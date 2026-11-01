// Addresses of the pictures uploaded for songs (see lib/song-art.ts). Kept apart from the image code so
// the playlist code can read an address without loading the image library.

/** Where an uploaded picture is served from (public, read-only) */
export const SONG_ART_PATH = '/api/jukebox/song-art/';

/** The address of an uploaded picture. A new upload gets a new id, so the address never changes content. */
export function songArtUrl(id: number): string {
  return `${SONG_ART_PATH}${id}`;
}

/** The id inside one of our own picture addresses; null for anything else (including other sites' images). */
export function songArtIdFromUrl(url: unknown): number | null {
  if (typeof url !== 'string' || !url.startsWith(SONG_ART_PATH)) return null;
  const rest = url.slice(SONG_ART_PATH.length);
  return /^[1-9]\d{0,9}$/.test(rest) ? Number(rest) : null;
}
