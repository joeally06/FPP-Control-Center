import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import db, { getActiveTheme, getCacheAge } from '@/lib/database';
import { getSetting } from '@/lib/settings';
import { listVisitorPlaylists } from '@/lib/jukebox-playlists';
import { buildSetupChecklist, listAdminSongs, readAudioState } from '@/lib/jukebox-songs';
import { listThemeAssets } from '@/lib/theme-assets';
import { THEME_PRESETS, normalizeThemeId } from '@/lib/themes/theme-config';

/**
 * GET /api/admin/jukebox-setup
 * Every song visitors can request (details, category, phone audio) and the setup checklist
 * for Settings → Jukebox. Reads the database and the audio folder only. ADMIN ONLY.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const songs = listAdminSongs(db, readAudioState());
    const themeId = normalizeThemeId((getActiveTheme.get() as { active_theme_id?: string } | undefined)?.active_theme_id);
    const cache = getCacheAge.get() as { last_updated?: string | null } | undefined;

    const checklist = buildSetupChecklist({
      songs,
      lastSynced: cache?.last_updated || null,
      themeName: THEME_PRESETS[themeId].name,
      offeredPlaylists: listVisitorPlaylists(db, themeId).length,
      hasLogo: listThemeAssets(db)[themeId].logo !== null,
      siteName: getSetting('site_name') || '',
      rateLimit: parseInt(getSetting('jukebox_rate_limit') || '3', 10),
    });

    return NextResponse.json({ songs, checklist });
  } catch (error) {
    console.error('Error in GET /api/admin/jukebox-setup:', error);
    return NextResponse.json({ error: 'Failed to load the jukebox setup' }, { status: 500 });
  }
}
