'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, CircleDashed, RefreshCw } from 'lucide-react';
import BannerSettings from '@/components/admin/BannerSettings';
import JukeboxSongs from '@/components/admin/JukeboxSongs';
import LocationRestrictions from '@/components/admin/LocationRestrictions';
import ThemeSettings from '@/components/admin/ThemeSettings';
import YouTubeVideoSettings from '@/components/admin/YouTubeVideoSettings';
import LiveStatus from '@/components/admin/jukebox/LiveStatus';
import { CountdownSettings, RequestRulesSettings, VisitorPageSettings } from '@/components/admin/JukeboxSettings';
import { accentButton, card, insetBox, notice, smallButton, tabClass } from '@/components/admin/ui-classes';
import type { AdminPlaylist } from '@/lib/jukebox-playlists';
import type { LiveStatus as LiveStatusData } from '@/lib/jukebox-live-status';
import type { AdminSong, ChecklistItem, SongFilter } from '@/lib/jukebox-songs';
import { formatDateTime } from '@/lib/time-utils';

export const TABS = [
  { id: 'songs', label: 'Playlists & songs' },
  { id: 'season', label: 'Season & countdown' },
  { id: 'rules', label: 'Request rules' },
  { id: 'visitor', label: 'Visitor page' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** One sentence at the top of each tab: what it is for */
const TAB_INTROS: Record<TabId, string> = {
  songs: 'Which playlists and songs visitors can request.',
  season: 'Which season the page shows, when the next show starts, and what it says between seasons.',
  rules: 'How many requests a visitor can make, where the queue puts them, and who can request from where.',
  visitor: 'The words and cards on the jukebox page: show name, radio frequency, reminders, facts and videos.',
};

export function toTab(value: string | undefined): TabId {
  // The Playlists tab was merged into this one; keep old links working
  if (value === 'playlists') return 'songs';
  return TABS.find((tab) => tab.id === value)?.id ?? 'songs';
}

const CHECK_ICONS = {
  ok: { Icon: CircleCheck, className: 'text-adm-ok', label: 'Ready' },
  warn: { Icon: CircleAlert, className: 'text-adm-warn', label: 'Needs attention' },
  todo: { Icon: CircleDashed, className: 'text-adm-faint', label: 'Not set up' },
} as const;

/** Settings → Jukebox: everything visitors can request and how the jukebox page looks, one tab per area. */
export default function JukeboxSetup({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<TabId>(toTab(initialTab));
  // Bumped after a sync so the song and playlist lists reload
  const [reloadKey, setReloadKey] = useState(0);
  const [cacheInfo, setCacheInfo] = useState<{ count: number; lastUpdated: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [setup, setSetup] = useState<{ songs: AdminSong[]; checklist: ChecklistItem[]; playlists: AdminPlaylist[]; live: LiveStatusData } | null>(null);
  const [savingStart, setSavingStart] = useState(false);
  // Goes up when the box clears the typed start, so the Countdown form drops its copy (its other unsaved edits stay)
  const [startClearedCount, setStartClearedCount] = useState(0);
  const [songFilter, setSongFilter] = useState<SongFilter>('all');
  // Changing it switches the Playlists & songs tab back to "All songs", which is the list the checklist counts
  const [songsKey, setSongsKey] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  // Bumped after a save on the Season & countdown or Visitor page tab so the preview frame reloads
  const [previewKey, setPreviewKey] = useState(0);
  const reloadPreview = () => setPreviewKey((n) => n + 1);
  // A save on those two tabs can change what the "What visitors see right now" box says (theme, typed start)
  const savedOnVisitorTab = () => {
    reloadPreview();
    fetchSetup();
  };

  useEffect(() => {
    fetchCacheInfo();
    fetchSetup();
  }, []);

  // Songs and the checklist, reloaded after anything that could change them
  async function fetchSetup() {
    try {
      const response = await fetch('/api/admin/jukebox-setup');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setSetup(await response.json());
    } catch (error) {
      console.error('Error fetching jukebox setup:', error);
      setMessage({ ok: false, text: '❌ Could not load the song list. Reload the page to try again.' });
    }
  }

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
    // Other tabs may have changed what the checklist reports
    fetchSetup();
  }

  // A button in the "What visitors see right now" box: open a tab, and put the cursor in the field it points at
  function openTabAt(id: TabId, focusId?: string) {
    selectTab(id);
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!focusId) return;
    // The tab's section is un-hidden on the next render
    requestAnimationFrame(() => {
      const field = document.getElementById(focusId);
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field?.focus();
    });
  }

  // Clear the typed "next show starts" so the countdown follows FPP's schedule again
  async function useScheduleStart() {
    setSavingStart(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { jukebox_countdown_start: '' } }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setMessage({ ok: true, text: "✅ The countdown now follows FPP's schedule." });
      setStartClearedCount((n) => n + 1);
      reloadPreview();
    } catch (error) {
      console.error('Error clearing the typed start time:', error);
      setMessage({ ok: false, text: '❌ Could not clear the start time. Try again from Season & countdown → Next show starts.' });
    } finally {
      await fetchSetup();
      setSavingStart(false);
    }
  }

  function openChecklistItem(item: ChecklistItem) {
    if (item.filter) {
      setSongFilter(item.filter);
      setSongsKey((n) => n + 1);
    }
    selectTab(item.tab);
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      await Promise.all([fetchCacheInfo(), fetchSetup()]);
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

      {setup?.live && (
        <LiveStatus
          live={setup.live}
          syncing={syncing}
          onSync={handleSync}
          onOpenTab={openTabAt}
          onUseScheduleStart={useScheduleStart}
          startSaving={savingStart}
        />
      )}

      {setup && (
        <section aria-labelledby="setup-checklist-title" className={`${card} mb-6`}>
          {(() => {
            const ready = setup.checklist.filter((item) => item.status === 'ok').length;
            const total = setup.checklist.length;
            return (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 id="setup-checklist-title" className="text-[15px] font-semibold text-adm-text">Setup checklist</h2>
                  <p className="mt-0.5 text-[13px] text-adm-muted">{ready} of {total} ready. Each item opens the place to fix it.</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-adm-line sm:w-60" role="presentation">
                  <div className="h-full rounded-full bg-adm-accent" style={{ width: `${Math.round((ready / total) * 100)}%` }} />
                </div>
              </div>
            );
          })()}
          <ul className="mt-4 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {setup.checklist.map((item) => {
              const { Icon, className, label } = CHECK_ICONS[item.status];
              const isSync = item.id === 'sync';
              return (
                <li key={item.id} className={`${insetBox} flex items-start gap-3`}>
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${className}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-adm-text">
                      {item.title} <span className="sr-only">({label})</span>
                    </p>
                    <p className="mt-0.5 text-[13px] text-adm-muted">{item.detail}</p>
                  </div>
                  <button
                    onClick={() => (isSync ? handleSync() : openChecklistItem(item))}
                    disabled={isSync && syncing}
                    className={`${smallButton} shrink-0`}
                  >
                    {isSync ? (syncing ? 'Syncing…' : 'Sync') : item.status === 'ok' ? 'Open' : 'Fix'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div ref={tabsRef} className="mb-6 flex scroll-mt-4 gap-1 overflow-x-auto border-b border-adm-line">
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => selectTab(id)} aria-pressed={tab === id} className={tabClass(tab === id)}>
            {label}
          </button>
        ))}
      </div>

      {/* Every tab stays mounted so unsaved edits survive switching tabs */}
      <section aria-label="Playlists and songs" hidden={tab !== 'songs'}>
        <TabIntro text={TAB_INTROS.songs} />
        <JukeboxSongs
          allSongsKey={songsKey}
          songs={setup?.songs ?? null}
          playlists={setup?.playlists ?? []}
          reloadKey={reloadKey}
          filter={songFilter}
          onFilterChange={setSongFilter}
          onChanged={fetchSetup}
        />
      </section>

      <section aria-label="Season and countdown" hidden={tab !== 'season'}>
        <TabIntro text={TAB_INTROS.season} />
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <ThemeSettings onSaved={savedOnVisitorTab} />
            <CountdownSettings startClearedCount={startClearedCount} onSaved={savedOnVisitorTab} />
            <div className="max-w-3xl">
              <BannerSettings onSaved={savedOnVisitorTab} />
            </div>
          </div>
          <PreviewAside id="season-preview-title" active={tab === 'season'} previewKey={previewKey} onReload={reloadPreview} />
        </div>
      </section>

      <section aria-label="Request rules" hidden={tab !== 'rules'}>
        <TabIntro text={TAB_INTROS.rules} />
        <div className="flex flex-col gap-4">
          <RequestRulesSettings />
          <LocationRestrictions />
        </div>
      </section>

      <section aria-label="Visitor page" hidden={tab !== 'visitor'}>
        <TabIntro text={TAB_INTROS.visitor} />
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <VisitorPageSettings onSaved={savedOnVisitorTab} />
            <YouTubeVideoSettings />
          </div>
          <PreviewAside id="visitor-preview-title" active={tab === 'visitor'} previewKey={previewKey} onReload={reloadPreview} />
        </div>
      </section>
    </div>
  );
}

function TabIntro({ text }: { text: string }) {
  return <p className="mb-4 text-sm text-adm-muted">{text}</p>;
}

/** The phone-sized preview of the visitor page, beside the forms that change it. */
function PreviewAside({ id, active, previewKey, onReload }: { id: string; active: boolean; previewKey: number; onReload: () => void }) {
  return (
    <aside aria-labelledby={id} className="flex flex-col items-center gap-3 xl:sticky xl:top-6 xl:w-[360px] xl:shrink-0">
      <div className="flex w-full max-w-[360px] items-center justify-between gap-3">
        <h2 id={id} className="text-xs font-semibold uppercase tracking-[0.08em] text-adm-muted">What visitors see</h2>
        <button onClick={onReload} className={smallButton}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Reload
        </button>
      </div>
      {/* Loaded only while its tab is open; a new key reloads it after a save */}
      {active && (
        <iframe
          key={previewKey}
          src="/settings/jukebox/preview"
          title="Preview of the visitor jukebox page"
          className="h-[640px] w-full max-w-[360px] rounded-[28px] border-8 border-adm-raised bg-black"
        />
      )}
      <p className="max-w-[360px] text-xs text-adm-muted">
        Shows your saved settings and reloads after each save. The song list, queue and videos are left out, and a courtesy card you dismissed in this browser stays hidden here too.
      </p>
    </aside>
  );
}
