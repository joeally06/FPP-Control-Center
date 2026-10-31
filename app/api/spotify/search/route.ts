import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { searchSpotify } from '@/lib/spotify-token';

/**
 * GET /api/spotify/search
 * Search Spotify for track metadata
 * ADMIN ONLY - Spotify API access for metadata management
 */
export async function GET(request: Request) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!query) {
      return NextResponse.json({ error: 'Query parameter required' }, { status: 400 });
    }

    const results = await searchSpotify(query, limit);

    return NextResponse.json({
      results: results.map((track: any) => ({
        id: track.id,
        name: track.name,
        artist: track.artists[0]?.name,
        album: track.album.name,
        albumArt: track.album.images[0]?.url,
        spotifyUri: track.uri,
        previewUrl: track.preview_url
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Spotify Search Error]:', error);
    return NextResponse.json(
      { error: 'Search failed', details: error instanceof Error ? error.message : undefined },
      { status: 500 }
    );
  }
}
