import type Database from 'better-sqlite3';
import { mediaNamesFromPlaylists } from './jukebox-songs';

// What visitors may request: the songs the admin synced from FPP (cached_sequences).
// Reads SQLite only, so a public request never has to call the FPP player.

/** True when the bare sequence name (no .fseq) is one of the synced songs. */
export function isRequestableSong(db: Database.Database, sequenceName: string): boolean {
  return db.prepare('SELECT 1 FROM cached_sequences WHERE sequence_name = ? LIMIT 1').get(sequenceName) !== undefined;
}

/** The audio file FPP plays with this sequence, from the cached playlists; null when none names one. */
export function lookupMediaName(db: Database.Database, sequenceName: string): string | null {
  const rows = db.prepare('SELECT raw_data FROM fpp_playlists WHERE raw_data IS NOT NULL').all() as { raw_data: string }[];
  return mediaNamesFromPlaylists(rows.map((row) => row.raw_data)).get(sequenceName) ?? null;
}
