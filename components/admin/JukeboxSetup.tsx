'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import BannerSettings from '@/components/admin/BannerSettings';
import LocationRestrictions from '@/components/admin/LocationRestrictions';
import ThemeSettings from '@/components/admin/ThemeSettings';
import YouTubeVideoSettings from '@/components/admin/YouTubeVideoSettings';
import {
  PlaylistSettings,
  RequestRulesSettings,
  SongDetailsSettings,
  VisitorPageSettings,
} from '@/components/admin/JukeboxSettings';
import { AdminH3, AdminTextMuted } from '@/components/admin/Typography';
import { accentButton, card, notice, tabClass, textLink } from '@/components/admin/ui-classes';
import { formatDateTime } from '@/lib/time-utils';

const TABS = [
  { id: 'songs', label: 'Songs' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'rules', label: 'Request rules' },
  { id: 'visitor', label: 'Visitor page' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function toTab(value: string | undefined): TabId {
  return TABS.find((tab) => tab.id === value)?.id ?? 'songs';
}

/** Settings → Jukebox: everything visitors can request and how the jukebox page looks, one tab per area. */
export default function JukeboxSetup({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<TabId>(toTab(initialTab));
  // Bumped after a sync so the song and playlist lists reload
  const [reloadKey, setReloadKey] = useState(0);
  const [cacheInfo, setCacheInfo] = useState<{ count: number; lastUpdated: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchCacheInfo();
  }, []);

  async function fetchCacheInfo() {
    try {
      const response = await fetch('/api/jukebox/sequences');
      if (response.ok) {
        const data = await response.json();
        setCacheInfo({ count: data.count || 0, lastUpdated: data.lastUpdated || null });
      }
    } catch (error) {
      console.error('Error fetching cache info:', error);
    }
  }

  function selectTab(id: TabId) {
    setTab(id);
    // Keep the tab in the address so a reload or a shared link opens the same one
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.replaceState(null, '', url);
  }

  // One button for both FPP caches: the songs and playlists visitors can request,
  // then the Media library's copy of every playlist (it holds the audio file names)
  async function handleSync() {
    setSyncing(true);
    setMessage(null);

    try {
      const songsResponse = await fetch('/api/jukebox/refresh-cache', { method: 'POST' });
      const songs = await songsResponse.json().catch(() => ({}));

      if (!songs.success) {
        if (songs.error === 'FPP is offline') {
          setMessage({ ok: false, text: '⚠️ FPP is offline. Cannot sync at this time.' });
        } else if (songs.error === 'FPP server timeout') {
          setMessage({ ok: false, text: '⏱️ FPP server timeout. The server may be offline or busy.' });
        } else {
          setMessage({ ok: false, text: `❌ ${songs.details || songs.error || 'Failed to sync from FPP'}` });
        }
        return;
      }

      const mediaResponse = await fetch('/api/fpp/sync', { method: 'POST' });
      const media = await mediaResponse.json().catch(() => ({}));

      const synced = `${songs.sequencesCached} songs${songs.playlistsCached != null ? ` and ${songs.playlistsCached} playlists` : ''}`;
      if (media.success) {
        setMessage({ ok: true, text: `✅ Synced ${synced} from FPP.` });
      } else {
        setMessage({ ok: false, text: `⚠️ Synced ${synced}, but the Media library sync failed: ${media.error || 'unknown error'}` });
      }
    } catch (error) {
      console.error('Error syncing from FPP:', error);
      setMessage({ ok: false, text: '❌ Network error while syncing from FPP.' });
    } finally {
      await fetchCacheInfo();
      setReloadKey((n) => n + 1);
      setSyncing(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-adm-text sm:text-3xl">Jukebox</h1>
          <p className="text-sm text-adm-muted sm:text-base">Everything visitors can request, and how the jukebox page looks.</p>
        </div>
        <div className="flex flex-col gap-1.5 sm:items-end">
          <button onClick={handleSync} disabled={syncing} className={accentButton}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {syncing ? 'Syncing…' : 'Sync from FPP'}
          </button>
          {cacheInfo && (
            <p className="text-[13px] text-adm-muted">
              {cacheInfo.count} {cacheInfo.count === 1 ? 'song' : 'songs'} ·{' '}
              {cacheInfo.lastUpdated ? `synced ${formatDateTime(cacheInfo.lastUpdated, 'relative')}` : 'not synced yet'}
            </p>
          )}
        </div>
      </div>

      {message && (
        <p role="status" className={`${message.ok ? notice.ok : notice.danger} mb-4`}>{message.text}</p>
      )}

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-adm-line">
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => selectTab(id)} aria-pressed={tab === id} className={tabClass(tab === id)}>
            {label}
          </button>
        ))}
      </div>

      {/* Every tab stays mounted so unsaved edits survive switching tabs */}
      <section aria-label="Songs" hidden={tab !== 'songs'} className="flex max-w-3xl flex-col gap-4">
        <div className={card}>
          <AdminH3 className="mb-0.5">Artwork, titles and phone audio</AdminH3>
          <AdminTextMuted>
            Song titles, artists and album art, and the audio visitors hear on their phones, are edited in the Media library for now.
          </AdminTextMuted>
          <Link href="/media" className={`${textLink} mt-3 inline-block`}>Open the Media library</Link>
        </div>
        <SongDetailsSettings reloadKey={reloadKey} />
      </section>

      <section aria-label="Playlists" hidden={tab !== 'playlists'} className="max-w-3xl">
        <PlaylistSettings reloadKey={reloadKey} />
      </section>

      <section aria-label="Request rules" hidden={tab !== 'rules'} className="flex flex-col gap-4">
        <RequestRulesSettings />
        <LocationRestrictions />
      </section>

      <section aria-label="Visitor page" hidden={tab !== 'visitor'} className="flex flex-col gap-6">
        <ThemeSettings />
        <div className="flex max-w-3xl flex-col gap-4">
          <VisitorPageSettings />
          <BannerSettings />
          <YouTubeVideoSettings />
        </div>
      </section>
    </div>
  );
}
