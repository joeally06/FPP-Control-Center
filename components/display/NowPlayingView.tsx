'use client';

import { useEffect } from 'react';
import { Music } from 'lucide-react';
import type { DisplayState } from '@/types/display';
import { resolveTheme } from '@/lib/display-theme';
import ProgressBar from './ProgressBar';
import QueueStrip from './QueueStrip';
import QRCodeWidget from './QRCodeWidget';
import TickerBar from './TickerBar';
import AnnouncementOverlay from './AnnouncementOverlay';

interface Props {
  state: DisplayState;
}

// Loads a Google Font dynamically (only when fontStyle requires it)
function FontLoader({ fontStyle }: { fontStyle: string }) {
  useEffect(() => {
    const id = 'display-font-link';
    document.getElementById(id)?.remove();
    if (fontStyle === 'modern') return;

    const link = document.createElement('link');
    link.id  = id;
    link.rel = 'stylesheet';
    link.href = fontStyle === 'serif'
      ? 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap'
      : 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&display=swap';
    document.head.appendChild(link);
    return () => { document.getElementById(id)?.remove(); };
  }, [fontStyle]);
  return null;
}

// Stable particle data (avoids hydration mismatch)
const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  id:       i,
  left:     `${((i * 23 + 11) % 95) + 2}%`,
  top:      `${((i * 17 + 7)  % 90) + 5}%`,
  size:     `${(4 + ((i * 1.3) % 9)).toFixed(1)}px`,
  delay:    `${((i * 0.8) % 6).toFixed(2)}s`,
  duration: `${(5 + ((i * 1.1) % 5)).toFixed(2)}s`,
}));

