'use client';

import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTheme } from '@/lib/themes/theme-context';
import { formatClock } from '@/lib/jukebox-display';
import Equalizer from './Equalizer';

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
  adminActions?: ReactNode;
}

const ART = 'sp-art h-[84px] w-[84px] shrink-0 sm:h-28 sm:w-28';

/** The one glowing card: what the lights are playing right now. */
export default function NowPlayingCard({ info, progress, adminActions }: NowPlayingCardProps) {
  const { theme, assets } = useTheme();
  // Album art, else the season's badge, else its emoji
  const fallbackArt = assets.badge?.url ?? null;

  return (
    <section aria-labelledby="now-playing-heading" className="sp-np-card">
      <h2 id="now-playing-heading" className="sp-eyebrow">
        {info && <Equalizer />}
        Now playing
      </h2>

      {!info ? (
        <p className="sp-muted mt-3">Nothing is playing right now.</p>
      ) : (
        <>
          {info.cacheAgeSeconds != null && info.cacheAgeSeconds > 30 && (
            <p className="mt-3 rounded-lg border border-yellow-500/40 bg-yellow-500/15 px-3 py-2 text-sm text-yellow-100">
              ⚠️ This may be out of date ({info.cacheAgeSeconds}s old).
            </p>
          )}

          <div className="mt-4 flex items-center gap-4">
            {info.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote album art, no image optimizer configured
              <img src={info.coverUrl} alt={info.album ? `${info.album} cover` : 'Album cover'} className={ART} />
            ) : fallbackArt ? (
              // eslint-disable-next-line @next/next/no-img-element -- served from /api/theme/asset
              <img src={fallbackArt} alt="" className={ART} />
            ) : (
              <div className={`${ART} flex items-center justify-center bg-white/10 text-4xl`} aria-hidden="true">
                {theme.icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="sp-display text-[clamp(22px,5.5vw,30px)] leading-tight text-white">{info.title}</p>
              {info.artist && <p className="sp-highlight mt-1 truncate font-bold">{info.artist}</p>}
              {info.album && <p className="sp-muted truncate text-xs">{info.album}</p>}
              {info.requesterName && (
                <p className="sp-muted mt-2 text-[13px]">
                  Requested by <b className="sp-soft font-bold">{info.requesterName}</b>
                </p>
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
                className="h-2 w-full overflow-hidden rounded-full bg-white/12"
              >
                <div
                  className="sp-progress-fill h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
                  style={{ width: `${Math.min(100, (progress.elapsed / progress.total) * 100)}%` }}
                />
              </div>
              <div className="sp-muted mt-1.5 flex justify-between text-xs tabular-nums">
                <span>{formatClock(progress.elapsed)}</span>
                <span>-{formatClock(progress.total - progress.elapsed)}</span>
              </div>
            </div>
          )}

          {!progress && info.startedLabel && <p className="sp-muted mt-3 text-xs">Started {info.startedLabel}</p>}

          {info.spotifyUrl && (
            <a
              href={info.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sp-btn-accent mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-4 font-bold transition"
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
