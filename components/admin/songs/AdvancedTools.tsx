'use client';

import { useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { AdminH3, AdminTextMuted } from '@/components/admin/Typography';
import { useConfirm } from '@/components/admin/AdminFeedback';
import { card, iconDangerButton, notice, smallButton, smallDangerButton } from '@/components/admin/ui-classes';

import { LocalAudioFile, Message, formatFileSize } from './song-ui';
export default function AdvancedTools({ onChanged, audioFiles }: { onChanged: () => Promise<void>; audioFiles: string[] | null }) {
  const confirmAction = useConfirm();
  const [allFiles, setFiles] = useState<LocalAudioFile[] | null>(null);
  const files = allFiles && audioFiles ? allFiles.filter((file) => audioFiles.includes(file.name)) : allFiles;
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  async function loadFiles() {
    try {
      const response = await fetch('/api/audio/local-files');
      const data = await response.json().catch(() => ({}));
      setFiles(data.files ?? []);
    } catch (error) {
      console.error('Failed to load audio files:', error);
      setFiles([]);
    }
  }

  async function deleteFiles(names: string[]) {
    const title = names.length === 1 ? `Delete "${names[0]}"?` : `Delete all ${names.length} audio files?`;
    if (!(await confirmAction({ title, text: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;

    setBusy(names.length === 1 ? names[0] : 'all');
    setMessage(null);
    let failed = 0;
    for (const name of names) {
      try {
        const response = await fetch(`/api/audio/local-files/${encodeURIComponent(name)}`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) failed++;
      } catch {
        failed++;
      }
    }
    setMessage(failed ? { ok: false, text: `${failed} of ${names.length} could not be deleted.` } : { ok: true, text: `Deleted ${names.length === 1 ? names[0] : `${names.length} files`}.` });
    await loadFiles();
    await onChanged();
    setBusy(null);
  }

  async function refreshSpotifyLinks() {
    setBusy('links');
    setMessage(null);
    try {
      const response = await fetch('/api/admin/media-library/refresh-urls', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to refresh Spotify links');
      setMessage({ ok: true, text: data.message });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Failed to refresh Spotify links' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <details
      className={card}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && allFiles === null) loadFiles();
      }}
    >
      <summary className="cursor-pointer text-sm font-semibold text-adm-text">Advanced: audio files and Spotify links</summary>

      <div className="mt-4 flex flex-col gap-4">
        {message && <p role="status" className={message.ok ? notice.ok : notice.danger}>{message.text}</p>}

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <AdminH3 className="mb-0">{audioFiles ? 'Audio files for this playlist' : 'Audio files on this server'}</AdminH3>
            {files !== null && files.length > 0 && (
              <button onClick={() => deleteFiles(files.map((file) => file.name))} disabled={busy !== null} className={smallDangerButton}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {busy === 'all' ? 'Deleting…' : 'Delete all'}
              </button>
            )}
          </div>
          <AdminTextMuted>Copies of FPP’s audio that visitors’ phones play. Downloading from a song’s panel adds them here.</AdminTextMuted>
          {files === null ? (
            <AdminTextMuted className="mt-3">Loading...</AdminTextMuted>
          ) : files.length === 0 ? (
            <AdminTextMuted className="mt-3">No audio files yet.</AdminTextMuted>
          ) : (
            <ul className="mt-3 divide-y divide-adm-line">
              {files.map((file) => (
                <li key={file.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-adm-text">{file.name}</span>
                    <span className="text-xs text-adm-muted">{formatFileSize(file.size)}</span>
                  </span>
                  <button
                    onClick={() => deleteFiles([file.name])}
                    disabled={busy !== null}
                    className={iconDangerButton}
                    aria-label={`Delete ${file.name}`}
                  >
                    {busy === file.name ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-adm-line pt-4">
          <AdminH3 className="mb-0.5">Spotify links</AdminH3>
          <AdminTextMuted>
            Looks up the “Open in Spotify” link for songs that have a title and artist but no link yet.
            {audioFiles ? ' This covers every song, not only this playlist.' : ''}
          </AdminTextMuted>
          <button onClick={refreshSpotifyLinks} disabled={busy !== null} className={`${smallButton} mt-3`}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy === 'links' ? 'animate-spin' : ''}`} aria-hidden="true" />
            {busy === 'links' ? 'Looking up…' : 'Fill in missing Spotify links'}
          </button>
        </div>
      </div>
    </details>
  );
}
