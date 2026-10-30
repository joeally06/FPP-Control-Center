'use client';

import { useEffect, useRef } from 'react';
import type { DisplayConfig } from '@/types/display';
import { PREVIEW_READY, type PreviewMessage, type PreviewScreen } from '@/lib/display-preview';

const SCREENS: { id: PreviewScreen; label: string }[] = [
  { id: 'playing', label: 'Playing' },
  { id: 'idle', label: 'Between songs' },
];

/**
 * A scaled copy of the sign with sample songs, in a frame. It is sent the settings as they are being edited,
 * so changes show before they are saved. The frame is a page of this site (/settings/display/preview).
 */
export default function DisplayPreview({
  config,
  screen,
  onScreenChange,
}: {
  config: DisplayConfig;
  screen: PreviewScreen;
  onScreenChange: (screen: PreviewScreen) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef<PreviewMessage | null>(null);

  function send() {
    const target = frame.current?.contentWindow;
    if (target && latest.current) target.postMessage(latest.current, window.location.origin);
  }

  // Send the draft whenever it changes
  useEffect(() => {
    latest.current = { type: 'display-preview', screen, config };
    send();
  }, [config, screen]);

  // The frame says when it is listening (on first load and on every reload), and gets the current draft then
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if ((event.data as { type?: unknown } | null)?.type === PREVIEW_READY.type) send();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div className="rounded-2xl border border-adm-line bg-adm-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-adm-muted">What the TV shows</h2>
        <div role="group" aria-label="Which screen to preview" className="flex overflow-hidden rounded-[10px] border border-adm-control-line">
          {SCREENS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onScreenChange(id)}
              aria-pressed={screen === id}
              className={`min-h-11 px-3 text-[13px] transition-colors ${
                screen === id ? 'bg-adm-accent font-semibold text-adm-accent-ink' : 'bg-adm-control text-adm-muted hover:text-adm-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative aspect-video w-full overflow-hidden rounded-[10px] bg-black">
        <iframe
          ref={frame}
          src="/settings/display/preview"
          title="Preview of the digital sign"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-adm-muted">
        A scaled copy of the real sign with sample songs, using what you have typed so far. Nothing is saved until you press Save.
      </p>
    </div>
  );
}
