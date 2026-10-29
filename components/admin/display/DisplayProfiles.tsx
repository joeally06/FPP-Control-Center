'use client';

import { useState } from 'react';
import { RefreshCw, Save, Trash2 } from 'lucide-react';
import type { DisplayConfig } from '@/types/display';
import { button, smallButton, smallDangerButton } from '@/components/admin/ui-classes';
import { inputClass, sectionClass, sectionTitle } from './styles';

export type DisplayProfileRow = { id: number; name: string; is_active: number; created_at: string };

interface DisplayProfilesProps {
  profiles: DisplayProfileRow[];
  /** Read the list again */
  onRefresh: () => void;
  onMessage: (message: { type: 'success' | 'error'; text: string }) => void;
  /** An activated profile's settings, to show in the form */
  onProfileActivated: (config: Partial<DisplayConfig> | undefined) => void;
}

/** Save the current Digital Sign settings as a named profile, and switch between saved profiles. */
export default function DisplayProfiles({ profiles, onRefresh, onMessage, onProfileActivated }: DisplayProfilesProps) {
  const [newProfileName, setNewProfileName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  async function saveProfile() {
    if (!newProfileName.trim()) return;
    setProfileSaving(true);
    await fetch('/api/display/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newProfileName.trim() }) });
    setNewProfileName('');
    setProfileSaving(false);
    onRefresh();
  }

  async function activateProfile(id: number) {
    const res = await fetch('/api/display/profiles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    if (res.ok) {
      const d = await res.json();
      onProfileActivated(d.config);
      onRefresh();
      onMessage({ type: 'success', text: 'Profile activated.' });
    }
  }

  async function deleteProfile(id: number) {
    await fetch(`/api/display/profiles?id=${id}`, { method: 'DELETE' });
    onRefresh();
  }

  return (
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h3 className={sectionTitle}>Display Profiles</h3>
          <button type="button" onClick={onRefresh}
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
                      onRefresh();
                      onMessage({ type: 'success', text: `Profile "${p.name}" updated with current settings.` });
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
  );
}
