'use client';

import { useEffect, useState } from 'react';
import { Download, Pencil, RefreshCw, Search } from 'lucide-react';
import type { AdminPlaylist } from '@/lib/jukebox-playlists';
import type { AdminSong, PlaylistAdminSong, SongFilter } from '@/lib/jukebox-songs';
import { THEME_PRESETS, type ThemeId } from '@/lib/themes/theme-config';
import { SUGGESTED_CATEGORIES, formatClock } from '@/lib/jukebox-display';
import { AdminH3, AdminTextMuted } from '@/components/admin/Typography';
import { card, field, notice, smallButton } from '@/components/admin/ui-classes';

import { Message, AUDIO, FILTERS, CATEGORY_LIST_ID, matchesFilter, SongArt, ListedSong, CHIP, seasonNote } from './songs/song-ui';
import SongPanel from './songs/SongPanel';
import AdvancedTools from './songs/AdvancedTools';

interface JukeboxSongsProps {
  /** null while loading */
  songs: AdminSong[] | null;
  /** Playlists whose songs are known, for the picker */
  playlists: AdminPlaylist[];
  /** Changes after a Sync from FPP so the open playlist's songs are read again */
  reloadKey: number;
  filter: SongFilter;
  onFilterChange: (filter: SongFilter) => void;
  /** Changes when the checklist sends the admin back to the full song list */
  allSongsKey: number;
  /** Reload the songs (and the checklist) after something changed */
  onChanged: () => Promise<void>;
}

