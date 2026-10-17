'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Music, Search } from 'lucide-react';
import {
  filterSongs,
  requestButtonState,
  songCategories,
  songDetailsLine,
  type CatalogSong,
  type RequestButtonState,
} from '@/lib/jukebox-display';
import { CARD, type ThemeAccent } from './theme-accent';

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
  accent: ThemeAccent;
  headerSlot?: ReactNode;
}

const BUTTON_LABEL: Record<RequestButtonState, string> = {
  playing: 'Playing',
  queued: 'Queued',
  limit: 'Limit reached',
  available: 'Request',
};

function limitText(requestsRemaining: number | null, rateLimit: number): string {
  if (requestsRemaining === null) return `Up to ${rateLimit} ${rateLimit === 1 ? 'request' : 'requests'} per hour`;
  if (requestsRemaining === 0) return 'Request limit reached for this hour';
  return `${requestsRemaining} of ${rateLimit} ${rateLimit === 1 ? 'request' : 'requests'} left this hour`;
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
  accent,
  headerSlot,
}: SongCatalogProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => songCategories(songs), [songs]);
  // A category can disappear when the admin edits the list; fall back to "All"
  const activeCategory = category && categories.includes(category) ? category : null;
  const filtered = useMemo(() => filterSongs(songs, query, activeCategory), [songs, query, activeCategory]);

  return (
    <section aria-labelledby="catalog-heading" className={`${CARD} p-5`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="catalog-heading" className="flex items-center gap-2 text-lg font-bold text-white themed-font">
          <Music className="h-5 w-5 text-white/80" aria-hidden="true" />
          Pick the next song
        </h2>
        {headerSlot}
      </div>

      <p
        className={`mb-3 rounded-lg border px-3 py-2 text-sm font-medium ${
          requestsRemaining === 0 ? 'border-red-400/40 bg-red-500/15 text-red-100' : accent.chip
        }`}
      >
        {limitText(requestsRemaining, rateLimit)}
      </p>

      <label className="relative mb-3 block">
        <span className="sr-only">Search songs</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by song or artist…"
          className={`w-full rounded-xl border border-white/15 bg-black/40 py-2.5 pl-9 pr-3 text-white placeholder-white/50 focus:outline-none focus-visible:ring-2 ${accent.focus}`}
        />
      </label>

      {categories.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by category">
          {[null, ...categories].map((option) => {
            const selected = option === activeCategory;
            return (
              <button
                key={option ?? 'all'}
                type="button"
                onClick={() => setCategory(option)}
                aria-pressed={selected}
                className={`min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 ${accent.focus} ${
                  selected ? accent.chip : 'border-white/15 bg-white/5 text-white/80 hover:bg-white/10'
                }`}
              >
                {option ?? 'All'}
              </button>
            );
          })}
        </div>
      )}

      {message && <p className="mb-3 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white">{message}</p>}

      {loading ? (
        <p className="py-6 text-center text-sm text-white/70">Loading songs…</p>
      ) : songs.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/70">No songs are available right now.</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/70">
          {query.trim() ? `No songs match “${query.trim()}”${activeCategory ? ` in ${activeCategory}` : ''}.` : `No songs in ${activeCategory}.`}
        </p>
      ) : (
        <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {filtered.map((song) => {
            const state = requestButtonState({ name: song.name, currentSequence, queuedNames, requestsRemaining });
            const disabled = state !== 'available' || busy;
            const title = song.title || song.name;
            const details = songDetailsLine(song);
            return (
              <li key={song.name} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-white">{title}</span>
                  {details && <span className="block truncate text-xs text-white/70">{details}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onRequest(song)}
                  disabled={disabled}
                  aria-label={state === 'available' ? `Request ${title}` : `${title}: ${BUTTON_LABEL[state]}`}
                  className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold transition focus:outline-none focus-visible:ring-2 ${accent.focus} ${
                    state === 'available' ? `${accent.button} disabled:opacity-60` : 'cursor-not-allowed bg-white/10 text-white/70'
                  }`}
                >
                  {BUTTON_LABEL[state]}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
