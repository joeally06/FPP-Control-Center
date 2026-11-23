import { NextRequest, NextResponse } from 'next/server';
import { getQueue, incrementSequenceRequests, getActiveTheme, getFPPState } from '@/lib/database';
import { addToQueueTransactional, countRecentRequests, RateLimitExceededError } from '@/lib/jukebox-queue';
import { getClientIP, getSongRequestRateLimit } from '@/lib/rate-limit';
import { getUtcNow, getUtcOffset } from '@/lib/time-utils';
import { debugLog } from '@/lib/logging';
import { anonymizeIP } from '@/lib/privacy-utils';
import db from '@/lib/database';
import { isRequestableSong, lookupMediaName } from '@/lib/jukebox-catalog';
import { authorizeLocation } from '@/lib/location-policy';
import { toPublicQueueItem } from '@/lib/jukebox-display';
import { activePlaylistNames, listThemeSongs, listVisitorPlaylists, sourcePlaylistFor } from '@/lib/jukebox-playlists';
import { normalizeThemeId } from '@/lib/themes/theme-config';

export async function GET() {
  try {
    // Public endpoint: never expose requester IPs or locations
    const queue = (getQueue.all() as Parameters<typeof toPublicQueueItem>[0][]).map(toPublicQueueItem);
    return NextResponse.json(queue);
  } catch (error) {
    console.error('Error fetching queue:', error);
    return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 });
  }
}

// The columns the request check reads from location_restrictions
interface LocationRestrictionRow {
  is_active: number;
  max_distance_miles: number;
  show_latitude: number | null;
  show_longitude: number | null;
}

// The columns the debug query selects from jukebox_queue
interface RecentEntryRow {
  id: number;
  sequence_name: string;
  created_at: string;
  status: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { requester_name, userLocation, playlist_name } = body;
    let { sequence_name } = body;
    const requester_ip = getClientIP(request);

    // Get current rate limit from settings
    const rateLimit = getSongRequestRateLimit();

    const themeId = normalizeThemeId((getActiveTheme.get() as { active_theme_id?: string } | undefined)?.active_theme_id);
    // Only playlists FPP's Scheduler can run today are offered (null until a schedule has been stored)
    const activePlaylists = activePlaylistNames(db);

    // A playlist request names an FPP playlist the admin tagged for the active theme instead of a song
    const isPlaylist = playlist_name !== undefined && playlist_name !== null;
    if (isPlaylist) {
      if (sequence_name !== undefined && sequence_name !== null) {
        return NextResponse.json({ error: 'Request a song or a playlist, not both' }, { status: 400 });
      }
      if (typeof playlist_name !== 'string' || playlist_name.length < 1 || playlist_name.length > 200) {
        return NextResponse.json({ error: 'Playlist name must be 1-200 characters' }, { status: 400 });
      }
      if (!listVisitorPlaylists(db, themeId, activePlaylists).some((playlist) => playlist.name === playlist_name)) {
        return NextResponse.json({ error: "That playlist isn't available right now" }, { status: 404 });
      }
      const fppState = getFPPState.get() as { current_playlist?: string | null } | undefined;
      if (fppState?.current_playlist === playlist_name) {
        return NextResponse.json({ error: 'That playlist is playing right now' }, { status: 409 });
      }
      // Stored like a song name from here on; validated against the admin's list above
      sequence_name = playlist_name;
    }

    // SECURITY: Validate sequence_name input
    if (!sequence_name) {
      return NextResponse.json({ error: 'Sequence name is required' }, { status: 400 });
    }

    if (typeof sequence_name !== 'string') {
      return NextResponse.json({ error: 'Invalid sequence name type' }, { status: 400 });
    }

    if (sequence_name.length < 1 || sequence_name.length > 200) {
      return NextResponse.json({ error: 'Sequence name must be 1-200 characters' }, { status: 400 });
    }

