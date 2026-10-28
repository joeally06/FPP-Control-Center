/**
 * Secure Backend API: Playlist Data
 * 
 * Returns cached playlist data from database (populated by fpp-poller).
 * 
 * SECURITY FEATURES:
 * - No direct FPP access from browser
 * - Read-only database access
 * - Cache age validation
 * - Public endpoint (no auth) - read-only playlist data
 * - Rate limiting applied by middleware
 * 
 * CACHE STRATEGY:
 * - fpp-poller caches playlist when it becomes active
 * - Cache expires after 5 minutes of inactivity
 * - Frontend reads from cache (never hits FPP directly)
 * 
 * @route GET /api/jukebox/playlist?name=PLAYLIST_NAME
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReadOnlyDb } from '@/lib/database';

// Read-only connection, shared with the other public read-only routes
type Db = ReturnType<typeof getReadOnlyDb>;

function getDatabase(): Db {
  return getReadOnlyDb();
}

// Prepared statement for fetching cached playlist
const getCachedPlaylistStmt = (db: Db) => db.prepare(`
  SELECT name, data, cached_at
  FROM cached_playlists
  WHERE name = ?
  ORDER BY cached_at DESC
  LIMIT 1
`);

/**
 * GET /api/jukebox/playlist?name=PLAYLIST_NAME
 * Returns cached playlist data
 */
export async function GET(request: NextRequest) {
  try {
    // Get playlist name from query parameter
    const searchParams = request.nextUrl.searchParams;
    const playlistName = searchParams.get('name');

    if (!playlistName) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameter',
        message: 'Query parameter "name" is required',
        example: '/api/jukebox/playlist?name=MyPlaylist'
      }, { status: 400 });
    }

    // Fetch from cache
    const database = getDatabase();
    const stmt = getCachedPlaylistStmt(database);
    const cached = stmt.get(playlistName) as any;

    if (!cached) {
      return NextResponse.json({
        success: false,
        error: 'Playlist not found in cache',
        message: `Playlist "${playlistName}" has not been cached yet. It will be cached when it becomes active.`,
        playlistName,
        cached: false
      }, { status: 404 });
    }

    // Parse JSON data
    let playlistData: any;
    try {
      playlistData = JSON.parse(cached.data);
    } catch (parseError) {
      console.error('[API] Failed to parse cached playlist data:', parseError);
      return NextResponse.json({
        success: false,
        error: 'Corrupted cache data',
        message: 'Playlist cache is corrupted. It will be refreshed on next poll.',
        playlistName
      }, { status: 500 });
    }

    // Calculate cache age
    const cachedAt = new Date(cached.cached_at);
    const now = new Date();
    const cacheAgeMs = now.getTime() - cachedAt.getTime();
    const cacheAgeSec = Math.floor(cacheAgeMs / 1000);

    // Warn if cache is old (>5 minutes)
    const isStale = cacheAgeSec > 300;

    // Prepare response
    const response = {
      success: true,
      playlistName: cached.name,
      playlist: playlistData,
      cache: {
        age: cacheAgeSec,
        ageHuman: formatCacheAge(cacheAgeSec),
        cachedAt: cached.cached_at,
        isStale,
        maxAge: 300 // 5 minutes
      }
    };

    // Add warning header if stale
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    };

    if (isStale) {
      headers['X-Cache-Warning'] = `Cache is ${cacheAgeSec}s old (stale)`;
    }

    return NextResponse.json(response, {
      status: 200,
      headers
    });

  } catch (error: any) {
    console.error('[API] /api/jukebox/playlist error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch playlist from cache',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

/**
 * Format cache age into human-readable string
 */
function formatCacheAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * HEAD /api/jukebox/playlist?name=PLAYLIST_NAME
 * Quick existence check (doesn't return body)
 */
export async function HEAD(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const playlistName = searchParams.get('name');

    if (!playlistName) {
      return new NextResponse(null, { status: 400 });
    }

    const database = getDatabase();
    const stmt = getCachedPlaylistStmt(database);
    const cached = stmt.get(playlistName) as any;

    if (!cached) {
      return new NextResponse(null, { status: 404 });
    }

    const cachedAt = new Date(cached.cached_at);
    const cacheAgeSec = Math.floor((Date.now() - cachedAt.getTime()) / 1000);
    const isStale = cacheAgeSec > 300;

    return new NextResponse(null, {
      status: 200,
      headers: {
        'X-Cache-Age': String(cacheAgeSec),
        'X-Cache-Stale': String(isStale)
      }
    });
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}
