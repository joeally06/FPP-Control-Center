'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatDateTime } from '@/lib/time-utils';
import {
  DEFAULT_COUNTDOWN_HEADING,
  DEFAULT_COURTESY_TEXT,
  SHOW_SPEC_FIELDS,
  VISITOR_SETTING_LIMITS,
} from '@/lib/jukebox-display';
import {
  AdminH2,
  AdminH3,
  AdminTextMuted,
  AdminLabel,
} from '@/components/admin/Typography';
import {
  accentButton, badge, card, checkInput, choiceCard, field, insetBox, notice, smallButton, smallDangerButton,
} from '@/components/admin/ui-classes';

interface JukeboxUser {
  ip: string;
  name: string;
  requestCount: number;
  lastRequest: string;
  firstRequest: string;
}

/** Jukebox → Request rules: how many requests a visitor gets and where they go in the show. */
export function RequestRulesSettings() {
  const [rateLimit, setRateLimit] = useState<number>(3);
  const [insertMode, setInsertMode] = useState<string>('after_current');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [jukeboxUsers, setJukeboxUsers] = useState<JukeboxUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchJukeboxUsers();
  }, []);

  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        setRateLimit(parseInt(data.settings.jukebox_rate_limit || '3', 10));
        setInsertMode(data.settings.jukebox_insert_mode || 'after_current');
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
            jukebox_insert_mode: insertMode
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
        <AdminH2>Song requests</AdminH2>
        <AdminTextMuted>Loading...</AdminTextMuted>
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className={card}>
        <AdminH2 className="mb-1">Song requests</AdminH2>
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

        {/* Save Button */}
        <div className="mt-6 flex gap-3 border-t border-adm-line pt-5">
          <button onClick={handleSave} disabled={saving} className={accentButton}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>

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
          <strong>Tip:</strong> Clearing a user&apos;s rate limit removes their request history for the last hour and gives them their full allowance back immediately. A song of theirs that is playing right now keeps playing but no longer counts.
        </p>
      </div>
    </div>
  );
}

/** Jukebox → Visitor page: the show name, radio frequency and optional cards on the visitor page. */
export function VisitorPageSettings({ onSaved }: { onSaved?: () => void }) {
  const [siteName, setSiteName] = useState('');
  const [fmFrequency, setFmFrequency] = useState('');
  const [courtesyEnabled, setCourtesyEnabled] = useState(false);
  const [courtesyText, setCourtesyText] = useState('');
  const [specsEnabled, setSpecsEnabled] = useState(false);
  const [specValues, setSpecValues] = useState<Record<string, string>>({});
  const [audienceEnabled, setAudienceEnabled] = useState(false);
  const [countdownEnabled, setCountdownEnabled] = useState(true);
  const [countdownHeading, setCountdownHeading] = useState('');
  const [countdownStart, setCountdownStart] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          setSiteName(data.settings.site_name || '');
          setFmFrequency(data.settings.jukebox_fm_frequency || '');
          setCourtesyEnabled(data.settings.jukebox_courtesy_enabled === 'true');
          setCourtesyText(data.settings.jukebox_courtesy_text || '');
          setSpecsEnabled(data.settings.jukebox_specs_enabled === 'true');
          setSpecValues(Object.fromEntries(SHOW_SPEC_FIELDS.map((field) => [field.key, data.settings[field.key] || ''])));
          setAudienceEnabled(data.settings.jukebox_audience_enabled === 'true');
          setCountdownEnabled(data.settings.jukebox_countdown_enabled !== 'false');
          setCountdownHeading(data.settings.jukebox_countdown_heading || '');
          setCountdownStart(data.settings.jukebox_countdown_start || '');
        }
      } catch (err) {
        console.error('Error fetching visitor page settings:', err);
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

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
            site_name: siteName.trim(),
            jukebox_fm_frequency: fmFrequency.trim(),
            jukebox_courtesy_enabled: courtesyEnabled ? 'true' : 'false',
            jukebox_courtesy_text: courtesyText.trim(),
            jukebox_specs_enabled: specsEnabled ? 'true' : 'false',
            ...Object.fromEntries(SHOW_SPEC_FIELDS.map((field) => [field.key, (specValues[field.key] || '').trim()])),
            jukebox_audience_enabled: audienceEnabled ? 'true' : 'false',
            jukebox_countdown_enabled: countdownEnabled ? 'true' : 'false',
            jukebox_countdown_heading: countdownHeading.trim(),
            jukebox_countdown_start: countdownStart,
          }
        })
      });

      if (response.ok) {
        setSuccess('✅ Settings saved successfully!');
        setTimeout(() => setSuccess(''), 3000);
        onSaved?.();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save settings');
      }
    } catch (err) {
      console.error('Error saving visitor page settings:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={card}>
        <AdminH2>Visitor page</AdminH2>
        <AdminTextMuted>Loading...</AdminTextMuted>
      </div>
    );
  }

  return (
    <div className={`${card} flex max-w-3xl flex-col gap-4`}>
      <div>
        <AdminH2 className="mb-1">Visitor page</AdminH2>
        <AdminTextMuted>What visitors see at the top of the jukebox page</AdminTextMuted>
      </div>

      {success && <p className={notice.ok}>{success}</p>}
      {error && <p className={notice.danger}>{error}</p>}

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
          checked={countdownEnabled}
          onChange={(e) => setCountdownEnabled(e.target.checked)}
          className={checkInput}
        />
        <div className="flex-1">
          <p className="text-sm font-medium text-adm-text">Show a countdown to the next show</p>
          <p className="mt-0.5 text-[13px] text-adm-muted">
            Shown while no show is running, counting down to the next start in FPP&apos;s Scheduler, even weeks away between seasons.
          </p>
        </div>
      </label>

      {countdownEnabled && (
        <div>
          <AdminLabel htmlFor="jukebox-countdown-heading">Countdown heading</AdminLabel>
          <input
            id="jukebox-countdown-heading"
            type="text"
            value={countdownHeading}
            onChange={(e) => setCountdownHeading(e.target.value)}
            maxLength={VISITOR_SETTING_LIMITS.jukebox_countdown_heading}
            placeholder={DEFAULT_COUNTDOWN_HEADING}
            className={field}
          />
          <p className="mt-1 text-xs text-adm-muted">
            For example &ldquo;Christmas lights return in&rdquo;. Leave empty to use the default shown above.
          </p>
        </div>
      )}

      {countdownEnabled && (
        <div>
          <AdminLabel htmlFor="jukebox-countdown-start">Next show starts (optional)</AdminLabel>
          <div className="flex gap-2 sm:max-w-md">
            <input
              id="jukebox-countdown-start"
              type="datetime-local"
              value={countdownStart}
              onChange={(e) => setCountdownStart(e.target.value)}
              className={`${field} min-w-0 flex-1`}
            />
            <button type="button" onClick={() => setCountdownStart('')} disabled={!countdownStart} className={`${smallButton} shrink-0`}>
              Clear
            </button>
          </div>
          <p className="mt-1 text-xs text-adm-muted">
            Counts down to this date and time, in the show&apos;s time zone, even when FPP is off. Leave empty to follow FPP&apos;s Scheduler. Once it has passed, the Scheduler takes over again. The digital sign counts down to it too.
          </p>
        </div>
      )}

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

      {/* Save Button */}
      <div className="flex gap-3 border-t border-adm-line pt-5">
        <button onClick={handleSave} disabled={saving} className={accentButton}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
