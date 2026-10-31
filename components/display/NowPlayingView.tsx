'use client';

import { useEffect } from 'react';
import { Music, Radio } from 'lucide-react';
import QRCode from 'react-qr-code';
import type { DisplayState } from '@/types/display';
import { resolveTheme } from '@/lib/display-theme';
import ProgressBar from './ProgressBar';
import QueueStrip from './QueueStrip';
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

// The song-change entrance. Only runs for people who haven't asked for reduced motion.
const ENTRANCE_CSS = `
@media (prefers-reduced-motion: no-preference) {
  @keyframes np-fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes np-rise { from { opacity: 0; transform: translateY(3vh) scale(.97) } to { opacity: 1; transform: none } }
  @keyframes np-line { from { width: 0 } to { width: 13.5vw } }
  .np-bg   { animation: np-fade 1.2s ease-out both }
  .np-art  { animation: np-rise .7s ease-out both }
  .np-text { animation: np-rise .7s ease-out .15s both }
  .np-line { animation: np-line .9s ease-out .3s both }
}
@keyframes ptc-float{0%,100%{transform:translateY(0) scale(1);opacity:.07}50%{transform:translateY(-28px) scale(1.4);opacity:.22}}
`;

/** Black or white, whichever reads better on this hex background */
function readableOn(hex: string): string {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const full = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : hex;
  const m = /^#([0-9a-f]{6})$/i.exec(full);
  if (!m) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#000000' : '#ffffff';
}

