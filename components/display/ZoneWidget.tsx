'use client';

import { useEffect, useState } from 'react';
import type { DisplayState, ZoneWidgetConfig } from '@/types/display';
import { resolveTheme } from '@/lib/display-theme';
import ProgressBar from './ProgressBar';
import QueueStrip from './QueueStrip';
import QRCodeWidget from './QRCodeWidget';

interface Props {
  widget: ZoneWidgetConfig;
  state: DisplayState;
}

function ClockWidget({ accent }: { accent: string }) {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full h-full flex items-center justify-center">
      <span className="tabular-nums font-light text-white" style={{ fontSize: 'clamp(2.5rem, 8vw, 6rem)', color: accent }}>
        {time}
      </span>
    </div>
  );
}

export default function ZoneWidget({ widget, state }: Props) {
  const theme = resolveTheme(state.config);

  switch (widget.type) {
    case 'now-playing':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4 overflow-hidden">
          {state.isPlaying ? (
            <>
              {state.albumArtUrl && (
                <img
                  src={state.albumArtUrl}
                  alt="Album art"
                  className="rounded-xl shadow-2xl object-cover"
                  style={{ maxHeight: '45%', maxWidth: '80%', aspectRatio: '1' }}
                />
              )}
              <div className="text-center px-2">
                <p className="text-white font-bold leading-tight" style={{ fontSize: 'clamp(1rem, 2.5vw, 2rem)' }}>
                  {state.songTitle}
                </p>
                {state.artist && (
                  <p className="text-white/60 mt-1" style={{ fontSize: 'clamp(0.75rem, 1.5vw, 1.25rem)' }}>
                    {state.artist}
                  </p>
                )}
              </div>
              <div className="w-full px-4">
                <ProgressBar
                  secondsPlayed={state.secondsPlayed}
                  secondsRemaining={state.secondsRemaining}
                  barFrom={theme.barFrom}
                  barTo={theme.barTo}
                />
              </div>
            </>
          ) : (
            <div className="text-center text-white/50">
              <div className="text-5xl mb-3">🎄</div>
              <p style={{ fontSize: 'clamp(0.85rem, 1.8vw, 1.4rem)' }}>
                {state.config.idleMessage || 'Show not playing'}
              </p>
            </div>
          )}
        </div>
      );

    case 'queue':
      return (
        <div className="w-full h-full flex flex-col justify-center p-3 overflow-hidden">
          <QueueStrip items={state.upcomingQueue} accentColor={theme.accent} />
        </div>
      );

    case 'clock':
      return <ClockWidget accent={theme.accent} />;

    case 'message':
      return (
        <div className="w-full h-full flex items-center justify-center p-4 text-center">
          <p className="text-white font-semibold leading-snug" style={{ fontSize: 'clamp(1rem, 2.5vw, 2rem)' }}>
            {widget.text || ''}
          </p>
        </div>
      );

    case 'image':
      return widget.imageUrl ? (
        <img src={widget.imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">No image set</div>
      );

    case 'slides':
      return widget.slidesUrl ? (
        <iframe
          src={widget.slidesUrl.replace('/pub?', '/embed?').replace('/pub&', '/embed&')}
          className="w-full h-full border-0"
          allowFullScreen
          style={{ pointerEvents: 'none' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">No slides URL set</div>
      );

    case 'qr':
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
          <QRCodeWidget url={state.jukeboxUrl} label="Scan to request a song" size={140} />
          <p className="text-white/60 text-xs text-center">Scan to request a song</p>
        </div>
      );

    case 'empty':
    default:
      return null;
  }
}
