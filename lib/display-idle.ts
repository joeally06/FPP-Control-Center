// What the digital sign's idle screen shows and when. Plain functions so they can be tested without React.

import type { DisplayConfig, IdleMode } from '@/types/display';

export type IdlePanel = 'welcome' | 'countdown' | 'fm' | 'how';

/** How long each idle panel stays up before the next one */
export const IDLE_PANEL_SECONDS = 10;

const IDLE_MODES: readonly IdleMode[] = ['info', 'photos', 'slides'];

/**
 * The idle screen the admin chose. With no saved choice (a sign set up before the choice existed) it works out what the
 * sign did then: a Google Slides link first, then uploaded photos, else the info screen. A choice that cannot show yet
 * (photos without photos, slides without a link) is kept, and the sign shows the info screen until it has something to show.
 */
export function resolveIdleMode(stored: string | null | undefined, slideshowUrl: string, imageCount: number): IdleMode {
  const chosen = IDLE_MODES.find((mode) => mode === stored);
  if (chosen) return chosen;
  return slideshowUrl.trim() ? 'slides' : imageCount > 0 ? 'photos' : 'info';
}

/**
 * What a timed "Google Slides" or "Custom Display" rule changes on the idle screen, or null for other rules.
 * A Slides rule with a link shows that presentation. Otherwise the Slides link is cleared and the sign shows the screen the
 * admin chose (info or photos); if they had chosen Google Slides, it shows the photos if there are any, else the info screen.
 */
export function idleOverrideForRule(
  actionType: string,
  payload: { url?: unknown },
  chosenMode: IdleMode,
  imageCount: number,
): { slideshowUrl: string; idleMode: IdleMode } | null {
  if (actionType !== 'slideshow' && actionType !== 'custom_display') return null;
  const url = actionType === 'slideshow' && typeof payload.url === 'string' ? payload.url : '';
  if (url) return { slideshowUrl: url, idleMode: 'slides' };
  const idleMode: IdleMode = chosenMode === 'slides' ? (imageCount > 0 ? 'photos' : 'info') : chosenMode;
  return { slideshowUrl: '', idleMode };
}

/** The panels to rotate through, in order, leaving out any that have nothing to show */
export function idlePanels(
  config: Pick<DisplayConfig, 'countdownEnabled' | 'fmFrequency'>,
  { showActive, hasCountdown }: { showActive: boolean; hasCountdown: boolean },
): IdlePanel[] {
  const panels: IdlePanel[] = ['welcome'];
  // A show that is already on has no "next show" worth counting down to
  if (config.countdownEnabled && hasCountdown && !showActive) panels.push('countdown');
  if (config.fmFrequency.trim()) panels.push('fm');
  panels.push('how');
  return panels;
}

/** True for a usable "HH:MM" (24 h) time */
export function isValidTime(hhmm: string | null | undefined): boolean {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

/** Seconds until the next occurrence of HH:MM (24 h) local time; 0 if the time is not usable */
export function secondsUntilTime(hhmm: string, now: Date): number {
  if (!isValidTime(hhmm)) return 0;
  const [hh, mm] = hhmm.split(':').map(Number);
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  let diff = Math.floor((target.getTime() - now.getTime()) / 1000);
  if (diff < 0) diff += 86400; // next day
  return diff;
}

/** Seconds until an ISO timestamp (never negative); null if it is not a date */
export function secondsUntilIso(iso: string | null | undefined, nowMs: number): number | null {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(at) ? Math.max(0, Math.floor((at - nowMs) / 1000)) : null;
}

/** 4521 -> "1:15:21"; a day or more -> "6d 4h 12m" (a show days away would not fit as hours) */
export function formatClock(secs: number): string {
  if (secs <= 0) return '0:00:00';
  if (secs >= 86400) {
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  }
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** "Today at 6:45 PM", "Tomorrow at 6:45 PM", "Friday at 6:45 PM", a week or more away "Friday, Nov 6 at 6:45 PM"; empty if it is not a date */
export function describeNextShow(iso: string | null | undefined, now: Date): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return '';
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayStart(at) - dayStart(now)) / 86400000);
  const day = days === 0 ? 'Today'
    : days === 1 ? 'Tomorrow'
    : at.toLocaleDateString('en-US', days >= 7 ? { weekday: 'long', month: 'short', day: 'numeric' } : { weekday: 'long' });
  return `${day} at ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export interface NextShowAnswer {
  settled: boolean;
  isActive: boolean;
  nextShowAt: string | null;
}

/**
 * Fold a fresh schedule-status answer (null when the request failed) into what the sign already knows.
 * A slow FPP makes the route answer with no next show, so a missing time does not wipe out a known
 * one that is still ahead; the countdown would otherwise jump to the typed fallback for a minute.
 */
export function mergeNextShow(
  prev: NextShowAnswer,
  data: { isActive?: unknown; nextShowTime?: unknown } | null,
  nowMs: number,
): NextShowAnswer {
  if (!data) return { ...prev, settled: true };
  if (typeof data.nextShowTime === 'string') {
    return { settled: true, isActive: data.isActive === true, nextShowAt: data.nextShowTime };
  }
  const kept = prev.nextShowAt !== null && (Date.parse(prev.nextShowAt) || 0) > nowMs ? prev.nextShowAt : null;
  return { settled: true, isActive: data.isActive === true, nextShowAt: kept };
}
