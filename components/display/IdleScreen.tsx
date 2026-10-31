'use client';

import { useEffect, useState } from 'react';
import { Radio, QrCode, Smartphone, Sparkles, TreePine } from 'lucide-react';
import QRCode from 'react-qr-code';
import type { DisplayConfig } from '@/types/display';
import { resolveTheme } from '@/lib/display-theme';
import {
  IDLE_PANEL_SECONDS, describeNextShow, formatClock, idlePanels, isValidTime, secondsUntilIso, secondsUntilTime,
} from '@/lib/display-idle';
import { useNextShow } from './useNextShow';
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

const HOW_IT_WORKS = [
  { Icon: QrCode,     title: 'Scan the code',  text: 'Point your phone camera at the QR code' },
  { Icon: Smartphone, title: 'Pick a song',    text: 'Choose a song from the list on your phone' },
  { Icon: Sparkles,   title: 'Watch the show', text: 'Your song plays on the lights, in line with the others' },
];

/** A QR code that sizes itself from the screen height, on the white card scanners need */
function Qr({ url, heightVh }: { url: string; heightVh: number }) {
  return (
    <div className="bg-white rounded-[0.9vw] p-[0.7vw] flex-shrink-0" style={{ lineHeight: 0, height: `${heightVh}vh`, aspectRatio: '1' }}>
      <QRCode value={url} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default function IdleScreen({ config, jukeboxUrl, activeAnnouncement }: Props) {
  const [now, setNow] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [slideIdx, setSlideIdx] = useState(0);
  const [slideFade, setSlideFade] = useState(true);
  const theme = resolveTheme(config);
  const scale = (config.fontScale ?? 100) / 100;
  // Big text grows with the Font scale setting but is also capped by screen height, so 150% never pushes a panel off the screen
  const sz = (vw: number, vh: number) => `min(${(vw * scale).toFixed(2)}vw, ${vh}vh)`;

  const images = config.idleSlideshowImages ?? [];
  const hasLocalSlideshow = images.length > 0 && config.idleMode === 'photos';
  const showSlides = config.idleMode === 'slides' && !!config.slideshowUrl;

  // The show's real schedule; the typed time only fills in when FPP has none
  const nextShow = useNextShow(!!config.countdownEnabled);
  const hasCountdown = !!config.countdownEnabled && nextShow.settled
    && (nextShow.nextShowAt !== null || isValidTime(config.countdownTime));
  const panels = idlePanels(config, { showActive: nextShow.isActive, hasCountdown });
  const panel = panels[tick % panels.length];

  const countdownSecs = now === null ? 0
    : nextShow.nextShowAt ? (secondsUntilIso(nextShow.nextShowAt, now) ?? 0)
    : secondsUntilTime(config.countdownTime, new Date(now));
  const whenText = now !== null && nextShow.nextShowAt ? describeNextShow(nextShow.nextShowAt, new Date(now)) : '';
  const timeText = now === null ? '' : new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const showCountdown = panels.includes('countdown');

  // One clock for the time of day and the countdown
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  // Next panel every few seconds
  useEffect(() => {
    if (panels.length < 2) return;
    const id = setInterval(() => setTick((t) => t + 1), IDLE_PANEL_SECONDS * 1000);
    return () => clearInterval(id);
  }, [panels.length]);

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

  const countdownBlock = (compact: boolean) => (
    <>
      <p className="text-white/80" style={{ fontSize: compact ? sz(1.8, 3.2) : sz(3, 5.5) }}>{config.countdownLabel || 'Next show starts in'}</p>
      <p className="font-bold tabular-nums tracking-tight leading-none" style={{ color: theme.accent, fontSize: compact ? sz(6, 11) : sz(13, 24), filter: 'brightness(1.2)' }}>
        {formatClock(countdownSecs)}
      </p>
      {whenText && <p className="text-white/80" style={{ fontSize: compact ? sz(1.6, 3) : sz(2.6, 4.6) }}>{whenText}</p>}
    </>
  );

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
        @media (prefers-reduced-motion: no-preference) {
          @keyframes idle-rise { from { opacity: 0; transform: translateY(3vh) scale(.98) } to { opacity: 1; transform: none } }
          .idle-panel { animation: idle-rise .7s ease-out both }
        }
        .idle-anim-snow { position:absolute; top:0; animation-name:idle-snow; animation-timing-function:linear; animation-iteration-count:infinite; pointer-events:none; user-select:none; color:#ffffff; }
        .idle-anim-note { position:absolute;       animation-name:idle-note; animation-timing-function:linear; animation-iteration-count:infinite; pointer-events:none; user-select:none; }
        .idle-anim-star { position:absolute;       animation-name:idle-star; animation-timing-function:ease-in-out; animation-iteration-count:infinite; pointer-events:none; user-select:none; color:#ffffff; }
        .slideshow-img  { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; transition:opacity 0.6s ease-in-out; }
      `}</style>

      <div
        className="display-sign relative w-screen h-screen overflow-hidden flex flex-col select-none text-white"
        style={bgStyle}
      >
        {/* Announcement overlay always on top */}
        <AnnouncementOverlay text={activeAnnouncement ?? null} accent={theme.accent} />

        {showSlides ? (
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
            {/* eslint-disable-next-line @next/next/no-img-element -- slideshow of images the admin uploaded, size unknown, no image optimizer configured */}
            <img
              key={slideIdx}
              src={images[slideIdx % images.length]}
              alt=""
              className="slideshow-img z-0"
              style={{ opacity: slideFade ? 1 : 0 }}
            />
            {/* Dark overlay for readability */}
            <div className="absolute inset-0 bg-black/40 z-10" />

            {/* Info strip + ticker */}
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-end pb-[9vh] px-[4vw] gap-[2vh] text-center" style={{ fontFamily: theme.fontFamily }}>
              {showCountdown && (
                <div className="bg-black/60 rounded-[1.5vw] px-[3vw] py-[2vh] backdrop-blur-sm flex flex-col items-center">
                  {countdownBlock(true)}
                </div>
              )}
              {config.fmFrequency && (
                <p className="flex items-center gap-[1vw] font-bold text-white" style={{ fontSize: sz(2.6, 4.5) }}>
                  <Radio style={{ width: sz(2.6, 4.5), height: sz(2.6, 4.5), color: theme.accent }} aria-hidden="true" />
                  Tune your radio to {config.fmFrequency} FM
                </p>
              )}
              {config.showQr && (
                <div className="flex items-center gap-[1.5vw] bg-black/60 rounded-[1.5vw] px-[2vw] py-[1.5vh]">
                  <p className="font-bold text-white text-right leading-tight" style={{ fontSize: sz(1.85, 3.3) }}>
                    Scan to pick<br />the next song
                  </p>
                  <Qr url={jukeboxUrl} heightVh={16} />
                </div>
              )}
              {/* Slide counter dots */}
              {images.length > 1 && (
                <div className="flex gap-2">
                  {images.map((_, i) => (
                    <span
                      key={i}
                      className="inline-block rounded-full transition-all duration-300"
                      style={{ width: i === slideIdx % images.length ? '20px' : '8px', height: '8px', background: i === slideIdx % images.length ? theme.accent : 'rgba(255,255,255,0.4)' }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-30">
              <TickerBar text={config.tickerText} accent={theme.accent} fontSize={`${1.65 * scale}vw`} />
            </div>
          </>
        ) : (
          /* ── Custom display mode: panels that take turns ── */
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

            {/* Top bar: who we are, and the time */}
            <div
              className="relative z-10 flex-shrink-0 flex items-center justify-between px-[4.4vw]"
              style={{ height: '9.6vh', fontFamily: theme.fontFamily }}
            >
              <div className="flex items-center gap-[1.2vw] min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- logo uploaded by the admin, size unknown, no image optimizer configured */}
                {config.logoUrl && panel !== 'welcome' && <img src={config.logoUrl} alt="Logo" className="h-[6vh] w-auto rounded" />}
                {config.showName && panel !== 'welcome' && (
                  <span className="font-bold truncate tracking-wide" style={{ fontSize: `${2.1 * scale}vw` }}>{config.showName}</span>
                )}
              </div>
              {config.showClock && timeText && (
                <span className="font-light text-white/80 tabular-nums flex-shrink-0" style={{ fontSize: `${2.4 * scale}vw` }}>{timeText}</span>
              )}
            </div>

            {/* The current panel */}
            <div
              key={panel}
              className="idle-panel relative z-10 flex-1 min-h-0 overflow-hidden flex items-center justify-center px-[4.4vw] text-center"
              style={{ fontFamily: theme.fontFamily }}
            >
              {panel === 'welcome' && (
                <div className="flex items-center justify-center gap-[6vw] w-full">
                  <div className="flex flex-col items-center gap-[2.5vh] min-w-0 flex-1">
                    {config.logoUrl
                      // eslint-disable-next-line @next/next/no-img-element -- logo uploaded by the admin, size unknown, no image optimizer configured
                      ? <img src={config.logoUrl} alt="Logo" className="w-auto rounded-xl shadow-2xl" style={{ maxHeight: '34vh', maxWidth: '40vw' }} />
                      : <TreePine style={{ width: '16vh', height: '16vh', color: theme.accent }} aria-hidden="true" />}
                    {config.showName && !config.logoUrl && (
                      <h1 className="font-extrabold text-white drop-shadow-lg leading-tight" style={{ fontSize: sz(5.6, 10) }}>{config.showName}</h1>
                    )}
                    <p className="text-white/80" style={{ fontSize: sz(2.8, 5) }}>{config.idleMessage}</p>
                  </div>
                  {config.showQr && (
                    <div className="flex flex-col items-center gap-[2vh] flex-shrink-0">
                      <Qr url={jukeboxUrl} heightVh={36} />
                      <p className="font-bold" style={{ fontSize: sz(2.1, 3.8), maxWidth: '28vw' }}>Scan to pick the next song</p>
                    </div>
                  )}
                </div>
              )}

              {panel === 'countdown' && (
                <div className="flex flex-col items-center gap-[2vh]">{countdownBlock(false)}</div>
              )}

              {panel === 'fm' && (
                <div className="flex flex-col items-center gap-[2.5vh]">
                  <Radio style={{ width: sz(9, 16), height: sz(9, 16), color: theme.accent }} aria-hidden="true" />
                  <p className="text-white/85" style={{ fontSize: sz(3.4, 6) }}>Tune your radio to</p>
                  <p className="font-extrabold leading-none" style={{ fontSize: sz(12, 21), color: theme.accent, filter: 'brightness(1.2)' }}>{config.fmFrequency} FM</p>
                  <p className="text-white/80" style={{ fontSize: sz(2.4, 4.2) }}>to hear the music with the lights</p>
                </div>
              )}

              {panel === 'how' && (
                <div className="flex flex-col items-center gap-[3vh] w-full">
                  <p className="font-extrabold" style={{ fontSize: sz(4.4, 6.5) }}>Pick the next song</p>
                  <div className="grid grid-cols-3 gap-[3vw] w-full">
                    {HOW_IT_WORKS.map(({ Icon, title, text }, i) => (
                      <div key={title} className="flex flex-col items-center gap-[1.5vh] min-w-0 rounded-[1.5vw] bg-black/35 px-[2vw] py-[3vh]">
                        <Icon style={{ width: sz(6, 9), height: sz(6, 9), color: theme.accent }} aria-hidden="true" />
                        <p className="font-bold" style={{ fontSize: sz(2.8, 4.2) }}>{i + 1}. {title}</p>
                        <p className="text-white/80" style={{ fontSize: sz(1.8, 3) }}>{text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom band: the code stays in view on every panel but the welcome one, which has its own */}
            <div
              className="relative z-10 flex-shrink-0 flex items-center justify-between gap-[3vw] px-[4.4vw]"
              style={{ height: panel !== 'welcome' && config.showQr ? '19vh' : '5vh', fontFamily: theme.fontFamily }}
            >
              <div className="flex gap-[0.8vw]" aria-hidden="true">
                {panels.length > 1 && panels.map((p) => (
                  <span
                    key={p}
                    className="inline-block rounded-full transition-all duration-300"
                    style={{ width: p === panel ? '2.2vw' : '0.8vw', height: '0.8vw', background: p === panel ? theme.accent : 'rgba(255,255,255,0.4)' }}
                  />
                ))}
              </div>
              {panel !== 'welcome' && config.showQr && (
                <div className="flex items-center gap-[1.5vw]">
                  <p className="font-bold text-right leading-tight" style={{ fontSize: sz(1.85, 3.3) }}>
                    Scan to pick<br />the next song
                  </p>
                  <Qr url={jukeboxUrl} heightVh={16} />
                </div>
              )}
            </div>

            {config.sponsorText && (
              <div
                className="relative z-10 flex-shrink-0 text-center py-[0.6vh] text-white/60 border-t"
                style={{ borderColor: `${theme.accent}20`, fontSize: `${1.2 * scale}vw` }}
              >
                {config.sponsorText}
              </div>
            )}

            <div className="relative z-10">
              <TickerBar text={config.tickerText} accent={theme.accent} fontSize={`${1.65 * scale}vw`} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
