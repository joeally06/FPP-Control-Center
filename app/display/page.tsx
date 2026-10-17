'use client';

import { useEffect, useState } from 'react';
import type { DisplayConfig, DisplayState } from '@/types/display';
import type { TriviaBroadcastState } from '@/types/trivia';
import NowPlayingView from '@/components/display/NowPlayingView';
import IdleScreen from '@/components/display/IdleScreen';
import ZoneDisplay from '@/components/display/ZoneDisplay';
import TriviaDisplay from '@/components/trivia/TriviaDisplay';

const DEFAULT_CONFIG: DisplayConfig = {
  showName: 'Christmas Light Show',
  showQr: true,
  queueCount: 4,
  enabled: true,
  colorTheme: 'christmas',
  accentColor: '#ef4444',
  backgroundStyle: 'gradient',
  fontStyle: 'modern',
  fontScale: 100,
  layoutVariant: 'sidebar',
  albumArtSize: 34,
  queuePosition: 'bottom',
  idleMessage: 'The show will begin shortly',
  logoUrl: '',
  sponsorText: '',
  fmFrequency: '',
  idleAnimation: 'snowflakes',
  showClock: true,
  idleBackgroundUrl: '',
  tickerText: '',
  slideshowUrl: '',
  idleSlideshowImages: [],
  idleSlideshowInterval: 8,
  countdownEnabled: false,
  countdownTime: '20:00',
  countdownLabel: 'Next show starts in',
  zoneConfig: { enabled: false, template: 'two-column', slots: {} },
};

export default function DisplayPage() {
  const [state, setState] = useState<DisplayState | null>(null);
  const [connected, setConnected] = useState(false);
  const [trivia, setTrivia] = useState<TriviaBroadcastState | null>(null);

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

  // Separate live feed for trivia - independent of the FPP/jukebox display state,
  // and takes priority over signage whenever a round is live.
  useEffect(() => {
    let es: EventSource;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource('/api/trivia/stream');

      es.onmessage = (event) => {
        try {
          const data: TriviaBroadcastState = JSON.parse(event.data as string);
          setTrivia(data);
        } catch {
          // ignore malformed frames
        }
      };

      es.onerror = () => {
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
  const cfg = state?.config ?? DEFAULT_CONFIG;

  // A live trivia round takes over the entire display, above signage/jukebox.
  // 'lobby' (armed but nobody playing yet) intentionally does NOT take over -
  // the display only interrupts once a player actually starts a round.
  if (trivia && (trivia.phase === 'question' || trivia.phase === 'reveal' || trivia.phase === 'ended')) {
    return <TriviaDisplay state={trivia} />;
  }

  // Zone layout mode (Plan C) takes over the entire display
  if (cfg.zoneConfig?.enabled) {
    const zoneState = state ?? {
      isPlaying: false, sequenceName: null, songTitle: null, artist: null,
      albumArtUrl: null, secondsPlayed: 0, secondsRemaining: 0,
      playlistName: null, trackIndex: null, trackCount: null, requesterName: null,
      upcomingQueue: [], jukeboxUrl: fallbackUrl, config: DEFAULT_CONFIG,
      activeAnnouncement: null, activeScheduleRule: null,
    };
    return (
      <div className="fixed inset-0 z-[9999] bg-black overflow-hidden" style={{ fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)' }}>
        {!connected && (
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-yellow-900/80 text-yellow-200 text-sm px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            Reconnecting…
          </div>
        )}
        <ZoneDisplay state={zoneState} />
      </div>
    );
  }

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
