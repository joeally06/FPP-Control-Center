import type Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// The admin's view of every song visitors can request (Settings → Jukebox → Songs), and the
// setup checklist at the top of that page. Reads SQLite and the phone-audio files only.

export type AudioStatus = 'ready' | 'needs-download' | 'needs-mapping';

/** One song in the jukebox catalog, with everything the admin can fix about it. */
export interface AdminSong {
  /** FPP sequence name without .fseq */
  name: string;
  /** Media Library details; without a title visitors see the file name */
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArt: string | null;
  category: string | null;
  durationSeconds: number | null;
  /** The audio file FPP plays with this sequence, from its playlists */
  mediaName: string | null;
  /** The copy in public/audio that visitors' phones play */
  audioFile: string | null;
  audioStatus: AudioStatus;
}

export interface AudioState {
  /** data/audio-mapping.json: sequence name → file in public/audio */
  mappings: Record<string, string>;
  /** Audio files in public/audio */
  files: string[];
}

const AUDIO_FILE = /\.(mp3|wav|ogg|m4a|flac|aac)$/i;

/** Same comparison as the phone-audio sync: case, apostrophes, _ and - don't matter. */
export function normalizeAudioName(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The mapped file if it exists, else a file whose name matches the sequence's. */
export function findLocalAudio(sequenceName: string, audio: AudioState): string | null {
  const mapped = audio.mappings[sequenceName] || audio.mappings[`${sequenceName}.fseq`];
  if (mapped && audio.files.includes(mapped)) return mapped;

  const wanted = normalizeAudioName(sequenceName);
  return audio.files.find((file) => normalizeAudioName(file.replace(AUDIO_FILE, '')) === wanted) ?? null;
}

/** Ready when a local file plays it; otherwise downloadable when FPP names its audio. */
export function songAudio(sequenceName: string, mediaName: string | null, audio: AudioState): Pick<AdminSong, 'audioFile' | 'audioStatus'> {
  const audioFile = findLocalAudio(sequenceName, audio);
  if (audioFile) return { audioFile, audioStatus: 'ready' };
  return { audioFile: null, audioStatus: mediaName ? 'needs-download' : 'needs-mapping' };
}

/** Sequence → audio file name, from cached FPP playlists (raw JSON). The first playlist naming one wins. */
export function mediaNamesFromPlaylists(rawPlaylists: string[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const raw of rawPlaylists) {
    let playlist: Record<string, unknown>;
    try {
      playlist = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const section of ['leadIn', 'mainPlaylist', 'leadOut']) {
      const items = playlist?.[section];
      if (!Array.isArray(items)) continue;
      for (const item of items as ({ sequenceName?: unknown; mediaName?: unknown } | null)[]) {
        const sequence = item?.sequenceName;
        const media = item?.mediaName;
        if (typeof sequence !== 'string' || typeof media !== 'string' || !media) continue;
        const name = sequence.replace(/\.fseq$/i, '').trim();
        if (!names.has(name)) names.set(name, media);
      }
    }
  }
  return names;
}

/** Mapping file and audio folder as the phone-audio sync sees them; missing ones are empty. */
export function readAudioState(root = process.cwd()): AudioState {
  const mappingFile = join(root, 'data', 'audio-mapping.json');
  const audioDir = join(root, 'public', 'audio');

  let mappings: Record<string, string> = {};
  try {
    if (existsSync(mappingFile)) mappings = JSON.parse(readFileSync(mappingFile, 'utf-8'));
  } catch (error) {
    console.warn('[Jukebox Songs] Could not read the audio mapping file:', error);
  }
  const files = existsSync(audioDir) ? readdirSync(audioDir).filter((file) => AUDIO_FILE.test(file)) : [];
  return { mappings, files };
}

interface SongRow {
  sequence_name: string;
  track_name: string | null;
  artist_name: string | null;
  album_name: string | null;
  album_art_url: string | null;
  duration_seconds: number | null;
  category: string | null;
}

/** Every cached song in playlist order, with its Media Library details, category and phone audio. */
export function listAdminSongs(db: Database.Database, audio: AudioState): AdminSong[] {
  const rows = db.prepare(`
    SELECT cs.sequence_name, sm.track_name, sm.artist_name, sm.album_name, sm.album_art_url,
           d.duration_seconds, d.category
    FROM cached_sequences cs
    LEFT JOIN spotify_metadata sm ON sm.sequence_name = cs.sequence_name
    LEFT JOIN jukebox_song_details d ON d.sequence_name = cs.sequence_name
    ORDER BY cs.playlist_order ASC, cs.sequence_name ASC
  `).all() as SongRow[];
  const playlists = db.prepare('SELECT raw_data FROM fpp_playlists WHERE raw_data IS NOT NULL').all() as { raw_data: string }[];
  const mediaNames = mediaNamesFromPlaylists(playlists.map((row) => row.raw_data));

  return rows.map((row) => {
    const mediaName = mediaNames.get(row.sequence_name) ?? null;
    return {
      name: row.sequence_name,
      title: row.track_name || null,
      artist: row.artist_name || null,
      album: row.album_name || null,
      albumArt: row.album_art_url || null,
      category: row.category || null,
      durationSeconds: row.duration_seconds ?? null,
      mediaName,
      ...songAudio(row.sequence_name, mediaName, audio),
    };
  });
}

export type SetupTab = 'songs' | 'playlists' | 'rules' | 'visitor';
export type SongFilter = 'all' | 'titles' | 'audio';

export interface ChecklistItem {
  id: 'sync' | 'titles' | 'audio' | 'playlists' | 'rules' | 'visitor';
  title: string;
  status: 'ok' | 'warn' | 'todo';
  detail: string;
  /** Where the admin fixes it */
  tab: SetupTab;
  filter?: SongFilter;
}

export interface SetupSummary {
  songs: Pick<AdminSong, 'title' | 'audioStatus'>[];
  lastSynced: string | null;
  themeName: string;
  /** Playlists visitors can request while the active theme is on */
  offeredPlaylists: number;
  hasLogo: boolean;
  siteName: string;
  rateLimit: number;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The setup checklist, in the order a new operator would work through it. */
export function buildSetupChecklist(summary: SetupSummary): ChecklistItem[] {
  const total = summary.songs.length;
  const untitled = summary.songs.filter((song) => !song.title).length;
  const noAudio = summary.songs.filter((song) => song.audioStatus !== 'ready').length;
  const synced = summary.lastSynced !== null && total > 0;
  const syncFirst = 'Sync from FPP first';

  return [
    {
      id: 'sync',
      title: 'Sync from FPP',
      status: synced ? 'ok' : 'todo',
      detail: synced ? `${plural(total, 'song')} from your scheduled playlists` : 'Load your songs and playlists from FPP',
      tab: 'songs',
    },
    {
      id: 'titles',
      title: 'Song titles',
      status: !synced ? 'todo' : untitled ? 'warn' : 'ok',
      detail: !synced ? syncFirst : untitled ? `${untitled} of ${total} show their file name to visitors` : 'Every song has a title',
      tab: 'songs',
      filter: 'titles',
    },
    {
      id: 'audio',
      title: 'Phone audio',
      status: !synced ? 'todo' : noAudio ? 'warn' : 'ok',
      detail: !synced ? syncFirst : noAudio ? `${plural(noAudio, 'song')} can't play on visitors' phones yet` : "Every song can play on visitors' phones",
      tab: 'songs',
      filter: 'audio',
    },
    {
      id: 'playlists',
      title: 'Playlists for visitors',
      status: summary.offeredPlaylists ? 'ok' : 'todo',
      detail: summary.offeredPlaylists
        ? `${plural(summary.offeredPlaylists, 'playlist')} offered for ${summary.themeName}`
        : `None offered for ${summary.themeName} (optional)`,
      tab: 'playlists',
    },
    {
      id: 'rules',
      title: 'Request rules',
      status: 'ok',
      detail: `${plural(summary.rateLimit, 'request')} per visitor per hour`,
      tab: 'rules',
    },
    {
      id: 'visitor',
      title: 'Visitor page',
      status: summary.hasLogo || summary.siteName ? 'ok' : 'todo',
      detail: summary.hasLogo
        ? `${summary.themeName} theme with your logo`
        : summary.siteName
          ? `${summary.themeName} theme, showing "${summary.siteName}"`
          : `Add a show name or upload a ${summary.themeName} logo`,
      tab: 'visitor',
    },
  ];
}
