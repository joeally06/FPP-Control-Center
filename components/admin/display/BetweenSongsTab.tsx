'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { IdleAnimation, IdleMode } from '@/types/display';
import { checkInput, choiceCard } from '@/components/admin/ui-classes';
import ImageUpload from '@/components/admin/display/ImageUpload';
import { idlePanels, type IdlePanel } from '@/lib/display-idle';
import { inputClass, selectClass, labelClass, sectionClass, sectionTitle, checkClass, subBox, hint } from './styles';
import type { TabProps } from './tab-props';

const MODES: { id: IdleMode; title: string; text: string }[] = [
  { id: 'info', title: 'Info screen', text: 'Rotating panels: welcome, countdown, radio, how it works.' },
  { id: 'photos', title: 'Photo slideshow', text: 'Your own pictures, with the countdown and request code on top.' },
  { id: 'slides', title: 'Google Slides', text: 'A published presentation, full screen.' },
];

const MAX_PHOTOS = 20;

/** What shows when no song is playing: pick one of three screens, then set up just that one. */
export default function BetweenSongsTab({
  config,
  set,
  onPhotosSaved,
}: TabProps & {
  /** Photos are saved on the server the moment they are added or removed, so the page must not count that as an unsaved change */
  onPhotosSaved: (images: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const photos = config.idleSlideshowImages ?? [];

  async function uploadPhoto(file: File) {
    setError('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('slot', 'slideshow');
      const res = await fetch('/api/display/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (res.ok) onPhotosSaved(data.images);
      else setError(data.error ?? 'Upload failed');
    } catch {
      setError('Network error');
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(index: number) {
    const res = await fetch(`/api/display/upload?slot=slideshow&index=${index}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) onPhotosSaved(data.images);
  }

  const panelLabels: Record<IdlePanel, string> = {
    welcome: 'Welcome and request code',
    countdown: 'Next show countdown',
    fm: `Tune to ${config.fmFrequency.trim()} FM`,
    how: 'How it works',
  };
  const panels = idlePanels(config, { showActive: false, hasCountdown: true });

  const countdownBox = (
    <div className={subBox}>
      <div className="flex items-center gap-3">
        <input type="checkbox" id="ds-countdown" checked={config.countdownEnabled} onChange={(e) => set('countdownEnabled', e.target.checked)} className={checkClass} />
        <label htmlFor="ds-countdown" className="text-sm font-medium text-adm-text">Count down to the next show</label>
      </div>
      {config.countdownEnabled && (
        <>
          <p className="text-xs text-adm-muted">Follows your FPP schedule. The fallback time is only used if FPP has no schedule.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ds-countdown-label" className={labelClass}>Countdown label</label>
              <input
                id="ds-countdown-label"
                type="text"
                value={config.countdownLabel}
                maxLength={100}
                onChange={(e) => set('countdownLabel', e.target.value)}
                className={inputClass}
                placeholder="Next show starts in"
              />
            </div>
            <div>
              <label htmlFor="ds-countdown-time" className={labelClass}>Fallback start time (24h)</label>
              <input id="ds-countdown-time" type="time" value={config.countdownTime} onChange={(e) => set('countdownTime', e.target.value)} className={inputClass} />
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className={sectionClass}>
        <div>
          <h3 className={sectionTitle}>What shows when no song is playing</h3>
          <p className="mt-0.5 text-[13px] text-adm-muted">Pick one. Your other choices are kept, so you can switch back any time.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {MODES.map((mode) => (
            <label key={mode.id} className={choiceCard}>
              <input
                type="radio"
                name="idle-mode"
                checked={config.idleMode === mode.id}
                onChange={() => set('idleMode', mode.id)}
                className={checkInput}
              />
              <span>
                <span className="block text-sm font-semibold text-adm-text">{mode.title}</span>
                <span className="mt-0.5 block text-[13px] text-adm-muted">{mode.text}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {config.idleMode === 'info' && (
        <>
          <div className={sectionClass}>
            <h3 className={sectionTitle}>Info screen</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ds-idle-message" className={labelClass}>Message</label>
                <input
                  id="ds-idle-message"
                  type="text"
                  value={config.idleMessage}
                  onChange={(e) => set('idleMessage', e.target.value)}
                  maxLength={150}
                  className={inputClass}
                  placeholder="The show will begin shortly"
                />
              </div>
              <div>
                <label htmlFor="ds-idle-animation" className={labelClass}>Falling animation</label>
                <select id="ds-idle-animation" value={config.idleAnimation} onChange={(e) => set('idleAnimation', e.target.value as IdleAnimation)} className={selectClass}>
                  <option value="snowflakes">Snowflakes</option>
                  <option value="notes">Music notes</option>
                  <option value="stars">Stars</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="ds-showClock" checked={config.showClock} onChange={(e) => set('showClock', e.target.checked)} className={checkClass} />
              <label htmlFor="ds-showClock" className="text-sm text-adm-text">Show the clock</label>
            </div>
            <ImageUpload
              label="Background picture (optional)"
              currentUrl={config.idleBackgroundUrl}
              slot="background"
              onUploaded={(url) => set('idleBackgroundUrl', url)}
              onClear={() => set('idleBackgroundUrl', '')}
            />

            {countdownBox}
          </div>

          <div className={sectionClass}>
            <div>
              <h3 className={sectionTitle}>Panels that will rotate</h3>
              <p className="mt-0.5 text-[13px] text-adm-muted">Each one shows for 10 seconds. The radio panel needs an FM frequency (Show info tab).</p>
            </div>
            <ol className="flex flex-wrap gap-2">
              {panels.map((panel, index) => (
                <li key={panel} className="rounded-full border border-adm-control-line bg-adm-side px-3 py-1.5 text-sm text-adm-text">
                  {index + 1} · {panelLabels[panel]}
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      {config.idleMode === 'photos' && (
        <div className={sectionClass}>
          <div>
            <h3 className={sectionTitle}>Photo slideshow</h3>
            <p className="mt-0.5 text-[13px] text-adm-muted">The countdown, radio line and request code show on top of your photos. Photos are saved as soon as you add or remove them.</p>
          </div>
          <div>
            <label htmlFor="ds-interval" className={labelClass}>Time on each photo: {config.idleSlideshowInterval} seconds</label>
            <input
              id="ds-interval"
              type="range"
              min={3}
              max={30}
              step={1}
              value={config.idleSlideshowInterval}
              onChange={(e) => set('idleSlideshowInterval', Number(e.target.value))}
              className="min-h-11 w-full accent-adm-accent"
            />
          </div>

          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {photos.map((url, index) => (
                <div key={`${index}-${url}`} className="relative aspect-video overflow-hidden rounded-lg border border-adm-line bg-adm-field">
                  <div
                    role="img"
                    aria-label={`Photo ${index + 1}`}
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${JSON.stringify(url)})` }}
                  />
                  <button
                    type="button"
                    onClick={() => { if (window.confirm(`Remove photo ${index + 1}? This cannot be undone.`)) void removePhoto(index); }}
                    className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-lg bg-black/70 text-adm-text transition-colors hover:bg-adm-danger-bg hover:text-adm-danger"
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="absolute bottom-0 left-0 bg-black/60 px-1 text-xs text-adm-soft">{index + 1}</span>
                </div>
              ))}
            </div>
          )}

          {photos.length < MAX_PHOTOS && (
            <div>
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files?.[0]; if (file) void uploadPhoto(file); }}
                onDragOver={(e) => e.preventDefault()}
                className="flex min-h-20 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-adm-control-line bg-adm-side transition-colors hover:border-adm-faint disabled:cursor-wait"
              >
                {uploading ? (
                  <span className="text-sm text-adm-muted">Uploading…</span>
                ) : (
                  <>
                    <Plus className="h-5 w-5 text-adm-faint" aria-hidden="true" />
                    <span className="text-xs text-adm-muted">Click or drag a photo here · up to {MAX_PHOTOS - photos.length} more · JPEG, PNG, WebP</span>
                  </>
                )}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                aria-label="Choose a photo to add"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadPhoto(file); e.target.value = ''; }}
              />
            </div>
          )}
          {error && <p className="text-xs text-adm-danger">{error}</p>}
          {photos.length === 0 && <p className={hint}>Add at least one photo. Until then the info screen shows.</p>}
          {countdownBox}
        </div>
      )}

      {config.idleMode === 'slides' && (
        <div className={sectionClass}>
          <div>
            <h3 className={sectionTitle}>Google Slides</h3>
            <p className="mt-0.5 text-[13px] text-adm-muted">Shows your presentation full screen. Only announcements show on top of it.</p>
          </div>
          <div>
            <label htmlFor="ds-slides-url" className={labelClass}>Google Slides publish link</label>
            <input
              id="ds-slides-url"
              type="url"
              value={config.slideshowUrl}
              onChange={(e) => set('slideshowUrl', e.target.value)}
              maxLength={500}
              className={inputClass}
              placeholder="https://docs.google.com/presentation/d/e/…/pub?start=true&loop=true&delayms=8000"
            />
            <p className="mt-1 text-xs text-adm-muted">
              In Google Slides: <strong className="text-adm-soft">File → Share → Publish to web → Embed tab</strong>, then copy the link inside <code className="rounded bg-adm-field px-1 text-adm-soft">src=&quot;…&quot;</code>. Both <code className="rounded bg-adm-field px-1 text-adm-soft">/pub</code> and <code className="rounded bg-adm-field px-1 text-adm-soft">/embed</code> links work.
            </p>
          </div>
          {!config.slideshowUrl.trim() && <p className={hint}>Add the link. Until then the info screen shows.</p>}
        </div>
      )}
    </div>
  );
}
