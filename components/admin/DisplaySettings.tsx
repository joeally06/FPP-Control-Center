'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  DisplayConfig, ColorTheme, BackgroundStyle, FontStyle, LayoutVariant,
  QueuePosition, IdleAnimation, ZoneConfig, ZoneTemplate, ZoneWidgetType,
  ZoneWidgetConfig, ScheduleRule, ScheduleActionType,
} from '@/types/display';
import { ZONE_TEMPLATE_SLOTS } from '@/types/display';

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
      <span className="block text-white/70 text-sm font-medium">{label}</span>

      {currentUrl ? (
        <div className="flex items-start gap-3">
          <img
            src={currentUrl}
            alt={label}
            className="h-16 w-16 object-contain rounded-lg border border-white/20 bg-black/30 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-white/50 text-xs truncate">{currentUrl}</p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
              >
                {uploading ? 'Uploading…' : 'Replace'}
              </button>
              <button
                type="button"
                onClick={onClear}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
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
          className="flex flex-col items-center justify-center gap-2 w-full h-24 rounded-lg border-2 border-dashed border-white/20 hover:border-white/40 cursor-pointer transition-colors bg-white/5"
        >
          {uploading ? (
            <span className="text-white/60 text-sm">Uploading…</span>
          ) : (
            <>
              <span className="text-2xl">🖼️</span>
              <span className="text-white/50 text-xs text-center px-2">
                Click or drag &amp; drop an image<br />
                <span className="text-white/30">JPEG, PNG, GIF, WebP, SVG — max 5 MB</span>
              </span>
            </>
          )}
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

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
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <p className="text-white/60">Loading display settings…</p>
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40';
  const selectClass =
    'w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white';
  const labelClass = 'block text-white/70 text-sm font-medium mb-1';
  const sectionClass = 'bg-white/5 rounded-xl p-5 space-y-4';

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-white text-xl font-bold">📺 Digital Sign</h2>
          <p className="text-white/60 text-sm mt-1">
            Configure the now-playing display shown on your TV or kiosk screen.{' '}
            <a href="/display" target="_blank" rel="noreferrer" className="text-blue-300 underline">
              Open full screen →
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors ${
            showPreview
              ? 'bg-blue-500/20 border-blue-400 text-blue-300'
              : 'bg-white/5 border-white/20 text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          👁 {showPreview ? 'Hide Preview' : 'Live Preview'}
        </button>
      </div>

      {/* Live preview iframe (Plan A) */}
      {showPreview && (
        <div className="rounded-xl overflow-hidden border border-white/20 bg-black" style={{ aspectRatio: '16/9', position: 'relative' }}>
          <iframe
            key={previewKey}
            src="/display"
            className="absolute inset-0 w-full h-full border-0"
            title="Digital sign live preview"
          />
        </div>
      )}

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-green-500/20 border border-green-400/40 text-green-300'
              : 'bg-red-500/20 border border-red-400/40 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Enable / Show Name */}
      <div className={sectionClass}>
        <h3 className="text-white font-semibold">General</h3>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="ds-enabled"
            checked={config.enabled}
            onChange={(e) => set('enabled', e.target.checked)}
            className="w-4 h-4 rounded"
          />
          <label htmlFor="ds-enabled" className="text-white text-sm">Enable digital sign</label>
        </div>
        <div>
          <label className={labelClass}>Show name <span className="text-white/40 font-normal">(optional)</span></label>
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
        <h3 className="text-white font-semibold">Theme &amp; Colors</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Color theme</label>
            <select
              value={config.colorTheme}
              onChange={(e) => set('colorTheme', e.target.value as ColorTheme)}
              className={selectClass}
            >
              <option value="christmas" className="bg-gray-900 text-white">🎄 Christmas</option>
              <option value="winter" className="bg-gray-900 text-white">❄️ Winter</option>
              <option value="classic" className="bg-gray-900 text-white">✨ Classic</option>
              <option value="custom" className="bg-gray-900 text-white">🎨 Custom</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Accent color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={config.accentColor}
                onChange={(e) => set('accentColor', e.target.value)}
                className="h-10 w-14 rounded cursor-pointer bg-transparent border border-white/20"
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
              <option value="gradient" className="bg-gray-900 text-white">Gradient</option>
              <option value="solid" className="bg-gray-900 text-white">Solid</option>
              <option value="particles" className="bg-gray-900 text-white">Particles</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Font style</label>
            <select
              value={config.fontStyle}
              onChange={(e) => set('fontStyle', e.target.value as FontStyle)}
              className={selectClass}
            >
              <option value="modern" className="bg-gray-900 text-white">Modern</option>
              <option value="display" className="bg-gray-900 text-white">Display</option>
              <option value="serif" className="bg-gray-900 text-white">Serif</option>
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
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Layout */}
      <div className={sectionClass}>
        <h3 className="text-white font-semibold">Layout</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Layout variant</label>
            <select
              value={config.layoutVariant}
              onChange={(e) => set('layoutVariant', e.target.value as LayoutVariant)}
              className={selectClass}
            >
              <option value="sidebar" className="bg-gray-900 text-white">Sidebar</option>
              <option value="centered" className="bg-gray-900 text-white">Centered</option>
              <option value="minimal" className="bg-gray-900 text-white">Minimal</option>
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
              className="w-full"
            />
          </div>
          <div>
            <label className={labelClass}>Queue position</label>
            <select
              value={config.queuePosition}
              onChange={(e) => set('queuePosition', e.target.value as QueuePosition)}
              className={selectClass}
            >
              <option value="bottom" className="bg-gray-900 text-white">Bottom</option>
              <option value="right" className="bg-gray-900 text-white">Right</option>
              <option value="hidden" className="bg-gray-900 text-white">Hidden</option>
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
              className="w-4 h-4 rounded"
            />
            <label htmlFor="ds-showQr" className="text-white text-sm">Show QR code</label>
          </div>
        </div>
      </div>

      {/* Idle screen */}
      <div className={sectionClass}>
        <h3 className="text-white font-semibold">Idle Screen</h3>

        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => set('slideshowUrl', '')}
            className={`py-3 px-4 rounded-lg border-2 text-sm font-semibold transition-colors text-left ${
              !config.slideshowUrl
                ? 'border-blue-400 bg-blue-500/20 text-white'
                : 'border-white/20 bg-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            🎨 Custom Display
            <span className="block text-xs font-normal mt-0.5 opacity-70">Logo, clock, QR code, animations</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (!config.slideshowUrl) set('slideshowUrl', 'https://');
            }}
            className={`py-3 px-4 rounded-lg border-2 text-sm font-semibold transition-colors text-left ${
              config.slideshowUrl
                ? 'border-blue-400 bg-blue-500/20 text-white'
                : 'border-white/20 bg-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            📊 Google Slides
            <span className="block text-xs font-normal mt-0.5 opacity-70">Full-screen slideshow</span>
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
              <p className="text-white/40 text-xs mt-1">
                In Google Slides: <strong className="text-white/60">File → Share → Publish to web → Embed tab</strong> — copy the <code className="bg-black/30 px-1 rounded">src="…"</code> value. Both <code className="bg-black/30 px-1 rounded">/pub</code> and <code className="bg-black/30 px-1 rounded">/embed</code> URLs work.
              </p>
            </div>
            <p className="text-white/40 text-xs bg-white/5 rounded-lg px-3 py-2 border border-white/10">
              ℹ️ While Google Slides is active, all custom display elements (logo, show name, clock, QR code, animations, ticker) are hidden. Only announcements will overlay the slideshow.
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
                  <option value="snowflakes" className="bg-gray-900 text-white">❄️ Snowflakes</option>
                  <option value="notes" className="bg-gray-900 text-white">🎵 Music notes</option>
                  <option value="stars" className="bg-gray-900 text-white">✦ Stars</option>
                  <option value="none" className="bg-gray-900 text-white">None</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ds-showClock"
                  checked={config.showClock}
                  onChange={(e) => set('showClock', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="ds-showClock" className="text-white text-sm">Show clock</label>
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
          </div>
        )}
      </div>{/* end Idle Screen section */}

      {/* ─── Schedule (Plan B) ──────────────────────────────────────────────── */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">🗓 Content Schedule</h3>
          <button
            type="button"
            onClick={() => {
              setRuleError('');
              setRuleForm({ name: '', enabled: true, days: '0,1,2,3,4,5,6', startTime: '18:00', endTime: '22:00', actionType: 'slideshow', actionPayload: '{}', priority: 10 });
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            + Add Rule
          </button>
        </div>
        <p className="text-white/40 text-xs">Automatically switch display modes or override themes at set times.</p>

        {/* Rule list */}
        {rules.length === 0 ? (
          <p className="text-white/30 text-sm text-center py-4">No schedule rules yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.enabled ? 'bg-green-400' : 'bg-white/20'}`} />
                    <span className="text-white text-sm font-medium truncate">{rule.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-white/50 capitalize">{rule.actionType.replace('_', ' ')}</span>
                  </div>
                  <p className="text-white/40 text-xs mt-0.5 ml-4">
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
                    className="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/display/schedule?id=${rule.id}`, { method: 'DELETE' });
                      fetchRules();
                    }}
                    className="text-xs px-2 py-1 rounded bg-red-600/30 hover:bg-red-600/50 text-red-300"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add / Edit rule form */}
        {ruleForm && (
          <div className="border border-white/20 rounded-xl p-4 space-y-3 bg-white/5">
            <h4 className="text-white text-sm font-semibold">{ruleForm.id ? 'Edit Rule' : 'New Rule'}</h4>
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
                  <option value="slideshow" className="bg-gray-900">📊 Show Google Slides</option>
                  <option value="custom_display" className="bg-gray-900">🎨 Custom Display</option>
                  <option value="theme" className="bg-gray-900">🎨 Override Theme</option>
                  <option value="announcement" className="bg-gray-900">📢 Announcement</option>
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
                    <option value="christmas" className="bg-gray-900">🎄 Christmas</option>
                    <option value="winter" className="bg-gray-900">❄️ Winter</option>
                    <option value="classic" className="bg-gray-900">✨ Classic</option>
                    <option value="custom" className="bg-gray-900">🎨 Custom</option>
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
                className="w-4 h-4 rounded" />
              <label htmlFor="rule-enabled" className="text-white text-sm">Rule enabled</label>
            </div>

            {ruleError && <p className="text-red-400 text-xs">{ruleError}</p>}

            <div className="flex gap-2">
              <button type="button"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
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
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Zone Layout (Plan C) ──────────────────────────────────────────── */}
      <div className={sectionClass}>
        <h3 className="text-white font-semibold">🖥 Zone Layout</h3>
        <p className="text-white/40 text-xs">Divide the screen into multiple zones, each showing a different widget.</p>

        <div className="flex items-center gap-3">
          <input type="checkbox" id="zone-enabled"
            checked={config.zoneConfig?.enabled ?? false}
            onChange={(e) => set('zoneConfig', { ...(config.zoneConfig ?? { template: 'two-column', slots: {} }), enabled: e.target.checked })}
            className="w-4 h-4 rounded" />
          <label htmlFor="zone-enabled" className="text-white text-sm">Enable zone layout</label>
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
                    className={`p-2 rounded-lg border text-xs text-left transition-colors ${
                      config.zoneConfig?.template === value
                        ? 'border-blue-400 bg-blue-500/20 text-white'
                        : 'border-white/20 bg-white/5 text-white/50 hover:bg-white/10'
                    }`}>
                    <span className="block font-semibold">{label}</span>
                    <span className="text-white/40">{desc}</span>
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
                  <div key={slotKey} className="bg-white/5 rounded-lg p-3 border border-white/10 space-y-2">
                    <p className="text-white/70 text-xs font-semibold capitalize">{slotKey} slot</p>
                    <select value={widget.type} className={selectClass}
                      onChange={(e) => updateSlot({ ...widget, type: e.target.value as ZoneWidgetType })}>
                      <option value="empty" className="bg-gray-900">Empty</option>
                      <option value="now-playing" className="bg-gray-900">🎵 Now Playing</option>
                      <option value="queue" className="bg-gray-900">📋 Upcoming Queue</option>
                      <option value="clock" className="bg-gray-900">🕐 Clock</option>
                      <option value="message" className="bg-gray-900">💬 Custom Message</option>
                      <option value="image" className="bg-gray-900">🖼️ Image</option>
                      <option value="slides" className="bg-gray-900">📊 Google Slides</option>
                      <option value="qr" className="bg-gray-900">📱 QR Code</option>
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

            <p className="text-white/30 text-xs bg-white/5 rounded-lg px-3 py-2 border border-white/10">
              ℹ️ When Zone Layout is enabled it replaces the standard Now Playing / Idle views. Ticker and announcements still appear.
            </p>
          </div>
        )}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
      >
        {saving ? 'Saving…' : 'Save Display Settings'}
      </button>
    </div>
  );
}
