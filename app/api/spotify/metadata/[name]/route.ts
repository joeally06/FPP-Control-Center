import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  searchSpotifyTrack,
  calculateMatchConfidence,
  extractTrackMetadata,
  cleanSequenceName
} from '@/lib/spotify-token';
import { isAdminSession } from '@/lib/auth-helpers';
import { getDb } from '@/lib/database';

const CACHE_TTL_DAYS = 30;

/**
 * GET /api/spotify/metadata/[name]
 * 
 * Fetches Spotify metadata for a sequence name with intelligent caching.
 * 
 * Flow:
 * 1. Check database cache (valid for 30 days)
 * 2. If cache miss or stale, fetch from Spotify API
 * 3. Store result in database (even if no match found)
 * 4. Return metadata
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const { name } = await params;
    const sequenceName = decodeURIComponent(name);

    console.log(`[Spotify Metadata] Request for: "${sequenceName}"`);

    const db = getDb();

    // Check cache first (only if updated within TTL)
    const cached = db.prepare(
      `SELECT * FROM spotify_metadata 
       WHERE sequence_name = ? 
       AND datetime(last_updated, '+${CACHE_TTL_DAYS} days') > datetime('now')`
    ).all(sequenceName);

    if (cached.length > 0) {
      console.log(`[Spotify Metadata] Cache HIT for "${sequenceName}"`);
      const entry = cached[0] as any;
      
      return NextResponse.json({
        albumArt: entry.album_art_url,
        artist: entry.artist_name,
        album: entry.album_name,
        trackName: entry.track_name,
        spotifyUri: entry.spotify_uri,
        previewUrl: entry.preview_url,
        matchConfidence: entry.match_confidence,
        cached: true,
        lastUpdated: entry.last_updated
      });
    }

    console.log(`[Spotify Metadata] Cache MISS for "${sequenceName}" - fetching from Spotify API`);

    // Clean up sequence name for better search results
    const cleanQuery = cleanSequenceName(sequenceName);

    try {
      // Fetch from Spotify API
      const spotifyData = await searchSpotifyTrack(sequenceName);
      const track = spotifyData.tracks?.items?.[0];

      if (!track) {
        // No match found - cache negative result to avoid repeated API calls
        console.log(`[Spotify Metadata] No match found for "${sequenceName}"`);
        
        db.prepare(
          `INSERT OR REPLACE INTO spotify_metadata 
           (sequence_name, search_query, match_confidence, last_updated) 
           VALUES (?, ?, 'none', datetime('now'))`
        ).run(sequenceName, cleanQuery);


        return NextResponse.json({
          albumArt: null,
          artist: null,
          album: null,
          trackName: null,
          spotifyUri: null,
          previewUrl: null,
          matchConfidence: 'none',
          cached: false,
          message: 'No Spotify match found'
        });
      }

      // Extract metadata from Spotify result
      const metadata = extractTrackMetadata(track);
      
      // Determine match confidence
      const confidence = calculateMatchConfidence(
        sequenceName,
        metadata.trackName || '',
        metadata.artist || ''
      );

      console.log(`[Spotify Metadata] Match confidence: ${confidence} for "${sequenceName}"`);

      // Cache the result
      db.prepare(
        `INSERT OR REPLACE INTO spotify_metadata 
         (sequence_name, album_art_url, artist_name, album_name, track_name, 
          spotify_track_id, spotify_uri, preview_url, search_query, match_confidence, last_updated) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        sequenceName,
        metadata.albumArt,
        metadata.artist,
        metadata.album,
        metadata.trackName,
        metadata.spotifyTrackId,
        metadata.spotifyUri,
        metadata.previewUrl,
        cleanQuery,
        confidence
      );


      return NextResponse.json({
        albumArt: metadata.albumArt,
        artist: metadata.artist,
        album: metadata.album,
        trackName: metadata.trackName,
        spotifyUri: metadata.spotifyUri,
        previewUrl: metadata.previewUrl,
        matchConfidence: confidence,
        cached: false,
        message: 'Fetched from Spotify and cached'
      });

    } catch (spotifyError: any) {
      console.error('[Spotify Metadata] Spotify API error:', spotifyError);
      
      // Return graceful error - don't fail the whole request
      return NextResponse.json({
        albumArt: null,
        artist: null,
        album: null,
        trackName: null,
        spotifyUri: null,
        previewUrl: null,
        matchConfidence: 'none',
        cached: false,
        error: spotifyError.message,
        message: 'Spotify API unavailable'
      });
    }

  } catch (error: any) {
    console.error('[Spotify Metadata] Unexpected error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch metadata',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/spotify/metadata/[name]
 * 
 * Clears cache for a specific sequence (admin only)
 * Useful for forcing a refresh if metadata is incorrect
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminSession(session)) {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      );
    }

    const { name } = await params;
    const sequenceName = decodeURIComponent(name);

    const db = getDb();

    db.prepare(
      'DELETE FROM spotify_metadata WHERE sequence_name = ?'
    ).run(sequenceName);


    console.log(`[Spotify Metadata] Cache cleared for "${sequenceName}"`);

    return NextResponse.json({
      success: true,
      message: 'Cache cleared - next request will fetch fresh data'
    });

  } catch (error: any) {
    console.error('[Spotify Metadata] Delete error:', error);
    return NextResponse.json(
      { error: 'Failed to clear cache' },
      { status: 500 }
    );
  }
}
