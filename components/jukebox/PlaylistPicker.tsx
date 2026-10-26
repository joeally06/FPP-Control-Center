'use client';

import {
  playlistButtonState,
  playlistDetailsLine,
  type PlaylistButtonState,
  type VisitorPlaylist,
} from '@/lib/jukebox-display';

interface PlaylistPickerProps {
  playlists: VisitorPlaylist[];
  /** Playlist a visitor requested that is playing now, if any */
  playingPlaylist: string | null;
  /** Playlist requests waiting in line */
  queuedPlaylists: string[];
  requestsRemaining: number | null;
  busy: boolean;
  onRequest: (playlist: VisitorPlaylist) => void;
}

const BUTTON_LABEL: Record<PlaylistButtonState, string> = {
  playing: 'On now',
  queued: 'In line',
  blocked: 'Not yet',
  limit: 'Limit reached',
  available: 'Request',
};

const TAG_CLASS: Record<Exclude<PlaylistButtonState, 'available'>, string> = {
  playing: 'sp-tag-on',
  queued: 'sp-tag-line',
  blocked: 'sp-tag-off',
  limit: 'sp-tag-off',
};

export default function PlaylistPicker({
  playlists,
  playingPlaylist,
  queuedPlaylists,
  requestsRemaining,
  busy,
  onRequest,
}: PlaylistPickerProps) {
  const playlistActive = playingPlaylist !== null || queuedPlaylists.length > 0;

  return (
    <section aria-labelledby="playlists-heading" className="sp-panel">
      <span className="sp-eyebrow">Whole show</span>
      <h2 id="playlists-heading" className="sp-display sp-h2">Pick a playlist</h2>
      <p className="sp-muted mt-1 text-[13px]">
        {playlistActive
          ? 'A playlist is already playing or in line. You can pick the next one when it finishes.'
          : 'It starts when the current song ends, then the regular show carries on.'}
      </p>

      <ul className="mt-3.5 space-y-1">
        {playlists.map((playlist) => {
          const state = playlistButtonState({ name: playlist.name, playingPlaylist, queuedPlaylists, requestsRemaining });
          return (
            <li key={playlist.name} className="flex items-center gap-3 rounded-xl py-2 pl-3 pr-1 transition hover:bg-white/5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{playlist.name}</span>
                <span className="sp-muted block truncate text-xs tabular-nums">{playlistDetailsLine(playlist)}</span>
              </span>
              {state === 'available' ? (
                <button
                  type="button"
                  onClick={() => onRequest(playlist)}
                  disabled={busy}
                  aria-label={`Request the ${playlist.name} playlist`}
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
    </section>
  );
}
