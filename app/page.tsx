'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import AdminLoadingScreen from '@/components/admin/AdminLoadingScreen';
import {
  accentButton, button, card, cardTitle, dangerButton, eyebrow, field, roundButton, textLink,
} from '@/components/admin/ui-classes';
import { useFPPConnection } from '@/contexts/FPPConnectionContext';
import {
  CircleCheck, Mail, Pause, Play, RotateCcw, Server, Shuffle, SkipBack, SkipForward, Square, TriangleAlert, WifiOff,
} from 'lucide-react';
import { TIMING } from '@/lib/constants';
import { formatDateTime } from '@/lib/time-utils';
import { formatClock, stripFseq, type PublicQueueItem } from '@/lib/jukebox-display';
import type { ShowSummary } from '@/lib/show-summary';

interface Status {
  status_name: string;
  current_playlist: { playlist: string; count: string; index: string };
  current_sequence: string;
  volume: number;
  mode_name: string;
  // FPP sends these as numbers or numeric strings; absent when nothing is playing
  seconds_played?: number | string;
  seconds_remaining?: number | string;
}

interface Playlist {
  name: string;
}

interface Sequence {
  name: string;
}

interface PlaylistDetails {
  name?: string;
  mainPlaylist?: Array<{
    sequenceName?: string;
    type?: string;
  }>;
  leadIn?: Array<{
    sequenceName?: string;
    type?: string;
  }>;
  leadOut?: Array<{
    sequenceName?: string;
    type?: string;
  }>;
  [key: string]: any;
}

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistDetails, setPlaylistDetails] = useState<Map<string, PlaylistDetails>>(new Map());
  const [allSequences, setAllSequences] = useState<Sequence[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>('');
  const [selectedSequence, setSelectedSequence] = useState<string>('');
  const [repeat, setRepeat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ShowSummary | null>(null);
  const [queue, setQueue] = useState<PublicQueueItem[]>([]);
  const [confirmStopNow, setConfirmStopNow] = useState(false);
  const keepPlayingRef = useRef<HTMLButtonElement>(null);
  const { data: session, status: sessionStatus } = useSession();
  const { isOnline } = useFPPConnection();
  const isAdmin = session?.user?.role === 'admin';
  const router = useRouter();

  // Redirect non-admins to jukebox page
  useEffect(() => {
    if (sessionStatus !== 'loading' && !isAdmin) {
      router.push('/jukebox');
    }
  }, [isAdmin, sessionStatus, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (!isOnline || !isAdmin) return;

      try {
        // Fetch status
        const statusRes = await fetch('/api/fppd/status');
        if (statusRes.ok) {
          const data = await statusRes.json();
          setStatus(data);
          if (data.current_playlist?.playlist) {
            setSelectedPlaylist(data.current_playlist.playlist);
          }
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    // Initial fetch
    fetchData();
    // Poll every 5 seconds for status updates
    const interval = setInterval(fetchData, TIMING.POLL_INTERVAL_FAST);
    return () => clearInterval(interval);
  }, [isAdmin, isOnline]);

  // Fetch playlists and sequences once on mount
  useEffect(() => {
    const fetchStaticData = async () => {
      if (!isOnline || !isAdmin) return;

      try {
        // Fetch playlists (only once)
        const playlistsRes = await fetch('/api/fpp/playlists/list');
        if (playlistsRes.ok) {
          const data = await playlistsRes.json();
          setPlaylists(data || []);
          if (data.length > 0 && !selectedPlaylist) {
            setSelectedPlaylist(data[0].name);
          }
        }

        // Fetch all sequences (for standalone playback)
        const sequencesRes = await fetch('/api/fpp/sequences/list');
        if (sequencesRes.ok) {
          const data = await sequencesRes.json();
          setAllSequences(data || []);
        }
      } catch (err) {
        console.error('Failed to fetch static data:', err);
      }
    };

    fetchStaticData();
  }, [isAdmin, isOnline]);

  // Today's numbers, letters waiting and device health: SQLite only, so it runs while FPP is offline too
  useEffect(() => {
    if (!isAdmin) return;
    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/admin/show-summary');
        if (res.ok) setSummary(await res.json());
      } catch (err) {
        console.error('Failed to fetch show summary:', err);
      }
    };
    fetchSummary();
    const interval = setInterval(fetchSummary, TIMING.POLL_INTERVAL_SLOW);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // Jukebox requests waiting to play
  useEffect(() => {
    if (!isAdmin) return;
    const fetchQueue = async () => {
      try {
        const res = await fetch('/api/jukebox/queue');
        if (res.ok) setQueue(await res.json());
      } catch (err) {
        console.error('Failed to fetch jukebox queue:', err);
      }
    };
    fetchQueue();
    const interval = setInterval(fetchQueue, TIMING.POLL_INTERVAL_MEDIUM);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // Fetch playlist details when playlist is selected
  useEffect(() => {
    const fetchPlaylistDetails = async () => {
      if (!selectedPlaylist || !isOnline) {
        return;
      }

      // Check if we already have this playlist's details
      if (playlistDetails.has(selectedPlaylist)) {
        return;
      }

      try {
        // Fetch playlist details from our API route
        const response = await fetch(`/api/fpp/playlists/${encodeURIComponent(selectedPlaylist)}`);
        if (response.ok) {
          const data = await response.json();
          console.log('Playlist details:', data);
          setPlaylistDetails(prev => new Map(prev).set(selectedPlaylist, data));
        } else if (response.status !== 404) {
          // 404: a jukebox song playing as a one-song ".fseq" playlist - there are no details to show
          console.error('Failed to fetch playlist details:', response.status);
        }
      } catch (err) {
        console.error('Failed to fetch playlist details:', err);
      }
    };

    fetchPlaylistDetails();
  }, [selectedPlaylist, isOnline, playlistDetails]);

  // The stop-now dialog: focus the safe choice, close on Escape
  useEffect(() => {
    if (!confirmStopNow) return;
    keepPlayingRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmStopNow(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmStopNow]);

  // Show loading while checking authentication
  if (sessionStatus === 'loading') {
    return <AdminLoadingScreen />;
  }

  // Non-admins will be redirected
  if (!isAdmin) {
    return null;
  }

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const sendCommand = async (command: string, args: any[]) => {
    setLoading(true);
    try {
      const response = await fetch('/api/fpp/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args }),
      });

      if (response.ok) {
        showMessage('success', `Command sent: ${command}`);
      } else {
        const error = await response.json();
        showMessage('error', error.error || 'Command failed');
      }
    } catch (error) {
      showMessage('error', 'Network error');
      console.error('Command error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Playlist Controls
  const startPlaylist = () => {
    if (!selectedPlaylist) {
      showMessage('error', 'Please select a playlist');
      return;
    }
    // If a sequence is selected, start from that sequence
    if (selectedSequence) {
      startSequence();
    } else {
      // Otherwise start the playlist from the beginning
      sendCommand('Start Playlist', [selectedPlaylist, repeat, false]);
    }
  };

  const stopPlaylist = () => sendCommand('Stop Gracefully', [false]);
  const stopNow = () => sendCommand('Stop Now', []);
  const nextItem = () => sendCommand('Next Playlist Item', []);
  const prevItem = () => sendCommand('Prev Playlist Item', []);
  const startRandom = () => {
    if (!selectedPlaylist) {
      showMessage('error', 'Please select a playlist');
      return;
    }
    sendCommand('Start Playlist At Random Item', [selectedPlaylist, repeat, false]);
  };
  const togglePauseResume = () => {
    if (status?.status_name === 'playing') {
      sendCommand('Pause Playlist', []);
    } else {
      sendCommand('Resume Playlist', []);
    }
  };
  const restartItem = () => sendCommand('Restart Playlist Item', []);

  // Get sequences from current playlist
  const getPlaylistSequences = () => {
    if (!selectedPlaylist) return [];
    const details = playlistDetails.get(selectedPlaylist);
    if (!details) return [];

    const sequences: Array<{ name: string; type: string; section: string }> = [];

    // Add leadIn sequences first (these come before mainPlaylist in FPP)
    if (details.leadIn && Array.isArray(details.leadIn)) {
      details.leadIn.forEach((item: any) => {
        if (item.sequenceName) {
          sequences.push({ name: item.sequenceName, type: item.type || 'sequence', section: 'Lead In' });
        }
      });
    }

    // Add mainPlaylist sequences
    if (details.mainPlaylist && Array.isArray(details.mainPlaylist)) {
      details.mainPlaylist.forEach((item: any) => {
        if (item.sequenceName) {
          sequences.push({ name: item.sequenceName, type: item.type || 'sequence', section: 'Main' });
        }
      });
    }

    // Add leadOut sequences last
    if (details.leadOut && Array.isArray(details.leadOut)) {
      details.leadOut.forEach((item: any) => {
        if (item.sequenceName) {
          sequences.push({ name: item.sequenceName, type: item.type || 'sequence', section: 'Lead Out' });
        }
      });
    }

    return sequences;
  };

  // Sequence Controls
  const startSequence = () => {
    if (!selectedSequence) {
      showMessage('error', 'Please select a sequence');
      return;
    }

    // Find the index of the selected sequence in the playlist
    const sequences = getPlaylistSequences();
    const sequenceIndex = sequences.findIndex(seq => seq.name === selectedSequence);

    if (sequenceIndex === -1) {
      showMessage('error', 'Sequence not found in playlist');
      return;
    }

    // FPP uses 1-based indexing for Start Playlist At Item (item 1 is the first item)
    const fppIndex = sequenceIndex + 1;
    console.log('Starting playlist item:', fppIndex, 'in playlist:', selectedPlaylist);
    sendCommand('Start Playlist At Item', [selectedPlaylist, fppIndex, false, false]);

    // Clear selection after starting so user can start playlist from beginning if desired
    setSelectedSequence('');
  };

  const stopSequence = () => {
    if (!selectedSequence) {
      showMessage('error', 'Please select a sequence');
      return;
    }
    const sequenceName = selectedSequence.replace(/\.fseq$/i, '');
    sendCommand('FSEQ Effect Stop', [sequenceName]);
  };

  const stopAllEffects = () => sendCommand('Effects Stop', []);

  const handleVolumeChange = async (vol: number) => {
    if (!isOnline || !status) return;
    try {
      await fetch(`/api/web/system/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: vol })
      });
      setStatus({ ...status, volume: vol });
    } catch (err) {
      showMessage('error', 'Failed to set volume');
    }
  };

  const isPlaying = status?.status_name === 'playing';
  const hasCurrent = isOnline && !!status?.current_sequence && status.status_name !== 'idle';
  const played = Number(status?.seconds_played);
  const remaining = Number(status?.seconds_remaining);
  const showProgress = hasCurrent && Number.isFinite(played) && Number.isFinite(remaining) && played + remaining > 0;
  const playlistSequences = getPlaylistSequences();
  const offlineDevices = summary?.offlineDevices ?? [];
  const attentionCount = (isOnline ? 0 : 1) + (offlineDevices.length > 0 ? 1 : 0) + (summary?.lettersPending ? 1 : 0);

  return (
    <AdminLayout
      title="Tonight"
      subtitle={
        !isOnline
          ? 'FPP is offline. The controls work again once it reconnects.'
          : status ? `FPP ${status.mode_name} mode` : 'Connecting to FPP…'
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Now playing */}
        <section aria-labelledby="now-playing-heading" className={`${card} lg:col-span-2`}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="now-playing-heading" className={eyebrow}>Now playing</h2>
            {isOnline && status?.current_playlist?.playlist && (
              <span className="truncate rounded-full bg-adm-warn-bg px-2.5 py-1 text-[11px] font-semibold text-adm-warn">
                {status.current_playlist.playlist}
              </span>
            )}
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-adm-text sm:text-3xl wrap-break-word">
            {!isOnline ? 'FPP is offline' : hasCurrent ? stripFseq(status?.current_sequence) : 'Nothing playing'}
          </p>
          <p className="mt-1 text-sm text-adm-muted">
            {isOnline && status ? (
              <>
                <span className="capitalize text-adm-muted">{status.status_name}</span>
                {status.current_playlist?.index && status.current_playlist.index !== '0' && (
                  <span className="text-adm-muted"> · Song {status.current_playlist.index} of {status.current_playlist.count}</span>
                )}
                <span className="text-adm-muted"> · repeat {repeat ? 'on' : 'off'}</span>
              </>
            ) : (
              <span className="text-adm-muted">Waiting for FPP</span>
            )}
          </p>

          {showProgress && (
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-adm-line" aria-hidden="true">
                <div className="h-full rounded-full bg-adm-accent" style={{ width: `${(played / (played + remaining)) * 100}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-xs text-adm-muted">
                <span className="text-adm-muted">{formatClock(played)}</span>
                <span className="text-adm-muted">{formatClock(played + remaining)}</span>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button onClick={prevItem} disabled={loading} aria-label="Previous song" title="Previous" className={roundButton}>
              <SkipBack className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
            <button
              onClick={togglePauseResume}
              disabled={loading}
              aria-label={isPlaying ? 'Pause' : 'Resume'}
              title={isPlaying ? 'Pause' : 'Resume'}
              className="grid h-14 w-14 place-items-center rounded-full bg-adm-accent text-adm-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPlaying ? <Pause className="h-6 w-6" aria-hidden="true" /> : <Play className="h-6 w-6" aria-hidden="true" />}
            </button>
            <button onClick={nextItem} disabled={loading} aria-label="Next song" title="Next" className={roundButton}>
              <SkipForward className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
            <button
              onClick={restartItem}
              disabled={loading || !status?.current_playlist?.playlist}
              aria-label="Restart song"
              title="Restart song"
              className={roundButton}
            >
              <RotateCcw className="h-4.5 w-4.5" aria-hidden="true" />
            </button>
            <div className="flex w-full flex-wrap gap-2.5 sm:ml-auto sm:w-auto">
              <button
                onClick={stopPlaylist}
                disabled={loading}
                title="Completes current sequence then stops"
                className={`${button} flex-1 sm:flex-none`}
              >
                Stop after this song
              </button>
              <button
                onClick={() => setConfirmStopNow(true)}
                disabled={loading}
                title="Stops immediately without completing sequence"
                className={`${dangerButton} flex-1 sm:flex-none`}
              >
                <Square className="h-4 w-4" aria-hidden="true" />
                Stop now
              </button>
            </div>
          </div>
        </section>

        {/* Needs attention */}
        <section aria-labelledby="attention-heading" className={card}>
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <h2 id="attention-heading" className={cardTitle}>Needs attention</h2>
            {attentionCount > 0 && (
              <span className="rounded-full bg-adm-line px-2 py-0.5 text-xs font-semibold text-adm-text">{attentionCount}</span>
            )}
          </div>
          <ul className="flex flex-col gap-2.5">
            {!isOnline && (
              <li className="flex gap-3 rounded-xl border border-adm-line bg-adm-hover p-3">
                <WifiOff className="mt-0.5 h-4.5 w-4.5 shrink-0 text-adm-warn" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm text-adm-text">FPP is not responding</p>
                  <p className="mt-0.5 text-[13px] text-adm-muted">Playback controls are unavailable</p>
                </div>
              </li>
            )}
            {offlineDevices.length > 0 && (
              <li className="flex gap-3 rounded-xl border border-adm-line bg-adm-hover p-3">
                <TriangleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-adm-warn" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm text-adm-text">
                    {offlineDevices.length === 1 ? `${offlineDevices[0].name} is offline` : `${offlineDevices.length} devices are offline`}
                  </p>
                  <p className="mt-0.5 text-[13px] text-adm-muted">
                    {offlineDevices.length === 1
                      ? offlineDevices[0].lastSeenOnline
                        ? `Last seen ${formatDateTime(offlineDevices[0].lastSeenOnline, 'relative')}`
                        : 'Not seen online yet'
                      : offlineDevices.map((d) => d.name).join(', ')}
                  </p>
                  <Link href="/device-status" className={`${textLink} mt-1.5 inline-block`}>Open devices</Link>
                </div>
              </li>
            )}
            {!!summary?.lettersPending && (
              <li className="flex gap-3 rounded-xl border border-adm-line bg-adm-hover p-3">
                <Mail className="mt-0.5 h-4.5 w-4.5 shrink-0 text-adm-warn" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm text-adm-text">
                    {summary.lettersPending} Santa {summary.lettersPending === 1 ? 'letter' : 'letters'} pending
                  </p>
                  {summary.oldestPendingLetterAt && (
                    <p className="mt-0.5 text-[13px] text-adm-muted">
                      Oldest arrived {formatDateTime(summary.oldestPendingLetterAt, 'relative')}
                    </p>
                  )}
                  <Link href="/santa-letters" className={`${textLink} mt-1.5 inline-block`}>Review letters</Link>
                </div>
              </li>
            )}
            {attentionCount === 0 && (
              <li className="flex items-center gap-3 p-1">
                <CircleCheck className="h-4.5 w-4.5 shrink-0 text-adm-ok" aria-hidden="true" />
                <p className="text-sm text-adm-muted">{summary ? 'Nothing needs attention' : 'Checking…'}</p>
              </li>
            )}
          </ul>
        </section>

        {/* Playlist */}
        <section aria-labelledby="playlist-heading" className={card}>
          <h2 id="playlist-heading" className={`${cardTitle} mb-3.5`}>Playlist</h2>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="playlist-select" className="text-[13px] font-medium text-adm-soft">Playlist to run</label>
              <select
                id="playlist-select"
                value={selectedPlaylist}
                onChange={(e) => {
                  setSelectedPlaylist(e.target.value);
                  // A song picked from the old playlist is not in the new one
                  setSelectedSequence('');
                }}
                className={field}
                disabled={loading}
              >
                {playlists.length === 0 ? (
                  <option>No playlists available</option>
                ) : (
                  playlists.map((playlist) => (
                    <option key={playlist.name} value={playlist.name}>
                      {playlist.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="start-from-select" className="text-[13px] font-medium text-adm-soft">Start from</label>
              <select
                id="start-from-select"
                value={selectedSequence}
                onChange={(e) => setSelectedSequence(e.target.value)}
                className={field}
                disabled={loading || playlistSequences.length === 0}
              >
                <option value="">{playlistSequences.length === 0 && selectedPlaylist ? 'Loading songs…' : 'The beginning'}</option>
                {playlistSequences.map((seq, index) => (
                  <option key={`${seq.section}-${index}`} value={seq.name}>
                    {index + 1}. {stripFseq(seq.name)}{seq.section !== 'Main' ? ` (${seq.section})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3 py-1">
              <span id="repeat-label" className="text-sm font-medium text-adm-text">Repeat</span>
              <button
                role="switch"
                aria-checked={repeat}
                aria-labelledby="repeat-label"
                onClick={() => setRepeat(!repeat)}
                disabled={loading}
                className={`relative h-7 w-11.5 shrink-0 rounded-full transition-colors disabled:opacity-50 ${repeat ? 'bg-adm-accent' : 'bg-adm-control-line'}`}
              >
                <span
                  className={`absolute top-0.75 left-0.75 h-5.5 w-5.5 rounded-full transition-transform ${
                    repeat ? 'translate-x-4.5 bg-adm-accent-ink' : 'bg-adm-soft'
                  }`}
                />
              </button>
            </div>
            <div className="flex gap-2.5">
              <button onClick={startPlaylist} disabled={loading || !selectedPlaylist} className={`${accentButton} flex-1`}>
                <Play className="h-4 w-4" aria-hidden="true" />
                Start
              </button>
              <button onClick={startRandom} disabled={loading || !selectedPlaylist} className={`${button} flex-1`}>
                <Shuffle className="h-4 w-4" aria-hidden="true" />
                Random
              </button>
            </div>
          </div>
        </section>

        {/* Volume */}
        <section aria-labelledby="volume-heading" className={card}>
          <h2 id="volume-heading" className={cardTitle}>Volume</h2>
          <p className="mt-1 mb-3 font-mono text-4xl font-semibold text-adm-text">
            {!isOnline ? '--' : status?.volume || 0}%
          </p>
          <input
            type="range"
            min="0"
            max="100"
            value={status?.volume || 0}
            disabled={!isOnline}
            onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
            aria-labelledby="volume-heading"
            className="h-7 w-full cursor-pointer accent-adm-accent disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="mt-1 flex justify-between text-xs text-adm-muted">
            <span className="text-adm-muted">Mute</span>
            <span className="text-adm-muted">Max</span>
          </div>
          {!isOnline && <p className="mt-3 text-[13px] text-adm-muted">Volume control unavailable while FPP is offline</p>}
        </section>

        {/* Up next */}
        <section aria-labelledby="up-next-heading" className={card}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="up-next-heading" className={cardTitle}>Up next</h2>
            <Link href="/settings/jukebox" className={textLink}>Jukebox</Link>
          </div>
          {queue.length === 0 ? (
            <p className="text-sm text-adm-muted">No requests waiting</p>
          ) : (
            <ol className="flex flex-col">
              {queue.slice(0, 3).map((item, index) => (
                <li key={item.id} className="flex items-center gap-3 border-t border-adm-line py-2.5 first:border-t-0 first:pt-0.5">
                  <span className="w-5 font-mono text-[13px] text-adm-faint">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-adm-text">{stripFseq(item.sequence_name)}</p>
                    <p className="mt-0.5 text-xs text-adm-muted">Requested {formatDateTime(item.created_at, 'short')}</p>
                  </div>
                </li>
              ))}
              {queue.length > 3 && <li className="pt-1 text-xs text-adm-muted">+{queue.length - 3} more</li>}
            </ol>
          )}
        </section>

        {/* Today */}
        <section aria-labelledby="today-heading" className="lg:col-span-3">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 id="today-heading" className={eyebrow}>Today</h2>
            <Link href="/analytics?view=requests" className={textLink}>Request &amp; vote analytics</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {[
              { label: 'Requests', value: summary?.requestsToday, detail: 'jukebox requests' },
              { label: 'Votes', value: summary?.votesToday, detail: 'song votes' },
              { label: 'Letters', value: summary?.lettersPending, detail: 'pending review' },
              {
                label: 'Devices',
                value: summary && summary.devicesTotal > 0 ? `${summary.devicesOnline}/${summary.devicesTotal}` : undefined,
                detail: summary && summary.devicesTotal === 0 ? 'none set up' : 'online',
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-adm-line bg-adm-surface px-4.5 py-4">
                <p className={eyebrow}>{stat.label}</p>
                <p className="mt-1.5 font-mono text-3xl font-semibold text-adm-text">{stat.value ?? '—'}</p>
                <p className="mt-1 text-xs text-adm-muted">{stat.detail}</p>
              </div>
            ))}
          </div>
          {summary && summary.devicesTotal > 0 && offlineDevices.length === 0 && (
            <p className="mt-2.5 flex items-center gap-1.5 text-xs text-adm-muted">
              <Server className="h-3.5 w-3.5" aria-hidden="true" />
              All enabled devices are online
            </p>
          )}
        </section>
      </div>

      {/* Stop-now confirmation */}
      {confirmStopNow && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stop-now-title"
            aria-describedby="stop-now-text"
            className="w-full max-w-md rounded-2xl border border-adm-control-line bg-adm-surface p-5.5"
          >
            <h2 id="stop-now-title" className="text-lg font-semibold text-adm-text">Stop the show now?</h2>
            <p id="stop-now-text" className="mt-2 text-sm leading-relaxed text-adm-muted">
              The lights and music stop immediately, mid-song. Use &ldquo;Stop after this song&rdquo; to finish gracefully.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2.5">
              <button ref={keepPlayingRef} onClick={() => setConfirmStopNow(false)} className={button}>
                Keep playing
              </button>
              <button
                onClick={() => {
                  setConfirmStopNow(false);
                  stopNow();
                }}
                className={dangerButton}
              >
                Stop now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command results */}
      {message && (
        <div
          role="status"
          className={`fixed inset-x-4 bottom-24 z-50 mx-auto max-w-sm rounded-xl px-4 py-3 text-center text-sm font-medium shadow-xl lg:bottom-6 ${
            message.type === 'success'
              ? 'bg-adm-text text-adm-bg'
              : 'border border-adm-danger-line bg-adm-danger-bg text-adm-danger'
          }`}
        >
          {message.text}
        </div>
      )}
    </AdminLayout>
  );
}
