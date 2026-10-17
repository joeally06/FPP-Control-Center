// Pure helpers for the public jukebox page and its public API responses.

/** Queue row fields that are safe to send to any visitor (no IP, no location). */
export interface PublicQueueItem {
  id: number;
  sequence_name: string;
  media_name: string | null;
  requester_name: string | null;
  status: string;
  priority: number;
  created_at: string;
  played_at: string | null;
}

interface QueueRowLike {
  id: number;
  sequence_name: string;
  media_name?: string | null;
  requester_name?: string | null;
  status: string;
  priority?: number | null;
  created_at: string;
  played_at?: string | null;
}

export function toPublicQueueItem(row: QueueRowLike): PublicQueueItem {
  return {
    id: row.id,
    sequence_name: row.sequence_name,
    media_name: row.media_name ?? null,
    requester_name: row.requester_name ?? null,
    status: row.status,
    priority: row.priority ?? 0,
    created_at: row.created_at,
    played_at: row.played_at ?? null,
  };
}

/** FPP reports "Song.fseq"; the jukebox stores "Song". */
export function stripFseq(name: string | null | undefined): string {
  return (name ?? '').replace(/\.fseq$/i, '');
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** FPP schedule times are "HH:MM" or "HH:MM:SS" (24h) → "6:00 PM". Returns '' for anything else. */
export function formatShowTime(time: string | null | undefined): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!match) return '';
  const hours = parseInt(match[1], 10);
  if (hours > 23) return '';
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hours12}:${match[2]} ${period}`;
}

export type RequestButtonState = 'playing' | 'queued' | 'limit' | 'available';

export function requestButtonState(input: {
  name: string;
  currentSequence: string | null;
  queuedNames: string[];
  requestsRemaining: number | null;
}): RequestButtonState {
  if (input.currentSequence && stripFseq(input.currentSequence) === input.name) return 'playing';
  if (input.queuedNames.includes(input.name)) return 'queued';
  if (input.requestsRemaining === 0) return 'limit';
  return 'available';
}

const MAX_COURTESY_LINES = 5;
const MAX_COURTESY_LINE_LENGTH = 120;

/** Shown when the courtesy card is enabled but the admin hasn't written their own text. */
export const DEFAULT_COURTESY_TEXT = [
  'Switch to parking lights while you watch.',
  'Keep driveways and traffic lanes clear.',
  'Keep car audio inside your car.',
].join('\n');

/** "Behind the Pixels" fields: settings key, visitor label, admin placeholder. Empty values are hidden. */
export const SHOW_SPEC_FIELDS = [
  { key: 'jukebox_spec_pixels', label: 'Smart RGB pixels', placeholder: 'e.g. 14,250' },
  { key: 'jukebox_spec_universes', label: 'E1.31 / DMX universes', placeholder: 'e.g. 48' },
  { key: 'jukebox_spec_wiring', label: 'Wiring', placeholder: 'e.g. 2.1 miles' },
  { key: 'jukebox_spec_software', label: 'Software', placeholder: 'e.g. xLights + Falcon Player' },
] as const;

export interface ShowSpec {
  label: string;
  value: string;
}

/** Specs to show visitors: only filled-in fields, none when the card is switched off. */
export function buildShowSpecs(enabled: boolean, getValue: (key: string) => string | null | undefined): ShowSpec[] {
  if (!enabled) return [];
  return SHOW_SPEC_FIELDS.map((field) => ({ label: field.label, value: (getValue(field.key) ?? '').trim() })).filter(
    (spec) => spec.value !== ''
  );
}

/** Length limits for the visitor-page settings (enforced by PUT /api/settings). */
export const VISITOR_SETTING_LIMITS = {
  jukebox_fm_frequency: 40,
  jukebox_courtesy_text: 600,
  jukebox_spec_pixels: 40,
  jukebox_spec_universes: 40,
  jukebox_spec_wiring: 40,
  jukebox_spec_software: 40,
} as const;

/** Visitor-page on/off switches (stored as 'true' / 'false'). */
export const VISITOR_BOOLEAN_SETTINGS = ['jukebox_courtesy_enabled', 'jukebox_specs_enabled', 'jukebox_audience_enabled'] as const;

export function parseCourtesyLines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim().slice(0, MAX_COURTESY_LINE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_COURTESY_LINES);
}

/** A requestable song with the details the catalog shows (all display-only). */
export interface CatalogSong {
  name: string;
  title: string | null;
  artist: string | null;
  durationSeconds: number | null;
  category: string | null;
}

export const MAX_CATEGORY_LENGTH = 30;

/** Shown as suggestions in the admin category field. */
export const SUGGESTED_CATEGORIES = ['Classics', 'Rock', 'Kids', 'Halloween'];

/** Admin-entered category → trimmed, single-spaced, at most 30 chars; null when empty. Throws on invalid input. */
export function normalizeCategory(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('Category must be text');
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error('Category contains invalid characters');
  const category = value.trim().replace(/\s+/g, ' ');
  if (category.length > MAX_CATEGORY_LENGTH) throw new Error(`Category must be at most ${MAX_CATEGORY_LENGTH} characters`);
  return category || null;
}

/** FPP playlist item duration in seconds → stored value, or null when missing or implausible. */
export function toSongDuration(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 3600 ? value : null;
}

/** "Artist · 3:15" - each part only when known; '' when neither is. */
export function songDetailsLine(song: Pick<CatalogSong, 'artist' | 'durationSeconds'>): string {
  return [song.artist, song.durationSeconds != null ? formatClock(song.durationSeconds) : null].filter(Boolean).join(' · ');
}

/** Distinct categories in use, sorted for the filter pills. */
export function songCategories(songs: CatalogSong[]): string[] {
  const categories = new Set<string>();
  for (const song of songs) if (song.category) categories.add(song.category);
  return [...categories].sort((a, b) => a.localeCompare(b));
}

/** Search (name, title, artist; case-insensitive) combined with an optional category filter. */
export function filterSongs(songs: CatalogSong[], query: string, category: string | null): CatalogSong[] {
  const q = query.trim().toLowerCase();
  return songs.filter((song) => {
    if (category && song.category !== category) return false;
    if (!q) return true;
    return [song.name, song.title, song.artist].some((text) => text?.toLowerCase().includes(q));
  });
}

/**
 * Seconds until each queued song starts: the current song's remaining time plus the lengths of
 * everything ahead of it. Null from the first song whose wait depends on an unknown length.
 * Pass one extra trailing entry to get the wait for a song that would join the end of the queue.
 */
export function estimateWaits(currentRemainingSec: number | null, durations: (number | null)[]): (number | null)[] {
  const waits: (number | null)[] = [];
  let wait = currentRemainingSec;
  for (const duration of durations) {
    waits.push(wait);
    wait = wait === null || duration === null ? null : wait + duration;
  }
  return waits;
}
