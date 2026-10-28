import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { fetchSpotifyUrl } from '@/lib/spotify-url-helper';
import { getDb } from '@/lib/database';

/**
 * POST /api/spotify/metadata/[name]/override
 * Manually override Spotify metadata for a sequence
 * ADMIN ONLY - Metadata management
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { name } = await params;
    const sequenceName = decodeURIComponent(name);
    const { albumArt, artist, album, trackName, spotifyTrackId, spotifyUri, previewUrl } = await request.json();

    console.log('[Spotify Override] Saving metadata for:', sequenceName);

    // Auto-fetch Spotify URL if we have track ID or can search by title/artist
    let spotifyUrl: string | null = null;
    
    if (spotifyTrackId) {
      // Construct URL from track ID
      spotifyUrl = `https://open.spotify.com/track/${spotifyTrackId}`;
      console.log('[Spotify Override] Constructed Spotify URL from track ID');
    } else if (trackName && artist) {
      // Search Spotify to get URL
      console.log('[Spotify Override] Searching Spotify for URL...');
      spotifyUrl = await fetchSpotifyUrl(trackName, artist);
      if (spotifyUrl) {
        console.log('[Spotify Override] ✓ Found Spotify URL:', spotifyUrl);
      } else {
        console.log('[Spotify Override] ✗ No Spotify URL found');
      }
    }

    const db = getDb();

    // Store manual override in database
    // Use 'none' for match_confidence since manual entries don't have a confidence score
    // We store the original search query to track that it was manually selected
    db.prepare(`
      INSERT INTO spotify_metadata 
      (sequence_name, album_art_url, artist_name, album_name, track_name, spotify_track_id, spotify_uri, preview_url, spotify_url, match_confidence, last_updated, search_query) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', CURRENT_TIMESTAMP, ?)
      ON CONFLICT(sequence_name) DO UPDATE SET
        album_art_url = excluded.album_art_url,
        artist_name = excluded.artist_name,
        album_name = excluded.album_name,
        track_name = excluded.track_name,
        spotify_track_id = excluded.spotify_track_id,
        spotify_uri = excluded.spotify_uri,
        preview_url = excluded.preview_url,
        spotify_url = excluded.spotify_url,
        match_confidence = 'none',
        last_updated = CURRENT_TIMESTAMP,
        search_query = excluded.search_query
    `).run(
      sequenceName,
      albumArt || null,
      artist || null,
      album || null,
      trackName || null,
      spotifyTrackId || null,
      spotifyUri || null,
      previewUrl || null,
      spotifyUrl || null,
      'MANUAL_OVERRIDE'
    );

    console.log('[Spotify Override] ✅ Metadata saved successfully');

    return NextResponse.json({
      success: true,
      message: 'Metadata updated successfully'
    });
  } catch (error: any) {
    if (error.message?.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error.message?.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Spotify Override Error]:', error);
    return NextResponse.json(
      { error: 'Failed to update metadata', details: error.message },
      { status: 500 }
    );
  }
}
