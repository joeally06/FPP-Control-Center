import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import {
  getYouTubeVideoById,
  updateYouTubeVideo,
  deleteYouTubeVideo
} from '@/lib/database';

/**
 * GET /api/admin/youtube-videos/[id]
 * Get a specific YouTube video by ID
 * ADMIN ONLY
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin authentication with rate limiting
    await requireAdminWithRateLimit(request);

    const { id } = await params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID' },
        { status: 400 }
      );
    }

    const video = getYouTubeVideoById.get(videoId);
    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      video
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Admin YouTube Video] Error fetching video:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/youtube-videos/[id]
 * Update a YouTube video
 * ADMIN ONLY
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin authentication with rate limiting
    await requireAdminWithRateLimit(request);

    const { id } = await params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID' },
        { status: 400 }
      );
    }

    const { title, description, thumbnail_url, duration_seconds, theme } = await request.json();

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Title is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    // Validate theme if provided
    if (theme && theme !== 'christmas' && theme !== 'halloween') {
      return NextResponse.json(
        { error: 'Theme must be either "christmas" or "halloween"' },
        { status: 400 }
      );
    }

    // Check if video exists
    const existingVideo = getYouTubeVideoById.get(videoId);
    if (!existingVideo) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Update video (theme defaults to 'christmas' if not provided)
    updateYouTubeVideo.run(
      title.trim(),
      description?.trim() || null,
      thumbnail_url?.trim() || null,
      duration_seconds ? parseInt(duration_seconds) : null,
      theme || 'christmas',
      videoId
    );

    console.log(`[Admin YouTube Video] Updated video ID ${videoId}: ${title} (Theme: ${theme || 'christmas'})`);

    return NextResponse.json({
      success: true,
      message: 'Video updated successfully'
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Admin YouTube Video] Error updating video:', error);
    return NextResponse.json(
      { error: 'Failed to update video' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/youtube-videos/[id]
 * Delete a YouTube video
 * ADMIN ONLY
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require admin authentication with rate limiting
    await requireAdminWithRateLimit(request);

    const { id } = await params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json(
        { error: 'Invalid video ID' },
        { status: 400 }
      );
    }

    // Check if video exists
    const existingVideo = getYouTubeVideoById.get(videoId) as {
      id: number;
      title: string;
      youtube_id: string;
      description: string | null;
      thumbnail_url: string | null;
      duration_seconds: number | null;
      created_at: string;
      updated_at: string;
    } | undefined;
    if (!existingVideo) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404 }
      );
    }

    // Delete video
    deleteYouTubeVideo.run(videoId);

    console.log(`[Admin YouTube Video] Deleted video ID ${videoId}: ${existingVideo.title}`);

    return NextResponse.json({
      success: true,
      message: 'Video deleted successfully'
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Admin YouTube Video] Error deleting video:', error);
    return NextResponse.json(
      { error: 'Failed to delete video' },
      { status: 500 }
    );
  }
}