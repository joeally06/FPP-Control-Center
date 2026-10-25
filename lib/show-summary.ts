// Read-only numbers for the admin Show page: today's activity, letters waiting and device health.
// Everything comes from SQLite; nothing here talks to the FPP player.

import type BetterSqlite3 from 'better-sqlite3';
import type { DateTime } from 'luxon';

type Db = BetterSqlite3.Database;

export interface OfflineDevice {
  id: string;
  name: string;
  lastSeenOnline: string | null;
}

export interface ShowSummary {
  requestsToday: number;
  votesToday: number;
  lettersPending: number;
  oldestPendingLetterAt: string | null;
  devicesTotal: number;
  devicesOnline: number;
  offlineDevices: OfflineDevice[];
}

/**
 * Midnight of the show's local day, as a SQLite UTC timestamp ('YYYY-MM-DD HH:mm:ss').
 * The counted columns default to CURRENT_TIMESTAMP (UTC, same format), so they compare as strings.
 */
export function startOfShowDayUtc(now: DateTime, zone: string): string {
  return now.setZone(zone).startOf('day').toUTC().toFormat('yyyy-MM-dd HH:mm:ss');
}

export function getShowSummary(db: Db, sinceUtc: string): ShowSummary {
  const count = (sql: string) => (db.prepare(sql).get(sinceUtc) as { count: number }).count;

  const letters = db.prepare(`
    SELECT COUNT(*) AS count, MIN(created_at) AS oldest FROM santa_letters WHERE status = 'pending'
  `).get() as { count: number; oldest: string | null };

  // Devices never checked yet have no status row: they count as neither online nor offline
  const devices = db.prepare(`
    SELECT d.id, d.name, s.is_online, s.last_seen_online
    FROM devices d
    LEFT JOIN device_status s ON s.device_id = d.id
    WHERE d.enabled = 1
    ORDER BY d.name
  `).all() as { id: string; name: string; is_online: number | null; last_seen_online: string | null }[];

  return {
    requestsToday: count('SELECT COUNT(*) AS count FROM jukebox_queue WHERE created_at >= ?'),
    votesToday: count('SELECT COUNT(*) AS count FROM votes WHERE created_at >= ?'),
    lettersPending: letters.count,
    oldestPendingLetterAt: letters.oldest,
    devicesTotal: devices.length,
    devicesOnline: devices.filter((d) => d.is_online === 1).length,
    offlineDevices: devices
      .filter((d) => d.is_online === 0)
      .map((d) => ({ id: d.id, name: d.name, lastSeenOnline: d.last_seen_online })),
  };
}
