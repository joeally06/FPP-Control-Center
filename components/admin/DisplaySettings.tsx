'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  DisplayConfig, ColorTheme, BackgroundStyle, FontStyle, IdleAnimation, ScheduleRule,
} from '@/types/display';
import { Eye, Plus, Trash2 } from 'lucide-react';
import { card, button, accentButton, notice } from '@/components/admin/ui-classes';
import ImageUpload from '@/components/admin/display/ImageUpload';
import DisplaySchedule from '@/components/admin/display/DisplaySchedule';
import { inputClass, selectClass, labelClass, sectionClass, sectionTitle, checkClass, subBox, hint } from '@/components/admin/display/styles';

const DEFAULT_CONFIG: DisplayConfig = {
  showName: 'Christmas Light Show',
  showQr: true,
  queueCount: 4,
  enabled: true,
  colorTheme: 'christmas',
  accentColor: '#ef4444',
  backgroundStyle: 'gradient',
  fontStyle: 'modern',
  fontScale: 100,
  idleMessage: 'The show will begin shortly',
  logoUrl: '',
  sponsorText: '',
  fmFrequency: '',
  idleAnimation: 'snowflakes',
  showClock: true,
  idleBackgroundUrl: '',
  tickerText: '',
  slideshowUrl: '',
  idleSlideshowImages: [],
  idleSlideshowInterval: 8,
  countdownEnabled: false,
  countdownTime: '20:00',
  countdownLabel: 'Next show starts in',
};

