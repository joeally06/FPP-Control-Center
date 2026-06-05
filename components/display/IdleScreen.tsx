'use client';

import { useEffect, useState } from 'react';
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

export default function IdleScreen({ config, jukeboxUrl, activeAnnouncement }: Props) {
  const [time, setTime] = useState('');
  const theme = resolveTheme(config);

  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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
        .idle-anim-snow { position:absolute; top:0; animation-name:idle-snow; animation-timing-function:linear; animation-iteration-count:infinite; pointer-events:none; user-select:none; color:#ffffff; }
        .idle-anim-note { position:absolute;       animation-name:idle-note; animation-timing-function:linear; animation-iteration-count:infinite; pointer-events:none; user-select:none; }
        .idle-anim-star { position:absolute;       animation-name:idle-star; animation-timing-function:ease-in-out; animation-iteration-count:infinite; pointer-events:none; user-select:none; color:#ffffff; }
      `}</style>

      <div
        className="relative w-screen h-screen overflow-hidden flex flex-col select-none"
        style={bgStyle}
      >
        {/* Google Slides / embed slideshow — fills entire background */}
        {config.slideshowUrl && (
          <iframe
            src={config.slideshowUrl}
            className="absolute inset-0 w-full h-full z-0"
            style={{ border: 'none', pointerEvents: 'none' }}
            allowFullScreen
          />
        )}

        {/* Dark overlay for custom background images (not slideshow) */}
        {config.idleBackgroundUrl && !config.slideshowUrl && (
          <div className="absolute inset-0 bg-black/55 z-0" />
        )}

        {/* â”€â”€ Animations â”€â”€ */}
        {config.idleAnimation === 'snowflakes' && SNOWFLAKES.map(f => (
          <span key={f.id} className="idle-anim-snow" style={{ left: f.left, animationDelay: f.delay, animationDuration: f.duration, fontSize: f.size, opacity: f.opacity }}>❄</span>
        ))}
        {config.idleAnimation === 'notes' && NOTES.map(f => (
          <span key={f.id} className="idle-anim-note" style={{ left: f.left, animationDelay: f.delay, animationDuration: f.duration, fontSize: f.size, opacity: f.opacity }}>{f.char}</span>
        ))}
        {config.idleAnimation === 'stars' && STARS.map(f => (
          <span key={f.id} className="idle-anim-star" style={{ left: f.left, top: f.top, animationDelay: f.delay, animationDuration: f.duration, fontSize: f.size, opacity: f.opacity }}>✦</span>
        ))}

        {/* Announcement overlay */}
        <AnnouncementOverlay text={activeAnnouncement ?? null} accent={theme.accent} />

        {/* â”€â”€ Main content â”€â”€ */}
        <div
          className="relative z-10 flex-1 flex flex-col items-center justify-center gap-8 text-center px-8"
          style={{ fontFamily: theme.fontFamily }}
        >
          {/* Logo or tree */}
          {config.logoUrl
            ? <img src={config.logoUrl} alt="Logo" className="h-24 w-auto rounded-xl shadow-2xl" />
            : <div style={{ fontSize: 'clamp(4rem, 10vw, 7rem)' }}>🎄</div>
          }

          {/* Show name + idle message */}
          <div>
            <h1
              className="font-bold text-white drop-shadow-lg"
              style={{ fontSize: 'clamp(2rem, 5vw, 4rem)' }}
            >
              {config.showName}
            </h1>
            <p className="text-white/45 mt-2" style={{ fontSize: 'clamp(1rem, 2vw, 1.5rem)' }}>
              {config.idleMessage}
            </p>
            {config.fmFrequency && (
              <p className="mt-3 font-semibold" style={{ color: theme.accent, fontSize: 'clamp(0.9rem, 1.8vw, 1.4rem)' }}>
                📻 Tune to {config.fmFrequency} FM
              </p>
            )}
          </div>

          {/* Clock */}
          {config.showClock && time && (
            <div
              className="font-light text-white/75 tabular-nums tracking-tight"
              style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}
            >
              {time}
            </div>
          )}

          {/* QR code */}
          {config.showQr && (
            <div className="flex flex-col items-center gap-3 mt-2">
              <p className="text-white/55" style={{ fontSize: 'clamp(0.85rem, 1.5vw, 1.25rem)' }}>
                🎵 Request a song for the show!
              </p>
              <QRCodeWidget url={jukeboxUrl} label="Scan with your phone to request a song" size={140} />
            </div>
          )}
        </div>

        {/* Sponsor text */}
        {config.sponsorText && (
          <div
            className="relative z-10 flex-shrink-0 text-center py-2 text-white/40 text-xs border-t"
            style={{ borderColor: `${theme.accent}20` }}
          >
            {config.sponsorText}
          </div>
        )}

        {/* Ticker */}
        <div className="relative z-10">
          <TickerBar text={config.tickerText} accent={theme.accent} />
        </div>
      </div>
    </>
  );
}
