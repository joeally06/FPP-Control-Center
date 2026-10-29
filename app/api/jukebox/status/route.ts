import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { getCurrentlyPlaying, updateQueueStatus, getFPPState } from '@/lib/database';
import { getFppUrl } from '@/lib/fpp-config';
import { toPublicQueueItem } from '@/lib/jukebox-display';
import { isFreshPlaying } from '@/lib/fpp-state';
import { parseDbTimestamp } from '@/lib/time-utils';

// last_updated is SQLite CURRENT_TIMESTAMP (UTC, no zone); new Date() would read it as local time.
// No usable timestamp counts as very old.
function cacheAgeSeconds(lastUpdated: string | null | undefined): number {
  const updatedMs = parseDbTimestamp(lastUpdated)?.toMillis();
  return updatedMs === undefined ? Infinity : Math.floor((Date.now() - updatedMs) / 1000);
}

export async function GET() {
  try {
    // First check if there's a song marked as playing in our database
    const currentlyPlaying = getCurrentlyPlaying.get() as Parameters<typeof toPublicQueueItem>[0] | undefined;

    if (currentlyPlaying) {
      // Public endpoint: never expose requester IPs or locations
      const item = toPublicQueueItem(currentlyPlaying);
      if (item.request_kind === 'playlist') {
        // Show the song FPP is playing from the requested playlist, credited to the requester
        const fppState = getFPPState.get() as { current_sequence?: string | null } | undefined;
        const playlist = { ...item, playlist_name: item.sequence_name };
        return NextResponse.json(fppState?.current_sequence
          ? {
              ...playlist,
              sequence_name: fppState.current_sequence,
              media_name: fppState.current_sequence.replace('.fseq', '.mp3'),
            }
          : playlist);
      }
      return NextResponse.json(item);
    }

    // NEW: Use cached FPP state instead of direct polling
    // This eliminates redundant FPP API calls and improves performance
    let usedCache = false;
    try {
      const fppState = getFPPState.get() as any;

      if (isFreshPlaying(fppState)) {
        // Return cached FPP status
        usedCache = true;
        return NextResponse.json({
          id: null, // No database ID since it's not from queue
          sequence_name: fppState.current_sequence,
          media_name: fppState.current_sequence.replace('.fseq', '.mp3'),
          requester_name: 'FPP Schedule',
          played_at: fppState.last_updated,
          status: 'playing',
          // Include cache metadata for debugging
          cached: true,
          cache_age_seconds: cacheAgeSeconds(fppState.last_updated)
        });
      }

      // If FPP state exists but not playing, check if cache is stale
      if (fppState) {
        const cacheAge = cacheAgeSeconds(fppState.last_updated);

        // If cache is very stale (> 60 seconds) or status is unknown, fall through to direct query
        if (cacheAge > 60 || fppState.status === 'unknown') {
          console.warn(`FPP cache is stale (age: ${cacheAge}s, status: ${fppState.status}) - querying FPP directly`);
          // Don't return, fall through to direct FPP query below
        } else {
          // Cache is fresh and FPP is not playing
          return NextResponse.json(null);
        }
      }
    } catch (cacheError) {
      console.warn('Could not fetch cached FPP status:', cacheError);
    }

    // FALLBACK: Query FPP directly if cache unavailable or stale
    // This maintains backward compatibility and handles poller downtime
    if (!usedCache) {
      try {
        const fppResponse = await fetch(`${getFppUrl()}/api/fppd/status`);
        if (fppResponse.ok) {
          const fppStatus = await fppResponse.json();

          if (fppStatus.status_name === 'playing' && fppStatus.current_song) {
            return NextResponse.json({
              id: null,
              sequence_name: fppStatus.current_sequence || fppStatus.current_song.replace('.mp3', '.fseq'),
              media_name: fppStatus.current_song,
              requester_name: 'FPP Schedule',
              played_at: new Date().toISOString(),
              status: 'playing',
              cached: false // Direct FPP query (fallback)
            });
          }
        }
      } catch (fppError) {
        console.warn('Could not fetch FPP status (fallback):', fppError);
      }
    }

    // If neither database nor FPP has something playing, return null
    return NextResponse.json(null);
  } catch (error) {
    console.error('Error fetching currently playing:', error);
    return NextResponse.json({ error: 'Failed to fetch currently playing' }, { status: 500 });
  }
}

// PUT /api/jukebox/status - Change a queue item's status (admin only)
export async function PUT(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const { id, status } = await request.json();

    if (!id || !status) {
      return NextResponse.json({ error: 'ID and status are required' }, { status: 400 });
    }

    const validStatuses = ['pending', 'playing', 'completed', 'skipped'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    updateQueueStatus.run(status, id);

    return NextResponse.json({ success: true, message: 'Status updated' });
  } catch (error) {
    console.error('Error updating status:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