export default function DisplaySettings() {
  const [config, setConfig] = useState<DisplayConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Plan A: live preview
  const [showPreview, setShowPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  // Option 1: local slideshow images
  const [slideshowUploading, setSlideshowUploading] = useState(false);
  const [slideshowError, setSlideshowError] = useState('');
  const slideshowInputRef = useRef<HTMLInputElement>(null);

  async function uploadSlideshowImage(file: File) {
    setSlideshowError('');
    setSlideshowUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('slot', 'slideshow');
      const res = await fetch('/api/display/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        set('idleSlideshowImages', data.images);
      } else {
        setSlideshowError(data.error ?? 'Upload failed');
      }
    } catch { setSlideshowError('Network error'); }
    finally { setSlideshowUploading(false); }
  }

  async function removeSlideshowImage(idx: number) {
    const res = await fetch(`/api/display/upload?slot=slideshow&index=${idx}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) set('idleSlideshowImages', data.images);
  }

  // Plan B: schedule rules
  const [rules, setRules] = useState<ScheduleRule[]>([]);

  const fetchRules = useCallback(async () => {
    const res = await fetch('/api/display/schedule');
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules ?? []);
    }
  }, []);

  useEffect(() => {
    fetch('/api/display/config')
      .then((r) => r.json())
      .then((data) => { setConfig({ ...DEFAULT_CONFIG, ...data }); setLoading(false); })
      .catch(() => setLoading(false));
    fetchRules();
  }, [fetchRules]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/display/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (res.ok) {
        setConfig({ ...DEFAULT_CONFIG, ...data.config });
        setMessage({ type: 'success', text: 'Settings saved successfully.' });
        setPreviewKey((k) => k + 1); // refresh live preview
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Failed to save settings.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error saving settings.' });
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof DisplayConfig>(key: K, value: DisplayConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div className={card}>
        <p className="text-sm text-adm-muted">Loading display settings…</p>
      </div>
    );
  }

  return (
    <div className={`${card} space-y-5`}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="admin-h2 mb-1">Digital Sign</h2>
          <p className="text-sm text-adm-muted">
            Configure the now-playing display shown on your TV or kiosk screen.{' '}
            <a href="/display" target="_blank" rel="noreferrer" className="font-medium text-adm-accent hover:underline">
              Open full screen →
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          aria-pressed={showPreview}
          className={`${button} shrink-0 self-start`}
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          {showPreview ? 'Hide Preview' : 'Live Preview'}
        </button>
      </div>

      {/* Live preview iframe (Plan A) */}
      {showPreview && (
        <div className="overflow-hidden rounded-xl border border-adm-line bg-black" style={{ aspectRatio: '16/9', position: 'relative' }}>
          <iframe
            key={previewKey}
            src="/display"
            className="absolute inset-0 w-full h-full border-0"
            title="Digital sign live preview"
          />
        </div>
      )}

      {message && (
        <p className={message.type === 'success' ? notice.ok : notice.danger}>
          {message.text}
        </p>
      )}

      {/* Enable / Show Name */}
      <div className={sectionClass}>
        <h3 className={sectionTitle}>General</h3>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="ds-enabled"
            checked={config.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
            className={checkClass}
          />
          <label htmlFor="ds-enabled" className="text-sm text-adm-text">Enable digital sign</label>
        </div>
        <div>
          <label className={labelClass}>Show name <span className="font-normal text-adm-faint">(optional)</span></label>
          <input
            type="text"
            value={config.showName}
            onChange={(e) => set('showName', e.target.value)}
            maxLength={100}
            className={inputClass}
            placeholder="Leave blank to hide"
          />
        </div>
        <div>
          <label className={labelClass}>FM frequency (optional)</label>
          <input
            type="text"
            value={config.fmFrequency}
            onChange={(e) => set('fmFrequency', e.target.value)}
            maxLength={20}
            className={inputClass}
            placeholder="e.g. 100.1"
          />
        </div>
        <div>
          <label className={labelClass}>Sponsor text (optional)</label>
          <input
            type="text"
            value={config.sponsorText}
            onChange={(e) => set('sponsorText', e.target.value)}
            maxLength={150}
            className={inputClass}
            placeholder="Brought to you by…"
          />
        </div>
        <div>
          <label className={labelClass}>Ticker text (optional)</label>
          <input
            type="text"
            value={config.tickerText}
            onChange={(e) => set('tickerText', e.target.value)}
            maxLength={300}
            className={inputClass}
            placeholder="Scrolling message at the bottom…"
          />
        </div>
      </div>

      {/* Theme & Colors */}
      <div className={sectionClass}>
        <h3 className={sectionTitle}>Theme &amp; Colors</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Color theme</label>
            <select
              value={config.colorTheme}
              onChange={(e) => set('colorTheme', e.target.value as ColorTheme)}
              className={selectClass}
            >
              <option value="christmas">Christmas</option>
              <option value="winter">Winter</option>
              <option value="classic">Classic</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Accent color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={config.accentColor}
                onChange={(e) => set('accentColor', e.target.value)}
                className="h-11 w-14 cursor-pointer rounded-lg border border-adm-control-line bg-transparent"
              />
              <input
                type="text"
                value={config.accentColor}
                onChange={(e) => set('accentColor', e.target.value)}
                maxLength={20}
                className={`${inputClass} flex-1`}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Background style</label>
            <select
              value={config.backgroundStyle}
              onChange={(e) => set('backgroundStyle', e.target.value as BackgroundStyle)}
              className={selectClass}
            >
              <option value="gradient">Gradient</option>
              <option value="solid">Solid</option>
              <option value="particles">Particles</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Font style</label>
            <select
              value={config.fontStyle}
              onChange={(e) => set('fontStyle', e.target.value as FontStyle)}
              className={selectClass}
            >
              <option value="modern">Modern</option>
              <option value="display">Display</option>
              <option value="serif">Serif</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Font scale ({config.fontScale}%)</label>
            <input
              type="range"
              min={75}
              max={150}
              step={5}
              value={config.fontScale}
              onChange={(e) => set('fontScale', Number(e.target.value))}
              className="w-full accent-adm-accent"
            />
          </div>
        </div>
      </div>

      {/* Up next & QR */}
      <div className={sectionClass}>
        <h3 className={sectionTitle}>Up Next &amp; QR Code</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Songs shown under &quot;Up next&quot; (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={config.queueCount}
              onChange={(e) => set('queueCount', Number(e.target.value))}
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="ds-showQr"
              checked={config.showQr}
              onChange={(e) => set('showQr', e.target.checked)}
              className={checkClass}
            />
            <label htmlFor="ds-showQr" className="text-sm text-adm-text">Show QR code</label>
          </div>
        </div>
      </div>

      {/* Idle screen */}
      <div className={sectionClass}>
        <h3 className={sectionTitle}>Idle Screen</h3>

        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => set('slideshowUrl', '')}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
              !config.slideshowUrl
                ? 'border-adm-accent bg-adm-warn-bg text-adm-text'
                : 'border-adm-control-line bg-adm-surface text-adm-muted hover:bg-adm-hover'
            }`}
          >
            Custom Display
            <span className="mt-0.5 block text-xs font-normal text-adm-muted">Logo, clock, QR code, animations</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!config.slideshowUrl) set('slideshowUrl', 'https://');
            }}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
              config.slideshowUrl
                ? 'border-adm-accent bg-adm-warn-bg text-adm-text'
                : 'border-adm-control-line bg-adm-surface text-adm-muted hover:bg-adm-hover'
            }`}
          >
            Google Slides
            <span className="mt-0.5 block text-xs font-normal text-adm-muted">Full-screen slideshow</span>
          </button>
        </div>

        {/* Google Slides mode */}
        {config.slideshowUrl !== undefined && config.slideshowUrl !== '' ? (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Google Slides publish URL</label>
              <input
                type="url"
                value={config.slideshowUrl}
                onChange={(e) => set('slideshowUrl', e.target.value)}
                maxLength={500}
                className={inputClass}
                placeholder="https://docs.google.com/presentation/d/e/…/pub?start=true&loop=true&delayms=8000"
              />
              <p className="mt-1 text-xs text-adm-muted">
                In Google Slides: <strong className="text-adm-soft">File → Share → Publish to web → Embed tab</strong> — copy the <code className="rounded bg-adm-field px-1 text-adm-soft">src="…"</code> value. Both <code className="rounded bg-adm-field px-1 text-adm-soft">/pub</code> and <code className="rounded bg-adm-field px-1 text-adm-soft">/embed</code> URLs work.
              </p>
            </div>
            <p className={hint}>
              While Google Slides is active, all custom display elements (logo, show name, clock, QR code, animations, ticker) are hidden. Only announcements will overlay the slideshow.
            </p>
          </div>
        ) : (
          /* Custom display mode */
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Idle message</label>
                <input
                  type="text"
                  value={config.idleMessage}
                  onChange={(e) => set('idleMessage', e.target.value)}
                  maxLength={150}
                  className={inputClass}
                  placeholder="The show will begin shortly"
                />
              </div>
              <div>
                <label className={labelClass}>Idle animation</label>
                <select
                  value={config.idleAnimation}
                  onChange={(e) => set('idleAnimation', e.target.value as IdleAnimation)}
                  className={selectClass}
                >
                  <option value="snowflakes">Snowflakes</option>
                  <option value="notes">Music notes</option>
                  <option value="stars">Stars</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ds-showClock"
                  checked={config.showClock}
                  onChange={(e) => set('showClock', e.target.checked)}
                  className={checkClass}
                />
                <label htmlFor="ds-showClock" className="text-sm text-adm-text">Show clock</label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <ImageUpload
                label="Logo image (optional)"
                currentUrl={config.logoUrl}
                slot="logo"
                onUploaded={(url) => set('logoUrl', url)}
                onClear={() => set('logoUrl', '')}
              />
              <ImageUpload
                label="Idle background image (optional)"
                currentUrl={config.idleBackgroundUrl}
                slot="background"
                onUploaded={(url) => set('idleBackgroundUrl', url)}
                onClear={() => set('idleBackgroundUrl', '')}
              />
            </div>

            {/* ── Countdown Timer (Option 2) ── */}
            <div className={subBox}>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="ds-countdown"
                  checked={config.countdownEnabled ?? false}
                  onChange={(e) => set('countdownEnabled', e.target.checked)}
                  className={checkClass} />
                <label htmlFor="ds-countdown" className="text-sm text-adm-text font-medium">Countdown Timer</label>
              </div>
              {config.countdownEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7">
                  <div>
                    <label className={labelClass}>Show start time (24h)</label>
                    <input type="time" value={config.countdownTime ?? '20:00'}
                      onChange={(e) => set('countdownTime', e.target.value)}
                      className={inputClass} />
                    <p className="mt-1 text-xs text-adm-muted">Counts down to this time each day (resets daily)</p>
                  </div>
                  <div>
                    <label className={labelClass}>Countdown label</label>
                    <input type="text" value={config.countdownLabel ?? 'Next show starts in'}
                      maxLength={100}
                      onChange={(e) => set('countdownLabel', e.target.value)}
                      className={inputClass}
                      placeholder="Next show starts in" />
                  </div>
                </div>
              )}
            </div>

            {/* ── Local Image Slideshow (Option 1) ── */}
            <div className={subBox}>
              <div>
                <h4 className="text-sm font-medium text-adm-text">Local Image Slideshow</h4>
                <p className="mt-0.5 text-xs text-adm-muted">Upload images to cycle on the idle screen. When images are uploaded, they replace the custom display.</p>
              </div>

              <div>
                <label className={labelClass}>Slide interval: {config.idleSlideshowInterval ?? 8} seconds</label>
                <input type="range" min={3} max={30} step={1}
                  value={config.idleSlideshowInterval ?? 8}
                  onChange={(e) => set('idleSlideshowInterval', Number(e.target.value))}
                  className="w-full accent-adm-accent" />
              </div>

              {/* Image gallery */}
              {(config.idleSlideshowImages?.length ?? 0) > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {(config.idleSlideshowImages ?? []).map((url, idx) => (
                    <div key={idx} className="group relative aspect-video overflow-hidden rounded-lg border border-adm-line bg-adm-field">
                      <img src={url} alt={`Slide ${idx + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeSlideshowImage(idx)}
                        className="absolute inset-0 flex items-center justify-center bg-black/60 text-adm-text opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        title="Remove"
                        aria-label={`Remove slide ${idx + 1}`}
                      ><Trash2 className="h-5 w-5" aria-hidden="true" /></button>
                      <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-xs text-adm-soft">{idx + 1}</span>
                    </div>
                  ))}
                </div>
              )}

              {(config.idleSlideshowImages?.length ?? 0) < 20 && (
                <div>
                  <div
                    onClick={() => !slideshowUploading && slideshowInputRef.current?.click()}
                    onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) uploadSlideshowImage(f); }}
                    onDragOver={(e) => e.preventDefault()}
                    className="flex h-20 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-adm-control-line bg-adm-side transition-colors hover:border-adm-faint"
                  >
                    {slideshowUploading ? (
                      <span className="text-sm text-adm-muted">Uploading…</span>
                    ) : (
                      <>
                        <Plus className="h-5 w-5 text-adm-faint" aria-hidden="true" />
                        <span className="text-xs text-adm-muted">Click or drag &amp; drop · max {20 - (config.idleSlideshowImages?.length ?? 0)} more · JPEG, PNG, WebP</span>
                      </>
                    )}
                  </div>
                  <input
                    ref={slideshowInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSlideshowImage(f); e.target.value = ''; }}
                  />
                </div>
              )}
              {slideshowError && <p className="text-xs text-adm-danger">{slideshowError}</p>}
              {(config.idleSlideshowImages?.length ?? 0) > 0 && (
                <p className="text-xs text-adm-faint">Local slideshow takes priority over the custom display. Upload at least 1 image to activate.</p>
              )}
            </div>
          </div>
        )}
      </div>{/* end Idle Screen section */}

      {/* Schedule rules (Plan B) */}
      <DisplaySchedule rules={rules} onRefresh={fetchRules} />

      <button
        onClick={save}
        disabled={saving}
        className={`${accentButton} w-full`}
      >
        {saving ? 'Saving…' : 'Save Display Settings'}
      </button>
    </div>
  );
}
