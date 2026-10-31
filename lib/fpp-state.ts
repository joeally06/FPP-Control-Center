// Helpers for the cached FPP player state (the single fpp_state row written by the poller).
// A failed poll leaves the last known status in place, so once FPP stops answering these decide what readers may trust.

import type Database from 'better-sqlite3';
import { parseDbTimestamp } from './time-utils';

/** A "playing" row older than this is not trusted (the poller refreshes it every few seconds) */
export const PLAYING_MAX_AGE_SECONDS = 60;

/** Forget what was playing, so nothing reads the last known song as live. The error fields are left for the failed poll to set. */
export function markFppOffline(db: Database.Database): void {
  db.prepare(`
    UPDATE fpp_state
    SET status = 'offline',
        current_sequence = NULL,
        current_playlist = NULL,
        current_playlist_index = NULL,
        current_playlist_count = NULL,
        seconds_played = 0,
        seconds_remaining = 0
    WHERE id = 1
  `).run();
}

/** A row of fpp_state (the table holds one row, id = 1), with the columns its readers use */
export interface FppStateRow {
  status: string | null;
  current_sequence: string | null;
  current_playlist: string | null;
  current_playlist_index: number | null;
  current_playlist_count: number | null;
  seconds_played: number | null;
  seconds_remaining: number | null;
  volume: number | null;
  mode: string | null;
  uptime: number | null;
  last_poll_success: number | null;
  last_error: string | null;
  last_updated: string | null;
}

interface CachedPlayerState {
  status?: string | null;
  current_sequence?: string | null;
  last_updated?: string | null;
}

/** True when the cached state says a sequence is playing and was written recently */
export function isFreshPlaying<T extends CachedPlayerState>(
  state: T | null | undefined,
  nowMs: number = Date.now(),
  maxAgeSeconds: number = PLAYING_MAX_AGE_SECONDS,
): state is T & { status: 'playing'; current_sequence: string } {
  if (!state || state.status !== 'playing' || !state.current_sequence) return false;
  const updatedMs = parseDbTimestamp(state.last_updated)?.toMillis();
  if (updatedMs === undefined || !Number.isFinite(updatedMs)) return false;
  return (nowMs - updatedMs) / 1000 <= maxAgeSeconds;
}
