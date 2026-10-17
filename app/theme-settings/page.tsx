'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
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

export default function ThemeSettings() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const router = useRouter();
  const themes = getAllThemes();
  const [activeThemeId, setActiveThemeId] = useState<ThemeId | null>(null);
  const [assets, setAssets] = useState<Record<string, SeasonAssets>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});

  // Redirect non-admins
  useEffect(() => {
    if (sessionStatus !== 'loading' && !isAdmin) {
      router.push('/jukebox');
    }
  }, [isAdmin, sessionStatus, router]);

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
    if (isAdmin) loadThemes();
  }, [isAdmin, loadThemes]);

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

  // Show loading while checking authentication
  if (sessionStatus === 'loading' || (isAdmin && isLoading)) {
    return (
      <div className="min-h-screen bg-linear-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl text-white">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminLayout title="🎨 Theme Settings" subtitle="Pick the season and upload its logo for the visitor jukebox page">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {themes.map((theme) => {
          const isActive = activeThemeId === theme.id;
          const themeAssets = assets[theme.id] ?? NO_ASSETS;
          const note = feedback[theme.id];

          return (
            <section
              key={theme.id}
              aria-labelledby={`theme-${theme.id}`}
              className={`overflow-hidden rounded-xl border-2 bg-white/5 ${isActive ? 'border-green-400 shadow-lg shadow-green-500/30' : 'border-white/20'}`}
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
                  <span className="absolute right-3 top-3 rounded-full bg-green-500 px-3 py-1 text-xs font-semibold text-white">✓ Showing now</span>
                )}
              </div>

              <div className="space-y-5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id={`theme-${theme.id}`} className="text-xl font-bold text-white">{theme.icon} {theme.name}</h2>
                    <p className="text-sm text-white/70">{theme.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => activate(theme)}
                    disabled={isActive || busy !== null}
                    className="min-h-11 rounded-lg bg-green-600 px-4 text-sm font-semibold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/60"
                  >
                    {isActive ? 'Active' : busy === `${theme.id}:activate` ? 'Switching…' : 'Make active'}
                  </button>
                </div>

                {ASSET_SLOTS.map((slot) => {
                  const current = themeAssets[slot.kind];
                  const slotBusy = busy === `${theme.id}:${slot.kind}`;
                  const inputId = `upload-${theme.id}-${slot.kind}`;
                  return (
                    <div key={slot.kind} className="flex items-start gap-4 rounded-lg border border-white/10 bg-black/20 p-3">
                      <div
                        data-season={theme.id}
                        className={`flex h-16 shrink-0 items-center justify-center overflow-hidden ${slot.kind === 'badge' ? 'w-16 rounded-full' : 'w-28 rounded-lg'}`}
                        style={{ background: 'var(--sp-night)' }}
                      >
                        {current ? (
                          // eslint-disable-next-line @next/next/no-img-element -- served from /api/theme/asset
                          <img src={current.url} alt="" className={`h-full w-full ${slot.kind === 'badge' ? 'object-cover' : 'object-contain'}`} />
                        ) : (
                          <span className="text-xs text-white/50">None</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">{slot.label}</p>
                        <p className="mt-0.5 text-xs text-white/60">{slot.help} JPEG, PNG or WebP, up to 5 MB.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
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
                            className={`inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-500 peer-focus-visible:ring-2 peer-focus-visible:ring-white ${busy !== null ? 'pointer-events-none opacity-60' : ''}`}
                          >
                            {slotBusy ? 'Saving…' : current ? `Replace ${slot.label.toLowerCase()}` : `Upload ${slot.label.toLowerCase()}`}
                          </label>
                          {current && (
                            <button
                              type="button"
                              onClick={() => remove(theme, slot.kind)}
                              disabled={busy !== null}
                              className="min-h-10 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-60"
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
                    className={`rounded-lg px-3 py-2 text-sm ${note.type === 'error' ? 'bg-red-500/20 text-red-100' : 'bg-green-500/20 text-green-100'}`}
                  >
                    {note.text}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-blue-500/30 bg-blue-500/10 p-6">
        <h3 className="mb-3 font-semibold text-white">💡 How themes work</h3>
        <ul className="space-y-2 text-sm text-white/80">
          <li>• The active theme sets the colours, lettering, string lights and background (stars or snow) of the visitor jukebox page.</li>
          <li>• Each theme keeps its own logo and badge, so you can upload Christmas artwork during Halloween and switch over when you&apos;re ready.</li>
          <li>• Images are stored in the database (and its backups), resized for the web, and shown to visitors right away.</li>
          <li>• The Letter to Santa card and the trivia button only appear in the Christmas theme.</li>
        </ul>
      </div>

      {/* Both seasons' faces, for the previews above */}
      <style jsx global>{`
        ${themes.map((t) => `@import url('https://fonts.googleapis.com/css2?${t.fontQuery}&display=swap');`).join('\n')}
      `}</style>
    </AdminLayout>
  );
}
