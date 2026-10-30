'use client';

import { useEffect, useState } from 'react';
import type { DisplayConfig } from '@/types/display';
import { DEFAULT_DISPLAY_CONFIG } from '@/lib/display-defaults';
import {
  PREVIEW_READY, parsePreviewMessage, sampleNowPlaying, sanitizePreviewConfig, type PreviewScreen,
} from '@/lib/display-preview';
import NowPlayingView from '@/components/display/NowPlayingView';
import IdleScreen from '@/components/display/IdleScreen';

/**
 * The digital sign with sample songs, shown in a frame on Settings → Digital Sign. It starts from the saved settings
 * and then follows the settings page, which sends the form as it is being edited. Unlike /display it opens no
 * connection to FPP and records nothing.
 */
export default function DisplayPreviewPage() {
  const [config, setConfig] = useState<DisplayConfig>(DEFAULT_DISPLAY_CONFIG);
  const [screen, setScreen] = useState<PreviewScreen>('idle');
  // The visitor page address the QR code points at; the real one is filled in once the page is in the browser
  const [jukeboxUrl, setJukeboxUrl] = useState('/jukebox');

  useEffect(() => {
    // Saved settings until the settings page sends a draft
    fetch('/api/display/config')
      .then((res) => res.json())
      .then((data) => setConfig((current) => (current === DEFAULT_DISPLAY_CONFIG ? sanitizePreviewConfig(data) : current)))
      .catch(() => {});

    function onMessage(event: MessageEvent) {
      // Only the settings page that framed this one, from this site
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const message = parsePreviewMessage(event.data);
      if (!message) return;
      setConfig(message.config);
      setScreen(message.screen);
    }
    window.addEventListener('message', onMessage);
    // Ask for the current draft in case the settings page sent it before this page was listening
    if (window.parent !== window) window.parent.postMessage(PREVIEW_READY, window.location.origin);
    const timer = setTimeout(() => setJukeboxUrl(`${window.location.origin}/jukebox`), 0);
    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black" style={{ fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)' }}>
      {screen === 'playing'
        ? <NowPlayingView state={sampleNowPlaying(config, jukeboxUrl)} />
        : <IdleScreen jukeboxUrl={jukeboxUrl} config={config} activeAnnouncement={null} />}
    </div>
  );
}
