'use client';

import { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { smallButton } from '@/components/admin/ui-classes';

export default function ImageUpload({
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
          {/* eslint-disable-next-line @next/next/no-img-element -- preview of the image the admin just uploaded */}
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
