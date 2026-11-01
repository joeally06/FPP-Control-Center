'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, Link2, Music, Pencil, RefreshCw, Search, Trash2, Undo2, X } from 'lucide-react';
import type { AdminPlaylist } from '@/lib/jukebox-playlists';
import type { AdminSong, AudioStatus, PlaylistAdminSong, SongFilter } from '@/lib/jukebox-songs';
import { THEME_PRESETS, type ThemeId } from '@/lib/themes/theme-config';
import { MAX_CATEGORY_LENGTH, SUGGESTED_CATEGORIES, formatClock } from '@/lib/jukebox-display';
import { AdminH3, AdminLabel, AdminTextMuted } from '@/components/admin/Typography';
import {
  accentButton, badge, button, card, field, iconButton, iconDangerButton, notice, smallButton, smallDangerButton, textLink,
} from '@/components/admin/ui-classes';

interface SpotifySearchResult {
  id: string;
  name: string;
  artist: string;
  album: string;
  albumArt: string;
  spotifyUri: string;
  previewUrl: string | null;
}

interface LocalAudioFile {
  name: string;
  size: number;
  lastModified: string;
}

type Message = { ok: boolean; text: string } | null;

const AUDIO: Record<AudioStatus, { label: string; className: string; help: string }> = {
  ready: {
    label: 'Audio ready',
    className: badge.ok,
    help: 'Visitors can listen along on their phones.',
  },
  'needs-download': {
    label: 'Download audio',
    className: badge.warn,
    help: 'FPP has this song’s audio. Download a copy so visitors can listen on their phones.',
  },
  'needs-mapping': {
    label: 'No audio file',
    className: badge.danger,
    help: 'No matching audio file was found on this server, and FPP’s playlist doesn’t name one. Pick a file for this sequence.',
  },
};

const FILTERS: { id: SongFilter; label: string }[] = [
  { id: 'all', label: 'All songs' },
  { id: 'titles', label: 'Needs a title' },
  { id: 'audio', label: 'Needs phone audio' },
];

const CATEGORY_LIST_ID = 'jukebox-category-suggestions';

