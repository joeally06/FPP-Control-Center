'use client';

import type { ReactNode } from 'react';
import { Headphones, Radio, X } from 'lucide-react';
import { useTheme } from '@/lib/themes/theme-context';
import { StringLights } from '@/components/ThemeAtmosphere';
import type { ThemeAccent } from './theme-accent';

interface RadioBarProps {
  siteName: string;
  fmFrequency: string;
  isPlaying: boolean;
  showListenButton: boolean;
  listening: boolean;
  onToggleListen: () => void;
  accent: ThemeAccent;
  adminSlot?: ReactNode;
}

function Equalizer({ accent }: { accent: ThemeAccent }) {
  return (
    <span className="flex h-3 items-end gap-0.5" aria-hidden="true">
      <span className={`h-2 w-1 rounded-full ${accent.dot} motion-safe:animate-pulse`} />
      <span className={`h-3 w-1 rounded-full ${accent.dot} motion-safe:animate-pulse [animation-delay:200ms]`} />
      <span className={`h-1.5 w-1 rounded-full ${accent.dot} motion-safe:animate-pulse [animation-delay:400ms]`} />
    </span>
  );
}

/** Fixed top bar: show name, FM frequency, and the "Listen online" toggle. */
export default function RadioBar({
  siteName,
  fmFrequency,
  isPlaying,
  showListenButton,
  listening,
  onToggleListen,
  accent,
  adminSlot,
}: RadioBarProps) {
  const { theme } = useTheme();

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/75 backdrop-blur-md"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          {/* Decorative; dropped on the narrowest phones to leave room for the text */}
          <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl min-[380px]:flex ${accent.button}`} aria-hidden="true">
            <Radio className="h-5 w-5" />
          </div>
          {/* Text truncates instead of wrapping, so the bar never grows taller than the space left for it */}
          <div className="min-w-0">
            <p className="themed-title truncate text-sm font-bold text-white sm:text-base">{siteName}</p>
            <p className="flex min-w-0 items-center gap-2 text-xs text-white/80">
              {fmFrequency ? (
                <span className={`truncate font-semibold ${accent.text}`}>
                  <span className="sm:hidden">Tune to {fmFrequency}</span>
                  <span className="hidden sm:inline">Tune your radio to {fmFrequency}</span>
                </span>
              ) : (
                <span className="truncate">{isPlaying ? 'Playing now' : 'Light show jukebox'}</span>
              )}
              {isPlaying && <Equalizer accent={accent} />}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {showListenButton && (
            <button
              type="button"
              onClick={onToggleListen}
              aria-pressed={listening}
              className={`flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 ${accent.focus} ${
                listening ? 'bg-white text-black' : 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {listening ? <X className="h-4 w-4" aria-hidden="true" /> : <Headphones className="h-4 w-4" aria-hidden="true" />}
              <span className="sm:hidden">{listening ? 'Close' : 'Listen'}</span>
              <span className="hidden sm:inline">{listening ? 'Close player' : 'Listen online'}</span>
            </button>
          )}
          {adminSlot}
        </div>
      </div>
      {/* Christmas lights hang just below the bar */}
      {theme.atmosphere === 'winter' && (
        <div className="pointer-events-none absolute inset-x-0 top-full">
          <StringLights />
        </div>
      )}
    </header>
  );
}
