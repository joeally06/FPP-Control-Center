'use client';

import { useState, useEffect } from 'react';
import { Play, Square, SkipForward, SkipBack, Repeat, Shuffle, Pause, RotateCcw } from 'lucide-react';
import { TIMING } from '@/lib/constants';

interface Playlist {
  name: string;
}

interface Sequence {
  name: string;
}

interface Status {
  status_name: string;
  current_playlist: { playlist: string; count: string; index: string };
  current_sequence: string;
}

export default function PlaylistControls() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>('');
  const [selectedSequence, setSelectedSequence] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [repeat, setRepeat] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  // Fetch available playlists
  useEffect(() => {
    const fetchPlaylists = async () => {
      try {
        const response = await fetch('/api/fpp/playlists/list');
        if (response.ok) {
          const data = await response.json();
          setPlaylists(data || []);
          if (data.length > 0) {
            setSelectedPlaylist(data[0].name);
          }
        }
      } catch (error) {
        console.error('Failed to fetch playlists:', error);
      }
    };

    fetchPlaylists();
  }, []);

  // Fetch current FPP status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/fppd/status');
        if (response.ok) {
          const data = await response.json();
          setStatus(data);
          // Auto-select the currently playing playlist
          if (data.current_playlist?.playlist) {
            setSelectedPlaylist(data.current_playlist.playlist);
          }
        }
      } catch (error) {
        console.error('Failed to fetch FPP status:', error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, TIMING.POLL_INTERVAL_FAST); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Fetch available sequences
  useEffect(() => {
    const fetchSequences = async () => {
      try {
        const response = await fetch('/api/fpp/sequences/list');
        if (response.ok) {
          const data = await response.json();
          setSequences(data || []);
          if (data.length > 0) {
            setSelectedSequence(data[0].name);
          }
        }
      } catch (error) {
        console.error('Failed to fetch sequences:', error);
      }
    };

    fetchSequences();
  }, []);

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
    sendCommand('Start Playlist', [selectedPlaylist, repeat, false]);
  };

  const stopPlaylist = () => {
    sendCommand('Stop Gracefully', [false]);
  };

  const stopNow = () => {
    sendCommand('Stop Now', []);
  };

  const nextItem = () => {
    sendCommand('Next Playlist Item', []);
  };

  const prevItem = () => {
    sendCommand('Prev Playlist Item', []);
  };

  const startRandom = () => {
    if (!selectedPlaylist) {
      showMessage('error', 'Please select a playlist');
      return;
    }
    sendCommand('Start Playlist At Random Item', [selectedPlaylist, repeat, false]);
  };

  const pausePlaylist = () => {
    sendCommand('Pause Playlist', []);
  };

  const resumePlaylist = () => {
    sendCommand('Resume Playlist', []);
  };

  const restartItem = () => {
    sendCommand('Restart Playlist Item', []);
  };

  // Sequence Controls
  const startSequence = () => {
    if (!selectedSequence) {
      showMessage('error', 'Please select a sequence');
      return;
    }
    // Remove .fseq extension if present
    const sequenceName = selectedSequence.replace(/\.fseq$/i, '');
    sendCommand('FSEQ Effect Start', [sequenceName, false, false]);
  };

  const stopSequence = () => {
    if (!selectedSequence) {
      showMessage('error', 'Please select a sequence');
      return;
    }
    const sequenceName = selectedSequence.replace(/\.fseq$/i, '');
    sendCommand('FSEQ Effect Stop', [sequenceName]);
  };

  const stopAllEffects = () => {
    sendCommand('Effects Stop', []);
  };

  return (
    <div className="backdrop-blur-md bg-white/10 rounded-xl p-8 shadow-2xl border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-4">Playlist & Sequence Controls</h2>

      {/* Currently Playing Status */}
      {status?.current_playlist?.playlist && (
        <div className="mb-6 p-4 bg-green-600/20 border border-green-600/30 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              <div>
                <p className="text-sm text-green-300 font-medium">Currently Playing</p>
                <p className="text-lg text-white font-bold">{status.current_playlist.playlist}</p>
                <p className="text-sm text-white/70">
                  Track {status.current_playlist.index} of {status.current_playlist.count}
                </p>
              </div>
            </div>
            <span className="text-3xl">▶️</span>
          </div>
          {status.current_sequence && (
            <div className="mt-3 pt-3 border-t border-green-600/20">
              <div className="flex items-center gap-2">
                <span className="text-sm text-green-300 font-medium">Sequence:</span>
                <span className="text-white font-semibold">{status.current_sequence}</span>
                <div className="flex items-center gap-1 ml-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-1 h-3 bg-green-400 rounded-full animate-pulse"
                      style={{
                        animationDelay: `${i * 0.15}s`,
                      }}
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Message */}
      {message && (
        <div
          className={`mb-4 p-3 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-600/20 text-green-400 border border-green-600/30'
              : 'bg-red-600/20 text-red-400 border border-red-600/30'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Playlist Controls */}
      <div className="space-y-4 mb-6">
        <h3 className="text-xl font-semibold text-white">Playlists</h3>
        
        <div className="flex gap-3">
          <select
            value={selectedPlaylist}
            onChange={(e) => setSelectedPlaylist(e.target.value)}
            className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
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

          <label className="flex items-center gap-2 text-white bg-gray-700 px-4 py-2 rounded-lg border border-gray-600 cursor-pointer hover:bg-gray-600 transition">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
              className="w-4 h-4"
              disabled={loading}
            />
            <Repeat size={18} />
            Repeat
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <button
            onClick={startPlaylist}
            disabled={loading || !selectedPlaylist}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <Play size={20} />
            Start
          </button>

          <button
            onClick={startRandom}
            disabled={loading || !selectedPlaylist}
            className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <Shuffle size={20} />
            Random
          </button>

          <button
            onClick={pausePlaylist}
            disabled={loading || status?.status_name !== 'playing'}
            className="flex items-center justify-center gap-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <Pause size={20} />
            Pause
          </button>

          <button
            onClick={resumePlaylist}
            disabled={loading || status?.status_name === 'playing'}
            className="flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <Play size={20} />
            Resume
          </button>

          <button
            onClick={stopPlaylist}
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <Square size={20} />
            Stop Gracefully
          </button>

          <button
            onClick={stopNow}
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <Square size={20} />
            Stop Now
          </button>

          <button
            onClick={restartItem}
            disabled={loading || !status?.current_playlist?.playlist}
            className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <RotateCcw size={20} />
            Restart Item
          </button>

          <button
            onClick={prevItem}
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <SkipBack size={20} />
            Previous
          </button>

          <button
            onClick={nextItem}
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <SkipForward size={20} />
            Next
          </button>
        </div>
      </div>

      {/* Sequence Controls */}
      <div className="space-y-4 border-t border-gray-700 pt-6">
        <h3 className="text-xl font-semibold text-white">Sequences (FSEQ)</h3>
        
        <select
          value={selectedSequence}
          onChange={(e) => setSelectedSequence(e.target.value)}
          className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
          disabled={loading}
        >
          {sequences.length === 0 ? (
            <option>No sequences available</option>
          ) : (
            sequences.map((sequence) => (
              <option key={sequence.name} value={sequence.name}>
                {sequence.name}
              </option>
            ))
          )}
        </select>

        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={startSequence}
            disabled={loading || !selectedSequence}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <Play size={20} />
            Start Sequence
          </button>

          <button
            onClick={stopSequence}
            disabled={loading || !selectedSequence}
            className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <Square size={20} />
            Stop Sequence
          </button>

          <button
            onClick={stopAllEffects}
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-semibold transition shadow-lg"
          >
            <Square size={20} />
            Stop All
          </button>
        </div>
      </div>
    </div>
  );
}
