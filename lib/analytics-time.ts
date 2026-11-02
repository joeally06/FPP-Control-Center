import { DateTime } from 'luxon';
import type Database from 'better-sqlite3';
import { APP_TIMEZONE, parseDbTimestamp } from './time-utils';

// The database stores UTC ('YYYY-MM-DD HH:MM:SS'). The analytics pages show the show's own clock
// (APP_TIMEZONE), so days, hours and weekdays are worked out here instead of in SQL: SQLite has no
// timezone database, and its 'localtime' is whatever the operating system is set to.

const SQL_FORMAT = 'yyyy-MM-dd HH:mm:ss';

/** The start of the local day `days - 1` days ago, as a UTC string to compare against stored times. */
export function windowStartUtc(days: number, now: DateTime = DateTime.now(), zone: string = APP_TIMEZONE): string {
  return now.setZone(zone).startOf('day').minus({ days: days - 1 }).toUTC().toFormat(SQL_FORMAT);
}

/** The local dates ('YYYY-MM-DD') of the last `days` days, oldest first, ending today. */
export function localDayKeys(days: number, now: DateTime = DateTime.now(), zone: string = APP_TIMEZONE): string[] {
  const today = now.setZone(zone).startOf('day');
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(today.minus({ days: i }).toFormat('yyyy-MM-dd'));
  return keys;
}

/** Today's date on the show's clock, for file names. */
export function localDateStamp(now: DateTime = DateTime.now(), zone: string = APP_TIMEZONE): string {
  return now.setZone(zone).toFormat('yyyy-MM-dd');
}

/** A stored UTC time shown on the show's clock, e.g. '2026-11-02 19:30:00'. Unreadable input is returned as is. */
export function utcSqlToLocal(value: string | null | undefined, zone: string = APP_TIMEZONE): string {
  if (!value) return '';
  const parsed = parseDbTimestamp(value);
  return parsed ? parsed.setZone(zone).toFormat(SQL_FORMAT) : value;
}

/** The zone's short name right now, e.g. 'CST' or 'CDT'. */
export function zoneAbbr(now: DateTime = DateTime.now(), zone: string = APP_TIMEZONE): string {
  return now.setZone(zone).toFormat('ZZZZ');
}

type Bucket = Record<string, string | number>;

/**
 * Regroups rows counted per UTC hour (`bucket` = 'YYYY-MM-DD HH') by something about the local time of that hour,
 * adding up `fields`. Done per hour, not per row, so a long history stays cheap; the offset is exact for each hour,
 * including across a daylight saving change.
 */
export function sumByLocal<K extends string | number>(
  rows: Bucket[],
  zone: string,
  keyOf: (local: DateTime) => K,
  fields: string[]
): Map<K, Record<string, number>> {
  const out = new Map<K, Record<string, number>>();
  for (const row of rows) {
    const local = DateTime.fromFormat(String(row.bucket), 'yyyy-MM-dd HH', { zone: 'utc' }).setZone(zone);
    if (!local.isValid) continue;
    const key = keyOf(local);
    const total = out.get(key) ?? Object.fromEntries(fields.map((f) => [f, 0]));
    for (const f of fields) total[f] += Number(row[f]) || 0;
    out.set(key, total);
  }
  return out;
}

const byLocalDate = (local: DateTime) => local.toFormat('yyyy-MM-dd');
const byLocalHour = (local: DateTime) => local.hour;
const bySundayFirstWeekday = (local: DateTime) => local.weekday % 7; // luxon: Monday = 1 ... Sunday = 7

/** Page views for the dashboard: total, today, each day of the window, and the busiest hour of the day. */
export function pageViewStats(db: Database.Database, days: number, now: DateTime = DateTime.now(), zone: string = APP_TIMEZONE) {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m-%d %H', view_time) AS bucket, COUNT(*) AS n
    FROM page_views
    WHERE view_time >= ?
    GROUP BY bucket
  `).all(windowStartUtc(days, now, zone)) as Bucket[];

  const daily = sumByLocal(rows, zone, byLocalDate, ['n']);
  const trends = localDayKeys(days, now, zone).map((date) => ({ date, views: daily.get(date)?.n ?? 0 }));

  let peakHour: number | null = null;
  let peakCount = 0;
  for (const [hour, { n }] of [...sumByLocal(rows, zone, byLocalHour, ['n'])].sort((a, b) => a[0] - b[0])) {
    if (n > peakCount) {
      peakCount = n;
      peakHour = hour;
    }
  }

  return {
    totalViews: trends.reduce((sum, day) => sum + day.views, 0),
    todayViews: trends[trends.length - 1]?.views ?? 0,
    peakHour,
    trends,
  };
}

/** Votes per local day for the last 30 days, and per local hour of the day over all time. */
export function voteTimeStats(db: Database.Database, zone: string = APP_TIMEZONE) {
  const fields = ['vote_count', 'upvotes', 'downvotes'];
  const select = (where: string) => db.prepare(`
    SELECT strftime('%Y-%m-%d %H', created_at) AS bucket,
      COUNT(*) AS vote_count,
      SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) AS upvotes,
      SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) AS downvotes
    FROM votes ${where}
    GROUP BY bucket
  `).all() as Bucket[];

  const votingTrend = [...sumByLocal(select("WHERE created_at >= datetime('now', '-30 days')"), zone, byLocalDate, fields)]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, c]) => ({ date, vote_count: c.vote_count, upvotes: c.upvotes, downvotes: c.downvotes }));
  const votingByHour = [...sumByLocal(select(''), zone, byLocalHour, fields)]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, c]) => ({ hour, vote_count: c.vote_count, upvotes: c.upvotes, downvotes: c.downvotes }));
  return { votingTrend, votingByHour };
}

/** Song requests per local hour of the day and per local weekday (0 = Sunday), over all time. */
export function requestTimeStats(db: Database.Database, zone: string = APP_TIMEZONE) {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m-%d %H', created_at) AS bucket, COUNT(*) AS request_count
    FROM jukebox_queue
    GROUP BY bucket
  `).all() as Bucket[];

  const requestsByHour = [...sumByLocal(rows, zone, byLocalHour, ['request_count'])]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, c]) => ({ hour, request_count: c.request_count }));
  const requestsByDay = [...sumByLocal(rows, zone, bySundayFirstWeekday, ['request_count'])]
    .sort((a, b) => a[0] - b[0])
    .map(([day, c]) => ({ day, request_count: c.request_count }));
  return { requestsByHour, requestsByDay };
}
