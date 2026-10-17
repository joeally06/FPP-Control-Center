'use client';

import type { ReactNode } from 'react';
import type { PublicQueueItem } from '@/lib/jukebox-display';

interface UpNextListProps {
  items: PublicQueueItem[];
  /** Display title for each item (same order as items) */
  titles: string[];
  /** Estimated seconds until each item starts (same order as items), null when unknown */
  waits: (number | null)[];
  renderAdminActions?: (item: PublicQueueItem) => ReactNode;
}

export default function UpNextList({ items, titles, waits, renderAdminActions }: UpNextListProps) {
  return (
    <section aria-labelledby="up-next-heading" className="sp-panel">
      <span className="sp-eyebrow">In line</span>
      <h2 id="up-next-heading" className="sp-display sp-h2">Up next</h2>

      {items.length === 0 ? (
        <p className="sp-muted mt-3.5 text-sm">Nothing in line. Pick a song and it plays next.</p>
      ) : (
        <ol className="mt-3.5 space-y-2">
          {items.map((item, index) => {
            const wait = waits[index] ?? null;
            return (
              <li key={item.id} className="sp-row px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="sp-queue-n flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{titles[index] || item.sequence_name}</p>
                    <p className="sp-muted truncate text-xs">
                      {item.requester_name ? `Requested by ${item.requester_name}` : 'Requested'}
                    </p>
                  </div>
                  {wait !== null && (
                    <span className="sp-soft shrink-0 text-xs font-bold tabular-nums">~{Math.max(1, Math.round(wait / 60))} min</span>
                  )}
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
