'use client';

import type { ShowSpec } from '@/lib/jukebox-display';

interface ShowSpecsCardProps {
  specs: ShowSpec[];
}

/** "Behind the Pixels": admin-entered facts about the display. Renders nothing when there are none. */
export default function ShowSpecsCard({ specs }: ShowSpecsCardProps) {
  if (specs.length === 0) return null;

  return (
    <section aria-labelledby="specs-heading" className="sp-panel">
      <span className="sp-eyebrow">Behind the pixels</span>
      <h2 id="specs-heading" className="sp-display sp-h2">What you&apos;re looking at</h2>
      <dl className="mt-3.5 grid grid-cols-2 gap-2.5">
        {specs.map((spec) => (
          // Value above its label, as in a spec sheet; dt stays first for screen readers
          <div key={spec.label} className="flex min-w-0 flex-col-reverse rounded-[0.875rem] border border-white/10 bg-black/20 p-3">
            <dt className="sp-muted text-xs">{spec.label}</dt>
            <dd className="sp-display sp-title break-words text-xl leading-tight">{spec.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