export default function NowPlayingView({ state }: Props) {
  const {
    sequenceName, songTitle, artist, albumArtUrl, secondsPlayed, secondsRemaining,
    playlistName, trackIndex, trackCount, requesterName, upcomingQueue,
    jukeboxUrl, config, activeAnnouncement,
  } = state;

  const theme       = resolveTheme(config);
  const scale       = (config.fontScale ?? 100) / 100;
  const isScheduled = !requesterName || requesterName === 'FPP Schedule';
  const songKey     = sequenceName ?? songTitle ?? '';

  const plainBg: React.CSSProperties = config.backgroundStyle === 'solid'
    ? { backgroundColor: theme.bgFrom }
    : { background: `linear-gradient(135deg, ${theme.bgFrom} 0%, #050505 50%, ${theme.bgTo} 100%)` };

  return (
    <div
      className="display-sign w-screen h-screen flex flex-col text-white select-none overflow-hidden relative"
      style={{ ...plainBg, fontFamily: theme.fontFamily }}
    >
      <FontLoader fontStyle={config.fontStyle ?? 'modern'} />
      <style>{ENTRANCE_CSS}</style>

      {/* Background: the song's album art, blurred and dimmed */}
      {albumArtUrl && (
        <div key={`bg-${songKey}`} className="np-bg absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute w-[112%] h-[112%] -left-[6%] -top-[6%] bg-cover bg-center"
            style={{ backgroundImage: `url(${JSON.stringify(albumArtUrl)})`, filter: 'blur(60px) brightness(0.55) saturate(1.3)' }}
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,.15) 40%, rgba(0,0,0,.7) 100%)' }} />
        </div>
      )}

      {/* Particles (only on the plain background) */}
      {config.backgroundStyle === 'particles' && !albumArtUrl && PARTICLES.map(p => (
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

      <AnnouncementOverlay text={activeAnnouncement ?? null} accent={theme.accent} />

      {/* ── Top bar: the radio instruction, or the show name ─────────────── */}
      {config.fmFrequency ? (
        <div
          className="relative flex-shrink-0 flex items-center justify-center gap-[1.4vw]"
          style={{ height: '9.6vh', backgroundColor: theme.accent, color: readableOn(theme.accent) }}
        >
          <Radio style={{ width: `${3.1 * scale}vw`, height: `${3.1 * scale}vw` }} aria-hidden="true" />
          <span className="font-extrabold" style={{ fontSize: `${3.1 * scale}vw` }}>
            Tune your radio to {config.fmFrequency} FM
          </span>
        </div>
      ) : (
        <div className="relative flex-shrink-0 flex items-center justify-between px-[4.4vw]" style={{ height: '9.6vh' }}>
          <div className="flex items-center gap-[1.2vw] min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo uploaded by the admin, size unknown, no image optimizer configured */}
            {config.logoUrl && <img src={config.logoUrl} alt="Logo" className="h-[6vh] w-auto rounded" />}
            {config.showName && (
              <span className="font-bold truncate tracking-wide" style={{ fontSize: `${2.1 * scale}vw` }}>
                {config.showName}
              </span>
            )}
          </div>
          {playlistName && trackIndex != null && trackCount != null && (
            <span className="text-white/75 flex-shrink-0" style={{ fontSize: `${1.55 * scale}vw` }}>
              Song {trackIndex} of {trackCount}
            </span>
          )}
        </div>
      )}

      {/* ── Main: album art + now playing ────────────────────────────────── */}
      <div className="relative flex-1 min-h-0 flex items-center gap-[4.4vw] px-[4.4vw]">
        <div
          key={`art-${songKey}`}
          className="np-art flex-shrink-0 rounded-[1.5vw] shadow-2xl overflow-hidden flex items-center justify-center"
          style={{
            height: '46vh', aspectRatio: '1',
            background: `linear-gradient(135deg, ${theme.bgFrom}aa, ${theme.bgTo}aa)`,
            boxShadow: '0 4vh 10vh rgba(0,0,0,.65)',
          }}
        >
          {albumArtUrl
            // eslint-disable-next-line @next/next/no-img-element -- remote album art, no image optimizer configured
            ? <img src={albumArtUrl} alt="Album art" className="w-full h-full object-cover" />
            : <Music className="w-1/3 h-1/3 text-white/30" aria-hidden="true" />}
        </div>

        <div className="flex-1 min-w-0 flex flex-col" style={{ gap: '2.4vh' }}>
          <div>
            <div className="font-bold uppercase" style={{ fontSize: `${1.55 * scale}vw`, letterSpacing: '0.28em', color: theme.accent, filter: 'brightness(1.35)' }}>
              Now playing
            </div>
            <div key={`line-${songKey}`} className="np-line mt-[1.2vh] rounded-full" style={{ height: '0.5vh', width: '13.5vw', backgroundColor: theme.accent }} />
          </div>

          <div key={`text-${songKey}`} className="np-text min-w-0">
            <h1
              className="font-extrabold leading-[1.04] break-words"
              style={{
                fontSize: `min(${5.4 * scale}vw, 13vh)`,
                fontFamily: theme.fontFamily,
                textShadow: '0 4px 30px rgba(0,0,0,.6)',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}
            >
              {songTitle ?? '—'}
            </h1>
            {artist && (
              <p className="text-white/85 truncate mt-[1.2vh]" style={{ fontSize: `min(${2.8 * scale}vw, 5.2vh)` }}>{artist}</p>
            )}
            <p className="text-white/70 mt-[2vh]" style={{ fontSize: `min(${2 * scale}vw, 3.8vh)` }}>
              {isScheduled ? 'Scheduled show' : `Requested by ${requesterName}`}
            </p>
          </div>

          <ProgressBar
            secondsPlayed={secondsPlayed}
            secondsRemaining={secondsRemaining}
            barFrom={theme.barFrom}
            barTo={theme.barTo}
            scale={scale}
          />
        </div>
      </div>

      {/* ── Up next + QR ─────────────────────────────────────────────────── */}
      <div
        className="relative flex-shrink-0 flex items-center gap-[3vw] px-[4.4vw]"
        style={{ height: '21vh', backgroundColor: 'rgba(0,0,0,.5)', borderTop: '2px solid rgba(255,255,255,.12)' }}
      >
        <div className="flex-1 min-w-0">
          <QueueStrip queue={upcomingQueue.slice(0, Math.max(1, config.queueCount ?? 4))} scale={scale} />
        </div>
        {config.showQr && (
          <div className="flex items-center flex-shrink-0 gap-[1.5vw]">
            <p className="font-bold text-right leading-tight" style={{ fontSize: `${1.85 * scale}vw`, maxWidth: '15vw' }}>
              Scan to pick<br />the next song
            </p>
            <div className="bg-white rounded-[0.9vw] p-[0.7vw]" style={{ lineHeight: 0, height: '17vh', aspectRatio: '1' }}>
              <QRCode value={jukeboxUrl} style={{ width: '100%', height: '100%' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Ticker ───────────────────────────────────────────────────────── */}
      <div className="relative">
        <TickerBar text={config.tickerText} accent={theme.accent} fontSize={`${1.65 * scale}vw`} />
      </div>

      {/* ── Sponsor text ─────────────────────────────────────────────────── */}
      {config.sponsorText && (
        <div
          className="relative flex-shrink-0 text-center py-[0.6vh] text-white/60"
          style={{ fontSize: `${1.2 * scale}vw`, backgroundColor: `${theme.bgFrom}88` }}
        >
          {config.sponsorText}
        </div>
      )}
    </div>
  );
}
