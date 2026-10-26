import type Database from 'better-sqlite3';
import { isThemeId, type ThemeId } from './themes/theme-config';
import type { VisitorPlaylist } from './jukebox-display';

// FPP playlists visitors can request. The list comes from FPP on every song-cache refresh;
// the theme is set by the admin, and visitors only see playlists tagged with the active theme.

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
  const duration = playlist.playlistInfo?.total_duration;
  return {
    itemCount: count(playlist.leadIn) + count(playlist.mainPlaylist) + count(playlist.leadOut),
    durationSeconds: typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : null,
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

  db.transaction(() => {
    const onFpp = new Set(names);
    for (const name of names) {
      const detail = details.get(name);
      if (detail) upsert.run(name, detail.itemCount, detail.durationSeconds);
      else insertName.run(name);
    }
    for (const { name } of existing.all() as { name: string }[]) {
      if (!onFpp.has(name)) remove.run(name);
    }
  })();
}

/** Every playlist from FPP with its theme, for the admin. */
export function listJukeboxPlaylists(db: Database.Database): JukeboxPlaylistRow[] {
  return db.prepare(`
    SELECT name, theme, item_count, duration_seconds FROM jukebox_playlists ORDER BY name COLLATE NOCASE
  `).all() as JukeboxPlaylistRow[];
}

/** Playlists visitors can request while `themeId` is active (tagged with it and not empty). */
export function listVisitorPlaylists(db: Database.Database, themeId: ThemeId): VisitorPlaylist[] {
  const rows = db.prepare(`
    SELECT name, item_count, duration_seconds FROM jukebox_playlists
    WHERE theme = ? AND item_count > 0
    ORDER BY name COLLATE NOCASE
  `).all(themeId) as JukeboxPlaylistRow[];
  return rows.map((row) => ({ name: row.name, itemCount: row.item_count, durationSeconds: row.duration_seconds }));
}

/** Apply admin theme choices (already normalized) in one transaction. Unknown names are ignored. */
export function setPlaylistThemes(db: Database.Database, updates: [string, ThemeId | null][]): void {
  const update = db.prepare('UPDATE jukebox_playlists SET theme = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?');
  db.transaction(() => {
    for (const [name, theme] of updates) update.run(theme, name);
  })();
}
