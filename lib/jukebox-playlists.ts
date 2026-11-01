import type Database from 'better-sqlite3';
import { DateTime } from 'luxon';
import { isThemeId, type ThemeId } from './themes/theme-config';
import type { VisitorPlaylist } from './jukebox-display';
import { activeSchedulePlaylists, type FppScheduleEntry } from './show-schedule';
import { APP_TIMEZONE } from './time-utils';

// FPP playlists visitors can request. The list comes from FPP on every song-cache refresh;
// the theme is set by the admin, and visitors only see playlists tagged with the active theme
// that FPP's Scheduler can still start (an enabled entry whose end date has not passed).

export interface JukeboxPlaylistRow {
  name: string;
  theme: ThemeId | null;
  item_count: number;
  duration_seconds: number | null;
}

/** Song count and length read from an FPP playlist (GET /api/playlist/:name). */
export interface PlaylistDetails {
  /** Entries that play a sequence or media file (pauses, commands etc. don't count) */
  itemCount: number;
  durationSeconds: number | null;
  /** Sequence names (no .fseq) in play order, each once */
  songs: string[];
}

export interface FppPlaylistJson {
  leadIn?: unknown[];
  mainPlaylist?: unknown[];
  leadOut?: unknown[];
  playlistInfo?: { total_duration?: unknown };
}

/** Songs in every section of an FPP playlist, and its total length when FPP reports one. */
export function playlistDetails(playlist: FppPlaylistJson): PlaylistDetails {
  const isSong = (item: unknown) =>
    typeof item === 'object' && item !== null &&
    ['sequenceName', 'mediaName'].some((key) => typeof (item as Record<string, unknown>)[key] === 'string' && (item as Record<string, unknown>)[key] !== '');
  const count = (items: unknown) => (Array.isArray(items) ? items.filter(isSong).length : 0);
  const songs = new Set<string>();
  for (const items of [playlist.leadIn, playlist.mainPlaylist, playlist.leadOut]) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const sequence = typeof item === 'object' && item !== null ? (item as Record<string, unknown>).sequenceName : null;
      const name = typeof sequence === 'string' ? sequence.replace(/\.fseq$/i, '').trim() : '';
      if (name) songs.add(name);
    }
  }
  const duration = playlist.playlistInfo?.total_duration;
  return {
    itemCount: count(playlist.leadIn) + count(playlist.mainPlaylist) + count(playlist.leadOut),
    durationSeconds: typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : null,
    songs: [...songs],
  };
}

/** Admin-chosen theme → stored value; '' or null hides the playlist. Throws on anything else. */
export function normalizePlaylistTheme(value: unknown): ThemeId | null {
  if (value === null || value === undefined || value === '') return null;
  if (isThemeId(value)) return value;
  throw new Error('Theme must be christmas, halloween or empty');
}

/**
 * Bring the table in line with FPP: `names` is every playlist on FPP, `details` those whose
 * contents loaded. Admin themes are kept; a playlist whose details failed keeps its old counts;
 * playlists no longer on FPP are removed.
 */
export function syncJukeboxPlaylists(db: Database.Database, names: string[], details: Map<string, PlaylistDetails>): void {
  const upsert = db.prepare(`
    INSERT INTO jukebox_playlists (name, item_count, duration_seconds, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET
      item_count = excluded.item_count,
      duration_seconds = excluded.duration_seconds,
      updated_at = CURRENT_TIMESTAMP
  `);
  const insertName = db.prepare('INSERT OR IGNORE INTO jukebox_playlists (name) VALUES (?)');
  const existing = db.prepare('SELECT name FROM jukebox_playlists');
  const remove = db.prepare('DELETE FROM jukebox_playlists WHERE name = ?');
  const clearSongs = db.prepare('DELETE FROM jukebox_playlist_songs WHERE playlist_name = ?');
  const insertSong = db.prepare('INSERT INTO jukebox_playlist_songs (playlist_name, position, sequence_name) VALUES (?, ?, ?)');

  db.transaction(() => {
    const onFpp = new Set(names);
    for (const name of names) {
      const detail = details.get(name);
      if (detail) {
        upsert.run(name, detail.itemCount, detail.durationSeconds);
        clearSongs.run(name);
        detail.songs.forEach((song, position) => insertSong.run(name, position, song));
      } else {
        insertName.run(name);
      }
    }
    for (const { name } of existing.all() as { name: string }[]) {
      if (!onFpp.has(name)) {
        remove.run(name);
        clearSongs.run(name);
      }
    }
  })();
}

const SCHEDULE_SETTING = 'fpp_schedule_json';

