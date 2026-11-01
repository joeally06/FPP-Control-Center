import type Database from 'better-sqlite3';
import { DateTime } from 'luxon';
import { isThemeId, type ThemeId } from './themes/theme-config';
import type { VisitorPlaylist } from './jukebox-display';
import { activeSchedulePlaylists, playlistSeason, type FppScheduleEntry, type PlaylistSeason } from './show-schedule';
import { APP_TIMEZONE } from './time-utils';
import { songArtIdFromUrl } from './song-art-url';

// FPP playlists visitors can request. The list comes from FPP on every song-cache refresh;
// the theme is set by the admin, and visitors only see playlists tagged with the active theme
// that FPP's Scheduler can start today (an enabled entry whose start date has arrived and end date has not passed).

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
  const ownDetails = db.prepare('SELECT sequence_name, title, artist, album, art_url, art_id FROM jukebox_playlist_songs WHERE playlist_name = ?');
  const clearSongs = db.prepare('DELETE FROM jukebox_playlist_songs WHERE playlist_name = ?');
  const insertSong = db.prepare(`
    INSERT INTO jukebox_playlist_songs (playlist_name, position, sequence_name, title, artist, album, art_url, art_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    const onFpp = new Set(names);
    for (const name of names) {
      const detail = details.get(name);
      if (detail) {
        upsert.run(name, detail.itemCount, detail.durationSeconds);
        // The admin's own details for a song survive the re-sync: read them, replace the rows, put them back
        const kept = new Map((ownDetails.all(name) as OwnDetailsRow[]).map((row) => [row.sequence_name, row]));
        clearSongs.run(name);
        detail.songs.forEach((song, position) => {
          const own = kept.get(song);
          insertSong.run(name, position, song, own?.title ?? null, own?.artist ?? null, own?.album ?? null, own?.art_url ?? null, own?.art_id ?? null);
        });
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
    deleteUnusedSongArt(db);
  })();
}

interface OwnDetailsRow {
  sequence_name: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  art_url: string | null;
  art_id: number | null;
}

/** Remove uploaded pictures no playlist song points at any more. */
export function deleteUnusedSongArt(db: Database.Database): number {
  return db.prepare(`
    DELETE FROM jukebox_song_art WHERE id NOT IN (SELECT art_id FROM jukebox_playlist_songs WHERE art_id IS NOT NULL)
  `).run().changes;
}

/** What the admin set for one song in one playlist; a null field falls back to the song's default details. */
export interface PlaylistSongDetails {
  title: string | null;
  artist: string | null;
  album: string | null;
  /** https address, or one of our own uploaded pictures (/api/jukebox/song-art/<id>) */
  albumArt: string | null;
}

export const MAX_DETAIL_TEXT_LENGTH = 200;
export const MAX_ART_URL_LENGTH = 500;

function detailText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be text`);
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} contains invalid characters`);
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length > MAX_DETAIL_TEXT_LENGTH) throw new Error(`${label} must be at most ${MAX_DETAIL_TEXT_LENGTH} characters`);
  return text || null;
}

/** Admin input → values to store. Throws (message safe to show) on anything else; art must be https or one of ours. */
export function normalizePlaylistSongDetails(input: unknown): PlaylistSongDetails {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('details must be an object');
  const body = input as Record<string, unknown>;

  const art = detailText(body.albumArt, 'Artwork address');
  if (art !== null) {
    if (art.length > MAX_ART_URL_LENGTH) throw new Error(`Artwork address must be at most ${MAX_ART_URL_LENGTH} characters`);
    if (!art.startsWith('https://') && songArtIdFromUrl(art) === null) {
      throw new Error('Artwork must be an https:// address or an uploaded picture');
    }
  }
  return {
    title: detailText(body.title, 'Title'),
    artist: detailText(body.artist, 'Artist'),
    album: detailText(body.album, 'Album'),
    albumArt: art,
  };
}

/**
 * Save the details for one song in one playlist, or clear them (null = use the default again).
 * Returns false when the playlist does not hold that song. Uploaded pictures left unused are deleted.
 */
export function setPlaylistSongDetails(db: Database.Database, playlist: string, sequence: string, details: PlaylistSongDetails | null): boolean {
  const artId = details?.albumArt ? songArtIdFromUrl(details.albumArt) : null;
  // Only a picture that exists can be pointed at
  const knownArtId = artId !== null && db.prepare('SELECT 1 FROM jukebox_song_art WHERE id = ?').get(artId) ? artId : null;
  if (artId !== null && knownArtId === null) throw new Error('That uploaded picture no longer exists');

  return db.transaction(() => {
    const result = db.prepare(`
      UPDATE jukebox_playlist_songs SET title = ?, artist = ?, album = ?, art_url = ?, art_id = ?
      WHERE playlist_name = ? AND sequence_name = ?
    `).run(details?.title ?? null, details?.artist ?? null, details?.album ?? null, details?.albumArt ?? null, knownArtId, playlist, sequence);
    deleteUnusedSongArt(db);
    return result.changes > 0;
  })();
}

/**
 * The playlist a visitor picked a song from, kept only when it is one the theme offers and it holds that song.
 * Anything else (a page left open since before a change, a made-up name) is dropped: the request still goes through.
 */
export function sourcePlaylistFor(themeSongs: ThemeSongs, sequence: string, requested: unknown): string | null {
  if (typeof requested !== 'string' || requested.length === 0 || requested.length > 255) return null;
  return themeSongs.order.get(requested)?.includes(sequence) ? requested : null;
}

/** One playlist in the admin's picker: its tag, how many songs it holds and where it stands in FPP's Scheduler. */
export interface AdminPlaylist {
  name: string;
  theme: ThemeId | null;
  songCount: number;
  /** 'unknown' until a schedule has been stored */
  season: PlaylistSeason['status'] | 'unknown';
  startsOn: string | null;
}

/** Every synced FPP playlist with the songs stored for it on the last sync (0 when none), for the picker on the Playlists & songs tab. */
export function listAdminPlaylists(db: Database.Database, now = DateTime.now().setZone(APP_TIMEZONE)): AdminPlaylist[] {
  const rows = db.prepare(`
    SELECT p.name, p.theme, COUNT(s.sequence_name) AS song_count
    FROM jukebox_playlists p
    LEFT JOIN jukebox_playlist_songs s ON s.playlist_name = p.name
    GROUP BY p.name
    ORDER BY p.name COLLATE NOCASE
  `).all() as { name: string; theme: ThemeId | null; song_count: number }[];
  const schedule = readStoredSchedule(db);
  const today = now.toISODate() ?? '';
  return rows.map((row) => {
    const season = schedule ? playlistSeason(schedule, row.name, today) : null;
    return {
      name: row.name,
      theme: row.theme,
      songCount: row.song_count,
      season: season?.status ?? 'unknown',
      startsOn: season?.startsOn ?? null,
    };
  });
}

/** Details set for songs in these playlists: playlist → sequence → own title and artist (only songs that have some). */
export function listPlaylistSongOverrides(db: Database.Database, playlists: string[]): Map<string, Map<string, { title: string | null; artist: string | null }>> {
  const result = new Map<string, Map<string, { title: string | null; artist: string | null }>>();
  const query = db.prepare(`
    SELECT sequence_name, title, artist FROM jukebox_playlist_songs
    WHERE playlist_name = ? AND (title IS NOT NULL OR artist IS NOT NULL)
  `);
  for (const playlist of playlists) {
    const rows = query.all(playlist) as { sequence_name: string; title: string | null; artist: string | null }[];
    if (rows.length > 0) result.set(playlist, new Map(rows.map((row) => [row.sequence_name, { title: row.title, artist: row.artist }])));
  }
  return result;
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
 * Playlists FPP's Scheduler can run today, from the stored schedule (a Set), or null when no schedule
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
 * is given) in season in FPP's Scheduler.
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
 * Songs from the playlists tagged with `themeId` that FPP's Scheduler can run today (`active`, or null
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
