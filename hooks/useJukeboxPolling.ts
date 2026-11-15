'use client';
import { useEffect, useRef } from 'react';
import { startJukeboxPolling, type JukeboxLoaders } from '@/lib/jukebox-polling';

async function refreshCache() {
  try {
    const response = await fetch('/api/jukebox/refresh-cache', { method: 'POST' });
    const data = await response.json();
    if (data.success) console.log(`[Jukebox] Background cache refresh: ${data.sequencesCached} sequences cached`);
    else if (data.error !== 'FPP is offline') console.warn('[Jukebox] Background cache refresh failed:', data.error);
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') console.error('Background cache refresh failed:', error);
  }
}

export function useJukeboxPolling(isAdmin: boolean, loaders: JukeboxLoaders) {
  const latest = useRef(loaders);
  useEffect(() => { latest.current = loaders; });
  useEffect(() => startJukeboxPolling(() => latest.current, isAdmin, refreshCache), [isAdmin]);
}
