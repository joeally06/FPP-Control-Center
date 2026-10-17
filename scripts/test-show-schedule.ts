import assert from 'assert';
import { DateTime } from 'luxon';
import { DAY_NAMES, dayIndex, findShowWindow, formatCountdown, isInDailyWindow, type FppScheduleEntry } from '../lib/show-schedule';

function print(msg: string) {
  console.log('[test-show-schedule] ' + msg);
}

const ZONE = 'America/Chicago';
const at = (iso: string) => DateTime.fromISO(iso, { zone: ZONE });

// The show's real FPP schedule (2026): daily 6:45-10:30 PM in October, plus two empty-playlist entries
const halloween: FppScheduleEntry[] = [
  { enabled: 1, day: 7, playlist: 'Halloween 2026', startTime: '18:45:00', endTime: '22:30:00', startDate: '2026-10-02', endDate: '2026-10-31' },
  { enabled: 1, day: 7, playlist: '', startTime: '22:30:00', endTime: '22:30:00', startDate: '2026-10-02', endDate: '2026-01-04' },
  { enabled: 1, day: 7, playlist: '', startTime: '22:35:00', endTime: '22:35:00', startDate: '2026-10-02', endDate: '2026-01-04' },
];

function summary(entries: FppScheduleEntry[], now: DateTime) {
  const w = findShowWindow(entries, now);
  return {
    live: w.isActiveBySchedule,
    until: w.currentShowEndTime,
    next: w.nextShow ? `${DAY_NAMES[dayIndex(w.nextShow.start)]} ${w.nextShow.start.toFormat('yyyy-MM-dd HH:mm')}` : null,
    countdown: w.nextShow ? formatCountdown(w.nextShow.start, now) : null,
  };
}

try {
  // Test 1: the reported case - Saturday afternoon is not "live", whatever zone the server runs in
  print('Test 1: afternoon before the show');
  const afternoon = at('2026-10-17T15:16:00');
  const expected = { live: false, until: null, next: 'Saturday 2026-10-17 18:45', countdown: '3h 29m' };
  assert.deepStrictEqual(summary(halloween, afternoon), expected);
  // The same instant handed in as UTC (what a UTC server's clock reads) gives the same answer once set to the show zone
  assert.deepStrictEqual(summary(halloween, afternoon.toUTC().setZone(ZONE)), expected);
  print('Test 1 OK');

  // Test 2: during, at the edges, and after the show
  print('Test 2: live window');
  assert.deepStrictEqual(summary(halloween, at('2026-10-17T20:00:00')), { live: true, until: '22:30:00', next: null, countdown: null });
  assert.strictEqual(summary(halloween, at('2026-10-17T18:45:00')).live, true, 'starts at 6:45');
  assert.strictEqual(summary(halloween, at('2026-10-17T18:44:00')).live, false);
  assert.strictEqual(summary(halloween, at('2026-10-17T22:30:00')).live, false, 'over at 10:30');
  assert.deepStrictEqual(summary(halloween, at('2026-10-17T22:45:00')), { live: false, until: null, next: 'Sunday 2026-10-18 18:45', countdown: '20h 0m' });
  print('Test 2 OK');

  // Test 3: the season's date range, in show-local dates
  print('Test 3: date range');
  assert.deepStrictEqual(summary(halloween, at('2026-10-01T12:00:00')).next, 'Friday 2026-10-02 18:45', 'before the season');
  assert.strictEqual(summary(halloween, at('2026-10-31T20:00:00')).live, true, 'last night');
  assert.deepStrictEqual(summary(halloween, at('2026-10-31T23:00:00')), { live: false, until: null, next: null, countdown: null }, 'season over');
  // 31 Oct 7:30 PM Central is already 1 Nov in UTC: still the last night of the season
  assert.strictEqual(summary(halloween, at('2026-10-31T19:30:00')).live, true);
  print('Test 3 OK');

  // Test 4: a specific weekday, and the countdown across the end of daylight saving (1 Nov 2026)
  print('Test 4: weekday and DST');
  const saturdays: FppScheduleEntry[] = [{ enabled: true, day: 6, playlist: 'Christmas', startTime: '18:00', endTime: '22:00' }];
  assert.strictEqual(summary(saturdays, at('2026-12-02T12:00:00')).next, 'Saturday 2026-12-05 18:00');
  assert.strictEqual(summary(saturdays, at('2026-12-05T19:00:00')).live, true);
  const daily: FppScheduleEntry[] = [{ enabled: 1, day: 7, playlist: 'Show', startTime: '18:45:00', endTime: '22:30:00' }];
  // 10:45 PM CDT -> 6:45 PM CST next day is 21 real hours, not 20
  assert.deepStrictEqual(summary(daily, at('2026-10-31T22:45:00')).countdown, '21h 0m');
  assert.strictEqual(findShowWindow(daily, at('2026-10-31T22:45:00')).nextShow?.start.toUTC().toISO(), '2026-11-02T00:45:00.000Z');
  print('Test 4 OK');

  // Test 5: disabled entries and entries without a playlist never count
  print('Test 5: ignored entries');
  const ignored: FppScheduleEntry[] = [
    { enabled: 0, day: 7, playlist: 'Off', startTime: '12:00', endTime: '23:00' },
    { enabled: 1, day: 7, playlist: '  ', startTime: '12:00', endTime: '23:00' },
  ];
  assert.deepStrictEqual(summary(ignored, at('2026-10-17T15:00:00')), { live: false, until: null, next: null, countdown: null });
  print('Test 5 OK');

  // Test 6: countdown formats
  print('Test 6: formatCountdown');
  const now = at('2026-10-17T12:00:00');
  assert.strictEqual(formatCountdown(now.plus({ minutes: 12 }), now), '12m');
  assert.strictEqual(formatCountdown(now.plus({ hours: 3, minutes: 5 }), now), '3h 5m');
  assert.strictEqual(formatCountdown(now.plus({ days: 2, hours: 5 }), now), '2d 5h');
  print('Test 6 OK');

  // Test 7: display-sign schedule rules use the show's weekday and time
  print('Test 7: isInDailyWindow');
  const weekendEvenings = { days: '5,6', startTime: '18:00', endTime: '22:00' }; // Friday, Saturday
  assert.strictEqual(isInDailyWindow(weekendEvenings, at('2026-10-17T19:30:00')), true, 'Saturday 7:30 PM');
  assert.strictEqual(isInDailyWindow(weekendEvenings, at('2026-10-17T18:00:00')), true, 'start is inclusive');
  assert.strictEqual(isInDailyWindow(weekendEvenings, at('2026-10-17T22:00:00')), true, 'end is inclusive');
  assert.strictEqual(isInDailyWindow(weekendEvenings, at('2026-10-17T22:01:00')), false);
  assert.strictEqual(isInDailyWindow(weekendEvenings, at('2026-10-17T15:16:00')), false, 'afternoon (8:16 PM in UTC)');
  assert.strictEqual(isInDailyWindow(weekendEvenings, at('2026-10-14T19:30:00')), false, 'Wednesday');
  // Saturday 7:30 PM Central is already Sunday 00:30 in UTC; still Saturday for the sign
  assert.strictEqual(isInDailyWindow({ days: '6', startTime: '19:00', endTime: '21:00' }, at('2026-10-17T19:30:00').toUTC().setZone(ZONE)), true);
  print('Test 7 OK');

  print('All tests passed');
} catch (err) {
  console.error('[test-show-schedule] FAILED:', err);
  process.exitCode = 1;
}
