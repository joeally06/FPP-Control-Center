'use client';

import { useEffect, useRef } from 'react';
import { formatClock } from '@/lib/jukebox-display';
import type { ThemeAccent } from './theme-accent';

interface RequestConfirmModalProps {
  song: string;
  /** Position the request will take in the queue (1 = next) */
  position: number;
  currentRemainingSec: number | null;
  requesterName: string;
  onRequesterNameChange: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  accent: ThemeAccent;
}

function waitText(position: number, currentRemainingSec: number | null): string {
  if (currentRemainingSec == null) return position === 1 ? "You'll be next in line." : `You'll be #${position} in line.`;
  if (position === 1) return `You'll be next — after the current song (about ${formatClock(currentRemainingSec)}).`;
  const ahead = position - 1;
  return `You'll be #${position} in line: the current song ends in about ${formatClock(currentRemainingSec)}, then ${ahead} ${ahead === 1 ? 'request' : 'requests'} before yours.`;
}

export default function RequestConfirmModal({
  song,
  position,
  currentRemainingSec,
  requesterName,
  onRequesterNameChange,
  onConfirm,
  onCancel,
  accent,
}: RequestConfirmModalProps) {
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
        className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-950 p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="request-dialog-title" className="text-lg font-bold">Request this song?</h2>
        <p className="mt-2 text-xl font-extrabold themed-font">{song}</p>
        <p className="mt-2 text-sm text-white/80">{waitText(position, currentRemainingSec)}</p>

        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm();
          }}
        >
          <label className="block">
            <span className="text-sm font-medium text-white/90">Your name (optional)</span>
            <input
              ref={nameRef}
              type="text"
              value={requesterName}
              onChange={(e) => onRequesterNameChange(e.target.value)}
              maxLength={50}
              placeholder="Shown in the queue"
              className={`mt-1.5 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-white placeholder-white/50 focus:outline-none focus-visible:ring-2 ${accent.focus}`}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 flex-1 rounded-xl border border-white/20 bg-white/10 font-semibold transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`min-h-11 flex-1 rounded-xl font-bold transition focus:outline-none focus-visible:ring-2 ${accent.focus} ${accent.button}`}
            >
              Add to queue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
