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

/** Length limits for the visitor-page settings (enforced by PUT /api/settings). */
export const VISITOR_SETTING_LIMITS = {
  jukebox_fm_frequency: 40,
  jukebox_courtesy_text: 600,
} as const;

export function parseCourtesyLines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim().slice(0, MAX_COURTESY_LINE_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_COURTESY_LINES);
}
