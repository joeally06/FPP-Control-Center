import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getDb } from '@/lib/database';

/**
 * GET /api/fpp/playlists
 * Returns cached playlists from database
 * ADMIN ONLY - Playlists are used for show management
 */
export async function GET() {
  try {
    await requireAdmin();

    // Try to read playlists from database cache first
    const db = getDb();
    
    const cachedPlaylists = db.prepare(`
      SELECT name, description, item_count, duration, raw_data, synced_at
      FROM fpp_playlists
      ORDER BY name ASC
    `).all();

    if (cachedPlaylists.length > 0) {
      console.log(`[FPP Playlists] Returning ${cachedPlaylists.length} playlists from cache`);
      
      // Parse raw_data JSON for each playlist; rows that aren't a playlist object
      // (FPP's "" cached for a jukebox song's .fseq name) are left out
      const parsedPlaylists = cachedPlaylists.flatMap((playlist: any) => {
        try {
          const parsed = JSON.parse(playlist.raw_data);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? [parsed] : [];
        } catch {
          // Fallback to basic structure if JSON parse fails
          return {
            name: playlist.name,
            description: playlist.description,
            playlistInfo: {
              total_items: playlist.item_count,
              total_duration: playlist.duration
            }
          };
        }
      });

      console.log('[FPP Playlists] Sample parsed playlist:', parsedPlaylists[0]);
      return NextResponse.json(parsedPlaylists);
    }

    // If cache is empty, suggest syncing
    console.log('[FPP Playlists] Cache empty - suggesting sync');
    
    return NextResponse.json({
      error: 'No cached playlists available',
      hint: 'Click "Sync Now" to load playlists from FPP device',
      playlists: []
    }, { status: 404 });

  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[FPP Playlists] Error:', error);
    
    return NextResponse.json({
      error: 'Failed to load playlists',
      details: error instanceof Error ? error.message : undefined,
      playlists: []
    }, { status: 500 });
  }
}
