'use client';

import { useEffect, useState } from 'react';
import { OFF_SEASON_BANNER_DEFAULTS, OFF_SEASON_BANNER_LIMITS, type OffSeasonBanner } from '@/lib/jukebox-display';

/** Settings → Jukebox: the one optional message shown under the logo on the visitor page. */
export default function BannerSettings() {
  const [banner, setBanner] = useState<OffSeasonBanner>(OFF_SEASON_BANNER_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/jukebox/banner-config')
      .then((res) => res.json())
      .then((data: OffSeasonBanner) => setBanner(data))
      .catch((err) => console.error('Failed to load banner config:', err));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/jukebox/banner-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(banner),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to save the message');
      setMessage({ ok: true, text: '✅ Message saved' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ ok: false, text: `❌ ${error instanceof Error ? error.message : 'Failed to save the message'}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-white mb-1">📣 Off-season message</h3>
          <p className="text-white/60 text-sm">
            A message under the logo on the visitor page, for example between seasons. Show times, the countdown and
            whether the show is live are already shown automatically.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={banner.enabled}
          aria-label="Show the off-season message"
          onClick={() => setBanner({ ...banner, enabled: !banner.enabled })}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
            banner.enabled ? 'bg-green-500' : 'bg-gray-600'
          }`}
        >
          <span
            className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${banner.enabled ? 'translate-x-7' : 'translate-x-1'}`}
          />
        </button>
      </div>

      <label className="block">
        <span className="block text-sm font-medium text-white/80 mb-1">Heading</span>
        <input
          type="text"
          value={banner.heading}
          maxLength={OFF_SEASON_BANNER_LIMITS.heading}
          onChange={(e) => setBanner({ ...banner, heading: e.target.value })}
          placeholder="e.g. Thanks for a great season!"
          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40"
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-white/80 mb-1">Message</span>
        <input
          type="text"
          value={banner.subtitle}
          maxLength={OFF_SEASON_BANNER_LIMITS.subtitle}
          onChange={(e) => setBanner({ ...banner, subtitle: e.target.value })}
          placeholder="e.g. See you in October"
          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40"
        />
      </label>

      <p className="text-xs text-white/60">
        {banner.enabled
          ? 'Switched on: visitors see this message, drawn in the active theme’s colours and lettering.'
          : 'Switched off: visitors don’t see a message.'}
      </p>

      {message && (
        <div role={message.ok ? 'status' : 'alert'} className={`p-3 rounded-lg ${message.ok ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
          {message.text}
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
      >
        {saving ? '💾 Saving…' : '💾 Save message'}
      </button>
    </div>
  );
}
