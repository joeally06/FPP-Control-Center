'use client';

import { useCallback, useEffect, useState } from 'react';
import { card, insetBox, button, accentButton, smallButton, smallDangerButton, notice, badge } from '@/components/admin/ui-classes';
import { AdminH2, AdminTextMuted } from '@/components/admin/Typography';
import { Check, Upload } from 'lucide-react';
import {
  getAllThemes,
  NO_ASSETS,
  type SeasonAssets,
  type ThemeAssetKind,
  type ThemeConfig,
  type ThemeId,
} from '@/lib/themes/theme-config';

const ASSET_SLOTS: { kind: ThemeAssetKind; label: string; help: string }[] = [
  {
    kind: 'logo',
    label: 'Logo',
    help: 'The wide artwork across the top of the visitor page. Without one, the show name is shown in large lettering.',
  },
  {
    kind: 'badge',
    label: 'Round badge',
    help: 'A square picture (your mascot, a face) shown in a circle in the top bar and footer. Without one, the middle of the logo is used.',
  },
];

const ACCEPT = 'image/jpeg,image/png,image/webp';

type Feedback = { type: 'success' | 'error'; text: string };

/** Jukebox → Visitor page: pick the season and upload its logo and badge. */
export default function ThemeSettings() {
  const themes = getAllThemes();
  const [activeThemeId, setActiveThemeId] = useState<ThemeId | null>(null);
  const [assets, setAssets] = useState<Record<string, SeasonAssets>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});

  const loadThemes = useCallback(async () => {
    try {
      const response = await fetch('/api/theme');
      if (response.ok) {
        const data = await response.json();
        setActiveThemeId(data.themeId);
        setAssets(data.assets ?? {});
      }
    } catch (error) {
      console.error('Failed to fetch themes:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThemes();
  }, [loadThemes]);

  const say = (themeId: ThemeId, type: Feedback['type'], text: string) =>
    setFeedback((prev) => ({ ...prev, [themeId]: { type, text } }));

  const activate = async (theme: ThemeConfig) => {
    setBusy(`${theme.id}:activate`);
    try {
      const response = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId: theme.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not switch themes');
      setActiveThemeId(theme.id);
      say(theme.id, 'success', `${theme.name} is now showing on the visitor page.`);
    } catch (error) {
      say(theme.id, 'error', error instanceof Error ? error.message : 'Could not switch themes');
    } finally {
      setBusy(null);
    }
  };

  const upload = async (theme: ThemeConfig, kind: ThemeAssetKind, file: File) => {
    setBusy(`${theme.id}:${kind}`);
    try {
      const form = new FormData();
      form.append('theme', theme.id);
      form.append('kind', kind);
      form.append('file', file);
      const response = await fetch('/api/theme/asset', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      await loadThemes();
      say(theme.id, 'success', `${theme.name} ${kind === 'logo' ? 'logo' : 'badge'} saved.`);
    } catch (error) {
      say(theme.id, 'error', error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (theme: ThemeConfig, kind: ThemeAssetKind) => {
    setBusy(`${theme.id}:${kind}`);
    try {
      const response = await fetch(`/api/theme/asset?theme=${theme.id}&kind=${kind}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not remove the image');
      await loadThemes();
      say(theme.id, 'success', `${theme.name} ${kind === 'logo' ? 'logo' : 'badge'} removed.`);
    } catch (error) {
      say(theme.id, 'error', error instanceof Error ? error.message : 'Could not remove the image');
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <div className={card}>
        <AdminH2>Season and logo</AdminH2>
        <AdminTextMuted>Loading...</AdminTextMuted>
      </div>
    );
  }

  return (
    <div>
      <AdminH2 className="mb-1">Season and logo</AdminH2>
      <AdminTextMuted className="mb-4">Pick the season and upload its logo for the visitor jukebox page</AdminTextMuted>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {themes.map((theme) => {
          const isActive = activeThemeId === theme.id;
          const themeAssets = assets[theme.id] ?? NO_ASSETS;
          const note = feedback[theme.id];

          return (
            <section
              key={theme.id}
              aria-labelledby={`theme-${theme.id}`}
              className={`overflow-hidden rounded-2xl border bg-adm-surface ${isActive ? 'border-adm-accent' : 'border-adm-line'}`}
            >
              {/* Preview in the season's own colours (tokens from app/globals.css) */}
              <div
                data-season={theme.id}
                className="relative flex h-44 items-center justify-center overflow-hidden"
                style={{ background: 'var(--sp-night)' }}
              >
                {themeAssets.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element -- served from /api/theme/asset
                  <img src={themeAssets.logo.url} alt={`${theme.name} logo`} className="h-full w-auto max-w-full object-contain" />
                ) : (
                  <p className="sp-display sp-title sp-glow-text px-4 text-center text-3xl">{theme.name}</p>
                )}
                {isActive && (
                  <span className={`${badge.ok} absolute right-3 top-3 items-center gap-1`}>
                    <Check className="h-3 w-3" aria-hidden="true" />
                    Showing now
                  </span>
                )}
              </div>

              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id={`theme-${theme.id}`} className="text-lg font-semibold text-adm-text">{theme.name}</h3>
                    <p className="text-sm text-adm-muted">{theme.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => activate(theme)}
                    disabled={isActive || busy !== null}
                    className={isActive ? button : accentButton}
                  >
                    {isActive ? 'Active' : busy === `${theme.id}:activate` ? 'Switching…' : 'Make active'}
                  </button>
                </div>

                {ASSET_SLOTS.map((slot) => {
                  const current = themeAssets[slot.kind];
                  const slotBusy = busy === `${theme.id}:${slot.kind}`;
                  const inputId = `upload-${theme.id}-${slot.kind}`;
                  return (
                    <div key={slot.kind} className={`${insetBox} flex items-start gap-4`}>
                      <div
                        data-season={theme.id}
                        className={`flex h-16 shrink-0 items-center justify-center overflow-hidden ${slot.kind === 'badge' ? 'w-16 rounded-full' : 'w-28 rounded-lg'}`}
                        style={{ background: 'var(--sp-night)' }}
                      >
                        {current ? (
                          // eslint-disable-next-line @next/next/no-img-element -- served from /api/theme/asset
                          <img src={current.url} alt="" className={`h-full w-full ${slot.kind === 'badge' ? 'object-cover' : 'object-contain'}`} />
                        ) : (
                          <span className="text-xs text-adm-faint">None</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-adm-text">{slot.label}</p>
                        <p className="mt-0.5 text-xs text-adm-muted">{slot.help} JPEG, PNG or WebP, up to 5 MB.</p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {/* Hidden file input before its label, so the label shows the input's keyboard focus */}
                          <input
                            id={inputId}
                            type="file"
                            accept={ACCEPT}
                            className="peer sr-only"
                            disabled={busy !== null}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (file) upload(theme, slot.kind, file);
                            }}
                          />
                          <label
                            htmlFor={inputId}
                            className={`${smallButton} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-adm-accent ${busy !== null ? 'pointer-events-none opacity-50' : ''}`}
                          >
                            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                            {slotBusy ? 'Saving…' : current ? `Replace ${slot.label.toLowerCase()}` : `Upload ${slot.label.toLowerCase()}`}
                          </label>
                          {current && (
                            <button
                              type="button"
                              onClick={() => remove(theme, slot.kind)}
                              disabled={busy !== null}
                              className={smallDangerButton}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {note && (
                  <p
                    role={note.type === 'error' ? 'alert' : 'status'}
                    className={note.type === 'error' ? notice.danger : notice.ok}
                  >
                    {note.text}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className={`${card} mt-4`}>
        <h3 className="admin-h3">How themes work</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li className="text-adm-soft">The active theme sets the colours, lettering, string lights and background (stars or snow) of the visitor jukebox page.</li>
          <li className="text-adm-soft">Each theme keeps its own logo and badge, so you can upload Christmas artwork during Halloween and switch over when you&apos;re ready.</li>
          <li className="text-adm-soft">Images are stored in the database (and its backups), resized for the web, and shown to visitors right away.</li>
          <li className="text-adm-soft">The Letter to Santa card and the trivia button only appear in the Christmas theme.</li>
        </ul>
      </div>

      {/* Both seasons' faces, for the previews above */}
      <style jsx global>{`
        ${themes.map((t) => `@import url('https://fonts.googleapis.com/css2?${t.fontQuery}&display=swap');`).join('\n')}
      `}</style>
    </div>
  );
}
