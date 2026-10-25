'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  DisplayConfig, DisplayProfile, ColorTheme, BackgroundStyle, FontStyle, LayoutVariant,
  QueuePosition, IdleAnimation, ZoneConfig, ZoneTemplate, ZoneWidgetType,
  ZoneWidgetConfig, ScheduleRule, ScheduleActionType,
} from '@/types/display';
import { ZONE_TEMPLATE_SLOTS } from '@/types/display';
import { Eye, ImagePlus, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { card, insetBox, field, button, accentButton, smallButton, smallDangerButton, notice } from '@/components/admin/ui-classes';

function ImageUpload({
  label,
  currentUrl,
  slot,
  onUploaded,
  onClear,
}: {
  label: string;
  currentUrl: string;
  slot: 'logo' | 'background';
  onUploaded: (url: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('slot', slot);
      const res = await fetch('/api/display/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        onUploaded(data.url);
      } else {
        setError(data.error ?? 'Upload failed');
      }
    } catch {
      setError('Network error during upload');
    } finally {
      setUploading(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-2">
      <span className="admin-label mb-0">{label}</span>

      {currentUrl ? (
        <div className="flex items-start gap-3">
          <img
            src={currentUrl}
            alt={label}
            className="h-16 w-16 shrink-0 rounded-lg border border-adm-line bg-adm-field object-contain"
          />
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs text-adm-muted">{currentUrl}</p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className={smallButton}
              >
                {uploading ? 'Uploading…' : 'Replace'}
              </button>
              <button
                type="button"
                onClick={onClear}
                className={smallButton}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex h-24 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-adm-control-line bg-adm-surface transition-colors hover:border-adm-faint"
        >
          {uploading ? (
            <span className="text-sm text-adm-muted">Uploading…</span>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-adm-faint" aria-hidden="true" />
              <span className="px-2 text-center text-xs text-adm-muted">
                Click or drag &amp; drop an image<br />
                <span className="text-adm-faint">JPEG, PNG, GIF, WebP, SVG — max 5 MB</span>
              </span>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-adm-danger">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  );
}

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
  layoutVariant: 'sidebar',
  albumArtSize: 34,
  queuePosition: 'bottom',
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
  zoneConfig: { enabled: false, template: 'two-column', slots: {} },
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

  // Option 4: profiles
  const [profiles, setProfiles] = useState<Array<{ id: number; name: string; is_active: number; created_at: string }>>([]);
  const [newProfileName, setNewProfileName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const fetchProfiles = useCallback(async () => {
    const res = await fetch('/api/display/profiles');
    if (res.ok) { const d = await res.json(); setProfiles(d.profiles ?? []); }
  }, []);

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

  async function saveProfile() {
    if (!newProfileName.trim()) return;
    setProfileSaving(true);
    await fetch('/api/display/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newProfileName.trim() }) });
    setNewProfileName('');
    setProfileSaving(false);
    fetchProfiles();
  }

  async function activateProfile(id: number) {
    const res = await fetch('/api/display/profiles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (res.ok) {
      const d = await res.json();
      if (d.config) setConfig({ ...DEFAULT_CONFIG, ...d.config });
      fetchProfiles();
      setMessage({ type: 'success', text: 'Profile activated.' });
    }
  }

  async function deleteProfile(id: number) {
    await fetch(`/api/display/profiles?id=${id}`, { method: 'DELETE' });
    fetchProfiles();
  }

  // Plan B: schedule rules
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [ruleForm, setRuleForm] = useState<{
    id?: number; name: string; enabled: boolean; days: string;
    startTime: string; endTime: string;
    actionType: ScheduleActionType; actionPayload: string; priority: number;
  } | null>(null);
  const [ruleError, setRuleError] = useState('');

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
    fetchProfiles();
  }, [fetchRules, fetchProfiles]);

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

  const inputClass = field;
  const selectClass = field;
  const labelClass = 'admin-label';
  const sectionClass = `${insetBox} space-y-4`;
  const sectionTitle = 'text-[15px] font-semibold text-adm-text';
  const checkClass = 'h-4.5 w-4.5 shrink-0 accent-adm-accent';
  // A box nested inside a section
  const subBox = 'rounded-xl border border-adm-line bg-adm-surface p-4 space-y-3';
  const hint = 'rounded-lg border border-adm-line bg-adm-surface px-3 py-2 text-xs text-adm-muted';

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

      {/* Layout */}
      <div className={sectionClass}>
        <h3 className={sectionTitle}>Layout</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Layout variant</label>
            <select
              value={config.layoutVariant}
              onChange={(e) => set('layoutVariant', e.target.value as LayoutVariant)}
              className={selectClass}
            >
              <option value="sidebar">Sidebar</option>
              <option value="centered">Centered</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Album art size ({config.albumArtSize}%)</label>
            <input
              type="range"
              min={20}
              max={50}
              step={1}
              value={config.albumArtSize}
              onChange={(e) => set('albumArtSize', Number(e.target.value))}
              className="w-full accent-adm-accent"
            />
          </div>
          <div>
            <label className={labelClass}>Queue position</label>
            <select
              value={config.queuePosition}
              onChange={(e) => set('queuePosition', e.target.value as QueuePosition)}
              className={selectClass}
            >
              <option value="bottom">Bottom</option>
              <option value="right">Right</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Queue count (1–5)</label>
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

      {/* ─── Display Profiles (Option 4) ──────────────────────────────────── */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className={sectionTitle}>Display Profiles</h3>
          <button type="button" onClick={fetchProfiles}
            className={smallButton}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Refresh</button>
        </div>
        <p className="text-xs text-adm-muted">Save snapshots of your current settings and switch between them instantly.</p>

        {/* Save current as profile */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            placeholder="Profile name (e.g. Show Night, Off Season)"
            maxLength={100}
            className={`${inputClass} flex-1`}
            onKeyDown={(e) => { if (e.key === 'Enter') saveProfile(); }}
          />
          <button type="button" onClick={saveProfile} disabled={profileSaving || !newProfileName.trim()}
            className={`${button} whitespace-nowrap`}>
            {profileSaving ? 'Saving…' : 'Save Current'}
          </button>
        </div>

        {/* Profile list */}
        {profiles.length === 0 ? (
          <p className="py-3 text-center text-sm text-adm-muted">No saved profiles yet. Type a name above and save.</p>
        ) : (
          <div className="space-y-2">
            {profiles.map((p) => (
              <div key={p.id} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 border transition-colors ${p.is_active ? 'border-adm-ok-line bg-adm-ok-bg' : 'border-adm-line bg-adm-surface'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {p.is_active ? <span className="text-xs font-semibold text-adm-ok">● ACTIVE</span> : <span className="text-xs text-adm-faint">○</span>}
                    <span className="truncate text-sm text-adm-text">{p.name}</span>
                  </div>
                  <p className="ml-5 text-xs text-adm-faint">{new Date(p.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {!p.is_active && (
                    <button type="button" onClick={() => activateProfile(p.id)}
                      className={smallButton}>
                      Activate
                    </button>
                  )}
                  <button type="button"
                    onClick={async () => {
                      await fetch('/api/display/profiles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, action: 'update' }) });
                      fetchProfiles();
                      setMessage({ type: 'success', text: `Profile "${p.name}" updated with current settings.` });
                    }}
                    className={smallButton} title="Update with current settings" aria-label={`Update ${p.name} with current settings`}>
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => deleteProfile(p.id)}
                    className={smallDangerButton} aria-label={`Delete ${p.name}`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Schedule (Plan B) ──────────────────────────────────────────────── */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className={sectionTitle}>Content Schedule</h3>
          <button
            type="button"
            onClick={() => {
              setRuleError('');
              setRuleForm({ name: '', enabled: true, days: '0,1,2,3,4,5,6', startTime: '18:00', endTime: '22:00', actionType: 'slideshow', actionPayload: '{}', priority: 10 });
            }}
            className={smallButton}
          >
            + Add Rule
          </button>
        </div>
        <p className="text-xs text-adm-muted">Automatically switch display modes or override themes at set times.</p>

        {/* Rule list */}
        {rules.length === 0 ? (
          <p className="py-4 text-center text-sm text-adm-muted">No schedule rules yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-3 rounded-lg border border-adm-line bg-adm-surface px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.enabled ? 'bg-adm-ok' : 'bg-adm-line'}`} />
                    <span className="truncate text-sm font-medium text-adm-text">{rule.name}</span>
                    <span className="rounded bg-adm-line px-1.5 py-0.5 text-xs capitalize text-adm-soft">{rule.actionType.replace('_', ' ')}</span>
                  </div>
                  <p className="ml-4 mt-0.5 text-xs text-adm-muted">
                    {rule.startTime}–{rule.endTime} · Days {rule.days} · Priority {rule.priority}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setRuleError('');
                      setRuleForm({
                        id: rule.id, name: rule.name, enabled: rule.enabled,
                        days: rule.days, startTime: rule.startTime, endTime: rule.endTime,
                        actionType: rule.actionType, actionPayload: rule.actionPayload, priority: rule.priority,
                      });
                    }}
                    className={smallButton}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/display/schedule?id=${rule.id}`, { method: 'DELETE' });
                      fetchRules();
                    }}
                    className={smallDangerButton}
                    aria-label={`Delete ${rule.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add / Edit rule form */}
        {ruleForm && (
          <div className={subBox}>
            <h4 className="text-sm font-semibold text-adm-text">{ruleForm.id ? 'Edit Rule' : 'New Rule'}</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Rule name</label>
                <input type="text" value={ruleForm.name} maxLength={100} className={inputClass}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, name: e.target.value } : f)} />
              </div>
              <div>
                <label className={labelClass}>Action type</label>
                <select value={ruleForm.actionType} className={selectClass}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, actionType: e.target.value as ScheduleActionType, actionPayload: '{}' } : f)}>
                  <option value="slideshow">Show Google Slides</option>
                  <option value="custom_display">Custom Display</option>
                  <option value="theme">Override Theme</option>
                  <option value="announcement">Announcement</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Start time (HH:MM)</label>
                <input type="time" value={ruleForm.startTime} className={inputClass}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, startTime: e.target.value } : f)} />
              </div>
              <div>
                <label className={labelClass}>End time (HH:MM)</label>
                <input type="time" value={ruleForm.endTime} className={inputClass}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, endTime: e.target.value } : f)} />
              </div>
              <div>
                <label className={labelClass}>Days (0=Sun … 6=Sat, comma-separated)</label>
                <input type="text" value={ruleForm.days} maxLength={20} className={inputClass} placeholder="0,1,2,3,4,5,6"
                  onChange={(e) => setRuleForm((f) => f ? { ...f, days: e.target.value } : f)} />
              </div>
              <div>
                <label className={labelClass}>Priority (lower = higher priority)</label>
                <input type="number" min={1} max={100} value={ruleForm.priority} className={inputClass}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, priority: Number(e.target.value) } : f)} />
              </div>
            </div>

            {/* Action-specific payload fields */}
            {ruleForm.actionType === 'slideshow' && (
              <div>
                <label className={labelClass}>Google Slides URL</label>
                <input type="url" className={inputClass} placeholder="https://docs.google.com/presentation/…/pub?…"
                  value={(() => { try { return JSON.parse(ruleForm.actionPayload).url ?? ''; } catch { return ''; } })()}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, actionPayload: JSON.stringify({ url: e.target.value }) } : f)} />
              </div>
            )}
            {ruleForm.actionType === 'theme' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Color theme</label>
                  <select className={selectClass}
                    value={(() => { try { return JSON.parse(ruleForm.actionPayload).colorTheme ?? 'christmas'; } catch { return 'christmas'; } })()}
                    onChange={(e) => setRuleForm((f) => { if (!f) return f; const p = (() => { try { return JSON.parse(f.actionPayload); } catch { return {}; } })(); return { ...f, actionPayload: JSON.stringify({ ...p, colorTheme: e.target.value }) }; })}>
                    <option value="christmas">Christmas</option>
                    <option value="winter">Winter</option>
                    <option value="classic">Classic</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
            )}
            {ruleForm.actionType === 'announcement' && (
              <div>
                <label className={labelClass}>Announcement text</label>
                <input type="text" className={inputClass} maxLength={200}
                  value={(() => { try { return JSON.parse(ruleForm.actionPayload).text ?? ''; } catch { return ''; } })()}
                  onChange={(e) => setRuleForm((f) => f ? { ...f, actionPayload: JSON.stringify({ text: e.target.value }) } : f)} />
              </div>
            )}

            <div className="flex items-center gap-3">
              <input type="checkbox" id="rule-enabled" checked={ruleForm.enabled}
                onChange={(e) => setRuleForm((f) => f ? { ...f, enabled: e.target.checked } : f)}
                className={checkClass} />
              <label htmlFor="rule-enabled" className="text-sm text-adm-text">Rule enabled</label>
            </div>

            {ruleError && <p className="text-xs text-adm-danger">{ruleError}</p>}

            <div className="flex gap-2">
              <button type="button"
                className={accentButton}
                onClick={async () => {
                  setRuleError('');
                  if (!ruleForm.name.trim()) { setRuleError('Rule name is required'); return; }
                  const method = ruleForm.id ? 'PUT' : 'POST';
                  const body = {
                    ...(ruleForm.id ? { id: ruleForm.id } : {}),
                    name: ruleForm.name, enabled: ruleForm.enabled, days: ruleForm.days,
                    startTime: ruleForm.startTime, endTime: ruleForm.endTime,
                    actionType: ruleForm.actionType, actionPayload: ruleForm.actionPayload,
                    priority: ruleForm.priority,
                  };
                  const res = await fetch('/api/display/schedule', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                  if (res.ok) { setRuleForm(null); fetchRules(); }
                  else { const d = await res.json(); setRuleError(d.error ?? 'Save failed'); }
                }}>
                {ruleForm.id ? 'Save Changes' : 'Create Rule'}
              </button>
              <button type="button" onClick={() => setRuleForm(null)}
                className={button}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Zone Layout (Plan C) ──────────────────────────────────────────── */}
      <div className={sectionClass}>
        <h3 className={sectionTitle}>Zone Layout</h3>
        <p className="text-xs text-adm-muted">Divide the screen into multiple zones, each showing a different widget.</p>

        <div className="flex items-center gap-3">
          <input type="checkbox" id="zone-enabled"
            checked={config.zoneConfig?.enabled ?? false}
            onChange={(e) => set('zoneConfig', { ...(config.zoneConfig ?? { template: 'two-column', slots: {} }), enabled: e.target.checked })}
            className={checkClass} />
          <label htmlFor="zone-enabled" className="text-sm text-adm-text">Enable zone layout</label>
        </div>

        {config.zoneConfig?.enabled && (
          <div className="space-y-4">
            {/* Template selector */}
            <div>
              <label className={labelClass}>Layout template</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { value: 'two-column',   label: '◫ Two Column',    desc: 'Left / Right' },
                  { value: 'pip',          label: '⬜ Picture-in-Pic', desc: 'Main + corner' },
                  { value: 'banner-main',  label: '⬛ Banner + Main', desc: 'Top bar + main' },
                  { value: 'sidebar-main', label: '▮ Sidebar + Main', desc: 'Left bar + main' },
                ] as { value: ZoneTemplate; label: string; desc: string }[]).map(({ value, label, desc }) => (
                  <button key={value} type="button"
                    onClick={() => set('zoneConfig', { ...(config.zoneConfig ?? { enabled: true, slots: {} }), template: value, slots: {} })}
                    className={`rounded-lg border p-2 text-left text-xs transition-colors ${
                      config.zoneConfig?.template === value
                        ? 'border-adm-accent bg-adm-warn-bg text-adm-text'
                        : 'border-adm-control-line bg-adm-surface text-adm-muted hover:bg-adm-hover'
                    }`}>
                    <span className="block font-semibold">{label}</span>
                    <span className="text-adm-faint">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Slot configuration */}
            <div className="space-y-3">
              <label className={labelClass}>Configure slots</label>
              {ZONE_TEMPLATE_SLOTS[config.zoneConfig.template ?? 'two-column']?.map((slotKey) => {
                const widget = config.zoneConfig?.slots?.[slotKey] ?? { type: 'empty' as ZoneWidgetType };
                const updateSlot = (w: ZoneWidgetConfig) => {
                  const newSlots = { ...(config.zoneConfig?.slots ?? {}), [slotKey]: w };
                  set('zoneConfig', { ...(config.zoneConfig!), slots: newSlots });
                };
                return (
                  <div key={slotKey} className="space-y-2 rounded-lg border border-adm-line bg-adm-surface p-3">
                    <p className="text-xs font-semibold capitalize text-adm-soft">{slotKey} slot</p>
                    <select value={widget.type} className={selectClass}
                      onChange={(e) => updateSlot({ ...widget, type: e.target.value as ZoneWidgetType })}>
                      <option value="empty">Empty</option>
                      <option value="now-playing">Now Playing</option>
                      <option value="queue">Upcoming Queue</option>
                      <option value="clock">Clock</option>
                      <option value="message">Custom Message</option>
                      <option value="image">Image</option>
                      <option value="slides">Google Slides</option>
                      <option value="qr">QR Code</option>
                    </select>
                    {widget.type === 'message' && (
                      <input type="text" value={widget.text ?? ''} maxLength={300} className={inputClass}
                        placeholder="Message text…"
                        onChange={(e) => updateSlot({ ...widget, text: e.target.value })} />
                    )}
                    {widget.type === 'image' && (
                      <input type="url" value={widget.imageUrl ?? ''} maxLength={500} className={inputClass}
                        placeholder="https://…/image.jpg"
                        onChange={(e) => updateSlot({ ...widget, imageUrl: e.target.value })} />
                    )}
                    {widget.type === 'slides' && (
                      <input type="url" value={widget.slidesUrl ?? ''} maxLength={500} className={inputClass}
                        placeholder="https://docs.google.com/presentation/…/pub?…"
                        onChange={(e) => updateSlot({ ...widget, slidesUrl: e.target.value })} />
                    )}
                  </div>
                );
              })}
            </div>

            <p className={hint}>
              When Zone Layout is enabled it replaces the standard Now Playing / Idle views. Ticker and announcements still appear.
            </p>
          </div>
        )}
      </div>

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
