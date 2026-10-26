'use client';

import { useEffect, useRef } from 'react';
import { formatClock, songDetailsLine, type CatalogSong } from '@/lib/jukebox-display';

interface RequestConfirmModalProps {
  song: CatalogSong;
  /** Position the request will take in the queue (1 = next) */
  position: number;
  currentRemainingSec: number | null;
  /** Estimated seconds until this request starts, when every song ahead has a known length */
  waitSec: number | null;
  requesterName: string;
  onRequesterNameChange: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** Dialog heading; defaults to "Request this song?" */
  heading?: string;
}

function waitText(position: number, currentRemainingSec: number | null, waitSec: number | null): string {
  if (waitSec != null) {
    return `${position === 1 ? "You'll be next" : `You'll be #${position} in line`} — about ${formatClock(waitSec)} from now.`;
  }
  if (currentRemainingSec == null) return position === 1 ? "You'll be next in line." : `You'll be #${position} in line.`;
  if (position === 1) return `You'll be next — after the current song (about ${formatClock(currentRemainingSec)}).`;
  const ahead = position - 1;
  return `You'll be #${position} in line: the current song ends in about ${formatClock(currentRemainingSec)}, then ${ahead} ${ahead === 1 ? 'request' : 'requests'} before yours.`;
}

export default function RequestConfirmModal({
  song,
  position,
  currentRemainingSec,
  waitSec,
  requesterName,
  onRequesterNameChange,
  onConfirm,
  onCancel,
  heading = 'Request this song?',
}: RequestConfirmModalProps) {
  const details = songDetailsLine(song);
  const nameRef = useRef<HTMLInputElement>(null);
  // Latest onCancel without re-running the focus effect on every parent render
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  // Move focus into the dialog, close on Escape, and give focus back to the trigger afterwards
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-dialog-title"
        className="sp-modal w-full max-w-md rounded-[1.25rem] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="request-dialog-title" className="sp-eyebrow">{heading}</h2>
        <p className="sp-display sp-title mt-2 text-2xl leading-tight">{song.title || song.name}</p>
        {details && <p className="sp-muted text-sm">{details}</p>}
        <p className="mt-2 text-sm">{waitText(position, currentRemainingSec, waitSec)}</p>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium">Your name (optional)</span>
            <input
              ref={nameRef}
              type="text"
              value={requesterName}
              onChange={(e) => onRequesterNameChange(e.target.value)}
              maxLength={50}
              placeholder="Shown in the queue"
              className="sp-input mt-1.5 w-full rounded-xl px-3 py-2.5"
            />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="sp-btn-quiet min-h-11 flex-1 rounded-full font-semibold transition">
              Cancel
            </button>
            <button type="submit" className="sp-btn-accent min-h-11 flex-1 rounded-full font-extrabold transition">
              Add to queue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
