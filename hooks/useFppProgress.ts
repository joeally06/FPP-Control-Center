'use client';

import { useEffect, useRef, useState } from 'react';
import {
  msUntilSongChange,
  nextPlaybackAnchor,
  sampleTimeFromAge,
  type PlaybackAnchor,
} from '@/lib/jukebox-display';

/**
 * Where FPP is in the current song, for the progress bar. Polls the FPP poller's cache while the page is
 * visible (/api/fpp/cached-status) and keeps `nowTick` moving each second so the bar advances between polls.
 * `onSongChange` is called when FPP moves to a different song, so the page can refresh the title and queue
 * now rather than on its next regular poll.
 */
export function useFppProgress(onSongChange: () => void) {
  const [fppProgress, setFppProgress] = useState<PlaybackAnchor | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // The poll below lives in a mount-once effect, so it reads the latest callback from here
  const onSongChangeRef = useRef(onSongChange);
  useEffect(() => {
    onSongChangeRef.current = onSongChange;
  });

  // Playback position for the progress bar - polled from the FPP poller cache while the page is visible
  useEffect(() => {
    let cancelled = false;
    let songEndTimer: ReturnType<typeof setTimeout> | undefined;
    let lastSequence: string | null | undefined; // undefined until the first answer
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/fpp/cached-status');
        if (!response.ok || cancelled) return;
        const data = await response.json();
        const played = Number(data.seconds_played);
        const remaining = Number(data.seconds_remaining);
        const playing =
          data.status === 'playing' &&
          !data.cache?.is_stale &&
          Number.isFinite(played) &&
          Number.isFinite(remaining) &&
          played + remaining > 0;
        clearTimeout(songEndTimer);
        if (playing) {
          // Date the sample by when the poller took it (the cache refreshes less often than we poll),
          // and keep counting smoothly unless FPP really moved
          const now = Date.now();
          const sample = { sequence: data.current_sequence || null, played, remaining, sampledAt: sampleTimeFromAge(now, data.cache?.age_ms) };
          setFppProgress((current) => nextPlaybackAnchor(current, sample, now));
          // Look again just after this song ends instead of waiting for the next regular poll
          songEndTimer = setTimeout(poll, msUntilSongChange(sample, now));
        } else {
          setFppProgress(null);
        }

        // A different song: refresh the title and queue now rather than on their next 5 s poll
        const sequence = playing ? data.current_sequence || null : null;
        if (lastSequence !== undefined && sequence !== lastSequence) onSongChangeRef.current();
        lastSequence = sequence;
      } catch {
        // Keep the last known position; the next poll will correct it
      }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(songEndTimer);
    };
  }, []);

  // Advance the progress bar smoothly between polls
  useEffect(() => {
    if (!fppProgress) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [fppProgress]);

  return { fppProgress, nowTick };
}
