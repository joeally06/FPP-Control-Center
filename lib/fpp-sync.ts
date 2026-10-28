import { getFppUrl } from './fpp-config';
import { TIMING } from './constants';
import { getDb } from './database';

export interface SyncResult {
  success: boolean;
  playlistsCount: number;
  sequencesCount: number;
  error?: string;
  timestamp: string;
}

export interface SyncStatus {
  lastSync: string | null;
  lastSuccess: string | null;
  lastError: string | null;
  playlistsCount: number;
  sequencesCount: number;
}

/**
 * Main sync function - fetches from FPP using existing working API routes (same as Jukebox)
 * and updates database cache
 */
export async function syncFppData(): Promise<SyncResult> {
  const timestamp = new Date().toISOString();
  const db = getDb();

  try {
    console.log('[FPP Sync] Starting sync from FPP device...');
    
    // Connect directly to FPP device (public API endpoints don't require auth)
    const fppUrl = getFppUrl();
    console.log('[FPP Sync] FPP URL:', fppUrl);
    
    // Fetch playlists from FPP
    console.log('[FPP Sync] Fetching playlists from', `${fppUrl}/api/playlists`);
    const playlistsRes = await fetch(`${fppUrl}/api/playlists`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(TIMING.FETCH_TIMEOUT_VERY_LONG) // 15 seconds for FPP to respond
    });

    if (!playlistsRes.ok) {
      throw new Error(`Playlists API returned ${playlistsRes.status}`);
    }

    const playlistsData = await playlistsRes.json();
    const playlistNames = Array.isArray(playlistsData) ? playlistsData : [];
    console.log('[FPP Sync] Found', playlistNames.length, 'playlist names');
    
    // Fetch full details for each playlist
    const playlists: any[] = [];
    for (const name of playlistNames) {
      try {
        const playlistRes = await fetch(`${fppUrl}/api/playlist/${encodeURIComponent(name)}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(TIMING.FETCH_TIMEOUT_LONG)
        });
        
        if (playlistRes.ok) {
          const playlistDetail = await playlistRes.json();
          playlists.push(playlistDetail);
          console.log('[FPP Sync] Loaded playlist:', name, 'with', playlistDetail.mainPlaylist?.length || 0, 'items');
        } else {
          console.warn('[FPP Sync] Failed to load playlist details for:', name);
        }
      } catch (error) {
        console.warn('[FPP Sync] Error loading playlist:', name, error);
      }
    }
    
    console.log('[FPP Sync] Loaded', playlists.length, 'complete playlists');
    console.log('[FPP Sync] Sample playlist:', playlists[0]);

    // Fetch sequences from FPP
    console.log('[FPP Sync] Fetching sequences from', `${fppUrl}/api/sequence`);
    const sequencesRes = await fetch(`${fppUrl}/api/sequence`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(TIMING.FETCH_TIMEOUT_VERY_LONG) // 15 seconds for FPP to respond
    });

    if (!sequencesRes.ok) {
      throw new Error(`Sequences API returned ${sequencesRes.status}`);
    }

    const sequencesData = await sequencesRes.json();
    const sequences = Array.isArray(sequencesData) ? sequencesData : [];
    console.log('[FPP Sync] Found', sequences.length, 'sequences');
    console.log('[FPP Sync] Sample sequence:', sequences[0]);

    // Start transaction
    const transaction = db.transaction(() => {
      // Clear old data
      db.prepare('DELETE FROM fpp_playlists').run();
      db.prepare('DELETE FROM fpp_sequences').run();

      // Insert playlists
      const insertPlaylist = db.prepare(`
        INSERT INTO fpp_playlists (name, description, item_count, duration, raw_data, synced_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const playlist of playlists) {
        const name = playlist.name || 'Unknown';
        const description = playlist.desc || '';
        const itemCount = playlist.mainPlaylist?.length || 0;
        const duration = playlist.playlistInfo?.total_duration || 0;
        
        // Skip empty names
        if (!name || name.trim() === '') continue;
        
        const rawData = JSON.stringify(playlist);
        insertPlaylist.run(name, description, itemCount, duration, rawData, timestamp);
      }

      // Insert sequences
      const insertSequence = db.prepare(`
        INSERT INTO fpp_sequences (name, filename, length_ms, channel_count, raw_data, synced_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const sequence of sequences) {
        // FPP returns just strings (sequence filenames)
        const filename = typeof sequence === 'string' ? sequence : (sequence.name || 'Unknown');
        
        // Skip empty names
        if (!filename || filename.trim() === '') continue;
        
        // Remove .fseq extension if present for display name
        const name = filename.replace(/\.fseq$/i, '');
        
        // Create object that matches Media Library expectations
        const sequenceObj = {
          name: name,
          size: 0,
          duration: 0
        };
        
        const rawData = JSON.stringify(sequenceObj);
        insertSequence.run(name, filename, 0, 0, rawData, timestamp);
      }

      // Update sync status
      db.prepare(`
        UPDATE fpp_sync_status 
        SET last_sync = ?,
            last_success = ?,
            last_error = NULL,
            playlists_count = ?,
            sequences_count = ?
        WHERE id = 1
      `).run(timestamp, timestamp, playlists.length, sequences.length);
    });

    transaction();

    console.log('[FPP Sync] ✅ Sync completed successfully');
    console.log('[FPP Sync] Cached', playlists.length, 'playlists and', sequences.length, 'sequences');

    return {
      success: true,
      playlistsCount: playlists.length,
      sequencesCount: sequences.length,
      timestamp
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[FPP Sync] ❌ Sync failed:', errorMessage);
    console.error('[FPP Sync] Stack trace:', errorStack);

    // Update sync status with error
    try {
      db.prepare(`
        UPDATE fpp_sync_status 
        SET last_sync = ?,
            last_error = ?
        WHERE id = 1
      `).run(timestamp, errorMessage);
    } catch (dbError) {
      console.error('[FPP Sync] Failed to update error status:', dbError);
    }

    return {
      success: false,
      playlistsCount: 0,
      sequencesCount: 0,
      error: errorMessage,
      timestamp
    };
  }
}

/**
 * Get current sync status from database
 */
export function getSyncStatus(): SyncStatus {
  try {
    const db = getDb();
    
    const status = db.prepare(`
      SELECT last_sync, last_success, last_error, playlists_count, sequences_count
      FROM fpp_sync_status
      WHERE id = 1
    `).get() as any;

    if (!status) {
      return {
        lastSync: null,
        lastSuccess: null,
        lastError: null,
        playlistsCount: 0,
        sequencesCount: 0
      };
    }

    return {
      lastSync: status.last_sync,
      lastSuccess: status.last_success,
      lastError: status.last_error,
      playlistsCount: status.playlists_count || 0,
      sequencesCount: status.sequences_count || 0
    };

  } catch (error) {
    console.error('[FPP Sync] Failed to get sync status:', error);
    return {
      lastSync: null,
      lastSuccess: null,
      lastError: 'Failed to read sync status',
      playlistsCount: 0,
      sequencesCount: 0
    };
  }
}
