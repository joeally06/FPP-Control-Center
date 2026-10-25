'use client';

import { useEffect, useState } from 'react';
import { OFF_SEASON_BANNER_DEFAULTS, OFF_SEASON_BANNER_LIMITS, type OffSeasonBanner } from '@/lib/jukebox-display';
import { accentButton, card, field, notice } from '@/components/admin/ui-classes';

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
    <div className={`${card} space-y-4`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="mb-0.5 text-[15px] font-semibold text-adm-text">Off-season message</h3>
          <p className="text-sm text-adm-muted">
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
          className={`relative h-7 w-11.5 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-adm-accent ${
            banner.enabled ? 'bg-adm-accent' : 'bg-adm-control-line'
          }`}
        >
          <span
            className={`absolute top-0.75 left-0.75 h-5.5 w-5.5 rounded-full transition-transform ${
              banner.enabled ? 'translate-x-4.5 bg-adm-accent-ink' : 'bg-adm-soft'
            }`}
          />
        </button>
      </div>

      <div>
        <label htmlFor="banner-heading" className="mb-1.5 block text-[13px] font-medium text-adm-soft">Heading</label>
        <input
          id="banner-heading"
          type="text"
          value={banner.heading}
          maxLength={OFF_SEASON_BANNER_LIMITS.heading}
          onChange={(e) => setBanner({ ...banner, heading: e.target.value })}
          placeholder="e.g. Thanks for a great season!"
          className={field}
        />
      </div>

      <div>
        <label htmlFor="banner-subtitle" className="mb-1.5 block text-[13px] font-medium text-adm-soft">Message</label>
        <input
          id="banner-subtitle"
          type="text"
          value={banner.subtitle}
          maxLength={OFF_SEASON_BANNER_LIMITS.subtitle}
          onChange={(e) => setBanner({ ...banner, subtitle: e.target.value })}
          placeholder="e.g. See you in October"
          className={field}
        />
      </div>

      <p className="text-xs text-adm-muted">
        {banner.enabled
          ? 'Switched on: visitors see this message, drawn in the active theme’s colours and lettering.'
          : 'Switched off: visitors don’t see a message.'}
      </p>

      {message && (
        <div role={message.ok ? 'status' : 'alert'} className={message.ok ? notice.ok : notice.danger}>
          {message.text}
        </div>
      )}

      <button type="button" onClick={handleSave} disabled={saving} className={accentButton}>
        {saving ? 'Saving…' : 'Save message'}
      </button>
    </div>
  );
}
