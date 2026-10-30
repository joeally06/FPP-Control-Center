'use client';

import { useEffect, useState } from 'react';
import type { DisplayState } from '@/types/display';
import { DEFAULT_DISPLAY_CONFIG } from '@/lib/display-defaults';
import NowPlayingView from '@/components/display/NowPlayingView';
import IdleScreen from '@/components/display/IdleScreen';

export default function DisplayPage() {
  const [state, setState] = useState<DisplayState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let es: EventSource;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource('/api/display/stream');

      es.onopen = () => setConnected(true);

      es.onmessage = (event) => {
        try {
          const data: DisplayState = JSON.parse(event.data as string);
          setState(data);
        } catch {
          // ignore malformed frames
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      es?.close();
      clearTimeout(reconnectTimer);
    };
  }, []);

  const fallbackUrl = 'http://localhost:3000/jukebox';
  const cfg = state?.config ?? DEFAULT_DISPLAY_CONFIG;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black overflow-hidden"
      style={{ fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)' }}
    >
      {!connected && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-yellow-900/80 text-yellow-200 text-sm px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          Reconnecting…
        </div>
      )}
      {state?.isPlaying ? (
        <NowPlayingView state={state} />
      ) : (
        <IdleScreen
          jukeboxUrl={state?.jukeboxUrl ?? fallbackUrl}
          config={cfg}
          activeAnnouncement={state?.activeAnnouncement}
        />
      )}
    </div>
  );
}
