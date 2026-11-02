// The computer's own clock is set somewhere else on purpose: results must follow the show's timezone, not the OS.
process.env.TZ = 'Asia/Tokyo';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { DateTime } from 'luxon';
import Database from 'better-sqlite3';
import {
  localDateStamp,
  localDayKeys,
  pageViewStats,
  requestTimeStats,
  sumByLocal,
  utcSqlToLocal,
  voteTimeStats,
  windowStartUtc,
  zoneAbbr,
} from '../lib/analytics-time';

function print(msg: string) {
  console.log('[test-analytics-time] ' + msg);
}

const ZONE = 'America/Chicago';
// 8:30 PM on Oct 28 in Chicago (CDT) is already Oct 29 in UTC - the case the old code got wrong
const evening = DateTime.fromISO('2026-10-28T20:30:00', { zone: ZONE });
assert.strictEqual(evening.toUTC().toFormat('yyyy-MM-dd'), '2026-10-29');

print('Test 1: the window and the days follow the show\'s clock, not UTC');
assert.strictEqual(localDateStamp(evening, ZONE), '2026-10-28', 'file names use the show\'s date');
assert.deepStrictEqual(localDayKeys(7, evening, ZONE), ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28']);
assert.strictEqual(localDayKeys(30, evening, ZONE).length, 30);
assert.strictEqual(windowStartUtc(7, evening, ZONE), '2026-10-22 05:00:00', 'local midnight (CDT = UTC-5) as a UTC string');
// across the November clock change: midnight on Oct 27 is still CDT, today is CST
const afterChange = DateTime.fromISO('2026-11-02T12:00:00', { zone: ZONE });
assert.strictEqual(windowStartUtc(7, afterChange, ZONE), '2026-10-27 05:00:00');
assert.strictEqual(windowStartUtc(1, afterChange, ZONE), '2026-11-02 06:00:00', 'a CST midnight is UTC-6');
assert.deepStrictEqual(localDayKeys(3, afterChange, ZONE), ['2026-10-31', '2026-11-01', '2026-11-02']);
assert.strictEqual(zoneAbbr(evening, ZONE), 'CDT');
assert.strictEqual(zoneAbbr(afterChange, ZONE), 'CST');

print('Test 2: stored UTC times are shown on the show\'s clock');
assert.strictEqual(utcSqlToLocal('2026-10-29 01:15:00', ZONE), '2026-10-28 20:15:00');
assert.strictEqual(utcSqlToLocal('2026-11-02 18:00:00', ZONE), '2026-11-02 12:00:00', 'CST after the change');
assert.strictEqual(utcSqlToLocal('2026-10-29T01:15:00Z', ZONE), '2026-10-28 20:15:00', 'ISO form too');
assert.strictEqual(utcSqlToLocal(null, ZONE), '');
assert.strictEqual(utcSqlToLocal('not a date', ZONE), 'not a date');

print('Test 3: per-hour counts regroup exactly across the clock change');
{
  // Nov 1 2026: clocks go back at 2:00 AM CDT = 07:00 UTC, so local 1 AM happens twice
  const rows = [
    { bucket: '2026-11-01 05', n: 1 }, // 00:00 CDT
    { bucket: '2026-11-01 06', n: 2 }, // 01:00 CDT
    { bucket: '2026-11-01 07', n: 4 }, // 01:00 CST (the repeated hour)
    { bucket: '2026-11-01 08', n: 8 }, // 02:00 CST
  ];
  const byHour = sumByLocal(rows, ZONE, (local) => local.hour, ['n']);
  assert.deepStrictEqual([...byHour].map(([h, v]) => [h, v.n]), [[0, 1], [1, 6], [2, 8]]);
  const byDate = sumByLocal(rows, ZONE, (local) => local.toFormat('yyyy-MM-dd'), ['n']);
  assert.deepStrictEqual([...byDate].map(([d, v]) => [d, v.n]), [['2026-11-01', 15]]);
}

print('Test 4: page views - an evening view counts for today, the window starts at local midnight, the peak hour is local');
{
  const db = new Database(':memory:');
  db.exec('CREATE TABLE page_views (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER, page_path TEXT, view_time DATETIME)');
  const insert = db.prepare('INSERT INTO page_views (session_id, page_path, view_time) VALUES (1, ?, ?)');
  for (const t of [
    '2026-10-29 01:15:00', // 8:15 PM CDT Oct 28 - today
    '2026-10-29 01:20:00', // 8:20 PM CDT Oct 28 - today
    '2026-10-28 23:30:00', // 6:30 PM CDT Oct 28 - today (the old code started "tomorrow" at 7 PM)
    '2026-10-28 04:59:00', // 11:59 PM CDT Oct 27
    '2026-10-22 05:00:00', // midnight CDT Oct 22 - first moment of the window
    '2026-10-22 04:59:59', // one second earlier - outside
  ]) insert.run('/jukebox', t);

  const stats = pageViewStats(db, 7, evening, ZONE);
  assert.strictEqual(stats.todayViews, 3);
  assert.strictEqual(stats.totalViews, 5);
  assert.strictEqual(stats.trends.length, 7);
  assert.deepStrictEqual(stats.trends[0], { date: '2026-10-22', views: 1 });
  assert.deepStrictEqual(stats.trends[5], { date: '2026-10-27', views: 1 });
  assert.deepStrictEqual(stats.trends[6], { date: '2026-10-28', views: 3 }, 'tonight\'s views are on tonight\'s date');
  assert.ok(!stats.trends.some((d) => d.date === '2026-10-29'), 'no day in the future');
  assert.strictEqual(stats.peakHour, 20, '8 PM local, not the UTC hour');
  assert.deepStrictEqual(pageViewStats(new Database(':memory:').exec('CREATE TABLE page_views (view_time DATETIME)') && db, 7, DateTime.fromISO('2027-01-01T12:00:00', { zone: ZONE }), ZONE).peakHour, null, 'nothing in the window → no peak');
  db.close();
}

print('Test 5: requests by hour and by weekday (0 = Sunday) are local');
{
  const db = new Database(':memory:');
  db.exec('CREATE TABLE jukebox_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at DATETIME)');
  const insert = db.prepare('INSERT INTO jukebox_queue (created_at) VALUES (?)');
  for (const t of [
    '2026-11-01 18:00:00', // Sunday Nov 1, 12:00 CST
    '2026-11-01 18:30:00', // Sunday 12:30 CST
    '2026-11-02 02:00:00', // Sunday Nov 1, 8:00 PM CST (already Monday in UTC)
    '2026-11-01 05:30:00', // Sunday Nov 1, 00:30 CDT
    '2026-10-31 23:00:00', // Saturday Oct 31, 18:00 CDT
  ]) insert.run(t);

  const { requestsByHour, requestsByDay } = requestTimeStats(db, ZONE);
  assert.deepStrictEqual(requestsByHour, [
    { hour: 0, request_count: 1 },
    { hour: 12, request_count: 2 },
    { hour: 18, request_count: 1 },
    { hour: 20, request_count: 1 },
  ]);
  assert.deepStrictEqual(requestsByDay, [
    { day: 0, request_count: 4 },
    { day: 6, request_count: 1 },
  ], 'the 8 PM Sunday request is Sunday, not Monday');
  db.close();
}

print('Test 6: votes by hour (all time) and by day (last 30 days) are local');
{
  const db = new Database(':memory:');
  db.exec('CREATE TABLE votes (id INTEGER PRIMARY KEY AUTOINCREMENT, sequence_name TEXT, vote_type TEXT, created_at DATETIME)');
  const insert = db.prepare('INSERT INTO votes (sequence_name, vote_type, created_at) VALUES (?, ?, ?)');
  insert.run('A', 'up', '2026-10-29 01:15:00'); // 8:15 PM CDT
  insert.run('B', 'down', '2026-10-29 01:40:00'); // 8:40 PM CDT
  insert.run('C', 'up', '2026-10-29 03:05:00'); // 10:05 PM CDT
  // recent votes: where they land depends on today's real date, so compute the expected local day from the stored time
  db.prepare("INSERT INTO votes (sequence_name, vote_type, created_at) VALUES ('D', 'up', datetime('now', '-1 hours'))").run();
  db.prepare("INSERT INTO votes (sequence_name, vote_type, created_at) VALUES ('E', 'down', datetime('now', '-45 days'))").run();

  const { votingTrend, votingByHour } = voteTimeStats(db, ZONE);
  const hour20 = votingByHour.find((h) => h.hour === 20);
  assert.deepStrictEqual(hour20, { hour: 20, vote_count: 2, upvotes: 1, downvotes: 1 });
  assert.strictEqual(votingByHour.find((h) => h.hour === 22)?.vote_count, 1);
  assert.deepStrictEqual(votingByHour.map((h) => h.hour), [...votingByHour.map((h) => h.hour)].sort((a, b) => a - b), 'sorted by hour');
  assert.strictEqual(votingByHour.reduce((sum, h) => sum + h.vote_count, 0), 5, 'all-time hours count every vote');

  const recent = db.prepare("SELECT created_at FROM votes WHERE sequence_name = 'D'").get() as { created_at: string };
  const expectedDay = DateTime.fromSQL(recent.created_at, { zone: 'utc' }).setZone(ZONE).toFormat('yyyy-MM-dd');
  assert.ok(votingTrend.some((d) => d.date === expectedDay && d.vote_count >= 1), 'the recent vote is on its local day');
  const old = db.prepare("SELECT created_at FROM votes WHERE sequence_name = 'E'").get() as { created_at: string };
  const oldDay = DateTime.fromSQL(old.created_at, { zone: 'utc' }).setZone(ZONE).toFormat('yyyy-MM-dd');
  assert.ok(!votingTrend.some((d) => d.date === oldDay), 'votes older than 30 days are not in the trend');
  assert.ok(votingByHour.reduce((sum, h) => sum + h.vote_count, 0) >= 5, 'but the by-hour chart still counts them');
  db.close();
}

print('Test 7: no analytics code goes back to UTC dates or SQL localtime');
{
  const root = process.cwd();
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  for (const dir of ['app/api/analytics', 'app/analytics', 'components/analytics']) walk(path.join(root, dir));
  files.push(path.join(root, 'lib', 'csv-export.ts'));

  const banned: Array<[RegExp, string]> = [
    [/toISOString\(\)\s*\.split\(/, 'toISOString().split(...) is the UTC date; use localDateStamp()'],
    [/'localtime'/, "SQLite's localtime is the operating system's clock; use lib/analytics-time.ts"],
    [/strftime\(\s*'%[HwdmY]'\s*,\s*(created_at|view_time)/, 'grouping by a UTC hour/weekday in SQL; use lib/analytics-time.ts'],
    [/\bDATE\(\s*(created_at|view_time)\s*\)/, 'grouping by the UTC date in SQL; use lib/analytics-time.ts'],
    [/new Date\([^)]*(view_time|created_at|played_at|last_requested)[^)]*\)/, 'a stored UTC time parsed as local; use formatDateTime()/utcSqlToLocal()'],
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf-8');
    for (const [pattern, why] of banned) {
      if (pattern.test(text)) offenders.push(`${path.relative(root, file).split(path.sep).join('/')}: ${why}`);
    }
  }
  assert.deepStrictEqual(offenders, []);
  assert.ok(files.length >= 8, `the scan found the analytics files (${files.length})`);
}

print('All tests passed');
