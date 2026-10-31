/**
 * Secure Backend API: YouTube Videos (Public)
 * 
 * Returns YouTube videos from database for jukebox display.
 * 
 * SECURITY FEATURES:
 * - Public endpoint (no auth) - videos are publicly viewable content
 * - Read-only database access
 * - No sensitive data exposed (only public YouTube metadata)
 * - Rate limiting applied by middleware
 * - Theme filtering support
 * 
 * REPLACES:
 * - Previous /api/admin/videos endpoint (admin-only)
 * - Now public endpoint specifically for jukebox display
 * 
 * @route GET /api/jukebox/videos
 * @query theme - Optional theme filter
 * @query limit - Optional result limit (default: 50, max: 100)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReadOnlyDb } from '@/lib/database';

// Read-only connection, shared with the other public read-only routes
type Db = ReturnType<typeof getReadOnlyDb>;

function getDatabase(): Db {
  return getReadOnlyDb();
}

// Prepared statements
const getAllVideosStmt = (db: Db) => db.prepare(`
  SELECT 
    id,
    title,
    description,
    thumbnail_url,
    youtube_id,
    created_at,
    duration_seconds,
    theme
  FROM youtube_videos
  ORDER BY created_at DESC
  LIMIT ?
`);

const getVideosByThemeStmt = (db: Db) => db.prepare(`
  SELECT 
    id,
    title,
    description,
    thumbnail_url,
    youtube_id,
    created_at,
    duration_seconds,
    theme
  FROM youtube_videos
  WHERE theme = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

/**
 * GET /api/jukebox/videos
 * Returns public YouTube videos for jukebox display
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Parse query parameters
    const theme = searchParams.get('theme');
    const limitParam = searchParams.get('limit');
    
    // Validate and sanitize limit
    let limit = 50; // default
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return NextResponse.json({
          success: false,
          error: 'Invalid limit parameter',
          message: 'Limit must be a positive integer',
        }, { status: 400 });
      }
      limit = Math.min(parsedLimit, 100); // max 100
    }

    // Fetch videos from database
    const database = getDatabase();
    let videos: any[];

    if (theme) {
      const stmt = getVideosByThemeStmt(database);
      videos = stmt.all(theme, limit) as any[];
    } else {
      const stmt = getAllVideosStmt(database);
      videos = stmt.all(limit) as any[];
    }

    // Format response
    const response = {
      success: true,
      count: videos.length,
      theme: theme || 'all',
      limit,
      videos: videos.map(video => ({
        id: video.id,
        title: video.title,
        description: video.description,
        thumbnailUrl: video.thumbnail_url,
        videoId: video.youtube_id,
        publishedAt: video.created_at, // Use created_at as publishedAt
        durationSeconds: video.duration_seconds,
        theme: video.theme,
        youtubeUrl: `https://www.youtube.com/watch?v=${video.youtube_id}`,
        embedUrl: `https://www.youtube.com/embed/${video.youtube_id}`
      }))
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes (videos don't change often)
      }
    });

  } catch (error) {
    console.error('[API] /api/jukebox/videos error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to fetch videos from database',
      details: error instanceof Error && process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

/**
 * HEAD /api/jukebox/videos
 * Quick count check (doesn't return body)
 */
export async function HEAD() {
  try {
    const database = getDatabase();
    const countStmt = database.prepare(`
      SELECT COUNT(*) as count 
      FROM youtube_videos
    `);
    const result = countStmt.get() as any;

    return new NextResponse(null, {
      status: 200,
      headers: {
        'X-Video-Count': String(result.count)
      }
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
