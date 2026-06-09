'use client';

import { useEffect, useState, useCallback } from 'react';
import type { DisplayConfig } from '@/types/display';
import { resolveTheme } from '@/lib/display-theme';
import QRCodeWidget from './QRCodeWidget';
import TickerBar from './TickerBar';
import AnnouncementOverlay from './AnnouncementOverlay';

interface Props {
  config: DisplayConfig;
  jukeboxUrl: string;
  activeAnnouncement?: string | null;
}

// Pre-computed stable arrays to avoid hydration mismatches
const SNOWFLAKES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left:     `${((i * 17 + 7)  % 97) + 1}%`,
  delay:    `${((i * 0.73)    % 8).toFixed(2)}s`,
  duration: `${(6 + ((i * 1.37) % 8)).toFixed(2)}s`,
  size:     `${(0.9 + ((i * 0.29) % 1.3)).toFixed(2)}rem`,
  opacity:  Number((0.25 + ((i * 0.043) % 0.5)).toFixed(2)),
}));

const NOTES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left:     `${((i * 19 + 5)  % 95) + 2}%`,
  delay:    `${((i * 0.9)     % 8).toFixed(2)}s`,
  duration: `${(7 + ((i * 1.2)  % 6)).toFixed(2)}s`,
  size:     `${(1 + ((i * 0.31) % 1.4)).toFixed(2)}rem`,
  opacity:  Number((0.2 + ((i * 0.04) % 0.4)).toFixed(2)),
  char:     ['🎵', '🎶', '♪', '♫'][i % 4],
}));

const STARS = Array.from({ length: 25 }, (_, i) => ({
  id: i,
  left:     `${((i * 21 + 9)  % 96) + 2}%`,
  top:      `${((i * 13 + 5)  % 92) + 4}%`,
  delay:    `${((i * 0.7)     % 5).toFixed(2)}s`,
  duration: `${(3 + ((i * 0.9)  % 4)).toFixed(2)}s`,
  size:     `${(0.7 + ((i * 0.22) % 0.8)).toFixed(2)}rem`,
  opacity:  Number((0.15 + ((i * 0.035) % 0.4)).toFixed(2)),
}));

// Return seconds until the next occurrence of HH:MM (24h) local time
function secondsUntil(hhmm: string): number {
  const now = new Date();
  const [hh, mm] = hhmm.split(':').map(Number);
  if (isNaN(hh) || isNaN(mm)) return 0;
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  let diff = Math.floor((target.getTime() - now.getTime()) / 1000);
  if (diff < 0) diff += 86400; // next day
  return diff;
}

