'use client';

import { Cpu } from 'lucide-react';
import type { ShowSpec } from '@/lib/jukebox-display';
import { CARD, type ThemeAccent } from './theme-accent';

interface ShowSpecsCardProps {
  specs: ShowSpec[];
  accent: ThemeAccent;
}

/** "Behind the Pixels": admin-entered facts about the display. Renders nothing when there are none. */
export default function ShowSpecsCard({ specs, accent }: ShowSpecsCardProps) {
  if (specs.length === 0) return null;

  return (
    <section aria-labelledby="specs-heading" className={`${CARD} p-5`}>
      <h2 id="specs-heading" className="flex items-center gap-2 text-lg font-bold text-white themed-font">
        <Cpu className="h-5 w-5 text-white/80" aria-hidden="true" />
        Behind the pixels
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {specs.map((spec) => (
          <div key={spec.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <dt className="text-xs font-medium text-white/70">{spec.label}</dt>
            <dd className={`mt-1 break-words text-lg font-bold ${accent.text}`}>{spec.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
