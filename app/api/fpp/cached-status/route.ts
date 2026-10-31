/**
 * FPP Cached Status API
 * 
 * PUBLIC endpoint that returns cached FPP state from database.
 * This replaces direct FPP polling from frontend for better performance.
 * 
 * SECURITY:
 * - No authentication required (public jukebox access)
 * - Read-only operation (no user input accepted)
 * - Rate limiting TODO: implement if abuse detected
 * - Uses prepared statements
 * 
 * PERFORMANCE:
 * - Sub-millisecond response (reads from SQLite)
 * - Scalable to thousands of concurrent users
 * - No load on FPP device
 */

import { NextResponse } from 'next/server';
import { getFPPState, getCachedPlaylist, getCachedPlaylistSequences } from '@/lib/database';
import { parseDbTimestamp } from '@/lib/time-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {

    // Get cached FPP state
    const state = getFPPState.get() as any;

    if (!state) {
      return NextResponse.json(
        {
          error: 'FPP state not available',
          message: 'Polling service may not be running'
        },
        { status: 503 }
      );
    }

    // Calculate staleness. last_updated is SQLite CURRENT_TIMESTAMP (UTC without a zone); new Date() would
    // read it as local time and be off by the server's UTC offset
    const lastUpdate = parseDbTimestamp(state.last_updated)?.toMillis() ?? NaN;
    const now = Date.now();
    const ageMs = now - lastUpdate;
    const ageSeconds = Math.floor(ageMs / 1000);

    // Flag stale data (older than 30 seconds, or no usable timestamp)
    const isStale = !Number.isFinite(ageMs) || ageSeconds > 30;

    // Get active playlist if playing
    let activePlaylist = null;
    if (state.current_playlist) {
      activePlaylist = getCachedPlaylist.get(state.current_playlist) as any;
      
      if (activePlaylist) {
        // Get sequences for this playlist
        const sequences = getCachedPlaylistSequences.all(state.current_playlist);
        activePlaylist.sequences = sequences;
      }
    }

    // Build response
    const response = {
      // FPP Status
      status: state.status,
      status_name: state.status,
      current_sequence: state.current_sequence,
      current_playlist: state.current_playlist
        ? {
            playlist: state.current_playlist,
            index: state.current_playlist_index,
            count: state.current_playlist_count
          }
        : null,
      seconds_played: state.seconds_played,
      seconds_remaining: state.seconds_remaining,
      volume: state.volume,
      mode: state.mode,
      mode_name: state.mode,
      uptime: state.uptime,

      // Metadata
      last_poll_success: Boolean(state.last_poll_success),
      last_error: state.last_error,
      last_updated: state.last_updated,

      // Cache metadata
      cache: {
        age_ms: ageMs,
        age_seconds: ageSeconds,
        is_stale: isStale,
        warning: isStale ? 'Data may be outdated - FPP poller may be offline' : null
      },

      // Active playlist details
      active_playlist: activePlaylist
    };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        'X-Cache-Age': String(ageSeconds),
        'X-Cache-Stale': String(isStale)
      }
    });
  } catch (error) {
    console.error('[API] /api/fpp/cached-status error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch cached status',
        message: error instanceof Error ? error.message : undefined
      },
      { status: 500 }
    );
  }
}