function formatCountdown(secs: number): string {
  if (secs <= 0) return '0:00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function IdleScreen({ config, jukeboxUrl, activeAnnouncement }: Props) {
  const [time, setTime] = useState('');
  const [slideIdx, setSlideIdx] = useState(0);
  const [slideFade, setSlideFade] = useState(true);
  const [countdownSecs, setCountdownSecs] = useState(0);
  const theme = resolveTheme(config);

  const images = config.idleSlideshowImages ?? [];
  const hasLocalSlideshow = images.length > 0 && !config.slideshowUrl;

  // Clock tick
  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Local image slideshow cycling
  useEffect(() => {
    if (!hasLocalSlideshow || images.length < 2) return;
    const intervalMs = Math.max(3, config.idleSlideshowInterval ?? 8) * 1000;
    const id = setInterval(() => {
      setSlideFade(false);
      setTimeout(() => {
        setSlideIdx(i => (i + 1) % images.length);
        setSlideFade(true);
      }, 600);
    }, intervalMs);
    return () => clearInterval(id);
  }, [hasLocalSlideshow, images.length, config.idleSlideshowInterval]);

  // Countdown timer
  useEffect(() => {
    if (!config.countdownEnabled || !config.countdownTime) return;
    setCountdownSecs(secondsUntil(config.countdownTime));
    const id = setInterval(() => {
      setCountdownSecs(secondsUntil(config.countdownTime));
    }, 1000);
    return () => clearInterval(id);
  }, [config.countdownEnabled, config.countdownTime]);

  // Background
  let bgStyle: React.CSSProperties;
  if (config.idleBackgroundUrl) {
    bgStyle = {
      backgroundImage:    `url(${config.idleBackgroundUrl})`,
      backgroundSize:     'cover',
      backgroundPosition: 'center',
    };
  } else if (config.backgroundStyle === 'solid') {
    bgStyle = { backgroundColor: theme.bgFrom };
  } else {
    bgStyle = { background: `linear-gradient(180deg, ${theme.bgFrom} 0%, #050505 50%, ${theme.bgTo} 100%)` };
  }

  return (
    <>
      <style>{`
        @keyframes idle-snow {
          0%   { transform: translateY(-12vh) translateX(0)    rotate(0deg);   opacity: 1; }
          50%  { transform: translateY(50vh)  translateX(15px) rotate(180deg); }
          100% { transform: translateY(112vh) translateX(-5px) rotate(360deg); opacity: 0; }
        }
        @keyframes idle-note {
          0%   { transform: translateY(110vh) rotate(-10deg); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.7; }
          100% { transform: translateY(-15vh) rotate(15deg);  opacity: 0; }
        }
        @keyframes idle-star {
          0%, 100% { opacity: 0.1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(1.5); }
        }
        @keyframes slideshow-pulse {
          0%, 100% { opacity: 0.9; }
          50%      { opacity: 1; }
        }
        .idle-anim-snow { position:absolute; top:0; animation-name:idle-snow; animation-timing-function:linear; animation-iteration-count:infinite; pointer-events:none; user-select:none; color:#ffffff; }
        .idle-anim-note { position:absolute;       animation-name:idle-note; animation-timing-function:linear; animation-iteration-count:infinite; pointer-events:none; user-select:none; }
        .idle-anim-star { position:absolute;       animation-name:idle-star; animation-timing-function:ease-in-out; animation-iteration-count:infinite; pointer-events:none; user-select:none; color:#ffffff; }
        .slideshow-img  { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transition:opacity 0.6s ease-in-out; }
      `}</style>

      <div
        className="relative w-screen h-screen overflow-hidden flex flex-col select-none"
        style={bgStyle}
      >
        {/* Announcement overlay always on top */}
        <AnnouncementOverlay text={activeAnnouncement ?? null} accent={theme.accent} />

        {config.slideshowUrl ? (
          /* ── Google Slides mode: fullscreen iframe ── */
          <iframe
            src={config.slideshowUrl
              .replace('/pub?', '/embed?')
              .replace('/pub&', '/embed&')}
            className="absolute inset-0 w-full h-full z-0"
            style={{ border: 'none', pointerEvents: 'none' }}
            allowFullScreen
          />
        ) : hasLocalSlideshow ? (
          /* ── Local Image Slideshow mode ── */
          <>
            <img
              key={slideIdx}
              src={images[slideIdx]}
              alt=""
              className="slideshow-img z-0"
              style={{ opacity: slideFade ? 1 : 0 }}
            />
            {/* Dark overlay for readability */}
            <div className="absolute inset-0 bg-black/40 z-10" />

            {/* Info strip + ticker */}
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-end pb-16 px-8 gap-4 text-center" style={{ fontFamily: theme.fontFamily }}>
              {config.countdownEnabled && config.countdownTime && (
                <div className="bg-black/60 rounded-2xl px-8 py-4 backdrop-blur-sm">
                  <p className="text-white/70 text-lg mb-1">{config.countdownLabel || 'Next show starts in'}</p>
                  <p className="text-white font-bold tabular-nums" style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)', color: theme.accent }}>
                    {formatCountdown(countdownSecs)}
                  </p>
                </div>
              )}
              {config.fmFrequency && (
                <p className="font-semibold text-white" style={{ color: theme.accent, fontSize: 'clamp(1rem, 2vw, 1.5rem)' }}>
                  📻 Tune to {config.fmFrequency} FM
                </p>
              )}
              {config.showQr && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-white/70" style={{ fontSize: 'clamp(0.8rem, 1.4vw, 1.1rem)' }}>🎵 Request a song</p>
                  <QRCodeWidget url={jukeboxUrl} label="" size={110} />
                </div>
              )}
              {/* Slide counter dots */}
              {images.length > 1 && (
                <div className="flex gap-2">
                  {images.map((_, i) => (
                    <span
                      key={i}
                      className="inline-block rounded-full transition-all duration-300"
                      style={{ width: i === slideIdx ? '20px' : '8px', height: '8px', background: i === slideIdx ? theme.accent : 'rgba(255,255,255,0.4)' }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-30">
              <TickerBar text={config.tickerText} accent={theme.accent} />
            </div>
          </>
        ) : (
          /* ── Custom display mode ── */
          <>
            {config.idleBackgroundUrl && (
              <div className="absolute inset-0 bg-black/55 z-0" />
            )}

            {config.idleAnimation === 'snowflakes' && SNOWFLAKES.map(f => (
              <span key={f.id} className="idle-anim-snow" style={{ left: f.left, animationDelay: f.delay, animationDuration: f.duration, fontSize: f.size, opacity: f.opacity }}>❄</span>
            ))}
            {config.idleAnimation === 'notes' && NOTES.map(f => (
              <span key={f.id} className="idle-anim-note" style={{ left: f.left, animationDelay: f.delay, animationDuration: f.duration, fontSize: f.size, opacity: f.opacity }}>{f.char}</span>
            ))}
            {config.idleAnimation === 'stars' && STARS.map(f => (
              <span key={f.id} className="idle-anim-star" style={{ left: f.left, top: f.top, animationDelay: f.delay, animationDuration: f.duration, fontSize: f.size, opacity: f.opacity }}>✦</span>
            ))}

            <div
              className="relative z-10 flex-1 flex flex-col items-center justify-center gap-8 text-center px-8"
              style={{ fontFamily: theme.fontFamily }}
            >
              {config.logoUrl
                ? <img src={config.logoUrl} alt="Logo" className="w-auto rounded-xl shadow-2xl" style={{ maxHeight: 'clamp(12rem, 35vw, 28rem)' }} />
                : <div style={{ fontSize: 'clamp(4rem, 10vw, 7rem)' }}>🎄</div>
              }

              <div>
                {config.showName && !config.logoUrl && (
                  <h1
                    className="font-bold text-white drop-shadow-lg"
                    style={{ fontSize: 'clamp(2rem, 5vw, 4rem)' }}
                  >
                    {config.showName}
                  </h1>
                )}
                <p className="text-white/45 mt-2" style={{ fontSize: 'clamp(1rem, 2vw, 1.5rem)' }}>
                  {config.idleMessage}
                </p>
                {config.fmFrequency && (
                  <p className="mt-3 font-semibold" style={{ color: theme.accent, fontSize: 'clamp(0.9rem, 1.8vw, 1.4rem)' }}>
                    📻 Tune to {config.fmFrequency} FM
                  </p>
                )}
              </div>

              {/* Countdown timer */}
              {config.countdownEnabled && config.countdownTime && (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-white/60" style={{ fontSize: 'clamp(0.85rem, 1.5vw, 1.2rem)' }}>
                    {config.countdownLabel || 'Next show starts in'}
                  </p>
                  <p
                    className="font-bold tabular-nums tracking-tight"
                    style={{ color: theme.accent, fontSize: 'clamp(2.5rem, 7vw, 5.5rem)' }}
                  >
                    {formatCountdown(countdownSecs)}
                  </p>
                </div>
              )}

              {config.showClock && time && !config.countdownEnabled && (
                <div
                  className="font-light text-white/75 tabular-nums tracking-tight"
                  style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}
                >
                  {time}
                </div>
              )}

              {config.showQr && (
                <div className="flex flex-col items-center gap-3 mt-2">
                  <p className="text-white/55" style={{ fontSize: 'clamp(0.85rem, 1.5vw, 1.25rem)' }}>
                    🎵 Request a song for the show!
                  </p>
                  <QRCodeWidget url={jukeboxUrl} label="Scan with your phone to request a song" size={140} />
                </div>
              )}
            </div>

            {config.sponsorText && (
              <div
                className="relative z-10 flex-shrink-0 text-center py-2 text-white/40 text-xs border-t"
                style={{ borderColor: `${theme.accent}20` }}
              >
                {config.sponsorText}
              </div>
            )}

            <div className="relative z-10">
              <TickerBar text={config.tickerText} accent={theme.accent} />
            </div>
          </>
        )}
      </div>
    </>
  );
}