    // Allow alphanumeric, spaces, hyphens, underscores, dots, apostrophes
    // This prevents SQL injection and path traversal attacks
    if (!isPlaylist && !/^[a-zA-Z0-9_\-. ']+$/.test(sequence_name)) {
      return NextResponse.json({ 
        error: 'Invalid characters in sequence name' 
      }, { status: 400 });
    }

    // Songs must be ones the admin synced from FPP and the active theme offers; hidden sequences can't be queued
    const themeSongs = listThemeSongs(db, themeId, activePlaylists);
    if (!isPlaylist && !isRequestableSong(db, sequence_name, themeSongs)) {
      return NextResponse.json({ error: "That song isn't available right now" }, { status: 404 });
    }
    // The playlist the visitor picked the song from, so that playlist's own details show while it plays
    const sourcePlaylist = isPlaylist ? null : sourcePlaylistFor(themeSongs, sequence_name, body.source_playlist);

    // SECURITY: Validate requester_name input
    if (requester_name !== undefined && requester_name !== null) {
      if (typeof requester_name !== 'string') {
        return NextResponse.json({ error: 'Invalid requester name type' }, { status: 400 });
      }

      if (requester_name.length > 100) {
        return NextResponse.json({ error: 'Requester name must be under 100 characters' }, { status: 400 });
      }

      // Allow alphanumeric, spaces, and common name characters
      if (requester_name.length > 0 && !/^[a-zA-Z0-9_\-. ']+$/.test(requester_name)) {
        return NextResponse.json({ 
          error: 'Invalid characters in requester name' 
        }, { status: 400 });
      }
    }

    const permission = authorizeLocation(userLocation, () => db.prepare(
      'SELECT is_active, max_distance_miles, show_latitude, show_longitude FROM location_restrictions WHERE id = 1'
    ).get() as LocationRestrictionRow | undefined, 'to request songs');
    if (!permission.allowed) return NextResponse.json(permission.body, { status: permission.status });
    const { distanceFromShow, locationDetails } = permission;

    // Songs only: the audio name comes from the cached FPP playlists, not a live FPP call
    const media_name = isPlaylist ? null : lookupMediaName(db, sequence_name);

    // Track sequence requests
    
    // Now add to jukebox queue with a transactional check for rate limit and duplicates
    let transactionResult;
    try {
      transactionResult = addToQueueTransactional(db, {
        sequence_name,
        media_name,
        requester_name: requester_name || 'Anonymous',
        requester_ip,
        rateLimit,
        latitude: locationDetails.latitude,
        longitude: locationDetails.longitude,
        city: null,
        region: null,
        countryCode: null,
        distanceFromShow: distanceFromShow,
        request_kind: isPlaylist ? 'playlist' : 'song',
        source_playlist: sourcePlaylist
      });
    } catch (txError) {
      if (txError instanceof RateLimitExceededError) {
        const used = txError.requestsUsed || rateLimit;
        console.warn(`[SECURITY] Rate limit exceeded for ${anonymizeIP(requester_ip)} (${used}/${rateLimit} used)`);
        return NextResponse.json({ 
          error: `Rate limit exceeded. You can request ${rateLimit} songs per hour.`,
          rateLimit,
          requestsUsed: used,
          requestsRemaining: 0
        }, { status: 429 });
      }
      const txCode = txError instanceof Error && 'code' in txError ? txError.code : undefined;
      if (txCode === 'PLAYLIST_ACTIVE') {
        return NextResponse.json({
          error: 'Another playlist is already in line. Try again when it finishes.'
        }, { status: 409 });
      }
      if (txCode === 'DUPLICATE_REQUEST') {
        console.warn(`[SECURITY] Duplicate request detected from ${anonymizeIP(requester_ip)} for ${sequence_name}`);
        return NextResponse.json({ 
          error: `You already requested this ${isPlaylist ? 'playlist' : 'song'} recently. Please wait a few minutes.` 
        }, { status: 429 });
      }
      throw txError; // let outer catch handle other errors
    }

    if (!isPlaylist) incrementSequenceRequests.run(sequence_name);
    const result = { lastInsertRowid: transactionResult.id };

    // Calculate how many requests the user has used in the last hour
    const now = getUtcNow();
    const oneHourAgo = getUtcOffset(1, 'hours');
    
    debugLog(`[Queue DEBUG] Request just added - ID: ${result.lastInsertRowid}`);
    debugLog(`[Queue DEBUG] Current time (UTC): ${now}`);
    debugLog(`[Queue DEBUG] One hour ago (UTC): ${oneHourAgo}`);
    
    // Get all recent entries to see what's being counted
    const recentEntries = db.prepare(`
      SELECT id, sequence_name, created_at, status
      FROM jukebox_queue 
      WHERE requester_ip = ? 
        AND created_at >= datetime('now', '-1 hour')
      ORDER BY created_at DESC
    `).all(requester_ip) as RecentEntryRow[];
    
    debugLog(`[Queue DEBUG] Entries in last hour for IP ${requester_ip}:`);
    recentEntries.forEach((entry) => {
      debugLog(`  ID ${entry.id}: ${entry.sequence_name} | ${entry.created_at} | ${entry.status}`);
    });
    
    // Same rule the rate-limit check uses (last hour, after any admin clear)
    const requestsUsed = countRecentRequests(db, requester_ip);
    const requestsRemaining = Math.max(0, rateLimit - requestsUsed);
    const requested = isPlaylist ? 'Playlist requested!' : 'Song requested!';

    debugLog(`[Queue POST - AFTER INSERT] IP: ${requester_ip} | Rate Limit: ${rateLimit} | Used: ${requestsUsed} | Remaining: ${requestsRemaining}`);

    return NextResponse.json({ 
      success: true, 
      id: result.lastInsertRowid,
      message: requestsRemaining > 0 
        ? `${requested} You have ${requestsRemaining} request${requestsRemaining !== 1 ? 's' : ''} remaining this hour.`
        : `${requested} You've used all ${rateLimit} requests this hour.`,
      rateLimit,
      requestsUsed,
      requestsRemaining
    });
  } catch (error) {
    console.error('Error adding to queue:', error);

    // Handle duplicate entries or other constraints
    if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT') {
      return NextResponse.json({ error: 'Unable to add sequence to queue' }, { status: 400 });
    }
    
    return NextResponse.json({ error: 'Failed to add to queue' }, { status: 500 });
  }
}
