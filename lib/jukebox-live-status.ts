import { DateTime } from 'luxon';
import { THEME_PRESETS, type ThemeId } from './themes/theme-config';
import { findShowWindow, parseManualShowStart, playlistSeason, scheduleOutlook, type FppScheduleEntry } from './show-schedule';

/**
 * What visitors get right now, in plain words, for the box at the top of Settings → Jukebox.
 * Built only from saved settings and FPP's last stored schedule: it never asks FPP.
 */

export interface LivePlaylist {
  name: string;
  /** Display name of the theme it is tagged with, null when untagged */
  themeName: string | null;
  songCount: number;
  offered: boolean;
  /** One sentence: why visitors cannot request it, or that they can */
  reason: string;
  /** The quick fix the page can offer on this row */
  action: 'sync' | 'tag' | null;
}

export interface LiveStatus {
  /** ISO time the box was worked out */
  checkedAt: string;
  theme: { id: ThemeId; name: string };
  countdown: {
    /** typed: the admin's own start time · schedule: FPP's next show · none: nothing to count down to */
    source: 'typed' | 'schedule' | 'none';
    /** UTC ISO time the visitor countdown goes to */
    at: string | null;
    /** "Today 4:30 PM" */
    label: string | null;
    /** FPP's own next show, whether or not a typed start replaces it */
    schedule: { at: string; label: string; playlist: string | null } | null;
    /** A typed start is in force and it is a different time than FPP's next show */
    overridesSchedule: boolean;
    /** "10:30 PM" when the stored schedule has a show on right now (it has no "next show" then), else null */
    showOnNowUntil: string | null;
  };
  requests: { perHour: number; locationLimited: boolean };
  playlists: LivePlaylist[];
  offeredCount: number;
  /** Playlist names in FPP's Scheduler that match no synced playlist (usually a spelling difference) */
  unmatchedScheduleNames: string[];
  /** Something here is worth the admin's attention: the card opens instead of showing one line */
  needsAttention: boolean;
}

export interface LiveStatusInput {
  /** In the show's time zone */
  now: DateTime;
  themeId: ThemeId;
  /** Every synced FPP playlist (jukebox_playlists) */
  playlists: { name: string; theme: ThemeId | null; itemCount: number }[];
  /** The playlists the visitor list really returned: offered is never worked out a second time here */
  offeredNames: Iterable<string>;
  /** FPP's schedule as last stored; null when none has been stored */
  schedule: FppScheduleEntry[] | null;
  /** The admin's "next show starts" value, "YYYY-MM-DDTHH:mm" or empty */
  typedStart: string | null | undefined;
  rateLimit: number;
  locationLimited: boolean;
}

function dayAndTime(start: DateTime, now: DateTime): string {
  const day = start.toISODate() === now.toISODate()
    ? 'Today'
    : start.toISODate() === now.plus({ days: 1 }).toISODate()
      ? 'Tomorrow'
      : start.setLocale('en-US').toFormat('ccc LLL d');
  return `${day} ${start.setLocale('en-US').toFormat('h:mm a')}`;
}

function hiddenReason(
  playlist: { name: string; theme: ThemeId | null; itemCount: number },
  themeId: ThemeId,
  schedule: FppScheduleEntry[] | null,
  today: string,
): Pick<LivePlaylist, 'reason' | 'action'> {
  if (playlist.itemCount <= 0) {
    return { reason: 'No songs yet. Sync from FPP, or check the playlist has songs in FPP.', action: 'sync' };
  }
  if (!playlist.theme) {
    return { reason: 'Not tagged with a theme, so no visitor page shows it.', action: 'tag' };
  }
  const season = schedule ? playlistSeason(schedule, playlist.name, today) : null;
  if (playlist.theme !== themeId) {
    const other = `Tagged ${THEME_PRESETS[playlist.theme].name}, and ${THEME_PRESETS[themeId].name} is the active theme.`;
    return { reason: season?.status === 'ended' ? `${other} Its Scheduler dates are over.` : other, action: null };
  }
  switch (season?.status) {
    case 'not-scheduled':
      return { reason: "FPP's Scheduler has no enabled entry for it.", action: null };
    case 'upcoming':
      return {
        reason: season.startsOn
          ? `FPP's Scheduler starts it on ${DateTime.fromISO(season.startsOn).setLocale('en-US').toFormat('LLL d')}. It appears that day.`
          : "FPP's Scheduler starts it later this year. It appears then.",
        action: null,
      };
    case 'ended':
      return { reason: "Its Scheduler dates are over.", action: null };
    default:
      return { reason: 'Hidden for another reason. Sync from FPP and check again.', action: 'sync' };
  }
}

export function buildLiveStatus(input: LiveStatusInput): LiveStatus {
  const { now, themeId, schedule } = input;
  const today = now.toISODate() ?? '';
  const offered = new Set(input.offeredNames);

  const typed = parseManualShowStart(input.typedStart, now);
  const fromSchedule = scheduleOutlook(schedule, false, null, now).nextShow;
  const chosen = typed ?? fromSchedule?.start ?? null;
  const overridesSchedule = Boolean(typed && fromSchedule && typed.toMillis() !== fromSchedule.start.toMillis());
  // While a scheduled show is on there is no "next show": say so rather than "nothing scheduled"
  const endsAt = schedule ? findShowWindow(schedule, now) : null;
  const endTime = endsAt?.isActiveBySchedule ? endsAt.currentShowEndTime : null;
  const showOnNowUntil = endTime ? DateTime.fromFormat(endTime.slice(0, 5), 'HH:mm').setLocale('en-US').toFormat('h:mm a') : null;

  const playlists: LivePlaylist[] = input.playlists
    .map((playlist) => {
      const isOffered = offered.has(playlist.name);
      return {
        name: playlist.name,
        themeName: playlist.theme ? THEME_PRESETS[playlist.theme].name : null,
        songCount: playlist.itemCount,
        offered: isOffered,
        ...(isOffered ? { reason: 'Visitors can request it.', action: null } : hiddenReason(playlist, themeId, schedule, today)),
      } satisfies LivePlaylist;
    })
    .sort((a, b) => Number(b.offered) - Number(a.offered) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const known = new Set(input.playlists.map((playlist) => playlist.name));
  const unmatchedScheduleNames = [...new Set(
    (schedule ?? [])
      .filter((entry) => entry.enabled && typeof entry.playlist === 'string' && entry.playlist.trim() !== '' && !known.has(entry.playlist))
      .map((entry) => entry.playlist as string),
  )];

  const offeredCount = playlists.filter((playlist) => playlist.offered).length;

  return {
    checkedAt: now.toUTC().toISO() ?? '',
    theme: { id: themeId, name: THEME_PRESETS[themeId].name },
    countdown: {
      source: typed ? 'typed' : fromSchedule ? 'schedule' : 'none',
      at: chosen ? chosen.toUTC().toISO() : null,
      label: chosen ? dayAndTime(chosen, now) : null,
      schedule: fromSchedule
        ? { at: fromSchedule.start.toUTC().toISO() ?? '', label: dayAndTime(fromSchedule.start, now), playlist: fromSchedule.entry.playlist?.trim() || null }
        : null,
      overridesSchedule,
      showOnNowUntil,
    },
    requests: { perHour: input.rateLimit, locationLimited: input.locationLimited },
    playlists,
    offeredCount,
    unmatchedScheduleNames,
    needsAttention: overridesSchedule || offeredCount === 0 || unmatchedScheduleNames.length > 0,
  };
}
