'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Headphones, Pause, Play, Square, Volume2, VolumeX, X } from 'lucide-react';

interface AudioSyncPlayerProps {
  /** Shows a close button in the corner */
  onClose?: () => void;
}

interface SyncState {
  isPlaying: boolean;
  currentSequence: string | null;
  audioFile: string | null;
  position: number; // Server's playback position in seconds
  timestamp: number; // Server timestamp when position was captured
}

type SyncStatus = 'synced' | 'adjusting' | 'seeking';

export default function AudioSyncPlayer({ onClose }: AudioSyncPlayerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isManuallyPaused, setIsManuallyPaused] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [driftMs, setDriftMs] = useState<number>(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSeekingRef = useRef(false);
  const isManuallyPausedRef = useRef(false);
  const hasUserInteractedRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isManuallyPausedRef.current = isManuallyPaused;
  }, [isManuallyPaused]);

  // Calculate where audio SHOULD be right now based on server state
  const calculateTargetPosition = useCallback((state: SyncState): number => {
    // Time elapsed since the server captured the position
    const elapsed = (Date.now() - state.timestamp) / 1000;
    // Target = server position + time elapsed since then
    return state.position + elapsed;
  }, []);

  // Sync audio to target position - called periodically when playing
  const syncAudio = useCallback(() => {
    if (!audioRef.current || !syncState || isSeekingRef.current || !syncState.isPlaying) return;
    if (isManuallyPausedRef.current) return;
    
    const audio = audioRef.current;
    if (audio.paused) return; // Don't sync if audio isn't playing
    
    const targetPosition = calculateTargetPosition(syncState);
    const currentPosition = audio.currentTime;
    
    // Calculate drift: positive = audio is ahead, negative = audio is behind
    const currentDrift = (currentPosition - targetPosition) * 1000;
    setDriftMs(Math.round(currentDrift));
    
    const absDrift = Math.abs(currentDrift);
    
    // Thresholds (in milliseconds)
    const SYNC_THRESHOLD = 100;      // Under 100ms = perfectly synced
    const SOFT_THRESHOLD = 500;      // Under 500ms = soft correction via playback rate
    const HARD_THRESHOLD = 2000;     // Over 2000ms = hard seek
    
    if (absDrift < SYNC_THRESHOLD) {
      // In sync - reset playback rate if needed
      if (Math.abs(audio.playbackRate - 1.0) > 0.01) {
        audio.playbackRate = 1.0;
      }
      setSyncStatus('synced');
    } else if (absDrift < SOFT_THRESHOLD) {
      // Soft correction - adjust playback rate slightly
      // If audio is ahead (positive drift), slow down
      // If audio is behind (negative drift), speed up
      const correction = currentDrift > 0 ? 0.97 : 1.03;
      audio.playbackRate = correction;
      setSyncStatus('adjusting');
    } else if (absDrift < HARD_THRESHOLD) {
      // Medium correction - stronger rate adjustment
      const correction = currentDrift > 0 ? 0.93 : 1.07;
      audio.playbackRate = correction;
      setSyncStatus('adjusting');
    } else {
      // Hard seek - too far off, just jump to correct position
      console.log(`[Audio Sync] Hard seek: drift=${absDrift.toFixed(0)}ms, jumping to ${targetPosition.toFixed(2)}s`);
      isSeekingRef.current = true;
      audio.currentTime = targetPosition;
      audio.playbackRate = 1.0;
      setSyncStatus('seeking');
      
      // Reset seeking flag after a short delay
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 500);
    }
  }, [syncState, calculateTargetPosition]);

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audio.preload = 'auto';
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Handle volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Sync loop - run every 500ms when playing
  useEffect(() => {
    if (!syncState?.isPlaying || isManuallyPaused) return;
    
    const interval = setInterval(syncAudio, 500);
    return () => clearInterval(interval);
  }, [syncState?.isPlaying, isManuallyPaused, syncAudio]);

  // EventSource (SSE) connection
  useEffect(() => {
    connectEventSource();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const connectEventSource = () => {
    try {
      const eventSource = new EventSource('/api/audio/sync');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data: SyncState = JSON.parse(event.data);
          handleSyncUpdate(data);
        } catch (err) {
          console.error('[Audio Sync] Parse error:', err);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();
        
        // Attempt reconnection after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[Audio Sync] Reconnecting...');
          connectEventSource();
        }, 5000);
      };
    } catch (err) {
      console.error('[Audio Sync] Connection failed:', err);
    }
  };

  const handleSyncUpdate = (data: SyncState) => {
    setSyncState(data);

    if (!audioRef.current) return;
    const audio = audioRef.current;

    // If no audio file or sequence stopped, pause
    if (!data.audioFile || !data.isPlaying) {
      if (!audio.paused) {
        audio.pause();
        audio.playbackRate = 1.0;
      }
      return;
    }

    // Load new audio file if changed
    const expectedSrc = `/audio/${encodeURIComponent(data.audioFile)}`;
    let currentSrc = '';
    try {
      currentSrc = audio.src ? new URL(audio.src, window.location.origin).pathname : '';
    } catch {
      currentSrc = '';
    }
    
    // Normalize for comparison
    const normExpected = decodeURIComponent(expectedSrc).toLowerCase();
    const normCurrent = decodeURIComponent(currentSrc).toLowerCase();
    
    if (normExpected !== normCurrent) {
      console.log(`[Audio Sync] Loading new track: ${data.audioFile}`);
      audio.src = expectedSrc;
      audio.load();
      audio.playbackRate = 1.0;

      // Set up one-time listener for when audio is ready
      const onCanPlay = () => {
        if (data.isPlaying && hasUserInteractedRef.current && !isManuallyPausedRef.current && audioRef.current) {
          console.log('[Audio Sync] New track ready, starting playback');
          const targetPosition = calculateTargetPosition(data);
          audioRef.current.currentTime = Math.max(0, targetPosition);
          audioRef.current.play().catch(err => console.error('[Audio Sync] New track auto-play failed:', err));
        }
      };
      
      audio.addEventListener('canplay', onCanPlay, { once: true });
      return;
    }

    // If user has clicked play and show is playing, ensure audio is playing
    if (hasUserInteractedRef.current && !isManuallyPausedRef.current && audio.paused && data.isPlaying) {
      const targetPosition = calculateTargetPosition(data);
      audio.currentTime = targetPosition;
      audio.play().catch(err => console.error('[Audio Sync] Auto-play failed:', err));
    }
  };

  const handlePlay = () => {
    if (!audioRef.current || !syncState) return;
    
    hasUserInteractedRef.current = true;
    
    // Sync position before playing
    const targetPosition = calculateTargetPosition(syncState);
    audioRef.current.currentTime = targetPosition;
    audioRef.current.playbackRate = 1.0;
    
    setIsManuallyPaused(false);
    audioRef.current.play().catch((err) => {
      console.error('[Audio Sync] Play failed:', err);
    });
  };

  const handlePause = () => {
    if (!audioRef.current) return;
    setIsManuallyPaused(true);
    audioRef.current.playbackRate = 1.0;
    audioRef.current.pause();
  };

  const handleStop = () => {
    if (!audioRef.current || !syncState) return;
    
    setIsManuallyPaused(true);
    audioRef.current.playbackRate = 1.0;
    audioRef.current.pause();
    
    // Sync to current show position
    const targetPosition = calculateTargetPosition(syncState);
    audioRef.current.currentTime = targetPosition;
  };

  const getSyncStatusColor = (): string => {
    switch (syncStatus) {
      case 'synced': return 'text-green-400';
      case 'adjusting': return 'text-yellow-400';
      case 'seeking': return 'text-red-400';
    }
  };

  const getSyncStatusText = (): string => {
    switch (syncStatus) {
      case 'synced': return 'In Sync';
      case 'adjusting': return `Adjusting ${driftMs >= 0 ? '+' : ''}${driftMs}ms`;
      case 'seeking': return 'Seeking...';
    }
  };

  const getDriftColor = (): string => {
    const absDrift = Math.abs(driftMs);
    if (absDrift < 100) return 'text-green-400';
    if (absDrift < 500) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <section aria-labelledby="listen-heading" className="sp-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="sp-eyebrow">
            <Headphones className="h-4 w-4" aria-hidden="true" />
            Listen online
          </span>
          <h2 id="listen-heading" className="sp-display sp-h2">Hear the show on your phone</h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the player"
            className="sp-muted -mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <p className="sp-muted mt-3 flex items-center gap-2 text-sm">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isConnected ? 'sp-live-dot' : 'bg-white/30'}`} aria-hidden="true" />
        <span className="min-w-0 truncate">
          {isConnected
            ? syncState?.currentSequence
              ? `Streaming ${syncState.currentSequence}`
              : 'Connected. Waiting for the show to start…'
            : 'Connecting…'}
        </span>
      </p>

      {/* Playback Controls */}
      {syncState?.audioFile && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={handlePlay}
            disabled={!audioRef.current?.paused}
            aria-label="Play"
            className="sp-btn-accent flex h-14 w-14 items-center justify-center rounded-full transition disabled:opacity-50"
          >
            <Play className="h-6 w-6 fill-current" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handlePause}
            disabled={audioRef.current?.paused}
            aria-label="Pause"
            className="sp-btn-outline flex h-12 w-12 items-center justify-center rounded-full transition disabled:opacity-50"
          >
            <Pause className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleStop}
            aria-label="Stop"
            className="sp-btn-quiet flex h-12 w-12 items-center justify-center rounded-full transition"
          >
            <Square className="h-4 w-4 fill-current" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Sync Quality Indicator */}
      {syncState?.isPlaying && !audioRef.current?.paused && (
        <p className="mt-3 text-center text-xs tabular-nums">
          <span className={`font-semibold ${getSyncStatusColor()}`}>{getSyncStatusText()}</span>
          <span className="sp-muted">
            {' · drift '}
            <span className={getDriftColor()}>{driftMs >= 0 ? '+' : ''}{driftMs}ms</span>
            {audioRef.current && Math.abs(audioRef.current.playbackRate - 1.0) > 0.01 && ` · ${audioRef.current.playbackRate.toFixed(2)}×`}
          </span>
        </p>
      )}

      {/* Volume Control */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsMuted(!isMuted)}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          className="sp-btn-quiet flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition"
        >
          {isMuted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          value={isMuted ? 0 : volume * 100}
          onChange={(e) => {
            const newVolume = parseInt(e.target.value) / 100;
            setVolume(newVolume);
            if (newVolume > 0) setIsMuted(false);
          }}
          aria-label="Volume"
          className="h-2 min-w-0 flex-1 cursor-pointer"
          style={{ accentColor: 'var(--sp-accent)' }}
        />
        <span className="sp-muted w-12 shrink-0 text-right text-xs tabular-nums">
          {isMuted ? 'Muted' : `${Math.round(volume * 100)}%`}
        </span>
      </div>

      {/* Instructions */}
      {!syncState?.isPlaying && (
        <p className="sp-row mt-4 px-3 py-2.5 text-sm">
          🎵 Press play when the show starts and your audio stays in time with the lights.
        </p>
      )}

      <p className="sp-muted mt-3 border-t border-white/10 pt-3 text-center text-xs">
        Audio follows the light show automatically. Keep your phone&apos;s volume up!
      </p>
    </section>
  );
}
