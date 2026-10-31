import { NextResponse } from 'next/server';
import { getDb } from '@/lib/database';

const FPP_URL = process.env.FPP_URL || 'http://fpp.local';

/**
 * GET /api/fpp/playlists/[name]
 * Get full playlist details from cache or FPP
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name: playlistName } = await params;
    
    if (!playlistName) {
      return NextResponse.json(
        { error: 'Playlist name is required' },
        { status: 400 }
      );
    }

    // Try to get from database cache first
    const db = getDb();
    const cached = db.prepare(`
      SELECT raw_data, synced_at 
      FROM fpp_playlists 
      WHERE name = ?
    `).get(playlistName) as { raw_data: string; synced_at: string } | undefined;

    if (cached?.raw_data) {
      try {
        const data = JSON.parse(cached.raw_data);
        // Older versions cached FPP's "" for names that aren't playlists; ignore those rows
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          console.log(`[Playlist Details] Returning cached data for: ${playlistName}`);
          return NextResponse.json(data);
        }
      } catch {
        console.warn(`[Playlist Details] Failed to parse cached data for ${playlistName}`);
        // Continue to fetch from FPP
      }
    }

    // Not in cache or parse failed, fetch from FPP
    console.log(`[Playlist Details] Fetching from FPP: ${playlistName}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `${FPP_URL}/api/playlist/${encodeURIComponent(playlistName)}`,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`FPP returned ${response.status}`);
    }

    const data = await response.json();

    // A jukebox song plays as a one-song "playlist" named after its .fseq; FPP answers "" for
    // that name. Only a JSON object is a playlist - don't cache or return anything else.
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    // Cache the result in database
    try {
      db.prepare(`
        INSERT OR REPLACE INTO fpp_playlists (name, raw_data, synced_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(playlistName, JSON.stringify(data));
      console.log(`[Playlist Details] Cached data for: ${playlistName}`);
    } catch (cacheError) {
      console.warn(`[Playlist Details] Failed to cache data:`, cacheError);
      // Continue anyway, we have the data
    }

    return NextResponse.json(data);
    
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'FPP request timeout' },
        { status: 504 }
      );
    }

    console.error('[Playlist Details] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch playlist details', details: error.message },
      { status: 500 }
    );
  }
}
