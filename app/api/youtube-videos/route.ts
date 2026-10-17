import { NextResponse } from 'next/server';
import { getAllYouTubeVideos, getYouTubeVideosByTheme, getActiveTheme } from '@/lib/database';
import { normalizeThemeId } from '@/lib/themes/theme-config';

/**
 * GET /api/youtube-videos
 * Get YouTube videos filtered by active theme
 * PUBLIC - Accessible to all users for jukebox integration
 * Query params: ?theme=christmas|halloween (admin preview only)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const themeParam = searchParams.get('theme');
    
    let videos;
    
    // If theme query param provided (admin preview), validate and use it
    if (themeParam) {
      if (themeParam !== 'christmas' && themeParam !== 'halloween') {
        return NextResponse.json(
          { error: 'Invalid theme. Must be "christmas" or "halloween"' },
          { status: 400 }
        );
      }
      videos = getYouTubeVideosByTheme.all(themeParam);
    } else {
      // Otherwise, fetch active theme from theme_settings table
      const themeData = getActiveTheme.get() as { active_theme_id: string } | undefined;
      const activeTheme = normalizeThemeId(themeData?.active_theme_id);
      videos = getYouTubeVideosByTheme.all(activeTheme);
    }

    const typedVideos = videos as Array<{
      id: number;
      title: string;
      youtube_id: string;
      description: string | null;
      thumbnail_url: string | null;
      duration_seconds: number | null;
      theme: string;
      created_at: string;
    }>;

    return NextResponse.json({
      success: true,
      videos: typedVideos.map(video => ({
        id: video.id,
        title: video.title,
        youtube_id: video.youtube_id,
        description: video.description,
        thumbnail_url: video.thumbnail_url,
        duration_seconds: video.duration_seconds,
        theme: video.theme,
        created_at: video.created_at
      }))
    });
  } catch (error) {
    console.error('[YouTube Videos] Error fetching videos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch videos' },
      { status: 500 }
    );
  }
}