/** Jukebox → Playlists & songs: every song visitors can request, with its title, category and phone audio. Pick a playlist to give its songs their own details. */
export default function JukeboxSongs({ songs, playlists, reloadKey, filter, onFilterChange, allSongsKey, onChanged }: JukeboxSongsProps) {
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [autoFill, setAutoFill] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<Message>(null);
  // null = "All songs (defaults)"; otherwise the playlist being edited and its songs (null while loading)
  const [playlist, setPlaylist] = useState<string | null>(null);
  const [playlistSongs, setPlaylistSongs] = useState<PlaylistAdminSong[] | null>(null);
  const [savingTheme, setSavingTheme] = useState(false);
  // The theme just picked for a playlist, shown until the playlist list reloads (the server's value is what is saved)
  const [pickedTheme, setPickedTheme] = useState<{ playlist: string; theme: string } | null>(null);
  const [seenAllSongsKey, setSeenAllSongsKey] = useState(allSongsKey);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!playlist) return;
    let cancelled = false;
    fetch(`/api/jukebox/playlist-songs?playlist=${encodeURIComponent(playlist)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data) => {
        if (!cancelled) setPlaylistSongs(data.songs ?? []);
      })
      .catch((error) => {
        console.error('Failed to load the playlist songs:', error);
        if (cancelled) return;
        setPlaylistSongs([]);
        setMessage({ ok: false, text: 'Could not load that playlist. Try again.' });
      });
    return () => {
      cancelled = true;
    };
    // reloadKey changes after a Sync from FPP, which can change a playlist's songs
  }, [playlist, reloadKey]);

  // After a change: the song list and checklist, and the open playlist's own list
  async function refresh() {
    await onChanged();
    if (!playlist) return;
    try {
      const response = await fetch(`/api/jukebox/playlist-songs?playlist=${encodeURIComponent(playlist)}`);
      if (response.ok) setPlaylistSongs((await response.json()).songs ?? []);
    } catch (error) {
      console.error('Failed to reload the playlist songs:', error);
    }
  }

  function choosePlaylist(name: string | null) {
    // Tapping the playlist that is already open changes nothing (and must not blank a list that will not reload)
    if (name === playlist) return;
    setPlaylist(name);
    setPlaylistSongs(null);
    setSelectedName(null);
    setMessage(null);
    setPickedTheme(null);
  }

  // Back to "All songs" when the checklist asks for it, or when a Sync removed the open playlist (adjusted while rendering, not in an effect)
  if (seenAllSongsKey !== allSongsKey) {
    setSeenAllSongsKey(allSongsKey);
    choosePlaylist(null);
  } else if (playlist && songs !== null && !playlists.some((item) => item.name === playlist)) {
    choosePlaylist(null);
  }

  const list: ListedSong[] = playlist ? (playlistSongs ?? []) : (songs ?? []);
  const query = search.trim().toLowerCase();
  const visible = list.filter((song) =>
    matchesFilter(song, filter) && (!query || [song.name, song.title, song.artist].some((text) => text?.toLowerCase().includes(query)))
  );
  const selected = list.find((song) => song.name === selectedName) ?? null;
  const untitled = list.filter((song) => !song.title);
  const selectedPlaylist = playlists.find((item) => item.name === playlist) ?? null;
  const needsDownload = list.filter((song) => song.audioStatus === 'needs-download');

  // Which theme shows this playlist to visitors; saved as soon as it changes
  async function saveTheme(name: string, theme: string) {
    setSavingTheme(true);
    setMessage(null);
    setPickedTheme({ playlist: name, theme });
    try {
      const response = await fetch('/api/jukebox/playlist-themes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themes: { [name]: theme } }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      await onChanged();
      setMessage({ ok: true, text: theme ? `${name} will show during ${THEME_PRESETS[theme as ThemeId]?.name ?? theme}.` : `${name} is hidden from visitors.` });
    } catch (error) {
      console.error('Failed to save the playlist theme:', error);
      setPickedTheme(null);
      setMessage({ ok: false, text: 'Could not save that change. Try again.' });
    } finally {
      setSavingTheme(false);
    }
  }

  // The phone audio FPP has for this playlist's songs, copied one song at a time
  async function downloadMissingAudio() {
    setMessage(null);
    setDownloadProgress({ done: 0, total: needsDownload.length });
    let copied = 0;
    for (const [index, song] of needsDownload.entries()) {
      try {
        const response = await fetch('/api/audio/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sequenceName: song.name, mediaName: song.mediaName }),
        });
        if (response.ok) copied++;
      } catch (error) {
        console.error('Audio download failed for', song.name, error);
      }
      setDownloadProgress({ done: index + 1, total: needsDownload.length });
    }
    await refresh();
    setDownloadProgress(null);
    setMessage({
      ok: copied === needsDownload.length,
      text: copied === needsDownload.length ? `Downloaded audio for ${copied} ${copied === 1 ? 'song' : 'songs'}.` : `Downloaded ${copied} of ${needsDownload.length}. Open the rest to see why.`,
    });
  }
  const categories = [...new Set([...SUGGESTED_CATEGORIES, ...list.map((song) => song.category).filter((c): c is string => !!c)])];

  // Spotify lookups for songs with no title, one at a time (the same lookup the Media library ran on every song)
  async function findMissingTitles() {
    setMessage(null);
    setAutoFill({ done: 0, total: untitled.length });
    let found = 0;
    for (const [index, song] of untitled.entries()) {
      try {
        const response = await fetch(`/api/spotify/metadata/${encodeURIComponent(song.name)}`);
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.trackName) found++;
      } catch (error) {
        console.error('Spotify lookup failed for', song.name, error);
      }
      setAutoFill({ done: index + 1, total: untitled.length });
    }
    await refresh();
    setAutoFill(null);
    setMessage({
      ok: found > 0,
      text: found > 0
        ? `Found ${found} of ${untitled.length} on Spotify. Automatic matches can be wrong, so check them.`
        : 'Spotify had no match for these songs. Search for each one in its panel, or enter the details by hand.',
    });
  }

  if (songs === null) {
    return (
      <div className={card}>
        <AdminTextMuted>Loading songs...</AdminTextMuted>
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className={card}>
        <AdminH3 className="mb-0.5">No songs yet</AdminH3>
        <AdminTextMuted>
          Press Sync from FPP at the top of the page to load the songs from your scheduled FPP playlists.
        </AdminTextMuted>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <datalist id={CATEGORY_LIST_ID}>
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {playlists.length > 0 && (
          <div className="flex flex-col gap-2">
            <label htmlFor="jukebox-playlist" className="text-xs font-semibold uppercase tracking-[0.08em] text-adm-muted">Playlist</label>
            <select
              id="jukebox-playlist"
              value={playlist ?? ''}
              onChange={(e) => choosePlaylist(e.target.value || null)}
              disabled={autoFill !== null || downloadProgress !== null}
              className={`${field} cursor-pointer sm:max-w-md`}
            >
              <option value="">All songs (default details)</option>
              {playlists.map((item) => {
                const note = item.theme ? seasonNote(item) : 'Hidden';
                return (
                  <option key={item.name} value={item.name}>
                    {item.name} · {item.songCount} {item.songCount === 1 ? 'song' : 'songs'}{note ? ` · ${note}` : ''}
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-adm-muted">
              {playlist
                ? 'Changes here apply to this playlist only. Anything left empty shows the song’s default details.'
                : 'Default details show in every playlist that has none of its own.'}
            </p>
          </div>
        )}

        {playlist && selectedPlaylist && (
          <div className={`${card} flex flex-col gap-4`}>
            <div className="flex flex-col gap-1.5 sm:max-w-md">
              <label htmlFor="jukebox-playlist-theme" className="text-sm font-semibold text-adm-text">Show it during</label>
              <select
                id="jukebox-playlist-theme"
                value={pickedTheme?.playlist === selectedPlaylist.name ? pickedTheme.theme : (selectedPlaylist.theme ?? '')}
                onChange={(e) => saveTheme(selectedPlaylist.name, e.target.value)}
                disabled={savingTheme}
                className={`${field} cursor-pointer`}
              >
                <option value="">Hidden from visitors</option>
                {Object.values(THEME_PRESETS).map((theme) => (
                  <option key={theme.id} value={theme.id}>{theme.name}</option>
                ))}
              </select>
              <p className="text-xs text-adm-muted">
                Visitors see this playlist while that theme is on and FPP’s schedule runs it today. Sync from FPP after changing a playlist in FPP.
              </p>
            </div>
            {needsDownload.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-adm-muted">
                  {needsDownload.length} {needsDownload.length === 1 ? 'song needs' : 'songs need'} audio for visitors’ phones.
                </span>
                <button onClick={downloadMissingAudio} disabled={downloadProgress !== null} className={`${smallButton} shrink-0`}>
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  {downloadProgress ? `Downloading ${downloadProgress.done} of ${downloadProgress.total}…` : 'Download phone audio'}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(({ id, label }) => {
              const count = list.filter((song) => matchesFilter(song, id)).length;
              const active = filter === id;
              return (
                <button
                  key={id}
                  onClick={() => onFilterChange(id)}
                  aria-pressed={active}
                  className={CHIP(active)}
                >
                  {label} <span className="opacity-75">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adm-faint" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search songs"
              aria-label="Search songs"
              className={`${field} pl-10`}
            />
          </div>
        </div>

        {untitled.length > 0 && (
          <div className={`${notice.info} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
            <span className="text-adm-info">
              {untitled.length} {untitled.length === 1 ? 'song shows its' : 'songs show their'} file name to visitors.
            </span>
            <button onClick={findMissingTitles} disabled={autoFill !== null} className={`${smallButton} shrink-0`}>
              <RefreshCw className={`h-3.5 w-3.5 ${autoFill ? 'animate-spin' : ''}`} aria-hidden="true" />
              {autoFill ? `Looking up ${autoFill.done} of ${autoFill.total}…` : 'Find titles on Spotify'}
            </button>
          </div>
        )}

        {message && <p role="status" className={message.ok ? notice.ok : notice.warn}>{message.text}</p>}

        <div className="overflow-hidden rounded-2xl border border-adm-line bg-adm-surface">
          {visible.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-adm-muted">
              {playlist && playlistSongs === null ? 'Loading playlist…' : query ? 'No songs match your search.' : 'Nothing left to fix here.'}
            </p>
          ) : (
            <ul className="divide-y divide-adm-line">
              {visible.map((song) => {
                const isSelected = song.name === selectedName;
                const audio = AUDIO[song.audioStatus];
                return (
                  <li key={song.name}>
                    <button
                      onClick={() => setSelectedName(song.name)}
                      aria-pressed={isSelected}
                      className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-adm-hover ${isSelected ? 'bg-adm-raised' : ''}`}
                    >
                      <SongArt song={song} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-semibold ${song.title ? 'text-adm-text' : 'italic text-adm-soft'}`}>
                          {song.title || song.name}
                        </span>
                        <span className="block truncate text-xs text-adm-muted">
                          {[
                            song.artist || (song.title ? 'Unknown artist' : 'No title yet'),
                            song.ownDetails ? 'Own details' : null,
                            song.category,
                            song.durationSeconds != null ? formatClock(song.durationSeconds) : null,
                          ].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className={`${audio.className} shrink-0`}>{audio.label}</span>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          isSelected ? 'border-adm-accent bg-adm-warn-bg text-adm-warn' : 'border-adm-control-line bg-adm-control text-adm-text'
                        }`}
                      >
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                        {/* Icon only on a phone so the title keeps its room; the word stays for screen readers */}
                        <span className="sr-only sm:not-sr-only">{isSelected ? 'Editing' : 'Edit'}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <AdvancedTools
          onChanged={onChanged}
          audioFiles={playlist ? [...new Set(list.map((song) => song.audioFile).filter((file): file is string => !!file))] : null}
        />
      </div>

      {selected && (
        <SongPanel
          key={`${playlist ?? ''}\u0000${selected.name}`}
          song={selected}
          playlist={playlist}
          onClose={() => setSelectedName(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

