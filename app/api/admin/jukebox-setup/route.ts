import { NextRequest, NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import db, { getActiveTheme, getCacheAge } from '@/lib/database';
import { getSetting } from '@/lib/settings';
import { activePlaylistNames, listAdminPlaylists, listJukeboxPlaylists, listVisitorPlaylists, readStoredSchedule } from '@/lib/jukebox-playlists';
import { buildLiveStatus } from '@/lib/jukebox-live-status';
import { buildSetupChecklist, listAdminSongs, readAudioState } from '@/lib/jukebox-songs';
import { listThemeAssets } from '@/lib/theme-assets';
import { THEME_PRESETS, normalizeThemeId } from '@/lib/themes/theme-config';
import { APP_TIMEZONE } from '@/lib/time-utils';

/**
 * GET /api/admin/jukebox-setup
 * Every song visitors can request (details, category, phone audio), the playlists to pick from on the
 * Songs tab, the setup checklist, and what visitors see right now (`live`) for Settings → Jukebox. Reads the database and the audio folder only. ADMIN ONLY.
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

    const offered = listVisitorPlaylists(db, themeId, activePlaylistNames(db));
    const checklist = buildSetupChecklist({
      songs,
      lastSynced: cache?.last_updated || null,
      themeName: THEME_PRESETS[themeId].name,
      offeredPlaylists: offered.length,
      hasLogo: listThemeAssets(db)[themeId].logo !== null,
      siteName: getSetting('site_name') || '',
      rateLimit: parseInt(getSetting('jukebox_rate_limit') || '3', 10),
    });

    // What visitors get right now, from saved settings and FPP's last stored schedule (no FPP call)
    const location = db.prepare('SELECT is_active FROM location_restrictions WHERE id = 1').get() as { is_active: number | boolean | null } | undefined;
    const live = buildLiveStatus({
      now: DateTime.now().setZone(APP_TIMEZONE),
      themeId,
      playlists: listJukeboxPlaylists(db).map((playlist) => ({ name: playlist.name, theme: playlist.theme, itemCount: playlist.item_count })),
      offeredNames: offered.map((playlist) => playlist.name),
      schedule: readStoredSchedule(db),
      typedStart: getSetting('jukebox_countdown_start'),
      rateLimit: parseInt(getSetting('jukebox_rate_limit') || '3', 10),
      locationLimited: Boolean(location?.is_active),
    });

    return NextResponse.json({ songs, checklist, playlists: listAdminPlaylists(db), live });
  } catch (error) {
    console.error('Error in GET /api/admin/jukebox-setup:', error);
    return NextResponse.json({ error: 'Failed to load the jukebox setup' }, { status: 500 });
  }
}
