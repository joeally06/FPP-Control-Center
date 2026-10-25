'use client';

import { useState, useEffect } from 'react';
import BannerSettings from '@/components/admin/BannerSettings';
import { formatDateTime } from '@/lib/time-utils';
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
  AdminH4,
  AdminText,
  AdminTextMuted,
  AdminTextSmall,
  AdminLabel,
  AdminValue,
  AdminSuccess,
  AdminError,
  AdminInfo,
} from '@/components/admin/Typography';

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
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH2>🎵 Jukebox Settings</AdminH2>
        <AdminTextMuted>Loading...</AdminTextMuted>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH2>🎵 Jukebox Settings</AdminH2>
        <AdminTextMuted>
          Configure song request behavior and rate limiting
        </AdminTextMuted>

        {success && <AdminSuccess className="mt-4">{success}</AdminSuccess>}
        {error && <AdminError className="mt-4">{error}</AdminError>}

        {/* Rate Limit Section */}
        <div className="mt-6 space-y-4">
          <div>
            <AdminH3>⏱️ Rate Limit</AdminH3>
            <AdminTextMuted>
              Maximum number of song requests per hour per visitor
            </AdminTextMuted>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max="10"
                value={rateLimit}
                onChange={(e) => setRateLimit(parseInt(e.target.value, 10))}
                className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #10b981 0%, #10b981 ${((rateLimit - 1) / 9) * 100}%, rgba(255,255,255,0.2) ${((rateLimit - 1) / 9) * 100}%, rgba(255,255,255,0.2) 100%)`
                }}
              />
              <div className="text-white font-bold text-2xl w-16 text-center">
                {rateLimit}
              </div>
            </div>

            <div className="flex justify-between text-sm text-white/60">
              <span>1 (Strict)</span>
              <span>5 (Moderate)</span>
              <span>10 (Generous)</span>
            </div>

            <AdminInfo>
              Current setting: <strong>{rateLimit} requests per hour</strong>
            </AdminInfo>
          </div>
        </div>

        {/* Insert Mode Section */}
        <div className="mt-8 space-y-4">
          <div>
            <AdminH3>🎶 Queue Insertion Behavior</AdminH3>
            <AdminTextMuted>
              How requested songs are inserted into the playlist
            </AdminTextMuted>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/20 cursor-pointer hover:bg-white/10 transition-all">
              <input
                type="radio"
                name="insertMode"
                value="after_current"
                checked={insertMode === 'after_current'}
                onChange={(e) => setInsertMode(e.target.value)}
                className="mt-1"
              />
              <div className="flex-1">
                <AdminLabel>🎵 After Current (Recommended)</AdminLabel>
                <AdminTextSmall className="text-white/60">
                  Request plays after the current song finishes. Provides smooth transitions without interruption.
                </AdminTextSmall>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/20 cursor-pointer hover:bg-white/10 transition-all">
              <input
                type="radio"
                name="insertMode"
                value="interrupt"
                checked={insertMode === 'interrupt'}
                onChange={(e) => setInsertMode(e.target.value)}
                className="mt-1"
              />
              <div className="flex-1">
                <AdminLabel>⚡ Interrupt</AdminLabel>
                <AdminTextSmall className="text-white/60">
                  Pauses current song, plays request, then resumes. Immediate but disruptive.
                </AdminTextSmall>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/20 cursor-pointer hover:bg-white/10 transition-all">
              <input
                type="radio"
                name="insertMode"
                value="end_of_playlist"
                checked={insertMode === 'end_of_playlist'}
                onChange={(e) => setInsertMode(e.target.value)}
                className="mt-1"
              />
              <div className="flex-1">
                <AdminLabel>📋 End of Playlist</AdminLabel>
                <AdminTextSmall className="text-white/60">
                  Adds request to the end of the queue. Longer wait time but no interruption.
                </AdminTextSmall>
              </div>
            </label>
          </div>

          <AdminInfo>
            Current mode: <strong>
              {insertMode === 'after_current' && '🎵 After Current'}
              {insertMode === 'interrupt' && '⚡ Interrupt'}
              {insertMode === 'end_of_playlist' && '📋 End of Playlist'}
            </strong>
          </AdminInfo>
        </div>

        {/* Visitor Page Section */}
        <div className="mt-8 space-y-4">
          <div>
            <AdminH3>📻 Visitor Page</AdminH3>
            <AdminTextMuted>
              What visitors see at the top of the jukebox page
            </AdminTextMuted>
          </div>

          <label className="block">
            <AdminLabel>Show name</AdminLabel>
            <input
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              maxLength={VISITOR_SETTING_LIMITS.site_name}
              placeholder="e.g. Lewis Family Light Show"
              className="mt-2 w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
            />
            <AdminTextSmall className="text-white/60 mt-1">
              Shown in the top bar and footer, in the active theme&apos;s lettering, and in place of the logo if none is uploaded.
            </AdminTextSmall>
          </label>

          <label className="block">
            <AdminLabel>FM frequency</AdminLabel>
            <input
              type="text"
              value={fmFrequency}
              onChange={(e) => setFmFrequency(e.target.value)}
              maxLength={VISITOR_SETTING_LIMITS.jukebox_fm_frequency}
              placeholder="e.g. 91.5 FM"
              className="mt-2 w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
            />
            <AdminTextSmall className="text-white/60 mt-1">
              Leave empty to hide the radio frequency (the Listen Online button still shows).
            </AdminTextSmall>
          </label>

          <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/20 cursor-pointer hover:bg-white/10 transition-all">
            <input
              type="checkbox"
              checked={courtesyEnabled}
              onChange={(e) => setCourtesyEnabled(e.target.checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <AdminLabel>🚗 Show the courtesy reminders card</AdminLabel>
              <AdminTextSmall className="text-white/60">
                A dismissible card with viewing reminders for visitors in cars.
              </AdminTextSmall>
            </div>
          </label>

          {courtesyEnabled && (
            <label className="block">
              <AdminLabel>Courtesy reminders (one per line, up to 5)</AdminLabel>
              <textarea
                value={courtesyText}
                onChange={(e) => setCourtesyText(e.target.value)}
                maxLength={VISITOR_SETTING_LIMITS.jukebox_courtesy_text}
                rows={4}
                placeholder={DEFAULT_COURTESY_TEXT}
                className="mt-2 w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
              />
              <AdminTextSmall className="text-white/60 mt-1">
                Leave empty to use the default reminders shown above.
              </AdminTextSmall>
            </label>
          )}

          <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/20 cursor-pointer hover:bg-white/10 transition-all">
            <input
              type="checkbox"
              checked={specsEnabled}
              onChange={(e) => setSpecsEnabled(e.target.checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <AdminLabel>💡 Show the &ldquo;Behind the pixels&rdquo; card</AdminLabel>
              <AdminTextSmall className="text-white/60">
                Facts about your display for curious visitors. Empty fields are hidden.
              </AdminTextSmall>
            </div>
          </label>

          {specsEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SHOW_SPEC_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <AdminLabel>{field.label}</AdminLabel>
                  <input
                    type="text"
                    value={specValues[field.key] || ''}
                    onChange={(e) => setSpecValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    maxLength={VISITOR_SETTING_LIMITS[field.key]}
                    placeholder={field.placeholder}
                    className="mt-2 w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
                  />
                </label>
              ))}
            </div>
          )}

          <label className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/20 cursor-pointer hover:bg-white/10 transition-all">
            <input
              type="checkbox"
              checked={audienceEnabled}
              onChange={(e) => setAudienceEnabled(e.target.checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <AdminLabel>👥 Show how many people are online</AdminLabel>
              <AdminTextSmall className="text-white/60">
                Shows &ldquo;N online now&rdquo;: devices with the jukebox page open in the last minute. It can&apos;t count radio-only listeners. Nothing is stored.
              </AdminTextSmall>
            </div>
          </label>
        </div>

        {/* Save Button */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '⏳ Saving...' : '💾 Save Settings'}
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <AdminH3>ℹ️ How It Works</AdminH3>
        <ul className="space-y-2 mt-4">
          <li><AdminTextSmall>• <strong>Rate Limiting:</strong> Prevents spam by limiting requests per visitor (tracked by IP)</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>After Current:</strong> Best user experience - no interruption, smooth transitions</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>Interrupt:</strong> Fastest response - request plays immediately</AdminTextSmall></li>
          <li><AdminTextSmall>• <strong>End of Playlist:</strong> Traditional queue - maintains playlist order</AdminTextSmall></li>
          <li><AdminTextSmall>• Settings take effect immediately for all new requests</AdminTextSmall></li>
          <li><AdminTextSmall>• Visitors see the current rate limit and queue behavior on the request page</AdminTextSmall></li>
        </ul>
      </div>

      {/* Sequence Cache Management */}
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <AdminH3>🎵 Song Cache Management</AdminH3>
            <AdminTextMuted>
              Refresh the list of available songs from FPP
            </AdminTextMuted>
          </div>
        </div>

        {/* Cache Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <AdminTextSmall className="mb-1">Cached Songs</AdminTextSmall>
            <AdminValue>{cacheInfo.count}</AdminValue>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <AdminTextSmall className="mb-1">Cache Status</AdminTextSmall>
            <AdminValue>
              {cacheInfo.count > 0 ? (
                <span className="text-green-400">✅ Active</span>
              ) : (
                <span className="text-yellow-400">⚠️ Empty</span>
              )}
            </AdminValue>
          </div>
        </div>

        {/* Refresh Button */}
        <div className="space-y-4">
          <button
            onClick={handleRefreshCache}
            disabled={refreshingCache}
            className="w-full px-6 py-3 bg-linear-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {refreshingCache ? '🔄 Refreshing...' : '🔄 Refresh Song Cache from FPP'}
          </button>

          <AdminTextSmall className="text-white/60">
            This fetches the latest playlist from your FPP server and updates the available songs for visitors to request.
          </AdminTextSmall>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <AdminH4>ℹ️ When to Refresh</AdminH4>
          <ul className="space-y-1 mt-2">
            <li><AdminTextSmall>• After adding or removing songs from your FPP playlist</AdminTextSmall></li>
            <li><AdminTextSmall>• After reordering songs in FPP</AdminTextSmall></li>
            <li><AdminTextSmall>• If visitors report missing songs</AdminTextSmall></li>
            <li><AdminTextSmall>• The cache also refreshes automatically in the background when admins visit the jukebox page</AdminTextSmall></li>
          </ul>
        </div>
      </div>

      <SongDetailsSettings reloadKey={songDetailsReload} />

      {/* Off-season message under the logo on the visitor page */}
      <BannerSettings />

      {/* User Rate Limit Management */}
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <AdminH3>👥 User Rate Limits</AdminH3>
            <AdminTextMuted>
              View and manage users with active requests in the last hour
            </AdminTextMuted>
          </div>
          <button
            onClick={fetchJukeboxUsers}
            disabled={loadingUsers}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loadingUsers ? '🔄 Loading...' : '🔄 Refresh'}
          </button>
        </div>

        {jukeboxUsers.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👻</div>
            <AdminH4 className="text-white/80 mb-2">No Active Users</AdminH4>
            <AdminTextMuted>No song requests in the last hour</AdminTextMuted>
          </div>
        ) : (
          <div className="space-y-3">
            {jukeboxUsers.map((user) => {
              const percentage = Math.min(100, (user.requestCount / rateLimit) * 100);
              const isAtLimit = user.requestCount >= rateLimit;
              
              return (
                <div 
                  key={user.ip}
                  className="bg-white/5 backdrop-blur-sm rounded-lg p-4 border border-white/20 hover:border-blue-400/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <AdminH4 className="text-white">{user.name}</AdminH4>
                        {isAtLimit && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-300 text-xs font-semibold rounded border border-red-500/30">
                            🚫 RATE LIMITED
                          </span>
                        )}
                      </div>
                      <AdminTextSmall className="text-white/50">
                        IP: {user.ip}
                      </AdminTextSmall>
                      <AdminTextSmall className="text-white/60">
                        Last request: {formatDateTime(user.lastRequest, 'relative')}
                      </AdminTextSmall>
                    </div>
                    
                    <button
                      onClick={() => handleClearUserRateLimit(user.ip, user.name)}
                      className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded transition-all shadow-md hover:shadow-lg"
                      title="Clear rate limit for this user"
                    >
                      🗑️ Clear
                    </button>
                  </div>

                  {/* Request count progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <AdminTextSmall className="text-white/70">
                        {user.requestCount} / {rateLimit} requests
                      </AdminTextSmall>
                      <AdminTextSmall className="text-white/70 font-semibold">
                        {Math.round(percentage)}%
                      </AdminTextSmall>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          percentage >= 100 ? 'bg-red-500' : 
                          percentage >= 80 ? 'bg-yellow-500' : 
                          'bg-green-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
          <div className="flex items-start gap-2">
            <span className="text-yellow-400 text-xl">💡</span>
            <div className="flex-1">
              <AdminTextSmall className="text-yellow-200">
                <strong>Tip:</strong> Clearing a user's rate limit removes their request history for the last hour and gives them their full allowance back immediately. A song of theirs that is playing right now keeps playing but no longer counts.
              </AdminTextSmall>
            </div>
          </div>
        </div>
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
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <AdminH3>🏷️ Song Details</AdminH3>
      <AdminTextMuted>
        Categories become filter buttons on the visitor song list. Titles and artists come from the Media Library; song lengths come from your FPP playlist when you refresh the song cache.
      </AdminTextMuted>

      {success && <AdminSuccess className="mt-4">{success}</AdminSuccess>}
      {error && <AdminError className="mt-4">{error}</AdminError>}

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
          <ul className="mt-4 space-y-2">
            {songs.map((song) => (
              <li key={song.name} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 p-3 bg-white/5 rounded-lg border border-white/10">
                <div className="flex-1 min-w-0">
                  <AdminText className="font-semibold truncate">{song.title || song.name}</AdminText>
                  <AdminTextSmall className="text-white/60 truncate">
                    {[song.artist || 'Unknown artist', song.durationSeconds != null ? formatClock(song.durationSeconds) : 'length unknown'].join(' · ')}
                  </AdminTextSmall>
                </div>
                <input
                  type="text"
                  list="song-category-suggestions"
                  value={categories[song.name] || ''}
                  onChange={(e) => setCategories((prev) => ({ ...prev, [song.name]: e.target.value }))}
                  maxLength={MAX_CATEGORY_LENGTH}
                  placeholder="Category"
                  aria-label={`Category for ${song.title || song.name}`}
                  className="w-full md:w-56 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
                />
              </li>
            ))}
          </ul>

          <div className="mt-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '⏳ Saving...' : '💾 Save Categories'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
