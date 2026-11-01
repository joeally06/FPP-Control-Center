// Show times from FPP's schedule, worked out in the show's timezone.
// FPP schedule times ("18:45:00") are local to the show, so "now" must be too: comparing them with
// the server's own clock breaks on a server running in UTC (it reported "Live now" mid-afternoon).

import type { DateTime } from 'luxon';

/** The fields of an FPP /api/schedule entry this uses */
export interface FppScheduleEntry {
  enabled?: number | boolean;
  playlist?: string;
  day?: number; // 0-6 = Sunday-Saturday, 7 = every day
  startTime?: string; // "HH:MM[:SS]"
  endTime?: string;
  startDate?: string; // "YYYY-MM-DD"
  endDate?: string;
}

export interface ShowWindow {
  isActiveBySchedule: boolean;
  /** End time of the show that is on right now */
  currentShowEndTime: string | null;
  nextShow: { start: DateTime; entry: FppScheduleEntry } | null;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const LOOK_AHEAD_DAYS = 14;

function minutesOf(time: string | undefined): number {
  const [hours, minutes] = (time ?? '').split(':');
  return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
}

/** Sunday = 0 … Saturday = 6, like FPP (luxon uses Monday = 1 … Sunday = 7) */
export function dayIndex(date: DateTime): number {
  return date.weekday % 7;
}

// FPP's day codes above 6 (ScheduleEntry.h): 7 every day, 8 weekdays, 9 weekend, 10 Mon/Wed/Fri, 11 Tue/Thu,
// 12 Sun-Thu, 13 Fri/Sat, 14 odd days of the month, 15 even days. Other values (day-mask form) match nothing.
const WEEKDAY_CODES: Record<number, number[]> = {
  8: [1, 2, 3, 4, 5],
  9: [0, 6],
  10: [1, 3, 5],
  11: [2, 4],
  12: [0, 1, 2, 3, 4],
  13: [5, 6],
};

/** Does a schedule entry's `day` code include this date? */
export function dayMatches(code: number | undefined, date: DateTime): boolean {
  if (code === undefined) return false;
  if (code >= 0 && code <= 6) return code === dayIndex(date);
  if (code === 7) return true;
  if (code === 14) return date.day % 2 === 1;
  if (code === 15) return date.day % 2 === 0;
  return WEEKDAY_CODES[code]?.includes(dayIndex(date)) ?? false;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A schedule date FPP wrote as "YYYY-MM-DD" (a real day) or "0000-MM-DD" (that day every year); null for anything else */
function parseScheduleDate(value: string | undefined): { iso: string; monthDay: string; yearless: boolean } | null {
  const match = ISO_DATE.exec(value ?? '');
  return match ? { iso: match[0], monthDay: match[0].slice(5), yearless: match[1] === '0000' } : null;
}

/**
 * Is `today` ("YYYY-MM-DD" in the show's timezone) inside a schedule entry's start and end dates, both included?
 * Like FPP, a season with a yearless date on either side is compared by month and day only, and one that runs over
 * New Year (start after end) is in season outside the gap between them. FPP also allows holiday names, which cannot be
 * resolved here: next to a real date only that date is checked, and next to a yearless one the entry counts as in season.
 */
function inSeason(entry: FppScheduleEntry, today: string): boolean {
  const start = parseScheduleDate(entry.startDate);
  const end = parseScheduleDate(entry.endDate);
  const todayMonthDay = today.slice(5);

  if (start && end) {
    if (start.yearless || end.yearless) {
      return start.monthDay <= end.monthDay
        ? todayMonthDay >= start.monthDay && todayMonthDay <= end.monthDay
        : todayMonthDay >= start.monthDay || todayMonthDay <= end.monthDay;
    }
    return today >= start.iso && today <= end.iso;
  }

  const bound = start ?? end;
  if (!bound) return true;
  // A holiday name on the other side: a lone yearless date cannot say which way the season wraps
  const otherIsHoliday = !!(start ? entry.endDate : entry.startDate);
  if (bound.yearless && otherIsHoliday) return true;
  const arrived = bound.yearless ? todayMonthDay >= bound.monthDay : today >= bound.iso;
  return start ? arrived : bound.yearless ? todayMonthDay <= bound.monthDay : today <= bound.iso;
}

/**
 * Playlists FPP's Scheduler can start today: an enabled entry whose start date has arrived and whose end date
 * has not passed. `today` is "YYYY-MM-DD" in the show's timezone.
 */
export function activeSchedulePlaylists(entries: FppScheduleEntry[], today: string): Set<string> {
  const names = new Set<string>();
  for (const entry of entries) {
    if (!entry.enabled || !entry.playlist || entry.playlist.trim() === '') continue;
    if (!inSeason(entry, today)) continue;
    names.add(entry.playlist);
  }
  return names;
}

/**
 * Is a scheduled show on now, and if not, when is the next one (within 14 days)?
 * `now` must be in the show's timezone (DateTime.now().setZone(APP_TIMEZONE)).
 */
export function findShowWindow(entries: FppScheduleEntry[], now: DateTime): ShowWindow {
  const today = now.toISODate() ?? '';
  const currentMinutes = now.hour * 60 + now.minute;
  const shows = entries.filter((entry) =>
    entry.enabled &&
    entry.playlist && entry.playlist.trim() !== '' &&
    !(entry.startDate && entry.endDate && today > entry.endDate)
  );

  let nextShow: ShowWindow['nextShow'] = null;
  for (let daysAhead = 0; daysAhead < LOOK_AHEAD_DAYS; daysAhead++) {
    const day = now.plus({ days: daysAhead }).startOf('day');
    const date = day.toISODate() ?? '';
    for (const entry of shows) {
      if (!dayMatches(entry.day, day)) continue;
      if (entry.startDate && entry.endDate && (date < entry.startDate || date > entry.endDate)) continue;

      const startMinutes = minutesOf(entry.startTime);
      const endMinutes = minutesOf(entry.endTime);
      if (daysAhead === 0 && currentMinutes >= startMinutes && currentMinutes < endMinutes) {
        return { isActiveBySchedule: true, currentShowEndTime: entry.endTime ?? null, nextShow: null };
      }

      const start = day.set({ hour: Math.floor(startMinutes / 60), minute: startMinutes % 60 });
      if (start > now && (!nextShow || start < nextShow.start)) {
        nextShow = { start, entry };
      }
    }
  }
  return { isActiveBySchedule: false, currentShowEndTime: null, nextShow };
}

/**
 * The playlist for tonight's show: the one on now, else the next one today (even when its start is a sun time
 * such as "SunSet", which findShowWindow cannot read), else the first show in the next 14 days. Null when none.
 * `now` must be in the show's timezone.
 */
export function findScheduledPlaylist(entries: FppScheduleEntry[], now: DateTime): string | null {
  const currentMinutes = now.hour * 60 + now.minute;
  const shows = entries.filter((entry) => entry.enabled && entry.playlist && entry.playlist.trim() !== '');

  for (let daysAhead = 0; daysAhead < LOOK_AHEAD_DAYS; daysAhead++) {
    const day = now.plus({ days: daysAhead }).startOf('day');
    const date = day.toISODate() ?? '';
    let best: { start: number; playlist: string } | null = null;
    for (const entry of shows) {
      if (!dayMatches(entry.day, day)) continue;
      if (entry.startDate && entry.endDate && (date < entry.startDate || date > entry.endDate)) continue;

      const endMinutes = minutesOf(entry.endTime);
      const startMinutes = minutesOf(entry.startTime);
      // Today's shows that are already over do not count; one that runs past midnight (17:00-00:30) is not over yet.
      // A sun-time start has no clock minute, so an end before noon is taken to be after midnight.
      const sunStart = Number.isNaN(startMinutes);
      const runsPastMidnight = sunStart ? endMinutes < 12 * 60 : endMinutes < startMinutes;
      if (daysAhead === 0 && endMinutes <= currentMinutes && !runsPastMidnight) continue;

      // A sun-time start ("SunSet") cannot be placed on the clock: order that show just before the minute it ends,
      // so it comes before a show that starts when it ends, but after one that starts well before
      // (a show that ends after midnight goes last in the day)
      const start = !sunStart ? startMinutes : Number.isNaN(endMinutes) ? Infinity : runsPastMidnight ? 24 * 60 - 1 : endMinutes - 1;
      if (!best || start < best.start) best = { start, playlist: entry.playlist as string };
    }
    if (best) return best.playlist;
  }
  return null;
}

/**
 * Display-sign schedule rule: is `now` (in the show's timezone) on one of the rule's days
 * ("0,1,…", Sunday = 0) and between its "HH:MM" start and end (both inclusive)?
 */
export function isInDailyWindow(rule: { days: string; startTime: string; endTime: string }, now: DateTime): boolean {
  const days = rule.days.split(',').map(Number);
  if (!days.includes(dayIndex(now))) return false;
  const time = now.toFormat('HH:mm');
  return time >= rule.startTime && time <= rule.endTime;
}

/** "2d 5h", "3h 28m" or "12m" until `start` */
export function formatCountdown(start: DateTime, now: DateTime): string {
  const minutesUntil = Math.floor(start.diff(now, 'minutes').minutes);
  const days = Math.floor(minutesUntil / (24 * 60));
  const hours = Math.floor((minutesUntil % (24 * 60)) / 60);
  const mins = minutesUntil % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
