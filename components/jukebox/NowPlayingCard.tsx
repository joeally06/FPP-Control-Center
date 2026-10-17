'use client';

import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatClock } from '@/lib/jukebox-display';
import { CARD, type ThemeAccent } from './theme-accent';

export interface NowPlayingInfo {
  title: string;
  artist?: string | null;
  album?: string | null;
  coverUrl?: string | null;
  requesterName?: string | null;
  startedLabel?: string | null;
  spotifyUrl?: string | null;
  /** Seconds since the cached FPP state was written; shown as a warning above 30 s */
  cacheAgeSeconds?: number | null;
}

interface NowPlayingCardProps {
  info: NowPlayingInfo | null;
  progress: { elapsed: number; total: number } | null;
  themeIcon: string;
  accent: ThemeAccent;
  adminActions?: ReactNode;
}

export default function NowPlayingCard({ info, progress, themeIcon, accent, adminActions }: NowPlayingCardProps) {
  return (
    <section aria-labelledby="now-playing-heading" className={`${CARD} p-5`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="now-playing-heading" className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${accent.chip}`}>
          Now playing on the lights
        </h2>
      </div>

      {!info ? (
        <p className="text-white/70">Nothing is playing right now.</p>
      ) : (
        <>
          {info.cacheAgeSeconds != null && info.cacheAgeSeconds > 30 && (
            <p className="mb-3 rounded-lg border border-yellow-500/40 bg-yellow-500/15 px-3 py-2 text-sm text-yellow-100">
              ⚠️ This may be out of date ({info.cacheAgeSeconds}s old).
            </p>
          )}

          <div className="flex items-center gap-4">
            {info.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote album art, no image optimizer configured
              <img
                src={info.coverUrl}
                alt={info.album ? `${info.album} cover` : 'Album cover'}
                className="h-20 w-20 shrink-0 rounded-xl object-cover shadow-lg ring-1 ring-white/20"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-white/10 text-4xl" aria-hidden="true">
                {themeIcon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xl font-extrabold text-white themed-font">{info.title}</p>
              {info.artist && <p className={`truncate text-sm font-medium ${accent.text}`}>{info.artist}</p>}
              {info.album && <p className="truncate text-xs text-white/70">{info.album}</p>}
              {info.requesterName && (
                <p className="mt-1.5 text-xs text-white/80">Requested by {info.requesterName}</p>
              )}
            </div>
          </div>

          {progress && (
            <div className="mt-5">
              <div
                role="progressbar"
                aria-label="Song progress"
                aria-valuemin={0}
                aria-valuemax={Math.round(progress.total)}
                aria-valuenow={Math.round(progress.elapsed)}
                aria-valuetext={`${formatClock(progress.elapsed)} of ${formatClock(progress.total)}`}
                className="h-2 w-full overflow-hidden rounded-full bg-white/15"
              >
                <div
                  className={`h-full rounded-full bg-linear-to-r ${accent.bar} transition-[width] duration-1000 ease-linear`}
                  style={{ width: `${Math.min(100, (progress.elapsed / progress.total) * 100)}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-xs text-white/80">
                <span>{formatClock(progress.elapsed)}</span>
                <span>-{formatClock(progress.total - progress.elapsed)}</span>
              </div>
            </div>
          )}

          {!progress && info.startedLabel && (
            <p className="mt-3 text-xs text-white/70">Started {info.startedLabel}</p>
          )}

          {info.spotifyUrl && (
            <a
              href={info.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 font-semibold transition focus:outline-none focus-visible:ring-2 ${accent.focus} ${accent.button}`}
            >
              Listen on Spotify
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}

          {adminActions && <div className="mt-4 flex flex-wrap gap-2">{adminActions}</div>}
        </>
      )}
    </section>
  );
}
