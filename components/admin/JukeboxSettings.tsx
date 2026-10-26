'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import BannerSettings from '@/components/admin/BannerSettings';
import { formatDateTime } from '@/lib/time-utils';
import { THEME_PRESETS, type ThemeId } from '@/lib/themes/theme-config';
import {
  DEFAULT_COURTESY_TEXT,
  MAX_CATEGORY_LENGTH,
  SHOW_SPEC_FIELDS,
  SUGGESTED_CATEGORIES,
  VISITOR_SETTING_LIMITS,
  formatClock,
  songCategories,
  type CatalogSong,
} from '@/lib/jukebox-display';
import {
  AdminH2,
  AdminH3,
  AdminTextMuted,
  AdminLabel,
} from '@/components/admin/Typography';
import {
  accentButton, badge, button, card, checkInput, choiceCard, eyebrow, field, insetBox, notice, smallButton, smallDangerButton,
} from '@/components/admin/ui-classes';

interface JukeboxUser {
  ip: string;
  name: string;
  requestCount: number;
  lastRequest: string;
  firstRequest: string;
}

export default function JukeboxSettings() {
  const [rateLimit, setRateLimit] = useState<number>(3);
  const [insertMode, setInsertMode] = useState<string>('after_current');
  const [siteName, setSiteName] = useState('');
  const [fmFrequency, setFmFrequency] = useState('');
  const [courtesyEnabled, setCourtesyEnabled] = useState(false);
  const [courtesyText, setCourtesyText] = useState('');
  const [specsEnabled, setSpecsEnabled] = useState(false);
  const [specValues, setSpecValues] = useState<Record<string, string>>({});
  const [audienceEnabled, setAudienceEnabled] = useState(false);
  const [songDetailsReload, setSongDetailsReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [jukeboxUsers, setJukeboxUsers] = useState<JukeboxUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [refreshingCache, setRefreshingCache] = useState(false);
  const [cacheInfo, setCacheInfo] = useState<{ count: number; lastRefresh: string | null }>({ count: 0, lastRefresh: null });

  useEffect(() => {
    fetchSettings();
    fetchJukeboxUsers();
    fetchCacheInfo();
  }, []);

  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setRateLimit(parseInt(data.settings.jukebox_rate_limit || '3', 10));
        setInsertMode(data.settings.jukebox_insert_mode || 'after_current');
        setSiteName(data.settings.site_name || '');
        setFmFrequency(data.settings.jukebox_fm_frequency || '');
        setCourtesyEnabled(data.settings.jukebox_courtesy_enabled === 'true');
        setCourtesyText(data.settings.jukebox_courtesy_text || '');
        setSpecsEnabled(data.settings.jukebox_specs_enabled === 'true');
        setSpecValues(Object.fromEntries(SHOW_SPEC_FIELDS.map((field) => [field.key, data.settings[field.key] || ''])));
        setAudienceEnabled(data.settings.jukebox_audience_enabled === 'true');
      }
    } catch (err) {
      console.error('Error fetching jukebox settings:', err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function fetchJukeboxUsers() {
    setLoadingUsers(true);
    try {
      const response = await fetch('/api/jukebox/users');
      if (response.ok) {
        const data = await response.json();
        setJukeboxUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching jukebox users:', error);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function fetchCacheInfo() {
    try {
      const response = await fetch('/api/jukebox/sequences');
      if (response.ok) {
        const data = await response.json();
        setCacheInfo({
          count: data.sequences?.length || 0,
          lastRefresh: data.lastRefresh || null
        });
      }
    } catch (error) {
      console.error('Error fetching cache info:', error);
    }
  }

  async function handleRefreshCache() {
    setRefreshingCache(true);
    setSuccess('');
    setError('');

    try {
      const response = await fetch('/api/jukebox/refresh-cache', {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`✅ Cache refreshed! ${data.sequencesCached} sequences loaded.`);
        await fetchCacheInfo();
        setSongDetailsReload((n) => n + 1);
      } else {
        const errorMsg = data.details || data.error || 'Failed to refresh cache';
        if (data.error === 'FPP is offline') {
          setError('⚠️ FPP is offline. Cannot refresh cache at this time.');
        } else if (data.error === 'FPP server timeout') {
          setError('⏱️ FPP server timeout. The server may be offline or busy.');
        } else {
          setError(`❌ ${errorMsg}`);
        }
      }
    } catch (err) {
      console.error('Error refreshing cache:', err);
      setError('❌ Network error while refreshing cache.');
    } finally {
      setRefreshingCache(false);
      setTimeout(() => {
        setSuccess('');
        setError('');
      }, 5000);
    }
  }

  async function handleClearUserRateLimit(userIp: string, userName: string) {
    if (!confirm(`Clear rate limit for ${userName}? This will allow them to make new requests immediately.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/jukebox/users?ip=${encodeURIComponent(userIp)}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message);
        setTimeout(() => setSuccess(''), 3000);
        fetchJukeboxUsers(); // Refresh the list
      } else {
        setError(data.error || 'Failed to clear rate limit');
        setTimeout(() => setError(''), 3000);
      }
    } catch (error) {
      console.error('Error clearing rate limit:', error);
      setError('Failed to clear rate limit');
      setTimeout(() => setError(''), 3000);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSuccess('');
    setError('');

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            jukebox_rate_limit: rateLimit.toString(),
            jukebox_insert_mode: insertMode,
            site_name: siteName.trim(),
            jukebox_fm_frequency: fmFrequency.trim(),
            jukebox_courtesy_enabled: courtesyEnabled ? 'true' : 'false',
            jukebox_courtesy_text: courtesyText.trim(),
            jukebox_specs_enabled: specsEnabled ? 'true' : 'false',
            ...Object.fromEntries(SHOW_SPEC_FIELDS.map((field) => [field.key, (specValues[field.key] || '').trim()])),
            jukebox_audience_enabled: audienceEnabled ? 'true' : 'false'
          }
        })
      });

      if (response.ok) {
        setSuccess('✅ Settings saved successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={card}>
        <AdminH2>Jukebox Settings</AdminH2>
        <AdminTextMuted>Loading...</AdminTextMuted>
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className={card}>
        <AdminH2 className="mb-1">Jukebox Settings</AdminH2>
        <AdminTextMuted>
          How song requests work. Saved changes apply to new requests straight away, and visitors see the limit and queue behaviour on the request page.
        </AdminTextMuted>

        {success && <p className={`${notice.ok} mt-4`}>{success}</p>}
        {error && <p className={`${notice.danger} mt-4`}>{error}</p>}

        {/* Rate Limit Section */}
        <section className="mt-6 border-t border-adm-line pt-5">
          <AdminH3 className="mb-0.5">Rate limit</AdminH3>
          <AdminTextMuted>Maximum number of song requests per hour per visitor (tracked by IP)</AdminTextMuted>
          <div className="mt-4 flex items-center gap-4">
            <input
              type="range"
              min="1"
              max="10"
              value={rateLimit}
              onChange={(e) => setRateLimit(parseInt(e.target.value, 10))}
              aria-label="Requests per visitor per hour"
              className="h-7 flex-1 cursor-pointer accent-adm-accent"
            />
            <span className="w-16 text-center font-mono text-2xl font-semibold text-adm-text">{rateLimit}</span>
          </div>
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-adm-muted">1 (strict)</span>
            <span className="text-adm-muted">5 (moderate)</span>
            <span className="text-adm-muted">10 (generous)</span>
          </div>
        </section>

        {/* Insert Mode Section */}
        <section className="mt-6 border-t border-adm-line pt-5">
          <AdminH3 className="mb-0.5">Queue insertion behavior</AdminH3>
          <AdminTextMuted>How requested songs are inserted into the playlist</AdminTextMuted>
          <div className="mt-4 flex flex-col gap-2.5">
            <label className={choiceCard}>
              <input
                type="radio"
                name="insertMode"
                value="after_current"
                checked={insertMode === 'after_current'}
                onChange={(e) => setInsertMode(e.target.value)}
                className={checkInput}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-adm-text">
                  After Current <span className="ml-1.5 text-[11px] font-semibold text-adm-warn">Recommended</span>
                </p>
                <p className="mt-0.5 text-[13px] text-adm-muted">
                  Request plays after the current song finishes. Provides smooth transitions without interruption.
                </p>
              </div>
            </label>

            <label className={choiceCard}>
              <input
                type="radio"
                name="insertMode"
                value="interrupt"
                checked={insertMode === 'interrupt'}
                onChange={(e) => setInsertMode(e.target.value)}
                className={checkInput}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-adm-text">Interrupt</p>
                <p className="mt-0.5 text-[13px] text-adm-muted">
                  Pauses current song, plays request, then resumes. Immediate but disruptive.
                </p>
              </div>
            </label>

            <label className={choiceCard}>
              <input
                type="radio"
                name="insertMode"
                value="end_of_playlist"
                checked={insertMode === 'end_of_playlist'}
                onChange={(e) => setInsertMode(e.target.value)}
                className={checkInput}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-adm-text">End of Playlist</p>
                <p className="mt-0.5 text-[13px] text-adm-muted">
                  Adds request to the end of the queue. Longer wait time but no interruption.
                </p>
              </div>
            </label>
          </div>
        </section>

        {/* Visitor Page Section */}
        <section className="mt-6 flex flex-col gap-4 border-t border-adm-line pt-5">
          <div>
            <AdminH3 className="mb-0.5">Visitor page</AdminH3>
            <AdminTextMuted>What visitors see at the top of the jukebox page</AdminTextMuted>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <AdminLabel htmlFor="jukebox-site-name">Show name</AdminLabel>
              <input
                id="jukebox-site-name"
                type="text"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                maxLength={VISITOR_SETTING_LIMITS.site_name}
                placeholder="e.g. Lewis Family Light Show"
                className={field}
              />
              <p className="mt-1 text-xs text-adm-muted">
                Shown in the top bar and footer, in the active theme&apos;s lettering, and in place of the logo if none is uploaded.
              </p>
            </div>

            <div>
              <AdminLabel htmlFor="jukebox-fm-frequency">FM frequency</AdminLabel>
              <input
                id="jukebox-fm-frequency"
                type="text"
                value={fmFrequency}
                onChange={(e) => setFmFrequency(e.target.value)}
                maxLength={VISITOR_SETTING_LIMITS.jukebox_fm_frequency}
                placeholder="e.g. 91.5 FM"
                className={field}
              />
              <p className="mt-1 text-xs text-adm-muted">
                Leave empty to hide the radio frequency (the Listen Online button still shows).
              </p>
            </div>
          </div>

          <label className={choiceCard}>
            <input
              type="checkbox"
              checked={courtesyEnabled}
              onChange={(e) => setCourtesyEnabled(e.target.checked)}
              className={checkInput}
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-adm-text">Show the courtesy reminders card</p>
              <p className="mt-0.5 text-[13px] text-adm-muted">
                A dismissible card with viewing reminders for visitors in cars.
              </p>
            </div>
          </label>

          {courtesyEnabled && (
            <div>
              <AdminLabel htmlFor="jukebox-courtesy-text">Courtesy reminders (one per line, up to 5)</AdminLabel>
              <textarea
                id="jukebox-courtesy-text"
                value={courtesyText}
                onChange={(e) => setCourtesyText(e.target.value)}
                maxLength={VISITOR_SETTING_LIMITS.jukebox_courtesy_text}
                rows={4}
                placeholder={DEFAULT_COURTESY_TEXT}
                className={field}
              />
              <p className="mt-1 text-xs text-adm-muted">
                Leave empty to use the default reminders shown above.
              </p>
            </div>
          )}

          <label className={choiceCard}>
            <input
              type="checkbox"
              checked={specsEnabled}
              onChange={(e) => setSpecsEnabled(e.target.checked)}
              className={checkInput}
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-adm-text">Show the &ldquo;Behind the pixels&rdquo; card</p>
              <p className="mt-0.5 text-[13px] text-adm-muted">
                Facts about your display for curious visitors. Empty fields are hidden.
              </p>
            </div>
          </label>

          {specsEnabled && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {SHOW_SPEC_FIELDS.map((specField) => (
                <div key={specField.key}>
                  <AdminLabel htmlFor={`jukebox-spec-${specField.key}`}>{specField.label}</AdminLabel>
                  <input
                    id={`jukebox-spec-${specField.key}`}
                    type="text"
                    value={specValues[specField.key] || ''}
                    onChange={(e) => setSpecValues((prev) => ({ ...prev, [specField.key]: e.target.value }))}
                    maxLength={VISITOR_SETTING_LIMITS[specField.key]}
                    placeholder={specField.placeholder}
                    className={field}
                  />
                </div>
              ))}
            </div>
          )}

          <label className={choiceCard}>
            <input
              type="checkbox"
              checked={audienceEnabled}
              onChange={(e) => setAudienceEnabled(e.target.checked)}
              className={checkInput}
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-adm-text">Show how many people are online</p>
              <p className="mt-0.5 text-[13px] text-adm-muted">
                Shows &ldquo;N online now&rdquo;: devices with the jukebox page open in the last minute. It can&apos;t count radio-only listeners. Nothing is stored.
              </p>
            </div>
          </label>
        </section>

        {/* Save Button */}
        <div className="mt-6 flex gap-3 border-t border-adm-line pt-5">
          <button onClick={handleSave} disabled={saving} className={accentButton}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>

      {/* Sequence Cache Management */}
      <div className={card}>
        <AdminH3 className="mb-0.5">Song cache</AdminH3>
        <AdminTextMuted>Refresh the list of available songs from FPP</AdminTextMuted>

        {/* Cache Status */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className={insetBox}>
            <p className={eyebrow}>Cached songs</p>
            <p className="mt-1 font-mono text-2xl font-semibold text-adm-text">{cacheInfo.count}</p>
          </div>
          <div className={insetBox}>
            <p className={eyebrow}>Cache status</p>
            {cacheInfo.count > 0 ? (
              <p className="mt-1 text-lg font-semibold text-adm-ok">Active</p>
            ) : (
              <p className="mt-1 text-lg font-semibold text-adm-warn">Empty</p>
            )}
          </div>
        </div>

        {/* Refresh Button */}
        <button onClick={handleRefreshCache} disabled={refreshingCache} className={`${button} mt-4 w-full`}>
          <RefreshCw className={`h-4 w-4 ${refreshingCache ? 'animate-spin' : ''}`} aria-hidden="true" />
          {refreshingCache ? 'Refreshing…' : 'Refresh song cache from FPP'}
        </button>
        <p className="mt-2 text-[13px] text-adm-muted">
          This fetches the latest playlist from your FPP server and updates the available songs for visitors to request.
        </p>

        {/* Info Box */}
        <div className={`${notice.info} mt-4`}>
          <p className="font-medium text-adm-info">When to refresh</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            <li className="text-adm-info">After adding or removing songs from your FPP playlist</li>
            <li className="text-adm-info">After reordering songs in FPP</li>
            <li className="text-adm-info">If visitors report missing songs</li>
            <li className="text-adm-info">The cache also refreshes automatically in the background when admins visit the jukebox page</li>
          </ul>
        </div>
      </div>

      <SongDetailsSettings reloadKey={songDetailsReload} />

      <PlaylistSettings reloadKey={songDetailsReload} />

      {/* Off-season message under the logo on the visitor page */}
      <BannerSettings />

      {/* User Rate Limit Management */}
      <div className={card}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <AdminH3 className="mb-0.5">User rate limits</AdminH3>
            <AdminTextMuted>View and manage users with active requests in the last hour</AdminTextMuted>
          </div>
          <button onClick={fetchJukeboxUsers} disabled={loadingUsers} className={smallButton}>
            <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin' : ''}`} aria-hidden="true" />
            {loadingUsers ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {jukeboxUsers.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-adm-soft">No active users</p>
            <p className="mt-1 text-[13px] text-adm-muted">No song requests in the last hour</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {jukeboxUsers.map((user) => {
              const percentage = Math.min(100, (user.requestCount / rateLimit) * 100);
              const isAtLimit = user.requestCount >= rateLimit;

              return (
                <li key={user.ip} className={insetBox}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-adm-text">{user.name}</p>
                        {isAtLimit && <span className={badge.danger}>Rate limited</span>}
                      </div>
                      <p className="font-mono text-xs text-adm-faint">IP: {user.ip}</p>
                      <p className="text-xs text-adm-muted">Last request: {formatDateTime(user.lastRequest, 'relative')}</p>
                    </div>
                    <button
                      onClick={() => handleClearUserRateLimit(user.ip, user.name)}
                      className={smallDangerButton}
                      title="Clear rate limit for this user"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Request count progress bar */}
                  <div className="flex justify-between text-xs">
                    <span className="text-adm-muted">{user.requestCount} / {rateLimit} requests</span>
                    <span className="font-semibold text-adm-muted">{Math.round(percentage)}%</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-adm-line">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        percentage >= 100 ? 'bg-adm-danger' :
                        percentage >= 80 ? 'bg-adm-warn' :
                        'bg-adm-ok'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className={`${notice.warn} mt-4`}>
          <strong>Tip:</strong> Clearing a user's rate limit removes their request history for the last hour and gives them their full allowance back immediately. A song of theirs that is playing right now keeps playing but no longer counts.
        </p>
      </div>
    </div>
  );
}

function SongDetailsSettings({ reloadKey }: { reloadKey: number }) {
  const [songs, setSongs] = useState<CatalogSong[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchSongs() {
      try {
        const response = await fetch('/api/jukebox/sequences');
        if (response.ok) {
          const data = await response.json();
          const list: CatalogSong[] = Array.isArray(data.songs) ? data.songs : [];
          setSongs(list);
          setCategories(Object.fromEntries(list.map((song) => [song.name, song.category || ''])));
        }
      } catch (err) {
        console.error('Error fetching songs:', err);
        setError('Failed to load songs');
      } finally {
        setLoading(false);
      }
    }
    fetchSongs();
  }, [reloadKey]);

  async function handleSave() {
    setSaving(true);
    setSuccess('');
    setError('');

    try {
      const response = await fetch('/api/jukebox/song-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories })
      });

      if (response.ok) {
        setSuccess('✅ Categories saved!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save categories');
      }
    } catch (err) {
      console.error('Error saving categories:', err);
      setError('Failed to save categories');
    } finally {
      setSaving(false);
    }
  }

  // Suggestions: the usual ones plus anything already in use
  const suggestions = [...new Set([...SUGGESTED_CATEGORIES, ...songCategories(songs.map((song) => ({ ...song, category: categories[song.name] || null })))])];

  return (
    <div className={card}>
      <AdminH3 className="mb-0.5">Song details</AdminH3>
      <AdminTextMuted>
        Categories become filter buttons on the visitor song list. Titles and artists come from the Media Library; song lengths come from your FPP playlist when you refresh the song cache.
      </AdminTextMuted>

      {success && <p className={`${notice.ok} mt-4`}>{success}</p>}
      {error && <p className={`${notice.danger} mt-4`}>{error}</p>}

      {loading ? (
        <AdminTextMuted className="mt-4">Loading...</AdminTextMuted>
      ) : songs.length === 0 ? (
        <AdminTextMuted className="mt-4">No songs cached yet. Refresh the song cache above first.</AdminTextMuted>
      ) : (
        <>
          <datalist id="song-category-suggestions">
            {suggestions.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <ul className="mt-4 flex flex-col gap-2">
            {songs.map((song) => (
              <li key={song.name} className="flex flex-col gap-2 rounded-xl border border-adm-line bg-adm-side p-3 md:flex-row md:items-center md:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-adm-text">{song.title || song.name}</p>
                  <p className="truncate text-xs text-adm-muted">
                    {[song.artist || 'Unknown artist', song.durationSeconds != null ? formatClock(song.durationSeconds) : 'length unknown'].join(' · ')}
                  </p>
                </div>
                <input
                  type="text"
                  list="song-category-suggestions"
                  value={categories[song.name] || ''}
                  onChange={(e) => setCategories((prev) => ({ ...prev, [song.name]: e.target.value }))}
                  maxLength={MAX_CATEGORY_LENGTH}
                  placeholder="Category"
                  aria-label={`Category for ${song.title || song.name}`}
                  className={`${field} md:w-56`}
                />
              </li>
            ))}
          </ul>

          <div className="mt-5">
            <button onClick={handleSave} disabled={saving} className={accentButton}>
              {saving ? 'Saving…' : 'Save categories'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface AdminPlaylist {
  name: string;
  theme: ThemeId | null;
  itemCount: number;
  durationSeconds: number | null;
}

function PlaylistSettings({ reloadKey }: { reloadKey: number }) {
  const [playlists, setPlaylists] = useState<AdminPlaylist[]>([]);
  const [themes, setThemes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchPlaylists() {
      try {
        const response = await fetch('/api/jukebox/playlist-themes');
        if (response.ok) {
          const data = await response.json();
          const list: AdminPlaylist[] = Array.isArray(data.playlists) ? data.playlists : [];
          setPlaylists(list);
          setThemes(Object.fromEntries(list.map((playlist) => [playlist.name, playlist.theme || ''])));
        }
      } catch (err) {
        console.error('Error fetching playlists:', err);
        setError('Failed to load playlists');
      } finally {
        setLoading(false);
      }
    }
    fetchPlaylists();
  }, [reloadKey]);

  async function handleSave() {
    setSaving(true);
    setSuccess('');
    setError('');

    try {
      const response = await fetch('/api/jukebox/playlist-themes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themes })
      });

      if (response.ok) {
        setSuccess('✅ Playlists saved!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save playlists');
      }
    } catch (err) {
      console.error('Error saving playlists:', err);
      setError('Failed to save playlists');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={card}>
      <AdminH3 className="mb-0.5">Playlists</AdminH3>
      <AdminTextMuted>
        Visitors can request a whole playlist; it starts when the current song ends, and the scheduled show carries on afterwards. Only playlists tagged with the active theme are offered, one in line at a time. New FPP playlists appear here after you refresh the song cache and start out hidden.
      </AdminTextMuted>

      {success && <p className={`${notice.ok} mt-4`}>{success}</p>}
      {error && <p className={`${notice.danger} mt-4`}>{error}</p>}

      {loading ? (
        <AdminTextMuted className="mt-4">Loading...</AdminTextMuted>
      ) : playlists.length === 0 ? (
        <AdminTextMuted className="mt-4">No playlists yet. Refresh the song cache above first.</AdminTextMuted>
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-2">
            {playlists.map((playlist) => (
              <li key={playlist.name} className="flex flex-col gap-2 rounded-xl border border-adm-line bg-adm-side p-3 md:flex-row md:items-center md:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-adm-text">{playlist.name}</p>
                  <p className="truncate text-xs text-adm-muted">
                    {[
                      `${playlist.itemCount} ${playlist.itemCount === 1 ? 'song' : 'songs'}`,
                      playlist.durationSeconds != null ? formatClock(playlist.durationSeconds) : 'length unknown',
                    ].join(' · ')}
                  </p>
                </div>
                <select
                  value={themes[playlist.name] || ''}
                  onChange={(e) => setThemes((prev) => ({ ...prev, [playlist.name]: e.target.value }))}
                  aria-label={`Theme for ${playlist.name}`}
                  className={`${field} md:w-56`}
                >
                  <option value="">Hidden</option>
                  {Object.values(THEME_PRESETS).map((theme) => (
                    <option key={theme.id} value={theme.id}>{theme.name}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>

          <div className="mt-5">
            <button onClick={handleSave} disabled={saving} className={accentButton}>
              {saving ? 'Saving…' : 'Save playlists'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
