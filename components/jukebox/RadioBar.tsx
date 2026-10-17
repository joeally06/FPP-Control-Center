'use client';

import type { ReactNode } from 'react';
import { Radio } from 'lucide-react';
import { useTheme } from '@/lib/themes/theme-context';
import { StringLights } from '@/components/ThemeAtmosphere';
import { formatFmFrequency } from '@/lib/jukebox-display';
import Equalizer from './Equalizer';

interface RadioBarProps {
  siteName: string;
  fmFrequency: string;
  isPlaying: boolean;
  adminSlot?: ReactNode;
}

/** Fixed top bar: badge, show name and FM frequency, with the string lights hanging below. */
export default function RadioBar({ siteName, fmFrequency, isPlaying, adminSlot }: RadioBarProps) {
  const { theme, assets } = useTheme();
  // The uploaded badge, else the middle of the logo, else a radio icon
  const badgeSrc = assets.badge?.url ?? assets.logo?.url ?? null;

  return (
    <header className="sp-bar fixed inset-x-0 top-0 z-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {/* Decorative; dropped on the narrowest phones to leave room for the text */}
          {badgeSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from /api/theme/asset, no image optimizer configured
            <img src={badgeSrc} alt="" className="sp-badge hidden h-11 w-11 shrink-0 min-[360px]:block" />
          ) : (
            <div className="sp-badge hidden h-11 w-11 shrink-0 items-center justify-center min-[360px]:flex" aria-hidden="true">
              <Radio className="sp-title h-5 w-5" />
            </div>
          )}
          {/* Text truncates instead of wrapping, so the bar never grows taller than the space left for it */}
          <div className="min-w-0">
            <p className="sp-display sp-title sp-glow-text truncate text-[15px] sm:text-base">{siteName}</p>
            <p className="sp-highlight flex min-w-0 items-center gap-2 text-xs font-bold tracking-wide">
              {isPlaying && <Equalizer />}
              <span className="truncate">
                {fmFrequency ? `Tune to ${formatFmFrequency(fmFrequency)}` : isPlaying ? 'Playing now' : 'Light show jukebox'}
              </span>
            </p>
          </div>
        </div>

        {adminSlot && <div className="flex shrink-0 items-center gap-2">{adminSlot}</div>}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-full px-4">
        <StringLights colors={theme.bulbs} />
      </div>
    </header>
  );
}
