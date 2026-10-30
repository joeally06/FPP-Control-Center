'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { ScheduleRule } from '@/types/display';
import { discarded, formFrom, isDirty, withEdit, withPhotosSaved, type DisplayForm } from '@/lib/display-form';
import type { DisplayPresetValues } from '@/lib/display-presets';
import type { PreviewScreen } from '@/lib/display-preview';
import { accentButton, button, card, notice, tabClass } from '@/components/admin/ui-classes';
import BetweenSongsTab from '@/components/admin/display/BetweenSongsTab';
import DisplayPreview from '@/components/admin/display/DisplayPreview';
import DisplaySchedule from '@/components/admin/display/DisplaySchedule';
import LookTab from '@/components/admin/display/LookTab';
import ShowInfoTab from '@/components/admin/display/ShowInfoTab';
import type { SetDisplayConfig } from '@/components/admin/display/tab-props';

const TABS = [
  { id: 'look', label: 'Look' },
  { id: 'info', label: 'Show info' },
  { id: 'idle', label: 'Between songs' },
  { id: 'schedule', label: 'Schedule' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function toTab(value: string | undefined): TabId {
  return TABS.find((tab) => tab.id === value)?.id ?? 'look';
}

/** Settings → Digital Sign: what the TV shows, one tab per area, with a live preview beside the form. */
export default function DisplaySettings({ initialTab }: { initialTab?: string }) {
  const [form, setForm] = useState<DisplayForm>(() => formFrom({}));
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<TabId>(toTab(initialTab));
  const [screen, setScreen] = useState<PreviewScreen>(toTab(initialTab) === 'idle' ? 'idle' : 'playing');
  // Below xl the preview sits above the form and can be hidden
  const [showPreview, setShowPreview] = useState(true);
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const tabsRef = useRef<HTMLDivElement>(null);

  const config = form.config;
  const dirty = isDirty(form);

  const fetchRules = useCallback(async () => {
    const res = await fetch('/api/display/schedule');
    if (res.ok) {
      const data = await res.json();
      setRules(data.rules ?? []);
    }
  }, []);

  useEffect(() => {
    fetch('/api/display/config')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setForm(formFrom(data));
        setLoading(false);
      })
      // Without the real settings the form would show defaults, and saving would write them over the real ones
      .catch(() => {
        setLoadFailed(true);
        setLoading(false);
      });
    fetchRules();
  }, [fetchRules]);

  // Closing the page with unsaved edits would lose them
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set: SetDisplayConfig = (key, value) => {
    setMessage(null);
    setForm((prev) => withEdit(prev, { [key]: value }));
  };

  function applyPreset(values: DisplayPresetValues) {
    setMessage(null);
    setForm((prev) => withEdit(prev, values));
  }

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
        setForm(formFrom(data.config));
        setMessage({ type: 'success', text: 'Saved. The sign picks up the changes within a few seconds.' });
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Failed to save settings.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error saving settings.' });
    } finally {
      setSaving(false);
    }
  }

  function selectTab(id: TabId) {
    setTab(id);
    // Between songs previews the screen you are editing; the other tabs keep whichever screen was showing
    if (id === 'idle') setScreen('idle');
    // Keep the tab in the address so a reload or a shared link opens the same one
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.replaceState(null, '', url);
  }

  if (loading) {
    return (
      <div className={card}>
        <p className="text-sm text-adm-muted">Loading display settings…</p>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className={`${notice.danger} flex flex-col gap-3`} role="alert">
        <p>Could not load the digital sign settings, so nothing is shown here to avoid saving over them.</p>
        <button type="button" onClick={() => window.location.reload()} className={`${button} self-start`}>Reload the page</button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-1.5 text-2xl font-semibold tracking-tight text-adm-text sm:text-3xl">Digital Sign</h1>
          <p className="text-sm text-adm-muted sm:text-base">What your TV shows. Changes appear in the preview as you type.</p>
        </div>
        <a href="/display" target="_blank" rel="noreferrer" className={`${button} self-start`}>Open full screen</a>
      </div>

      {message && (
        <p role="status" className={`${message.type === 'success' ? notice.ok : notice.danger} mb-4`}>{message.text}</p>
      )}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <aside className="order-first xl:order-last xl:sticky xl:top-6 xl:w-[440px] xl:shrink-0">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            aria-expanded={showPreview}
            className={`${button} w-full xl:hidden`}
          >
            {showPreview ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            {showPreview ? 'Hide preview' : 'Show preview'}
          </button>
          <div className={showPreview ? 'mt-3 xl:mt-0' : 'hidden xl:block'}>
            <DisplayPreview config={config} screen={screen} onScreenChange={setScreen} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div ref={tabsRef} className="mb-6 flex gap-1 overflow-x-auto border-b border-adm-line">
            {TABS.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => selectTab(id)} aria-pressed={tab === id} className={tabClass(tab === id)}>
                {label}
              </button>
            ))}
          </div>

          {/* Every tab stays mounted so unsaved edits survive switching tabs */}
          <section aria-label="Look" hidden={tab !== 'look'}>
            <LookTab config={config} set={set} onPreset={applyPreset} />
          </section>
          <section aria-label="Show info" hidden={tab !== 'info'}>
            <ShowInfoTab config={config} set={set} />
          </section>
          <section aria-label="Between songs" hidden={tab !== 'idle'}>
            <BetweenSongsTab config={config} set={set} onPhotosSaved={(images) => setForm((prev) => withPhotosSaved(prev, images))} />
          </section>
          <section aria-label="Schedule" hidden={tab !== 'schedule'} className="flex flex-col gap-3">
            <p className="text-[13px] text-adm-muted">Timed changes save as soon as you add them. They are not part of the Save button below.</p>
            <DisplaySchedule rules={rules} onRefresh={fetchRules} />
          </section>
        </div>
      </div>

      {/* Stays in view; below lg it sits above the bottom navigation bar */}
      <div
        role="region"
        aria-label="Save settings"
        className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-adm-line bg-adm-side px-4 py-3 shadow-lg lg:bottom-4"
      >
        <p className={`flex items-center gap-2 text-sm ${dirty ? 'text-adm-warn' : 'text-adm-ok'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${dirty ? 'bg-adm-warn' : 'bg-adm-ok'}`} aria-hidden="true" />
          {dirty ? 'You have unsaved changes' : 'All changes saved'}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => { setMessage(null); setForm(discarded); }} disabled={!dirty || saving} className={button}>Discard</button>
          <button type="button" onClick={save} disabled={!dirty || saving} className={accentButton}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
