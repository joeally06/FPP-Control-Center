import { NextResponse } from 'next/server';
import db, { getActiveTheme } from '@/lib/database';
import { activePlaylistNames, listVisitorPlaylists } from '@/lib/jukebox-playlists';
import { normalizeThemeId } from '@/lib/themes/theme-config';

/**
 * GET /api/jukebox/playlists
 * Playlists visitors can request: the ones the admin tagged with the active theme that FPP's Scheduler can run today (start date arrived, end date not passed).
 * PUBLIC - read-only, from the database (no FPP call)
 */
export async function GET() {
  try {
    const themeId = normalizeThemeId((getActiveTheme.get() as { active_theme_id?: string } | undefined)?.active_theme_id);
    return NextResponse.json({ themeId, playlists: listVisitorPlaylists(db, themeId, activePlaylistNames(db)) });
  } catch (error) {
    console.error('Error fetching jukebox playlists:', error);
    return NextResponse.json({ error: 'Failed to fetch playlists' }, { status: 500 });
  }
}
