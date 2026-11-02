'use client';

import { useEffect, useState } from 'react';
import { formatClock, secondsUntilIso } from '@/lib/display-idle';
import { formatShowDate, formatShowTime, type NextShowInfo } from '@/lib/jukebox-display';

/** Shown while no show is running: a ticking countdown to the next start in FPP's Scheduler, even weeks away. */
export default function NextShowCountdown({ nextShow }: { nextShow: NextShowInfo }) {
  // null until the first tick, so the server and first client render agree
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const seconds = nowMs === null ? null : secondsUntilIso(nextShow.at, nowMs);
  const when = [formatShowDate(nextShow.date), formatShowTime(nextShow.startTime)].filter(Boolean).join(' · ');

  return (
    <section aria-label={nextShow.heading} className="sp-panel w-full max-w-md px-5 py-4 text-center">
      <p className="sp-kicker">{nextShow.heading}</p>
      {seconds !== null && (
        <p className="sp-display sp-title sp-glow-text text-4xl tabular-nums sm:text-5xl">
          {seconds > 0 ? formatClock(seconds) : 'Starting any moment now'}
        </p>
      )}
      {when && <p className="sp-muted mt-1 text-sm">{when}</p>}
    </section>
  );
}
