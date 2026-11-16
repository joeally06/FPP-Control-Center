'use client';

import { useState } from 'react';
import type { LiveStatus as LiveStatusData } from '@/lib/jukebox-live-status';
import { button, card, cardTitle, eyebrow, insetBox, notice } from '@/components/admin/ui-classes';
import { DateTime } from 'luxon';
import { APP_TIMEZONE } from '@/lib/time-utils';

interface LiveStatusProps {
  live: LiveStatusData;
  syncing: boolean;
  onSync: () => void;
  /** Open a tab of the page, and focus a field on it when `focusId` is given */
  onOpenTab: (tab: 'songs' | 'season', focusId?: string) => void;
  /** Clear the typed start so the countdown follows FPP's schedule again */
  onUseScheduleStart: () => void;
  startSaving?: boolean;
}

/** The full card shows whenever something needs attention; otherwise only after the admin presses Details. */
export function isCardOpen(needsAttention: boolean, userOpened: boolean): boolean {
  return needsAttention || userOpened;
}

const pill ='inline-flex shrink-0 items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-bold';

/**
 * Settings → Jukebox, top of the page: what a visitor gets right now and, for every playlist they cannot see, why.
 * Shows one line when nothing needs attention; Details opens the whole card.
 */
export default function LiveStatus({ live, syncing, onSync, onOpenTab, onUseScheduleStart, startSaving = false }: LiveStatusProps) {
  // Worked out on every render: a problem that shows up after the page loaded (a save, a sync, a tag change) opens the card
  const [userOpened, setUserOpened] = useState(false);
  const open = isCardOpen(live.needsAttention, userOpened);
  const offered = live.playlists.filter((playlist) => playlist.offered);

  if (!open) {
    const countdown = live.countdown.label
      ? `countdown goes to ${live.countdown.label} ${live.countdown.source === 'typed' ? '(typed by you)' : "from FPP's schedule"}`
      : live.countdown.showOnNowUntil
        ? `a show is on now until ${live.countdown.showOnNowUntil}`
        : 'no upcoming show to count down to';
    return (
      <section aria-label="What visitors see right now" className={`${card} mb-6 flex flex-wrap items-center gap-4 !py-3.5`}>
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-adm-ok" aria-hidden="true" />
        <p className="min-w-0 flex-1 basis-80 text-sm leading-relaxed text-adm-text">
          <strong>Visitors can request {offered.length} {offered.length === 1 ? 'playlist' : 'playlists'}</strong>
          {' '}({offered.map((playlist) => playlist.name).join(', ')}) · {live.theme.name} theme · {countdown} · {live.requests.perHour} requests per hour
        </p>
        <button type="button" onClick={() => setUserOpened(true)} aria-expanded={false} className={button}>Details</button>
      </section>
    );
  }

  return (
    <section aria-labelledby="live-status-title" className={`${card} mb-6 flex flex-col gap-5 ${live.needsAttention ? '!border-adm-accent' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="live-status-title" className="text-lg font-semibold text-adm-text">What visitors see right now</h2>
          <p className="mt-1 text-[13px] text-adm-muted">
            From your saved settings and FPP&apos;s last schedule. Checked {DateTime.fromISO(live.checkedAt).setZone(APP_TIMEZONE).setLocale('en-US').toFormat('h:mm a')}.
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/jukebox" target="_blank" rel="noreferrer" className={button}>Open visitor page</a>
          {!live.needsAttention && (
            <button type="button" onClick={() => setUserOpened(false)} aria-expanded={true} className={button}>Hide details</button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className={insetBox}>
          <p className={eyebrow}>Theme</p>
          <p className="mt-1.5 text-[17px] font-semibold text-adm-text">{live.theme.name}</p>
          <p className="mt-0.5 text-[13px] text-adm-muted">Only {live.theme.name} playlists can show</p>
        </div>
        <div className={insetBox}>
          <p className={eyebrow}>Countdown goes to</p>
          <p className="mt-1.5 text-[17px] font-semibold text-adm-text">
            {live.countdown.label ?? (live.countdown.showOnNowUntil ? 'A show is on now' : 'Nothing scheduled')}
          </p>
          <p className={`mt-0.5 text-[13px] ${live.countdown.overridesSchedule ? 'text-adm-warn' : 'text-adm-muted'}`}>
            {live.countdown.source === 'typed'
              ? 'Typed by you, not from FPP'
              : live.countdown.source === 'schedule'
                ? "From FPP's schedule"
                : live.countdown.showOnNowUntil
                  ? `Scheduled until ${live.countdown.showOnNowUntil}`
                  : "FPP's schedule has no upcoming show"}
          </p>
        </div>
        <div className={insetBox}>
          <p className={eyebrow}>Requests</p>
          <p className="mt-1.5 text-[17px] font-semibold text-adm-text">{live.requests.perHour} per visitor per hour</p>
          <p className="mt-0.5 text-[13px] text-adm-muted">{live.requests.locationLimited ? 'Only near the show' : 'Anywhere (no location limit)'}</p>
        </div>
      </div>

      {live.countdown.overridesSchedule && live.countdown.schedule && (
        <div role="status" className={`${notice.warn} flex flex-wrap items-center gap-3`}>
          <p className="min-w-0 flex-1 basis-72 leading-relaxed">
            The countdown follows the start time you typed ({live.countdown.label}). FPP&apos;s schedule says the next show is{' '}
            {live.countdown.schedule.playlist ? `${live.countdown.schedule.playlist} at ` : ''}{live.countdown.schedule.label}.
          </p>
          <button type="button" onClick={onUseScheduleStart} disabled={startSaving} className={button}>
            {startSaving ? 'Saving…' : "Use FPP's time"}
          </button>
          <button type="button" onClick={() => onOpenTab('season', 'jukebox-countdown-start')} className={button}>Edit it</button>
        </div>
      )}

      <div>
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={cardTitle}>Playlists</h3>
          <span className={`text-[13px] font-semibold ${live.offeredCount === 0 ? 'text-adm-warn' : 'text-adm-ok'}`}>
            {live.offeredCount} of {live.playlists.length} shown to visitors
          </span>
        </div>
        {live.playlists.length === 0 ? (
          <p className="text-sm text-adm-muted">No playlists yet. Use Sync from FPP at the top of the page.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {live.playlists.map((playlist) => (
              <li key={playlist.name} className={`${insetBox} flex flex-col gap-2 !py-3 sm:flex-row sm:items-center sm:gap-4`}>
                <div className="flex items-center justify-between gap-3 sm:w-52 sm:shrink-0 sm:flex-col sm:items-start sm:justify-center sm:gap-0.5">
                  <span className="min-w-0 break-words text-sm font-semibold text-adm-text">{playlist.name}</span>
                  <span className="text-xs text-adm-muted">
                    {playlist.songCount} {playlist.songCount === 1 ? 'song' : 'songs'} · {playlist.themeName ?? 'no theme'}
                  </span>
                </div>
                <span className={`${pill} w-fit sm:w-[4.5rem] ${playlist.offered ? 'border-adm-ok-line bg-adm-ok-bg text-adm-ok' : 'border-adm-warn-line bg-adm-warn-bg text-adm-warn'}`}>
                  {playlist.offered ? 'Offered' : 'Hidden'}
                </span>
                <p className="min-w-0 flex-1 text-sm leading-relaxed text-adm-soft">{playlist.reason}</p>
                {playlist.action === 'sync' && (
                  <button type="button" onClick={onSync} disabled={syncing} className={`${button} sm:shrink-0`}>
                    {syncing ? 'Syncing…' : 'Sync'}
                  </button>
                )}
                {playlist.action === 'tag' && (
                  <button type="button" onClick={() => onOpenTab('songs')} className={`${button} sm:shrink-0`}>Tag it</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {live.unmatchedScheduleNames.length > 0 && (
          <p className="mt-3 text-[13px] leading-relaxed text-adm-soft">
            FPP&apos;s Scheduler also runs{' '}
            {live.unmatchedScheduleNames.map((name, index) => (
              <span key={name}>
                {index > 0 && ', '}
                <strong className="text-adm-text">{name}</strong>
              </span>
            ))}
            , which matches no playlist here. Check the spelling in FPP.
          </p>
        )}
      </div>
    </section>
  );
}