/** FPP's /api/schedule as last stored; null when none has been stored (or it is unreadable). */
export function readStoredSchedule(db: Database.Database): FppScheduleEntry[] | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SCHEDULE_SETTING) as { value: string } | undefined;
  if (!row) return null;
  try {
    const entries = JSON.parse(row.value);
    return Array.isArray(entries) ? entries : null;
  } catch {
    return null;
  }
}

/** Keep a copy of FPP's schedule (only when it changed) so visitor pages never have to ask FPP. */
export function storeSchedule(db: Database.Database, entries: FppScheduleEntry[]): void {
  const json = JSON.stringify(entries);
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SCHEDULE_SETTING) as { value: string } | undefined;
  if (row?.value === json) return;
  db.prepare(`
    INSERT INTO settings (key, value, description, category, updated_at)
    VALUES (?, ?, 'Copy of the FPP schedule, used to offer only scheduled playlists', 'system', CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(SCHEDULE_SETTING, json);
}

/**
 * Playlists FPP's Scheduler can still start, from the stored schedule (a Set), or null when no schedule
 * has been stored yet, in which case nothing is filtered.
 */
export function activePlaylistNames(db: Database.Database, now = DateTime.now().setZone(APP_TIMEZONE)): Set<string> | null {
  const entries = readStoredSchedule(db);
  return entries ? activeSchedulePlaylists(entries, now.toISODate() ?? '') : null;
}

/** Every playlist from FPP with its theme, for the admin. */
export function listJukeboxPlaylists(db: Database.Database): JukeboxPlaylistRow[] {
  return db.prepare(`
    SELECT name, theme, item_count, duration_seconds FROM jukebox_playlists ORDER BY name COLLATE NOCASE
  `).all() as JukeboxPlaylistRow[];
}

/**
 * Playlists visitors can request while `themeId` is active: tagged with it, not empty, and (when `active`
 * is given) still startable by FPP's Scheduler.
 */
export function listVisitorPlaylists(db: Database.Database, themeId: ThemeId, active: ReadonlySet<string> | null = null): VisitorPlaylist[] {
  const rows = db.prepare(`
    SELECT name, item_count, duration_seconds FROM jukebox_playlists
    WHERE theme = ? AND item_count > 0
    ORDER BY name COLLATE NOCASE
  `).all(themeId) as JukeboxPlaylistRow[];
  return rows
    .filter((row) => !active || active.has(row.name))
    .map((row) => ({ name: row.name, itemCount: row.item_count, durationSeconds: row.duration_seconds }));
}

/** The songs visitors may pick while a theme is active, by playlist. */
export interface ThemeSongs {
  /** False when the theme has no tagged playlist with known songs: then every cached song is offered */
  restricted: boolean;
  /** Offered playlists (tagged, scheduled), by name */
  playlists: string[];
  /** Each offered sequence name → the offered playlists that hold it */
  songs: Map<string, string[]>;
  /** Each offered playlist → its songs in play order */
  order: Map<string, string[]>;
}

/**
 * Songs from the playlists tagged with `themeId` that FPP's Scheduler can still start (`active`, or null
 * for no schedule check). Not restricted until the theme has a tagged playlist whose songs are known
 * (they are stored on each sync from FPP), so an untagged theme or a fresh install offers every song.
 */
export function listThemeSongs(db: Database.Database, themeId: ThemeId, active: ReadonlySet<string> | null = null): ThemeSongs {
  const tagged = db.prepare(`
    SELECT name FROM jukebox_playlists WHERE theme = ? AND item_count > 0 ORDER BY name COLLATE NOCASE
  `).all(themeId) as { name: string }[];
  const songsOf = db.prepare('SELECT sequence_name FROM jukebox_playlist_songs WHERE playlist_name = ? ORDER BY position');

  const known = tagged
    .map(({ name }) => ({ name, songs: (songsOf.all(name) as { sequence_name: string }[]).map((row) => row.sequence_name) }))
    .filter((playlist) => playlist.songs.length > 0);
  if (known.length === 0) return { restricted: false, playlists: [], songs: new Map(), order: new Map() };

  const offered = known.filter((playlist) => !active || active.has(playlist.name));
  const songs = new Map<string, string[]>();
  for (const playlist of offered) {
    for (const song of playlist.songs) songs.set(song, [...(songs.get(song) ?? []), playlist.name]);
  }
  return {
    restricted: true,
    playlists: offered.map((playlist) => playlist.name),
    songs,
    order: new Map(offered.map((playlist) => [playlist.name, playlist.songs])),
  };
}

/** Apply admin theme choices (already normalized) in one transaction. Unknown names are ignored. */
export function setPlaylistThemes(db: Database.Database, updates: [string, ThemeId | null][]): void {
  const update = db.prepare('UPDATE jukebox_playlists SET theme = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?');
  db.transaction(() => {
    for (const [name, theme] of updates) update.run(theme, name);
  })();
}
