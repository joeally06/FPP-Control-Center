import assert from 'assert';
import { DateTime } from 'luxon';
import {
  DAY_NAMES,
  activeSchedulePlaylists,
  dayIndex,
  dayMatches,
  findScheduledPlaylist,
  findShowWindow,
  formatCountdown,
  isInDailyWindow,
  playlistSeason,
  type FppScheduleEntry,
} from '../lib/show-schedule';

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

  // Test 8: FPP's day codes above 6 (2026-12-10 is a Thursday)
  print('Test 8: dayMatches');
  const thursday = at('2026-12-10T12:00:00');
  const friday = thursday.plus({ days: 1 });
  const saturday = thursday.plus({ days: 2 });
  const sunday = thursday.plus({ days: 3 });
  const monday = thursday.plus({ days: 4 });
  assert.deepStrictEqual([4, 5, 7].map((code) => dayMatches(code, thursday)), [true, false, true], 'Thursday is 4; 7 is every day');
  assert.deepStrictEqual([4, 5].map((code) => dayMatches(code, friday)), [false, true]);
  assert.deepStrictEqual([8, 9].map((code) => dayMatches(code, saturday)), [false, true], 'weekdays / weekend on Saturday');
  assert.deepStrictEqual([8, 9].map((code) => dayMatches(code, thursday)), [true, false]);
  assert.deepStrictEqual([10, 11].map((code) => dayMatches(code, monday)), [true, false], 'Mon/Wed/Fri vs Tue/Thu');
  assert.deepStrictEqual([10, 11].map((code) => dayMatches(code, thursday)), [false, true]);
  assert.deepStrictEqual([12, 13].map((code) => dayMatches(code, sunday)), [true, false], 'Sun-Thu vs Fri/Sat');
  assert.deepStrictEqual([12, 13].map((code) => dayMatches(code, friday)), [false, true]);
  assert.deepStrictEqual([14, 15].map((code) => dayMatches(code, thursday)), [false, true], 'the 10th is an even day');
  assert.deepStrictEqual([14, 15].map((code) => dayMatches(code, friday)), [true, false]);
  assert.strictEqual(dayMatches(undefined, thursday), false);
  // Day-mask form (0x10000 + weekday bits): the Sunday + Wednesday entry from FPP's Scheduler
  const sundayWednesday = 0x10000 | 0x4000 | 0x800;
  assert.deepStrictEqual([sunday, thursday.minus({ days: 1 }), thursday, monday].map((day) => dayMatches(sundayWednesday, day)), [true, true, false, false]);
  assert.strictEqual(dayMatches(0x10000 | 0x100, thursday.plus({ days: 2 })), true, 'Saturday bit');
  assert.strictEqual(dayMatches(0x10000 | 6, thursday), false, 'a mask with no weekday bit matches nothing');
  assert.strictEqual(summary([{ enabled: 1, day: sundayWednesday, playlist: 'Praise', startTime: '04:30', endTime: '22:30' }], sunday.set({ hour: 16, minute: 41 })).live, true, 'a day-mask show is on Sunday afternoon');
  // The next show now finds an entry on "Fri/Sat"
  const weekendShow: FppScheduleEntry[] = [{ enabled: 1, day: 13, playlist: 'Christmas', startTime: '18:00', endTime: '22:00' }];
  assert.deepStrictEqual(summary(weekendShow, thursday).next, 'Friday 2026-12-11 18:00');
  print('Test 8 OK');

  // Test 9: tonight's playlist
  print('Test 9: findScheduledPlaylist');
  const entry = (playlist: string, startTime: string, endTime: string, rest: Partial<FppScheduleEntry> = {}): FppScheduleEntry =>
    ({ enabled: 1, day: 7, playlist, startTime, endTime, ...rest });
  const twoShows = [entry('Late', '20:00', '22:00'), entry('Early', '17:00', '19:00')];
  assert.strictEqual(findScheduledPlaylist(twoShows, at('2026-12-10T12:00:00')), 'Early', 'the first show tonight');
  assert.strictEqual(findScheduledPlaylist(twoShows, at('2026-12-10T18:00:00')), 'Early', 'on now');
  assert.strictEqual(findScheduledPlaylist(twoShows, at('2026-12-10T19:30:00')), 'Late', 'the early show is over');
  assert.strictEqual(findScheduledPlaylist(twoShows, at('2026-12-10T22:30:00')), 'Early', 'tomorrow\'s first show');
  assert.strictEqual(findScheduledPlaylist([entry('Dusk Show', 'SunSet', '22:00')], at('2026-12-10T12:00:00')), 'Dusk Show', 'a sun-time start still counts for today');
  // A sun-time start comes before a show that starts when it ends, and after one that starts well before
  const sunThenLate = [entry('Late', '21:00', '22:30'), entry('Main', 'SunSet', '21:00')];
  assert.strictEqual(findScheduledPlaylist(sunThenLate, at('2026-12-10T19:00:00')), 'Main', 'on now, whatever the order in the file');
  assert.strictEqual(findScheduledPlaylist(sunThenLate, at('2026-12-10T21:30:00')), 'Late', 'the sun-time show is over');
  assert.strictEqual(findScheduledPlaylist([entry('Main', 'SunSet', '21:00'), entry('Afternoon', '15:00', '16:00')], at('2026-12-10T12:00:00')), 'Afternoon');
  // A show that runs past midnight is not over at 11 PM
  assert.strictEqual(findScheduledPlaylist([entry('Late Night', '17:00', '00:30')], at('2026-12-10T23:00:00')), 'Late Night');
  const sunPastMidnight = [entry('Dusk to late', 'SunSet', '00:30'), entry('Afternoon', '15:00', '16:00')];
  assert.strictEqual(findScheduledPlaylist(sunPastMidnight, at('2026-12-10T12:00:00')), 'Afternoon', 'a sun-time show that ends after midnight goes last');
  assert.strictEqual(findScheduledPlaylist(sunPastMidnight, at('2026-12-10T20:00:00')), 'Dusk to late', 'still on at 8 PM');
  assert.strictEqual(findScheduledPlaylist(sunPastMidnight, at('2026-12-10T23:30:00')), 'Dusk to late', 'not over before midnight');
  assert.strictEqual(findScheduledPlaylist(weekendShow, thursday), 'Christmas', 'the next show, not only today');
  assert.strictEqual(findScheduledPlaylist([entry('Off', '17:00', '19:00', { enabled: 0 }), entry('  ', '17:00', '19:00')], thursday), null);
  assert.strictEqual(findScheduledPlaylist([entry('Over', '17:00', '19:00', { startDate: '2026-11-01', endDate: '2026-12-01' })], thursday), null, 'season over');
  assert.strictEqual(findScheduledPlaylist([], thursday), null);
  print('Test 9 OK');

  // Test 10: playlists the Scheduler can run today
  print('Test 10: activeSchedulePlaylists');
  const names = (entries: FppScheduleEntry[], today: string) => [...activeSchedulePlaylists(entries, today)].sort();
  const season = [
    entry('Open', '18:00', '22:00', { endDate: '2026-12-24' }),
    entry('Over', '18:00', '22:00', { endDate: '2026-12-09' }),
    entry('Off', '18:00', '22:00', { endDate: '2026-12-31', enabled: 0 }),
    entry('Blank', '18:00', '22:00', { playlist: ' ' }),
    entry('Holiday', '18:00', '22:00', { endDate: 'Christmas' }),
    entry('Always', '18:00', '22:00'),
  ];
  assert.deepStrictEqual(names(season, '2026-12-10'), ['Always', 'Holiday', 'Open']);
  assert.deepStrictEqual(names([entry('Last Day', '18:00', '22:00', { endDate: '2026-12-10' })], '2026-12-10'), ['Last Day'], 'the end date itself is still on');
  assert.deepStrictEqual(names([entry('Last Day', '18:00', '22:00', { endDate: '2026-12-10' })], '2026-12-11'), []);
  // A yearless end date repeats every year; one that runs over New Year is out of season only in between
  assert.deepStrictEqual(names([entry('Yearly', '18:00', '22:00', { startDate: '0000-11-20', endDate: '0000-12-24' })], '2026-12-10'), ['Yearly']);
  assert.deepStrictEqual(names([entry('Yearly', '18:00', '22:00', { startDate: '0000-11-20', endDate: '0000-12-24' })], '2026-12-30'), []);
  const overNewYear = [entry('Winter', '18:00', '22:00', { startDate: '0000-12-01', endDate: '0000-01-04' })];
  assert.deepStrictEqual(names(overNewYear, '2026-12-30'), ['Winter']);
  assert.deepStrictEqual(names(overNewYear, '2026-01-03'), ['Winter']);
  assert.deepStrictEqual(names(overNewYear, '2026-06-15'), []);

  // A playlist is hidden until its start date, and shown from that day on
  const second = [entry('Second', '18:00', '22:00', { startDate: '2026-12-11', endDate: '2026-12-24' })];
  assert.deepStrictEqual(names(second, '2026-12-10'), [], 'starts tomorrow');
  assert.deepStrictEqual(names(second, '2026-12-11'), ['Second'], 'the start date itself is on');
  assert.deepStrictEqual(names(second, '2026-12-24'), ['Second']);
  assert.deepStrictEqual(names(second, '2026-12-25'), []);
  // Two playlists, one after the other: only the one in season is offered
  const inOrder = [
    entry('First', '18:00', '22:00', { startDate: '2026-11-20', endDate: '2026-12-10' }),
    entry('Second', '18:00', '22:00', { startDate: '2026-12-11', endDate: '2026-12-24' }),
  ];
  assert.deepStrictEqual(names(inOrder, '2026-12-10'), ['First']);
  assert.deepStrictEqual(names(inOrder, '2026-12-11'), ['Second']);
  // One playlist on two entries is offered while either is in season
  assert.deepStrictEqual(names([entry('Twice', '18:00', '22:00', { startDate: '2026-12-20', endDate: '2026-12-24' }), entry('Twice', '12:00', '14:00', { startDate: '2026-12-01', endDate: '2026-12-15' })], '2026-12-10'), ['Twice']);
  // A start date only (no end), a yearless start, a mixed pair, and a holiday name on the start side
  assert.deepStrictEqual(names([entry('Open Ended', '18:00', '22:00', { startDate: '2026-12-11' })], '2026-12-10'), []);
  assert.deepStrictEqual(names([entry('Open Ended', '18:00', '22:00', { startDate: '2026-12-11' })], '2026-12-30'), ['Open Ended']);
  assert.deepStrictEqual(names([entry('Yearly', '18:00', '22:00', { startDate: '0000-12-11' })], '2026-12-10'), []);
  assert.deepStrictEqual(names([entry('Mixed', '18:00', '22:00', { startDate: '0000-12-11', endDate: '2026-12-24' })], '2026-12-12'), ['Mixed']);
  assert.deepStrictEqual(names([entry('Mixed', '18:00', '22:00', { startDate: '0000-12-11', endDate: '2026-12-24' })], '2026-12-25'), []);
  assert.deepStrictEqual(names([entry('Holiday Start', '18:00', '22:00', { startDate: 'Thanksgiving', endDate: '2026-12-24' })], '2026-12-10'), ['Holiday Start'], 'a holiday name cannot be resolved, so it stays open');
  assert.deepStrictEqual(names([entry('Holiday Start', '18:00', '22:00', { startDate: 'Thanksgiving', endDate: '2026-12-24' })], '2026-12-25'), [], 'the real end date still applies');
  // FPP compares month and day only once either date has no year: this season runs every Nov 25 - Jan 6
  const everyYear = [entry('Every Year', '18:00', '22:00', { startDate: '0000-11-25', endDate: '2027-01-06' })];
  assert.deepStrictEqual(names(everyYear, '2026-12-10'), ['Every Year']);
  assert.deepStrictEqual(names(everyYear, '2027-01-02'), ['Every Year'], 'over New Year');
  assert.deepStrictEqual(names(everyYear, '2026-06-01'), []);
  assert.deepStrictEqual(names(everyYear, '2026-11-24'), [], 'the day before it starts');
  // A holiday name next to a yearless date: cannot tell which way it wraps, so never wrongly hidden
  assert.deepStrictEqual(names([entry('Holiday End', '18:00', '22:00', { startDate: '0000-12-11', endDate: 'Christmas' })], '2026-12-10'), ['Holiday End']);
  assert.deepStrictEqual(names([entry('Holiday Start', '18:00', '22:00', { startDate: 'Thanksgiving', endDate: '0000-01-06' })], '2026-12-10'), ['Holiday Start']);
  print('Test 10 OK');

  // Test 11: where a playlist stands, for the admin's picker
  print('Test 11: playlistSeason');
  const calendar: FppScheduleEntry[] = [
    entry('Now', '18:00', '22:00', { startDate: '2026-11-20', endDate: '2026-12-24' }),
    entry('Soon', '18:00', '22:00', { startDate: '2026-12-11', endDate: '2026-12-24' }),
    entry('Soon', '12:00', '14:00', { startDate: '2026-12-20', endDate: '2026-12-24' }),
    entry('Over', '18:00', '22:00', { startDate: '2026-10-02', endDate: '2026-10-31' }),
    entry('Off', '18:00', '22:00', { enabled: 0 }),
    entry('Yearly', '18:00', '22:00', { startDate: '0000-12-20', endDate: '0000-12-31' }),
  ];
  const standing = (playlist: string) => playlistSeason(calendar, playlist, '2026-12-10');
  assert.deepStrictEqual(standing('Now'), { status: 'in-season', startsOn: null });
  assert.deepStrictEqual(standing('Soon'), { status: 'upcoming', startsOn: '2026-12-11' }, 'the earliest start ahead');
  assert.deepStrictEqual(standing('Over'), { status: 'ended', startsOn: null });
  assert.deepStrictEqual(standing('Off'), { status: 'not-scheduled', startsOn: null }, 'a disabled entry is not scheduled');
  assert.deepStrictEqual(standing('Nowhere'), { status: 'not-scheduled', startsOn: null });
  assert.deepStrictEqual(standing('Yearly'), { status: 'upcoming', startsOn: null }, 'a yearless start has no single date to show');
  assert.deepStrictEqual(playlistSeason(calendar, 'Soon', '2026-12-11'), { status: 'in-season', startsOn: null }, 'from its start date on');
  print('Test 11 OK');

  // Test 12: the next show can be weeks away, in the next season (Halloween over on 1 Nov, Christmas from 28 Nov)
  print('Test 12: next show across seasons');
  const twoSeasons: FppScheduleEntry[] = [
    { enabled: 1, day: 7, playlist: 'Halloween 2026', startTime: '18:45:00', endTime: '22:30:00', startDate: '2026-10-02', endDate: '2026-10-31' },
    { enabled: 1, day: 7, playlist: 'Christmas', startTime: '17:30:00', endTime: '22:00:00', startDate: '2026-11-28', endDate: '2027-01-03' },
  ];
  assert.deepStrictEqual(summary(twoSeasons, at('2026-11-01T16:41:00')).next, 'Saturday 2026-11-28 17:30', 'weeks ahead, past the old 14-day limit');
  assert.strictEqual(summary(twoSeasons, at('2026-11-01T16:41:00')).live, false);
  assert.strictEqual(summary(twoSeasons, at('2026-11-28T18:00:00')).live, true, 'live on the first night');
  assert.strictEqual(summary(twoSeasons, at('2026-11-27T22:00:00')).next, 'Saturday 2026-11-28 17:30', 'the night before');
  // A yearless season (every year) and one that runs over New Year
  const yearly: FppScheduleEntry[] = [{ enabled: 1, day: 7, playlist: 'Christmas', startTime: '18:00', endTime: '22:00', startDate: '0000-11-28', endDate: '0000-12-31' }];
  assert.strictEqual(summary(yearly, at('2026-11-01T12:00:00')).next, 'Saturday 2026-11-28 18:00', 'a yearless start is found');
  assert.strictEqual(summary(yearly, at('2026-12-31T23:00:00')).next, 'Sunday 2027-11-28 18:00', 'after the season, next year');
  const winterSeason: FppScheduleEntry[] = [{ enabled: 1, day: 7, playlist: 'Winter', startTime: '18:00', endTime: '22:00', startDate: '0000-12-20', endDate: '0000-01-05' }];
  assert.strictEqual(summary(winterSeason, at('2026-11-01T12:00:00')).next, 'Sunday 2026-12-20 18:00');
  assert.strictEqual(summary(winterSeason, at('2027-01-02T19:00:00')).live, true, 'inside the wrapped season');
  // Weekday entries and ended seasons
  assert.strictEqual(summary([{ ...twoSeasons[1], day: 5 }], at('2026-11-01T12:00:00')).next, 'Friday 2026-12-04 17:30', 'the first Friday in the season');
  assert.strictEqual(summary([twoSeasons[0]], at('2026-11-01T12:00:00')).next, null, 'nothing scheduled after the only season ended');
  // Entries that cannot be placed are skipped, never thrown on or counted as live all year
  const sunSet: FppScheduleEntry = { enabled: 1, day: 7, playlist: 'Christmas', startTime: 'SunSet', endTime: '22:00:00', startDate: '2026-11-28', endDate: '2027-01-03' };
  assert.deepStrictEqual(summary([sunSet], at('2026-11-01T12:00:00')), { live: false, until: null, next: null, countdown: null }, 'a sun-time start is not counted');
  assert.strictEqual(summary([{ ...sunSet, startDate: '0000-11-28', endDate: '0000-12-31' }], at('2026-12-05T19:00:00')).live, false, 'a yearless sun-time season');
  const byHoliday: FppScheduleEntry = { enabled: 1, day: 7, playlist: 'Christmas', startTime: '18:00:00', endTime: '22:00:00', startDate: 'Thanksgiving', endDate: 'Christmas' };
  assert.strictEqual(summary([byHoliday], at('2026-07-04T19:00:00')).live, false, 'a holiday-name season is not live in July');
  assert.strictEqual(summary([{ ...byHoliday, endDate: '2027-01-03' }], at('2026-07-04T19:00:00')).live, false, 'a holiday-name start next to a real date');
  // A holiday-name end after a real start date is open-ended from that date; next to a yearless start it is skipped
  assert.strictEqual(summary([{ ...byHoliday, startDate: '2026-11-01', endDate: 'Christmas' }], at('2026-11-01T12:00:00')).next, 'Sunday 2026-11-01 18:00');
  assert.strictEqual(summary([{ ...byHoliday, startDate: '0000-11-28', endDate: 'Christmas' }], at('2026-07-04T19:00:00')).live, false);
  assert.strictEqual(summary([], at('2026-11-01T12:00:00')).next, null, 'an empty schedule');
  // An end time that is a sun time still lets the next show be found
  assert.strictEqual(summary([{ ...twoSeasons[1], endTime: 'SunRise' }], at('2026-11-01T12:00:00')).next, 'Saturday 2026-11-28 17:30');
  print('Test 12 OK');

  print('All tests passed');
} catch (err) {
  console.error('[test-show-schedule] FAILED:', err);
  process.exitCode = 1;
}
