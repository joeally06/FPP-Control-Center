'use client';

import { useEffect, useState } from 'react';
import { mergeNextShow, type NextShowAnswer } from '@/lib/display-idle';

/** settled: the request finished (worked or not), so the typed fallback time may be used if nothing came back.
 *  isActive: a scheduled show is on right now. nextShowAt: ISO time of the next show start, from the FPP schedule. */
export type NextShow = NextShowAnswer;

const REFRESH_MS = 60_000;

/** The show's real schedule, from the public schedule-status route; re-read every minute while mounted */
export function useNextShow(enabled: boolean): NextShow {
  const [next, setNext] = useState<NextShow>({ settled: false, isActive: false, nextShowAt: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/jukebox/schedule-status', { cache: 'no-store' });
        const data = res.ok ? await res.json() : null;
        if (cancelled) return;
        setNext((prev) => mergeNextShow(prev, data, Date.now()));
      } catch {
        // Keep the last answer; the typed fallback time covers a first failure
        if (!cancelled) setNext((prev) => mergeNextShow(prev, null, Date.now()));
      }
    }

    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled]);

  return next;
}
