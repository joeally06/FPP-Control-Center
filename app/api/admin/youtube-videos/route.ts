import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import {
  insertYouTubeVideo,
  getAllYouTubeVideos,
  getYouTubeVideoByYouTubeId
} from '@/lib/database';

// YouTube URL validation and ID extraction
function extractYouTubeId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  // Trim whitespace
  url = url.trim();

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&\n?#]+)/,
    /(?:youtu\.be\/)([^&\n?#]+)/,
    /(?:youtube\.com\/embed\/)([^&\n?#]+)/,
    /(?:youtube\.com\/v\/)([^&\n?#]+)/,
    /(?:youtube\.com\/shorts\/)([^&\n?#]+)/,
    /(?:youtube\.com\/live\/)([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

function isValidYouTubeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

/**
 * GET /api/admin/youtube-videos
 * Get all YouTube videos across all themes
 * ADMIN ONLY - Returns all videos regardless of theme
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin authentication with rate limiting
    await requireAdminWithRateLimit(request);

    const videos = getAllYouTubeVideos.all() as Array<{
      id: number;
      title: string;
      youtube_id: string;
      description: string | null;
      thumbnail_url: string | null;
      duration_seconds: number | null;
      theme: string;
      created_at: string;
      updated_at: string;
    }>;

    return NextResponse.json({
      success: true,
      videos
    });
  } catch (error: any) {
    if (error.message?.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error.message?.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Admin YouTube Videos] Error fetching videos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch videos' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/youtube-videos
 * Add a new YouTube video
 * ADMIN ONLY
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin authentication with rate limiting
    await requireAdminWithRateLimit(request);

    const { title, youtubeUrl, url, description, theme } = await request.json();

    // Support both youtubeUrl and url parameter names
    const videoUrl = youtubeUrl || url;

    if (!videoUrl || typeof videoUrl !== 'string') {
      return NextResponse.json(
        { error: 'YouTube URL is required' },
        { status: 400 }
      );
    }

    // Validate theme
    if (!theme || (theme !== 'christmas' && theme !== 'halloween')) {
      return NextResponse.json(
        { error: 'Theme is required and must be either "christmas" or "halloween"' },
        { status: 400 }
      );
    }

    // Extract and validate YouTube ID
    const youtubeId = extractYouTubeId(videoUrl);
    if (!youtubeId) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL format' },
        { status: 400 }
      );
    }

    if (!isValidYouTubeId(youtubeId)) {
      return NextResponse.json(
        { error: 'Invalid YouTube video ID' },
        { status: 400 }
      );
    }

    // Check if video already exists
    const existingVideo = getYouTubeVideoByYouTubeId.get(youtubeId);
    if (existingVideo) {
      return NextResponse.json(
        { error: 'This YouTube video is already in the library' },
        { status: 409 }
      );
    }

    let finalTitle = title?.trim();

    // If no title provided, try to fetch it from YouTube
    if (!finalTitle) {
      try {
        // Fetch video info from YouTube oEmbed API
        const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
        const response = await fetch(oEmbedUrl);
        
        if (response.ok) {
          const data = await response.json();
          finalTitle = data.title;
        }
      } catch (error) {
        console.warn('[YouTube API] Failed to fetch title from YouTube:', error);
      }

      // Fallback if YouTube API fails
      if (!finalTitle) {
        finalTitle = `YouTube Video ${youtubeId}`;
      }
    }

    // Validate title
    if (!finalTitle || finalTitle.length === 0) {
      return NextResponse.json(
        { error: 'Failed to get video title. Please provide a title manually.' },
        { status: 400 }
      );
    }

    // Generate thumbnail URL
    const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;

    // Insert new video with theme
    const result = insertYouTubeVideo.run(
      finalTitle,
      youtubeId,
      description?.trim() || null,
      thumbnailUrl,
      null, // duration_seconds will be set later if needed
      theme
    );

    console.log(`[Admin YouTube Videos] Added video: ${finalTitle} (${youtubeId}) - Theme: ${theme}`);

    return NextResponse.json({
      success: true,
      message: 'Video added successfully',
      video: {
        id: result.lastInsertRowid,
        title: finalTitle,
        youtube_id: youtubeId,
        description: description?.trim() || null,
        thumbnail_url: thumbnailUrl,
        duration_seconds: null,
        theme
      }
    });
  } catch (error: any) {
    if (error.message?.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error.message?.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Admin YouTube Videos] Error adding video:', error);
    return NextResponse.json(
      { error: 'Failed to add video' },
      { status: 500 }
    );
  }
}