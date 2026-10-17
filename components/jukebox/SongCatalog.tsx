'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import {
  filterSongs,
  requestButtonState,
  songCategories,
  songDetailsLine,
  type CatalogSong,
  type RequestButtonState,
} from '@/lib/jukebox-display';

interface SongCatalogProps {
  songs: CatalogSong[];
  loading: boolean;
  message: string;
  currentSequence: string | null;
  queuedNames: string[];
  requestsRemaining: number | null;
  rateLimit: number;
  busy: boolean;
  onRequest: (song: CatalogSong) => void;
  headerSlot?: ReactNode;
}

const BUTTON_LABEL: Record<RequestButtonState, string> = {
  playing: 'On now',
  queued: 'In line',
  limit: 'Limit reached',
  available: 'Request',
};

const TAG_CLASS: Record<Exclude<RequestButtonState, 'available'>, string> = {
  playing: 'sp-tag-on',
  queued: 'sp-tag-line',
  limit: 'sp-tag-off',
};

// One bulb per request; with a bigger allowance the text says it alone
const MAX_PIPS = 6;

function limitText(requestsRemaining: number | null, rateLimit: number): ReactNode {
  if (requestsRemaining === null) return `Up to ${rateLimit} ${rateLimit === 1 ? 'request' : 'requests'} per hour`;
  if (requestsRemaining === 0) return 'Request limit reached for this hour';
  return (
    <>
      <b className="text-white">{requestsRemaining} of {rateLimit}</b> {rateLimit === 1 ? 'request' : 'requests'} left
    </>
  );
}

export default function SongCatalog({
  songs,
  loading,
  message,
  currentSequence,
  queuedNames,
  requestsRemaining,
  rateLimit,
  busy,
  onRequest,
  headerSlot,
}: SongCatalogProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => songCategories(songs), [songs]);
  // A category can disappear when the admin edits the list; fall back to "All"
  const activeCategory = category && categories.includes(category) ? category : null;
  const filtered = useMemo(() => filterSongs(songs, query, activeCategory), [songs, query, activeCategory]);
  const used = requestsRemaining === null ? 0 : Math.max(0, rateLimit - requestsRemaining);

  return (
    <section id="request-a-song" aria-labelledby="catalog-heading" className="sp-panel scroll-mt-28">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="sp-eyebrow">Your turn</span>
          <h2 id="catalog-heading" className="sp-display sp-h2">Pick the next song</h2>
        </div>
        <p className="sp-muted flex items-center gap-2.5 text-[13px]">
          {rateLimit <= MAX_PIPS && (
            <span className="inline-flex gap-1.5" aria-hidden="true">
              {Array.from({ length: rateLimit }, (_, i) => (
                <span key={i} className={i < used ? 'sp-pip sp-pip-used' : 'sp-pip'} />
              ))}
            </span>
          )}
          <span>{limitText(requestsRemaining, rateLimit)}</span>
        </p>
      </div>

      {headerSlot && <div className="mt-3">{headerSlot}</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="relative min-w-0 flex-[1_1_12rem]">
          <span className="sr-only">Search songs</span>
          <Search className="sp-muted pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs or artists"
            className="sp-input min-h-11 w-full rounded-xl py-2 pl-10 pr-3"
          />
        </label>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            {[null, ...categories].map((option) => (
              <button
                key={option ?? 'all'}
                type="button"
                onClick={() => setCategory(option)}
                aria-pressed={option === activeCategory}
                className="sp-chip min-h-11 rounded-full px-3.5 text-[13px] font-bold transition"
              >
                {option ?? 'All'}
              </button>
            ))}
          </div>
        )}
      </div>

      {message && <p className="mt-3 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm">{message}</p>}

      {loading ? (
        <p className="sp-muted py-6 text-center text-sm">Loading songs…</p>
      ) : songs.length === 0 ? (
        <p className="sp-muted py-6 text-center text-sm">No songs are available right now.</p>
      ) : filtered.length === 0 ? (
        <p className="sp-muted py-6 text-center text-sm">
          {query.trim() ? `No songs match “${query.trim()}”${activeCategory ? ` in ${activeCategory}` : ''}.` : `No songs in ${activeCategory}.`}
        </p>
      ) : (
        <ul className="mt-3.5 max-h-[28rem] space-y-1 overflow-y-auto pr-1">
          {filtered.map((song) => {
            const state = requestButtonState({ name: song.name, currentSequence, queuedNames, requestsRemaining });
            const title = song.title || song.name;
            const details = [songDetailsLine(song), song.category].filter(Boolean).join(' · ');
            return (
              <li key={song.name} className="flex items-center gap-3 rounded-xl py-2 pl-3 pr-1 transition hover:bg-white/5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{title}</span>
                  {details && <span className="sp-muted block truncate text-xs tabular-nums">{details}</span>}
                </span>
                {state === 'available' ? (
                  <button
                    type="button"
                    onClick={() => onRequest(song)}
                    disabled={busy}
                    aria-label={`Request ${title}`}
                    className="sp-btn-accent min-h-10 min-w-[92px] shrink-0 rounded-full px-3.5 text-[13px] font-extrabold transition disabled:opacity-60"
                  >
                    {BUTTON_LABEL[state]}
                  </button>
                ) : (
                  <span
                    className={`${TAG_CLASS[state]} min-w-[92px] shrink-0 rounded-full px-2.5 py-2 text-center text-xs font-extrabold uppercase tracking-wide`}
                  >
                    {BUTTON_LABEL[state]}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
