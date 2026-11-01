// Pictures the admin uploads for a song in a playlist (Settings -> Jukebox -> Songs), stored in jukebox_song_art (migration 026).
// Uploads are decoded and re-encoded to a square WebP here, so whatever the admin sends, only a plain raster image is ever served.

import type Database from 'better-sqlite3';
import sharp from 'sharp';

export const MAX_SONG_ART_BYTES = 5 * 1024 * 1024;
export const SONG_ART_SIZE = 512;
const ALLOWED_FORMATS = ['jpeg', 'png', 'webp'];

/** A problem with the file; the message is safe to show the admin */
export class SongArtError extends Error {}

export interface ProcessedSongArt {
  data: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
}

/** A 512 px square WebP cropped from the centre, rotated upright, metadata stripped. */
export async function processSongArt(input: Buffer): Promise<ProcessedSongArt> {
  if (input.length === 0) throw new SongArtError('The file is empty.');
  if (input.length > MAX_SONG_ART_BYTES) throw new SongArtError('The image is larger than 5 MB.');

  let format: string | undefined;
  try {
    format = (await sharp(input).metadata()).format;
  } catch {
    throw new SongArtError("That file couldn't be read as an image.");
  }
  if (!format || !ALLOWED_FORMATS.includes(format)) throw new SongArtError('Use a JPEG, PNG or WebP image.');

  try {
    const { data, info } = await sharp(input)
      .rotate()
      .resize(SONG_ART_SIZE, SONG_ART_SIZE, { fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { data, mimeType: 'image/webp', width: info.width, height: info.height };
  } catch {
    throw new SongArtError("That file couldn't be read as an image.");
  }
}

export function saveSongArt(db: Database.Database, asset: ProcessedSongArt): number {
  const result = db.prepare('INSERT INTO jukebox_song_art (mime_type, width, height, data) VALUES (?, ?, ?, ?)')
    .run(asset.mimeType, asset.width, asset.height, asset.data);
  return Number(result.lastInsertRowid);
}

export function getSongArt(db: Database.Database, id: number): { mimeType: string; data: Buffer } | null {
  const row = db.prepare('SELECT mime_type, data FROM jukebox_song_art WHERE id = ?').get(id) as
    | { mime_type: string; data: Buffer }
    | undefined;
  return row ? { mimeType: row.mime_type, data: row.data } : null;
}

