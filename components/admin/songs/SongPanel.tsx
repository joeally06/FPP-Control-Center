'use client';

import { useRef, useState } from 'react';
import { Download, ImagePlus, Link2, Undo2, X } from 'lucide-react';
import { MAX_CATEGORY_LENGTH } from '@/lib/jukebox-display';
import { AdminLabel } from '@/components/admin/Typography';
import { accentButton, badge, button, field, iconButton, notice, textLink } from '@/components/admin/ui-classes';

import { SpotifySearchResult, LocalAudioFile, Message, AUDIO, CHIP, SongArt, ListedSong } from './song-ui';
interface SongPanelProps {
  song: ListedSong;
  /** The playlist being edited; null edits the song's default details */
  playlist: string | null;
  /** Categories to offer as one-tap suggestions */
  categories: string[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}

/** Everything about one song. A side column on wide screens, a full-screen sheet on phones. */
export default function SongPanel({ song, playlist, categories, onClose, onChanged }: SongPanelProps) {
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
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suggested categories">
            {categories.map((name) => (
              <button key={name} type="button" onClick={() => setCategory(name)} aria-pressed={category.trim() === name} className={CHIP(category.trim() === name)}>{name}</button>
            ))}
          </div>
        )}
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
