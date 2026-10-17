'use client';

import type { ReactNode } from 'react';
import { ListMusic } from 'lucide-react';
import { formatClock, type PublicQueueItem } from '@/lib/jukebox-display';
import { CARD, type ThemeAccent } from './theme-accent';

interface UpNextListProps {
  items: PublicQueueItem[];
  /** Display title for each item (same order as items) */
  titles: string[];
  /** Estimated seconds until each item starts (same order as items), null when unknown */
  waits: (number | null)[];
  accent: ThemeAccent;
  renderAdminActions?: (item: PublicQueueItem) => ReactNode;
}

export default function UpNextList({ items, titles, waits, accent, renderAdminActions }: UpNextListProps) {
  return (
    <section aria-labelledby="up-next-heading" className={`${CARD} p-5`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="up-next-heading" className="flex items-center gap-2 text-lg font-bold text-white themed-font">
          <ListMusic className="h-5 w-5 text-white/80" aria-hidden="true" />
          Up next
        </h2>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${accent.chip}`}>
          {items.length} {items.length === 1 ? 'request' : 'requests'}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/70">No requests yet. Pick a song!</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => {
            const wait = waits[index] ?? null;
            return (
              <li key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 font-mono text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">{titles[index] || item.sequence_name}</p>
                    <p className="truncate text-xs text-white/70">
                      {item.requester_name ? `Requested by ${item.requester_name}` : 'Requested'}
                      {wait !== null && ` · plays in ~${formatClock(wait)}`}
                    </p>
                  </div>
                </div>
                {renderAdminActions && <div className="mt-2 flex flex-wrap gap-2">{renderAdminActions(item)}</div>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
