'use client';

import { useEffect, useRef, useState } from 'react';
import type { DisplayConfig, ColorTheme, BackgroundStyle, FontStyle, LayoutVariant, QueuePosition, IdleAnimation } from '@/types/display';

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
};

export default function DisplaySettings() {
  const [config, setConfig] = useState<DisplayConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/display/config')
      .then((r) => r.json())
      .then((data) => { setConfig({ ...DEFAULT_CONFIG, ...data }); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

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
      <div>
        <h2 className="text-white text-xl font-bold">📺 Digital Sign</h2>
        <p className="text-white/60 text-sm mt-1">
          Configure the now-playing display shown on your TV or kiosk screen.{' '}
          <a href="/display" target="_blank" rel="noreferrer" className="text-blue-300 underline">
            Preview →
          </a>
        </p>
      </div>

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
          <label className={labelClass}>Show name</label>
          <input
            type="text"
            value={config.showName}
            onChange={(e) => set('showName', e.target.value)}
            maxLength={100}
            className={inputClass}
            placeholder="Christmas Light Show"
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

        <div>
          <label className={labelClass}>Google Slides embed URL (optional)</label>
          <input
            type="url"
            value={config.slideshowUrl}
            onChange={(e) => set('slideshowUrl', e.target.value)}
            maxLength={500}
            className={inputClass}
            placeholder="https://docs.google.com/presentation/d/…/embed?start=true&loop=true&delayms=8000"
          />
          <p className="text-white/40 text-xs mt-1">In Google Slides: File → Share → Publish to web → Embed. Paste the src URL here. When set, the slideshow replaces the idle screen background.</p>
        </div>
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
