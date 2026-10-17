'use client';

import { Users } from 'lucide-react';
import { useTheme } from '@/lib/themes/theme-context';
import { formatFmFrequency, type ShowStatus } from '@/lib/jukebox-display';

interface ShowHeroProps {
  siteName: string;
  fmFrequency: string;
  status: ShowStatus;
  /** Requests and the online player are open (show active, or an admin) */
  showActions: boolean;
  listening: boolean;
  onToggleListen: () => void;
  /** Visitors with the page open right now; null hides the counter */
  audienceCount: number | null;
}

/** Top of the page: the season's logo (or the show name), live status, FM frequency and the two main actions. */
export default function ShowHero({ siteName, fmFrequency, status, showActions, listening, onToggleListen, audienceCount }: ShowHeroProps) {
  const { assets } = useTheme();
  const logo = assets.logo;

  return (
    <section aria-labelledby="show-name" className="text-center">
      {logo ? (
        <>
          <h1 id="show-name" className="sr-only">{siteName}</h1>
          {/* eslint-disable-next-line @next/next/no-img-element -- served from /api/theme/asset, no image optimizer configured */}
          <img src={logo.url} width={logo.width} height={logo.height} alt="" className="sp-logo" />
        </>
      ) : (
        <h1 id="show-name" className="sp-display sp-title sp-glow-text px-2 pt-8 pb-2 text-4xl sm:text-6xl">
          {siteName}
        </h1>
      )}

      <div className="mt-2 flex flex-col items-center gap-3.5">
        {/* Only the status is a live region; the audience count changes too often to announce */}
        <p
          role="status"
          className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] ${
            status.live ? 'sp-live-pill' : 'sp-live-pill-off'
          }`}
        >
          {status.live && <span className="sp-live-dot h-2.5 w-2.5 rounded-full" aria-hidden="true" />}
          {status.label}
        </p>

        {fmFrequency && (
          <p className="sp-display sp-title sp-glow-text sp-fm">
            <span className="sp-kicker">Tune your car radio to</span>
            {formatFmFrequency(fmFrequency)}
          </p>
        )}

        {showActions && (
          <div className="flex flex-wrap justify-center gap-2.5">
            <a
              href="#request-a-song"
              className="sp-btn-accent inline-flex min-h-12 items-center justify-center rounded-full px-6 font-extrabold transition"
            >
              Request a song
            </a>
            <button
              type="button"
              onClick={onToggleListen}
              aria-pressed={listening}
              className="sp-btn-outline inline-flex min-h-12 items-center justify-center rounded-full px-6 font-extrabold transition"
            >
              {listening ? 'Close the player' : 'Listen on your phone'}
            </button>
          </div>
        )}

        {audienceCount !== null && audienceCount > 0 && (
          <p className="sp-muted flex items-center gap-1.5 text-[13px]">
            <Users className="sp-soft h-4 w-4" aria-hidden="true" />
            {audienceCount} watching now
          </p>
        )}
      </div>
    </section>
  );
}