export default function NowPlayingView({ state }: Props) {
  const {
    songTitle, artist, albumArtUrl, secondsPlayed, secondsRemaining,
    playlistName, trackIndex, trackCount, requesterName, upcomingQueue,
    jukeboxUrl, config, activeAnnouncement,
  } = state;

  const theme     = resolveTheme(config);
  const scale     = (config.fontScale ?? 100) / 100;
  const layout    = config.layoutVariant  ?? 'sidebar';
  const queuePos  = config.queuePosition  ?? 'bottom';
  const albumPct  = config.albumArtSize   ?? 34;
  const isScheduled = !requesterName || requesterName === 'FPP Schedule';

  // ── Background ────────────────────────────────────────────────────────────
  const bgStyle: React.CSSProperties = config.backgroundStyle === 'solid'
    ? { backgroundColor: theme.bgFrom }
    : { background: `linear-gradient(135deg, ${theme.bgFrom} 0%, #050505 50%, ${theme.bgTo} 100%)` };

  // ── Shared sub-elements ───────────────────────────────────────────────────
  const albumArtEl = albumArtUrl ? (
    <img src={albumArtUrl} alt="Album art" className="w-full h-full object-contain rounded-2xl shadow-2xl" />
  ) : (
    <div
      className="w-full aspect-square rounded-2xl border border-white/10 flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${theme.bgFrom}aa, ${theme.bgTo}aa)` }}
    >
      <Music className="w-1/3 h-1/3 text-white/15" />
    </div>
  );

  const titleEl = (
    <h1
      className="font-bold leading-tight text-white"
      style={{ fontSize: `clamp(${2 * scale}rem, ${4 * scale}vw, ${3.5 * scale}rem)`, fontFamily: theme.fontFamily }}
    >
      {songTitle ?? '—'}
    </h1>
  );

  const artistEl = artist ? (
    <p
      className="text-gray-300 mt-1.5 truncate"
      style={{ fontSize: `clamp(${1.1 * scale}rem, ${2 * scale}vw, ${1.75 * scale}rem)` }}
    >
      {artist}
    </p>
  ) : null;

  const progressEl = (
    <ProgressBar
      secondsPlayed={secondsPlayed}
      secondsRemaining={secondsRemaining}
      barFrom={theme.barFrom}
      barTo={theme.barTo}
    />
  );

  const requesterEl = (
    <div
      className="flex items-center gap-2 text-gray-400"
      style={{ fontSize: `clamp(${0.9 * scale}rem, ${1.5 * scale}vw, ${1.25 * scale}rem)` }}
    >
      <span>{isScheduled ? '📅' : '🎵'}</span>
      <span>{isScheduled ? 'Scheduled Show' : `Requested by ${requesterName}`}</span>
    </div>
  );

  const queueEl = queuePos !== 'hidden' ? (
    <QueueStrip queue={upcomingQueue} accentColor={theme.accent} />
  ) : null;

  // In right-sidebar layouts the QR lives inside the sidebar; otherwise in the bottom strip
  const qrEl = config.showQr ? (
    <div className="flex items-center justify-center px-4 flex-shrink-0">
      <QRCodeWidget url={jukeboxUrl} />
    </div>
  ) : null;

  // ── Right sidebar (used for queuePos='right' in all layouts) ─────────────
  const rightSidebar = queuePos === 'right' ? (
    <div
      className="w-[25%] flex-shrink-0 flex flex-col"
      style={{}}
    >
      <div className="flex-1 min-h-0">{queueEl}</div>
      {config.showQr && (
        <div className="flex items-center justify-center p-3 flex-shrink-0">
          <QRCodeWidget url={jukeboxUrl} size={90} label="Request a Song" />
        </div>
      )}
    </div>
  ) : null;

  // ── Bottom strip (queuePos='bottom') ─────────────────────────────────────
  const bottomStrip = queuePos === 'bottom' ? (
    <div
      className="flex flex-shrink-0"
      style={{
        height: layout === 'minimal' ? '18%' : '24%',
      }}
    >
      <div
        className="flex-1 min-w-0"
        style={{}}
      >
        {queueEl}
      </div>
      {config.showQr && (
        <div className="w-[27%] flex items-center justify-center flex-shrink-0">
          {qrEl}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div
      className="w-screen h-screen flex flex-col text-white select-none overflow-hidden relative"
      style={{ ...bgStyle, fontFamily: theme.fontFamily }}
    >
      <FontLoader fontStyle={config.fontStyle ?? 'modern'} />

      {/* Particle background */}
      {config.backgroundStyle === 'particles' && (
        <>
          <style>{`@keyframes ptc-float{0%,100%{transform:translateY(0) scale(1);opacity:.07}50%{transform:translateY(-28px) scale(1.4);opacity:.22}}`}</style>
          {PARTICLES.map(p => (
            <span
              key={p.id}
              style={{
                position: 'absolute', left: p.left, top: p.top,
                width: p.size, height: p.size, borderRadius: '50%',
                backgroundColor: theme.accent,
                animationName: 'ptc-float', animationDuration: p.duration,
                animationDelay: p.delay, animationTimingFunction: 'ease-in-out',
                animationIterationCount: 'infinite', pointerEvents: 'none',
              }}
            />
          ))}
        </>
      )}

      {/* Announcement overlay */}
      <AnnouncementOverlay text={activeAnnouncement ?? null} accent={theme.accent} />

      {/* ── FM frequency banner ─────────────────────────────────────────── */}
      {config.fmFrequency && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-6 py-2 rounded-full font-bold tracking-widest uppercase text-white shadow-lg"
          style={{ backgroundColor: `${theme.accent}cc`, fontSize: `clamp(1rem, 2vw, 1.5rem)` }}
        >
          📻 Tune to {config.fmFrequency} FM
        </div>
      )}

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-8 py-3 flex-shrink-0"
        style={{
          background: `linear-gradient(90deg, ${theme.bgFrom}dd 0%, transparent 50%, ${theme.bgTo}dd 100%)`,
          borderBottom: `1px solid ${theme.accent}25`,
        }}
      >
        <div className="flex items-center gap-3">
          {config.logoUrl
            ? <img src={config.logoUrl} alt="Logo" className="h-7 w-auto rounded" />
            : <span className="w-3 h-3 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: theme.accent }} />
          }
          <span className="text-base font-semibold tracking-[0.2em] uppercase text-white/70">
            Now Playing
          </span>
          {config.fmFrequency && (
            <span
              className="hidden"
            />
          )}
        </div>
        {playlistName && (
          <div className="text-white/60 text-base truncate max-w-[50%] text-right">
            <span className="font-medium text-white/80">{playlistName}</span>
            {trackIndex != null && trackCount != null && (
              <span className="ml-2 text-white/35">— {trackIndex} of {trackCount}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Layout: MINIMAL ────────────────────────────────────────────── */}
      {layout === 'minimal' && (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex flex-col items-center justify-center px-20 gap-6 text-center min-h-0">
            <h1
              className="font-bold leading-tight text-white"
              style={{ fontSize: `clamp(${3.5 * scale}rem, ${8 * scale}vw, ${7 * scale}rem)`, fontFamily: theme.fontFamily }}
            >
              {songTitle ?? '—'}
            </h1>
            {artist && (
              <p className="text-gray-300" style={{ fontSize: `clamp(${1.5 * scale}rem, ${3 * scale}vw, ${2.5 * scale}rem)` }}>
                {artist}
              </p>
            )}
            <div className="w-2/3 mt-2">{progressEl}</div>
            {requesterEl}
          </div>
          {rightSidebar}
        </div>
      )}

      {/* ── Layout: CENTERED ───────────────────────────────────────────── */}
      {layout === 'centered' && (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex items-center justify-center gap-10 px-10 min-h-0">
            <div style={{ width: `${albumPct}%`, maxWidth: '380px' }} className="flex-shrink-0 self-center">
              {albumArtEl}
            </div>
            <div className="flex flex-col gap-5 flex-1 min-w-0 self-center">
              <div className="min-w-0">{titleEl}{artistEl}</div>
              {progressEl}
              {requesterEl}
            </div>
          </div>
          {rightSidebar}
        </div>
      )}

      {/* ── Layout: SIDEBAR (default) ───────────────────────────────────── */}
      {layout === 'sidebar' && (
        <div className="flex flex-1 min-h-0">
          <div
            style={{ width: `${albumPct}%` }}
            className="flex items-center justify-center p-6 flex-shrink-0"
          >
            {albumArtEl}
          </div>
          <div className="flex flex-1 min-h-0">
            <div className="flex-1 flex flex-col justify-center pr-10 gap-5 min-w-0">
              <div className="min-w-0">{titleEl}{artistEl}</div>
              {progressEl}
              {requesterEl}
            </div>
            {rightSidebar}
          </div>
        </div>
      )}

      {/* ── Bottom strip ────────────────────────────────────────────────── */}
      {bottomStrip}

      {/* Floating QR when queue is hidden but QR is on */}
      {queuePos === 'hidden' && config.showQr && (
        <div className="absolute bottom-4 right-4 z-10">
          <QRCodeWidget url={jukeboxUrl} size={80} label="" />
        </div>
      )}

      {/* ── Ticker ──────────────────────────────────────────────────────── */}
      <TickerBar text={config.tickerText} accent={theme.accent} />

      {/* ── Sponsor text ────────────────────────────────────────────────── */}
      {config.sponsorText && (
        <div
          className="flex-shrink-0 text-center py-1.5 text-white/30 text-xs"
          style={{ backgroundColor: `${theme.bgFrom}88` }}
        >
          {config.sponsorText}
        </div>
      )}
    </div>
  );
}
