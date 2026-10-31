import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import db, { clearCachedSequences, insertCachedSequence, upsertSongDuration } from '@/lib/database';
import { getFppUrl } from '@/lib/fpp-config';
import { toSongDuration } from '@/lib/jukebox-display';
import { playlistDetails, syncJukeboxPlaylists, type FppPlaylistJson, type PlaylistDetails } from '@/lib/jukebox-playlists';

// GET with a 5 second timeout; null when FPP doesn't answer or answers with an error
async function fetchFppJson(path: string): Promise<unknown> {
  try {
    const response = await fetch(`${getFppUrl()}${path}`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/**
 * Update the list of playlists visitors can be offered (Settings → Jukebox → Playlists).
 * `loaded` holds playlists already fetched for the song cache. Returns how many FPP has,
 * or null when FPP's playlist list couldn't be read (the stored list is then left alone).
 */
async function refreshPlaylists(loaded: Map<string, FppPlaylistJson>): Promise<number | null> {
  const names = await fetchFppJson('/api/playlists');
  if (!Array.isArray(names)) return null;

  const playlistNames = names.filter((name): name is string => typeof name === 'string' && name.trim() !== '');
  const details = new Map<string, PlaylistDetails>();
  for (const name of playlistNames) {
    const playlist = loaded.get(name) ?? await fetchFppJson(`/api/playlist/${encodeURIComponent(name)}`);
    if (playlist && typeof playlist === 'object') details.set(name, playlistDetails(playlist as FppPlaylistJson));
  }
  syncJukeboxPlaylists(db, playlistNames, details);
  return playlistNames.length;
}

/**
 * POST /api/jukebox/refresh-cache
 * Refresh the jukebox sequence cache from FPP
 * ADMIN ONLY - Expensive operation that queries FPP and updates database
 */
export async function POST() {
  try {
    await requireAdmin();
    
    console.log('[Jukebox Cache] Starting refresh...');

    // Check FPP health directly (not through our API to avoid auth circular dependency)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const healthCheck = await fetch(`${getFppUrl()}/api/system/status`, {
        signal: controller.signal,
        cache: 'no-store'
      });

      clearTimeout(timeoutId);

      if (!healthCheck.ok) {
        console.log('[Jukebox Cache] FPP is offline, skipping cache refresh');
        return NextResponse.json({
          success: false,
          error: 'FPP is offline',
          details: 'Cache refresh skipped - FPP server is not available',
          sequencesCached: 0
        }, { status: 503 });
      }
    } catch (healthError) {
      console.warn('[Jukebox Cache] FPP health check failed:', healthError);
      return NextResponse.json({
        success: false,
        error: 'FPP is offline',
        details: 'Cache refresh skipped - FPP server is not reachable',
        sequencesCached: 0
      }, { status: 503 });
    }

    // Retry logic for FPP connection
    let scheduleResponse;
    let retries = 3;
    
    while (retries > 0) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        scheduleResponse = await fetch(`${getFppUrl()}/api/schedule`, {
          signal: controller.signal,
          cache: 'no-store'
        });
        
        clearTimeout(timeoutId);
        break; // Success, exit retry loop
      } catch (error) {
        retries--;
        console.warn(`[Jukebox Cache] Schedule fetch failed (${retries} retries left):`, error);
        if (retries === 0) {
          // Return early instead of throwing to prevent console spam
          return NextResponse.json({
            success: false,
            error: 'FPP server timeout',
            details: error instanceof Error && error.name === 'AbortError' 
              ? 'Request timed out after 5 seconds' 
              : (error instanceof Error ? error.message : 'Unknown error'),
            sequencesCached: 0
          }, { status: 503 });
        }
        // Wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!scheduleResponse || !scheduleResponse.ok) {
      const status = scheduleResponse ? scheduleResponse.status : 'unknown';
      throw new Error(`Failed to fetch schedule: ${status}`);
    }
    
    const schedule = await scheduleResponse.json();

    const playlistNames = new Set<string>();
    schedule.forEach((entry: any) => {
      if (entry.playlist) {
        playlistNames.add(entry.playlist);
      }
    });

    // Then, get sequence files from each scheduled playlist
    // Use an array to preserve playlist order
    const sequenceList: { name: string; order: number; duration: number | null }[] = [];
    const seenSequences = new Set<string>();
    const loadedPlaylists = new Map<string, FppPlaylistJson>();
    let orderIndex = 0;
    
    for (const playlistName of playlistNames) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const playlistResponse = await fetch(`${getFppUrl()}/api/playlist/${encodeURIComponent(playlistName)}`, {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (playlistResponse.ok) {
          const playlist = await playlistResponse.json();
          loadedPlaylists.set(playlistName, playlist);
          
          // Helper function to add sequences with order
          const addSequence = (item: any) => {
            if (item.sequenceName) {
              // Remove .fseq extension
              const sequenceName = item.sequenceName.replace(/\.fseq$/i, '');
              if (!seenSequences.has(sequenceName)) {
                seenSequences.add(sequenceName);
                // FPP's playlist editor stores each item's length in seconds
                sequenceList.push({ name: sequenceName, order: orderIndex++, duration: toSongDuration(item.duration) });
              }
            }
          };
          
          // Extract sequence names from leadIn first (they play first)
          if (playlist.leadIn) {
            playlist.leadIn.forEach(addSequence);
          }
          // Then extract from mainPlaylist (in order)
          if (playlist.mainPlaylist) {
            playlist.mainPlaylist.forEach(addSequence);
          }
          // Then leadOut if it exists
          if (playlist.leadOut) {
            playlist.leadOut.forEach(addSequence);
          }
        } else {
          console.warn(`Failed to fetch playlist ${playlistName}: ${playlistResponse.status}`);
        }
      } catch (err) {
        console.warn(`Error fetching playlist ${playlistName}:`, err);
        // Continue with other playlists even if one fails
      }
    }

    // Clear existing cache and insert new sequence names with order
    clearCachedSequences.run();

    for (const seq of sequenceList) {
      insertCachedSequence.run(seq.name, seq.order);
      // Keeps the admin's category; only the length is refreshed
      if (seq.duration !== null) {
        upsertSongDuration.run(seq.name, seq.duration);
      }
    }

    const playlistsCached = await refreshPlaylists(loadedPlaylists);

    return NextResponse.json({
      success: true,
      sequencesCached: sequenceList.length,
      playlistsCached,
      sequences: sequenceList.map(s => s.name)
    });
  } catch (error: any) {
    if (error.message?.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error.message?.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    
    console.error('[Jukebox Cache] Error refreshing sequence cache:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to refresh sequence cache';
    let errorDetails = error instanceof Error ? error.message : 'Unknown error';
    
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        errorMessage = 'Cannot connect to FPP server';
        errorDetails = 'FPP is not running or not accessible at the configured address';
      } else if (error.message.includes('timeout') || error.name === 'AbortError') {
        errorMessage = 'FPP server timeout';
        errorDetails = 'The request took too long. FPP may be offline or overloaded.';
      }
    }
    
    return NextResponse.json({ 
      success: false,
      error: errorMessage,
      details: errorDetails,
      sequencesCached: 0
    }, { status: 500 });
  }
}
