import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import db from '@/lib/database';
import { listJukeboxPlaylists, normalizePlaylistTheme, setPlaylistThemes } from '@/lib/jukebox-playlists';
import type { ThemeId } from '@/lib/themes/theme-config';

const MAX_PLAYLISTS = 500;
const MAX_NAME_LENGTH = 255;

/**
 * GET /api/jukebox/playlist-themes
 * Every FPP playlist (as of the last song-cache refresh) with its theme. ADMIN ONLY.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const playlists = listJukeboxPlaylists(db).map((row) => ({
      name: row.name,
      theme: row.theme,
      itemCount: row.item_count,
      durationSeconds: row.duration_seconds,
    }));
    return NextResponse.json({ playlists });
  } catch (error) {
    console.error('Error in GET /api/jukebox/playlist-themes:', error);
    return NextResponse.json({ error: 'Failed to load playlists' }, { status: 500 });
  }
}

/**
 * PUT /api/jukebox/playlist-themes
 * Set which theme shows each playlist to visitors: { themes: { [playlistName]: 'christmas' | 'halloween' | '' } }.
 * An empty theme hides the playlist. ADMIN ONLY.
 */
export async function PUT(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const themes = body?.themes;

    if (!themes || typeof themes !== 'object' || Array.isArray(themes)) {
      return NextResponse.json({ error: 'themes must be an object of playlist name → theme' }, { status: 400 });
    }

    const entries = Object.entries(themes);
    if (entries.length > MAX_PLAYLISTS) {
      return NextResponse.json({ error: `At most ${MAX_PLAYLISTS} playlists per request` }, { status: 400 });
    }

    const updates: [string, ThemeId | null][] = [];
    for (const [name, value] of entries) {
      if (!name || name.length > MAX_NAME_LENGTH) {
        return NextResponse.json({ error: 'Invalid playlist name' }, { status: 400 });
      }
      try {
        updates.push([name, normalizePlaylistTheme(value)]);
      } catch (error) {
        return NextResponse.json({ error: `${name}: ${toErrorMessage(error, 'Invalid theme')}` }, { status: 400 });
      }
    }

    setPlaylistThemes(db, updates);

    return NextResponse.json({ success: true, updated: updates.length });
  } catch (error) {
    console.error('Error in PUT /api/jukebox/playlist-themes:', error);
    return NextResponse.json({ error: 'Failed to save playlist themes' }, { status: 500 });
  }
}
