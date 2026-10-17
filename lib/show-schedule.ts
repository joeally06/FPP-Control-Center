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
      if (entry.day !== 7 && entry.day !== dayIndex(day)) continue;
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
