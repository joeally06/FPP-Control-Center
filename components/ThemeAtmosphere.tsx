'use client';

import { useEffect, useRef } from 'react';
import type { ThemeConfig } from '@/lib/themes/theme-config';

// Seasonal sky behind the visitor page, and the string lights under the top bar.
// The look lives in app/globals.css (.sp-*); everything here is decorative and ignores the pointer.

export default function ThemeAtmosphere({ sky }: { sky: ThemeConfig['sky'] }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {sky === 'snow' ? <DepthSnow /> : <div className="sp-sky-stars absolute inset-0" />}
    </div>
  );
}

const BULB_COUNT = 18;
const HOOKS = 3; // the wire is pinned up at the ends and between these spans
const SAG_PX = 8;

const sagAt = (x: number) => Math.sin(((x * HOOKS) % 1) * Math.PI) * SAG_PX;

// Built once: the wire's path in a 100x18 box stretched to the full width
const WIRE_PATH = Array.from({ length: 61 }, (_, i) => {
  const x = i / 60;
  return `${i === 0 ? 'M' : 'L'}${(x * 100).toFixed(2)} ${(2 + sagAt(x)).toFixed(2)}`;
}).join(' ');

/** C9 bulbs hung on a sagging wire, in the season's logo colours. */
export function StringLights({ colors }: { colors: string[] }) {
  return (
    <div aria-hidden="true" className="sp-lights">
      <svg viewBox="0 0 100 18" preserveAspectRatio="none">
        <path d={WIRE_PATH} fill="none" stroke="#2b2238" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: BULB_COUNT }, (_, i) => {
        const x = (i + 0.5) / BULB_COUNT;
        return (
          <span
            key={i}
            className="sp-bulb"
            style={{
              ['--bulb' as string]: colors[i % colors.length],
              left: `${x * 100}%`,
              top: `${sagAt(x) + 4}px`,
              animationDelay: `${(i * 0.37) % 3.2}s`,
            }}
          />
        );
      })}
    </div>
  );
}

interface SnowLayer {
  count: number;
  radius: [number, number];
  /** Fall speed in px per second */
  speed: [number, number];
  alpha: [number, number];
  soft: boolean;
}

// Far flakes are small, sharp and slow; a few near flakes are big, soft and fast - that gap reads as depth
const SNOW_LAYERS: SnowLayer[] = [
  { count: 55, radius: [1, 2.2], speed: [15, 35], alpha: [0.35, 0.7], soft: false },
  { count: 25, radius: [2.5, 4], speed: [40, 65], alpha: [0.5, 0.85], soft: false },
  { count: 8, radius: [7, 12], speed: [75, 110], alpha: [0.3, 0.55], soft: true },
];

const random = (min: number, max: number) => min + Math.random() * (max - min);

/** A white dot fading to transparent, drawn once and stamped for every flake (no per-frame blur). */
function makeFlakeSprite(soft: boolean): HTMLCanvasElement {
  const size = soft ? 32 : 8;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = size * 2;
  const ctx = sprite.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size, size, 0, size, size, size);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(soft ? 0.3 : 0.6, `rgba(255, 255, 255, ${soft ? 0.55 : 0.9})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size * 2, size * 2);
  }
  return sprite;
}

function DepthSnow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sprites = { sharp: makeFlakeSprite(false), soft: makeFlakeSprite(true) };
    let width = 0;
    let height = 0;
    const resize = () => {
      width = canvas.width = canvas.clientWidth;
      height = canvas.height = canvas.clientHeight;
    };
    resize();

    const flakes = SNOW_LAYERS.flatMap((layer) =>
      Array.from({ length: layer.count }, () => ({
        x: random(0, width),
        y: random(0, height),
        r: random(...layer.radius),
        speed: random(...layer.speed),
        alpha: random(...layer.alpha),
        sprite: layer.soft ? sprites.soft : sprites.sharp,
        phase: random(0, Math.PI * 2),
      }))
    );

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const flake of flakes) {
        const sway = Math.sin(time / 1600 + flake.phase) * flake.r * 1.5;
        ctx.globalAlpha = flake.alpha;
        ctx.drawImage(flake.sprite, flake.x + sway - flake.r, flake.y - flake.r, flake.r * 2, flake.r * 2);
      }
    };

    let frame = 0;
    let last = 0;
    const step = (time: number) => {
      // Time-based so the snow falls at the same speed on 60 Hz and 120 Hz screens; capped after a pause
      const dt = Math.min(0.05, last ? (time - last) / 1000 : 0);
      last = time;
      for (const flake of flakes) {
        flake.y += flake.speed * dt;
        flake.x += flake.speed * 0.15 * dt; // light breeze
        if (flake.y - flake.r > height) {
          flake.y = -flake.r;
          flake.x = random(0, width);
        }
        if (flake.x - flake.r > width) flake.x = -flake.r;
      }
      draw(time);
      frame = requestAnimationFrame(step);
    };

    const onResize = () => {
      resize();
      if (reduceMotion) draw(0);
    };
    window.addEventListener('resize', onResize);

    // Reduced motion: one still snowy frame instead of falling snow
    if (reduceMotion) draw(0);
    else frame = requestAnimationFrame(step);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}
