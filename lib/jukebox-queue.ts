import Database from 'better-sqlite3';
import type { RequestKind } from './jukebox-display';

// A request counts toward the hourly limit if it was made in the last hour and not before the
// admin last cleared this visitor's limit (the playing song survives a clear but must not count).
// Timestamps have 1-second resolution: ">=" so requests in the same second as the clear still count;
// the playing song is always older than the clear (it waited in the queue first).
const RECENT_REQUESTS_SQL = `
  SELECT COUNT(*) as count FROM jukebox_queue
  WHERE requester_ip = ?
    AND created_at >= datetime('now', '-1 hour')
    AND created_at >= COALESCE((SELECT reset_at FROM jukebox_rate_limit_resets WHERE requester_ip = ?), '')
`;

/** Requests this visitor has used toward the hourly limit. */
export function countRecentRequests(db: Database.Database, requesterIp: string): number {
  return (db.prepare(RECENT_REQUESTS_SQL).get(requesterIp, requesterIp) as { count: number }).count;
}

/** Give a visitor their full allowance back: earlier requests stop counting. */
export function resetRequestLimit(db: Database.Database, requesterIp: string): void {
  db.prepare(`
    INSERT INTO jukebox_rate_limit_resets (requester_ip, reset_at) VALUES (?, CURRENT_TIMESTAMP)
    ON CONFLICT(requester_ip) DO UPDATE SET reset_at = CURRENT_TIMESTAMP
  `).run(requesterIp);
}

/**
 * Transactional insert of a jukebox queue item with rate-limit check.
 * Throws an error with code 'RATE_LIMIT_EXCEEDED' if limit reached.
 */
export function addToQueueTransactional(db: Database.Database, params: {
  sequence_name: string;
  media_name?: string | null;
  requester_name?: string | null;
  requester_ip: string;
  rateLimit: number;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  region?: string | null;
  countryCode?: string | null;
  distanceFromShow?: number | null;
  /** 'playlist': sequence_name is an FPP playlist name, and only one playlist may be in line at a time */
  request_kind?: RequestKind;
}) {
  const { 
    sequence_name, 
    media_name, 
    requester_name, 
    requester_ip, 
    rateLimit,
    latitude,
    longitude,
    city,
    region,
    countryCode,
    distanceFromShow,
    request_kind = 'song'
  } = params;
  const isPlaylist = request_kind === 'playlist';

  // request_kind is only written for playlists; song rows get the column default ('song')
  const insert = db.prepare(`
    INSERT INTO jukebox_queue (
      sequence_name, media_name, requester_name, requester_ip,
      latitude, longitude, city, region, country_code, distance_from_show${isPlaylist ? ', request_kind' : ''}
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?${isPlaylist ? ", 'playlist'" : ''})
  `);
  const activePlaylistStmt = isPlaylist
    ? db.prepare(`SELECT id FROM jukebox_queue WHERE request_kind = 'playlist' AND status IN ('pending', 'playing') LIMIT 1`)
    : null;
  const duplicateStmt = db.prepare(`SELECT id FROM jukebox_queue WHERE requester_ip = ? AND sequence_name = ? AND created_at >= datetime('now', '-5 minutes') LIMIT 1`);

  const tx = db.transaction(() => {
    // Check duplicate first
    const duplicate = duplicateStmt.get(requester_ip, sequence_name);
    if (duplicate) {
      const err: any = new Error('DuplicateRequest');
      err.code = 'DUPLICATE_REQUEST';
      throw err;
    }

    if (activePlaylistStmt?.get()) {
      throw Object.assign(new Error('PlaylistActive'), { code: 'PLAYLIST_ACTIVE' });
    }

    const used = countRecentRequests(db, requester_ip);

    if (used >= rateLimit) {
      const err: any = new Error('RateLimitExceeded');
      err.code = 'RATE_LIMIT_EXCEEDED';
      err.requestsUsed = used;
      throw err;
    }

    // Insert the queue item with location data
    const res = insert.run(
      sequence_name, 
      media_name || null, 
      requester_name || 'Anonymous', 
      requester_ip,
      latitude || null,
      longitude || null,
      city || null,
      region || null,
      countryCode || null,
      distanceFromShow || null
    );
    return { id: res.lastInsertRowid, requestsUsed: used + 1 };
  });

  return tx();
}

/** How long FPP gets to start a request after its turn should have come (it reports on a 10 s poll). */
export const START_GRACE_MS = 30_000;
/** A playlist still reported as playing this long after its known length is treated as finished. */
const PLAYLIST_OVERRUN_MS = 120_000;

/** A request the queue processor has sent to FPP and is watching. */
export interface MonitoredRequest {
  kind: RequestKind;
  /** Sequence name (with or without .fseq) or playlist name */
  name: string;
  status: string;
  /** Epoch ms by which FPP must have started a pending request */
  startDeadline: number;
  /** Epoch ms when FPP was first seen playing it (null while pending) */
  startedAt: number | null;
  /** Playlist length in seconds, when known */
  durationSec: number | null;
}

/** What FPP reports it is playing (from /api/fppd/status). */
export interface FppNowPlaying {
  currentSequence?: string | null;
  currentPlaylist?: string | null;
}

export type RequestProgress = 'started' | 'finished' | 'waiting' | 'gave_up';

/** Whether FPP is playing this request: the sequence for a song, the playlist for a playlist. */
export function isPlayingRequest(item: Pick<MonitoredRequest, 'kind' | 'name'>, fpp: FppNowPlaying): boolean {
  if (item.kind === 'playlist') return Boolean(fpp.currentPlaylist) && fpp.currentPlaylist === item.name;
  const sequence = item.name.endsWith('.fseq') ? item.name : `${item.name}.fseq`;
  return fpp.currentSequence === sequence;
}

/**
 * Next step for the request the processor is watching. A pending request waits until FPP starts it
 * (FPP holds only one pending insert, so nothing else may be sent meanwhile) or the deadline passes;
 * a playing request is finished once FPP moves on.
 */
export function queueItemProgress(item: MonitoredRequest, fpp: FppNowPlaying, now: number): RequestProgress {
  const playing = isPlayingRequest(item, fpp);
  if (item.status === 'pending') {
    if (playing) return 'started';
    return now > item.startDeadline ? 'gave_up' : 'waiting';
  }
  if (!playing) return 'finished';
  if (item.kind === 'playlist' && item.durationSec !== null && item.startedAt !== null &&
      now > item.startedAt + item.durationSec * 1000 + PLAYLIST_OVERRUN_MS) {
    return 'finished';
  }
  return 'waiting';
}

/**
 * When a request just sent to FPP must have started by: after the current song when the insert
 * waits for it (FPP reports seconds_remaining as a number or a string), plus the grace period.
 */
export function insertStartDeadline(now: number, waitsForCurrentSong: boolean, secondsRemaining: unknown): number {
  const remaining = waitsForCurrentSong ? Number(secondsRemaining) : 0;
  return now + (Number.isFinite(remaining) && remaining > 0 ? remaining * 1000 : 0) + START_GRACE_MS;
}