function matchesFilter(song: AdminSong, filter: SongFilter) {
  if (filter === 'titles') return !song.title;
  if (filter === 'audio') return song.audioStatus !== 'ready';
  return true;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function SongArt({ song, large = false }: { song: AdminSong; large?: boolean }) {
  const size = large ? 'h-16 w-16 rounded-xl' : 'h-11 w-11 rounded-lg';
  return song.albumArt ? (
    // eslint-disable-next-line @next/next/no-img-element -- album art hosted by Spotify or wherever the admin pointed it
    <img src={song.albumArt} alt="" className={`${size} shrink-0 object-cover`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center border border-dashed border-adm-control-line text-adm-faint`}>
      <Music className={large ? 'h-6 w-6' : 'h-4 w-4'} aria-hidden="true" />
    </span>
  );
}

/** A song in the list: in a playlist it also says whether that playlist has its own details */
type ListedSong = AdminSong & Partial<Pick<PlaylistAdminSong, 'ownDetails' | 'own'>>;

const CHIP = (active: boolean) =>
  `min-h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors ${
    active ? 'border-adm-accent bg-adm-warn-bg text-adm-warn' : 'border-adm-control-line bg-adm-control text-adm-text hover:bg-adm-line'
  }`;

/** "Dec 11" from "2026-12-11", read as a plain calendar date (no time zone shift) */
function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Where a playlist stands in FPP's Scheduler, when that is worth a note */
function seasonNote(playlist: AdminPlaylist): string | null {
  if (playlist.season === 'upcoming') return playlist.startsOn ? `Starts ${formatShortDate(playlist.startsOn)}` : 'Starts later';
  if (playlist.season === 'ended') return 'Ended';
  if (playlist.season === 'not-scheduled') return 'Not scheduled';
  return null;
}

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

interface SongPanelProps {
  song: ListedSong;
  /** The playlist being edited; null edits the song's default details */
  playlist: string | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

/** Everything about one song. A side column on wide screens, a full-screen sheet on phones. */
function SongPanel({ song, playlist, onClose, onChanged }: SongPanelProps) {
  const pictureInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(song.title ? `${song.title} ${song.artist ?? ''}`.trim() : song.name.replace(/[_-]+/g, ' '));
  const [results, setResults] = useState<SpotifySearchResult[] | null>(null);
  const [manual, setManual] = useState(false);
  const songDetails = () => ({
    trackName: song.title ?? '',
    artist: song.artist ?? '',
    album: song.album ?? '',
    albumArt: song.albumArt ?? '',
  });
  const [form, setForm] = useState(songDetails);
  const [category, setCategory] = useState(song.category ?? '');
  const [localFiles, setLocalFiles] = useState<LocalAudioFile[] | null>(null);
  const [audioFile, setAudioFile] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const missing = [!song.title && 'a title', song.audioStatus !== 'ready' && 'phone audio'].filter(Boolean);
  const audio = AUDIO[song.audioStatus];

  // Runs one change, then reloads the list so the badges and checklist catch up
  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setMessage(null);
    try {
      const text = await action();
      await onChanged();
      setMessage({ ok: true, text });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Something went wrong' });
    } finally {
      setBusy(null);
    }
  }

  async function postJson(url: string, body: unknown, method = 'POST') {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function searchSpotify() {
    if (!query.trim()) return;
    setBusy('search');
    setMessage(null);
    try {
      const response = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}&limit=8`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Spotify search failed');
      setResults(data.results ?? []);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Spotify search failed' });
    } finally {
      setBusy(null);
    }
  }

  const saveDetails = (body: Record<string, string | null>) =>
    run('details', async () => {
      if (playlist) {
        await postJson('/api/jukebox/playlist-songs', {
          playlist,
          sequence: song.name,
          details: { title: body.trackName ?? null, artist: body.artist ?? null, album: body.album ?? null, albumArt: body.albumArt ?? null },
        }, 'PUT');
      } else {
        await postJson(`/api/spotify/metadata/${encodeURIComponent(song.name)}/override`, body);
      }
      setResults(null);
      setManual(false);
      return playlist ? `Saved for ${playlist}.` : 'Song details saved.';
    });

  // In a playlist, a field left as it was keeps its own value (or stays on the default) instead of turning into a copy
  const keepOwn = (typed: string, shown: string | null, own: string | null | undefined) =>
    typed.trim() === (shown ?? '') ? (own ?? null) : typed;

  async function uploadPicture(file: File) {
    if (!playlist) return;
    await run('upload', async () => {
      const upload = new FormData();
      upload.append('playlist', playlist);
      upload.append('sequence', song.name);
      upload.append('file', file);
      const response = await fetch('/api/jukebox/song-art', { method: 'POST', body: upload });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) throw new Error(data.error || 'Upload failed');
      // An open manual-entry form must not still hold the old artwork address, or its Save would put the old one back
      if (typeof data.artUrl === 'string') setForm((prev) => ({ ...prev, albumArt: data.artUrl }));
      return `Picture saved for ${playlist}.`;
    });
  }

  const resetToDefault = () =>
    run('reset', async () => {
      await postJson('/api/jukebox/playlist-songs', { playlist, sequence: song.name, details: null }, 'PUT');
      setResults(null);
      setManual(false);
      return 'This playlist now shows the default details for the song.';
    });

  const pickResult = (result: SpotifySearchResult) =>
    saveDetails({
      albumArt: result.albumArt,
      artist: result.artist,
      album: result.album,
      trackName: result.name,
      spotifyTrackId: result.id,
      spotifyUri: result.spotifyUri,
      previewUrl: result.previewUrl,
    });

  const saveManual = () =>
    saveDetails(playlist
      ? {
          trackName: keepOwn(form.trackName, song.title, song.own?.title),
          artist: keepOwn(form.artist, song.artist, song.own?.artist),
          album: keepOwn(form.album, song.album, song.own?.album),
          albumArt: keepOwn(form.albumArt, song.albumArt, song.own?.albumArt),
        }
      : { ...form, spotifyTrackId: null, spotifyUri: null, previewUrl: null });

  const saveCategory = () =>
    run('category', async () => {
      await postJson('/api/jukebox/song-categories', { categories: { [song.name]: category } }, 'PUT');
      return 'Category saved.';
    });

  const downloadAudio = () =>
    run('download', async () => {
      const data = await postJson('/api/audio/download', { sequenceName: song.name, mediaName: song.mediaName });
      return `Downloaded ${data.audioFile} from FPP.`;
    });

  const mapAudio = () =>
    run('map', async () => {
      await postJson('/api/audio/mappings', { sequenceName: song.name, audioFile });
      setLocalFiles(null);
      return `This song now plays ${audioFile} on phones.`;
    });

  async function loadLocalFiles() {
    try {
      const response = await fetch('/api/audio/local-files');
      const data = await response.json().catch(() => ({}));
      setLocalFiles(data.files ?? []);
      setAudioFile(song.audioFile ?? '');
    } catch (error) {
      console.error('Failed to load audio files:', error);
      setLocalFiles([]);
    }
  }

  return (
    <aside
      aria-label={`Edit ${song.title || song.name}`}
      className="fixed inset-0 z-50 flex flex-col gap-5 overflow-y-auto bg-adm-bg p-4 lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:max-h-[calc(100vh-3rem)] lg:w-96 lg:shrink-0 lg:rounded-2xl lg:border lg:border-adm-control-line lg:bg-adm-surface lg:p-5"
    >
      <div className="flex items-start gap-3">
        <SongArt song={song} large />
        <div className="min-w-0 flex-1">
          <p className={`text-base font-semibold ${song.title ? 'text-adm-text' : 'italic text-adm-soft'}`}>{song.title || song.name}</p>
          {song.artist && <p className="truncate text-sm text-adm-soft">{song.artist}</p>}
          <p className="mt-1 font-mono text-xs break-all text-adm-muted">FPP sequence: {song.name}.fseq</p>
          {playlist && (
            <p className="mt-1.5">
              <span className={song.ownDetails ? badge.ok : badge.warn}>
                {song.ownDetails ? `Own details for ${playlist}` : 'Using the default details'}
              </span>
            </p>
          )}
        </div>
        <button onClick={onClose} className={iconButton} aria-label="Close">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {missing.length > 0 && <p className={notice.warn}>Still needed: {missing.join(' and ')}.</p>}
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? notice.ok : notice.danger}>{message.text}</p>
      )}

      <section className="flex flex-col gap-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-adm-muted">Title and artwork</p>
        <div className="flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchSpotify()}
            aria-label="Search Spotify"
            className={`${field} min-w-0 flex-1`}
          />
          <button onClick={searchSpotify} disabled={busy !== null || !query.trim()} className={`${button} shrink-0`}>
            {busy === 'search' ? 'Searching…' : 'Find on Spotify'}
          </button>
        </div>
        <p className="text-xs text-adm-muted">Fills in the title, artist, album and artwork. Visitors see the title and artist in the song list.</p>

        {playlist ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={pictureInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-label="Upload a picture"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) uploadPicture(file);
              }}
            />
            <button onClick={() => pictureInput.current?.click()} disabled={busy !== null} className={button}>
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              {busy === 'upload' ? 'Uploading…' : 'Upload a picture'}
            </button>
            {song.ownDetails && (
              <button onClick={resetToDefault} disabled={busy !== null} className={button}>
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                {busy === 'reset' ? 'Resetting…' : 'Reset to default'}
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-adm-muted">To give a song its own picture, pick a playlist above first. JPEG, PNG or WebP, up to 5 MB.</p>
        )}

        {results !== null && (
          results.length === 0 ? (
            <p className="text-sm text-adm-muted">No results. Try different words, or enter the details by hand.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    onClick={() => pickResult(result)}
                    disabled={busy !== null}
                    className="flex w-full items-center gap-3 rounded-xl border border-adm-line bg-adm-side p-2.5 text-left transition-colors hover:bg-adm-hover disabled:opacity-50"
                  >
                    {result.albumArt ? (
                      // eslint-disable-next-line @next/next/no-img-element -- album art hosted by Spotify
                      <img src={result.albumArt} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="h-11 w-11 shrink-0 rounded-lg bg-adm-field" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-adm-text">{result.name}</span>
                      <span className="block truncate text-xs text-adm-muted">{result.artist} · {result.album}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-adm-accent">Use this</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        <button
          onClick={() => {
            // Start from what's saved now, which may have changed since the panel opened
            if (!manual) setForm(songDetails());
            setManual(!manual);
          }}
          aria-expanded={manual}
          className={`${textLink} self-start`}
        >
          {manual ? 'Hide manual entry' : 'Enter the details by hand'}
        </button>

        {manual && (
          <div className="flex flex-col gap-3">
            {([
              ['trackName', 'Title', 'Song title'],
              ['artist', 'Artist', 'Artist name'],
              ['album', 'Album', 'Album name'],
              ['albumArt', 'Artwork URL', 'https://...'],
            ] as const).map(([key, label, placeholder]) => (
              <div key={key}>
                <AdminLabel htmlFor={`song-${key}`}>{label}</AdminLabel>
                <input
                  id={`song-${key}`}
                  type="text"
                  value={form[key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className={field}
                />
              </div>
            ))}
            <button onClick={saveManual} disabled={busy !== null || !form.trackName.trim()} className={accentButton}>
              {busy === 'details' ? 'Saving…' : 'Save details'}
            </button>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2.5 border-t border-adm-line pt-4">
        <label htmlFor="song-category" className="text-xs font-semibold uppercase tracking-[0.08em] text-adm-muted">Category</label>
        <div className="flex gap-2">
          <input
            id="song-category"
            type="text"
            list={CATEGORY_LIST_ID}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={MAX_CATEGORY_LENGTH}
            placeholder="No category"
            className={`${field} min-w-0 flex-1`}
          />
          <button
            onClick={saveCategory}
            disabled={busy !== null || category.trim() === (song.category ?? '')}
            className={`${button} shrink-0`}
          >
            {busy === 'category' ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="text-xs text-adm-muted">Categories become filter buttons on the visitor song list. Optional.</p>
      </section>

      <section className="flex flex-col gap-2.5 border-t border-adm-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-adm-muted">Phone audio</p>
          <span className={audio.className}>{audio.label}</span>
        </div>
        <p className="text-sm text-adm-soft">
          {song.audioFile ? `Plays ${song.audioFile}. ` : ''}{audio.help}
        </p>
        <div className="flex flex-wrap gap-2">
          {song.audioStatus === 'needs-download' && (
            <button onClick={downloadAudio} disabled={busy !== null} className={accentButton}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {busy === 'download' ? 'Downloading…' : 'Download from FPP'}
            </button>
          )}
          {localFiles === null && (
            <button onClick={loadLocalFiles} disabled={busy !== null} className={button}>
              <Link2 className="h-4 w-4" aria-hidden="true" />
              {song.audioFile ? 'Use a different file' : 'Choose a file on this server'}
            </button>
          )}
        </div>
        {localFiles !== null && (
          localFiles.length === 0 ? (
            <p className="text-sm text-adm-muted">There are no audio files on this server yet. Download one from FPP first.</p>
          ) : (
            <div className="flex gap-2">
              <select
                value={audioFile}
                onChange={(e) => setAudioFile(e.target.value)}
                aria-label={`Audio file for ${song.name}`}
                className={`${field} min-w-0 flex-1`}
              >
                <option value="">Choose a file…</option>
                {localFiles.map((file) => (
                  <option key={file.name} value={file.name}>{file.name}</option>
                ))}
              </select>
              <button onClick={mapAudio} disabled={busy !== null || !audioFile} className={`${button} shrink-0`}>
                {busy === 'map' ? 'Saving…' : 'Use'}
              </button>
            </div>
          )
        )}
      </section>

      <button onClick={onClose} className={`${button} mt-auto lg:hidden`}>Done</button>
    </aside>
  );
}

/**
 * Rarely needed: the audio files kept for phones, and a bulk fix for missing Spotify links.
 * `audioFiles` limits the file list to the open playlist's songs; null lists every file on the server.
 */
function AdvancedTools({ onChanged, audioFiles }: { onChanged: () => Promise<void>; audioFiles: string[] | null }) {
  const [allFiles, setFiles] = useState<LocalAudioFile[] | null>(null);
  const files = allFiles && audioFiles ? allFiles.filter((file) => audioFiles.includes(file.name)) : allFiles;
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function loadFiles() {
    try {
      const response = await fetch('/api/audio/local-files');
      const data = await response.json().catch(() => ({}));
      setFiles(data.files ?? []);
    } catch (error) {
      console.error('Failed to load audio files:', error);
      setFiles([]);
    }
  }

  async function deleteFiles(names: string[]) {
    const prompt = names.length === 1 ? `Delete "${names[0]}"? This cannot be undone.` : `Delete all ${names.length} audio files? This cannot be undone.`;
    if (!confirm(prompt)) return;

    setBusy(names.length === 1 ? names[0] : 'all');
    setMessage(null);
    let failed = 0;
    for (const name of names) {
      try {
        const response = await fetch(`/api/audio/local-files/${encodeURIComponent(name)}`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) failed++;
      } catch {
        failed++;
      }
    }
    setMessage(failed ? { ok: false, text: `${failed} of ${names.length} could not be deleted.` } : { ok: true, text: `Deleted ${names.length === 1 ? names[0] : `${names.length} files`}.` });
    await loadFiles();
    await onChanged();
    setBusy(null);
  }

  async function refreshSpotifyLinks() {
    setBusy('links');
    setMessage(null);
    try {
      const response = await fetch('/api/admin/media-library/refresh-urls', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to refresh Spotify links');
      setMessage({ ok: true, text: data.message });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Failed to refresh Spotify links' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <details
      className={card}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && allFiles === null) loadFiles();
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold text-adm-text">Advanced: audio files and Spotify links</summary>

      <div className="mt-4 flex flex-col gap-4">
        {message && <p role="status" className={message.ok ? notice.ok : notice.danger}>{message.text}</p>}

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <AdminH3 className="mb-0">{audioFiles ? 'Audio files for this playlist' : 'Audio files on this server'}</AdminH3>
            {files !== null && files.length > 0 && (
              <button onClick={() => deleteFiles(files.map((file) => file.name))} disabled={busy !== null} className={smallDangerButton}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {busy === 'all' ? 'Deleting…' : 'Delete all'}
              </button>
            )}
          </div>
          <AdminTextMuted>Copies of FPP’s audio that visitors’ phones play. Downloading from a song’s panel adds them here.</AdminTextMuted>
          {files === null ? (
            <AdminTextMuted className="mt-3">Loading...</AdminTextMuted>
          ) : files.length === 0 ? (
            <AdminTextMuted className="mt-3">No audio files yet.</AdminTextMuted>
          ) : (
            <ul className="mt-3 divide-y divide-adm-line">
              {files.map((file) => (
                <li key={file.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-adm-text">{file.name}</span>
                    <span className="text-xs text-adm-muted">{formatFileSize(file.size)}</span>
                  </span>
                  <button
                    onClick={() => deleteFiles([file.name])}
                    disabled={busy !== null}
                    className={iconDangerButton}
                    aria-label={`Delete ${file.name}`}
                  >
                    {busy === file.name ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-adm-line pt-4">
          <AdminH3 className="mb-0.5">Spotify links</AdminH3>
          <AdminTextMuted>
            Looks up the “Open in Spotify” link for songs that have a title and artist but no link yet.
            {audioFiles ? ' This covers every song, not only this playlist.' : ''}
          </AdminTextMuted>
          <button onClick={refreshSpotifyLinks} disabled={busy !== null} className={`${smallButton} mt-3`}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy === 'links' ? 'animate-spin' : ''}`} aria-hidden="true" />
            {busy === 'links' ? 'Looking up…' : 'Fill in missing Spotify links'}
          </button>
        </div>
      </div>
    </details>
  );
}
