'use client';

import { useState, useSyncExternalStore } from 'react';
import { Car, X } from 'lucide-react';

const STORAGE_KEY = 'fpp-jukebox-courtesy-dismissed';
const CHANGE_EVENT = 'fpp-jukebox-courtesy-change';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readDismissed(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage blocked - just show the card
  }
}

interface CourtesyCardProps {
  lines: string[];
}

/** Dismissible viewing reminders. Dismissal is remembered per browser until the text changes. */
export default function CourtesyCard({ lines }: CourtesyCardProps) {
  const signature = lines.join('\n');
  // Server render treats the card as dismissed so it never flashes before storage is read
  const storedSignature = useSyncExternalStore(subscribe, readDismissed, () => signature);
  // Covers browsers where storage is blocked: dismissal lasts for this page view
  const [dismissedThisView, setDismissedThisView] = useState(false);

  if (lines.length === 0 || dismissedThisView || storedSignature === signature) return null;

  const dismiss = () => {
    setDismissedThisView(true);
    try {
      localStorage.setItem(STORAGE_KEY, signature);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      // storage blocked - dismissedThisView already hides the card
    }
  };

  return (
    <section
      aria-label="Viewing reminders"
      className="relative rounded-2xl border border-amber-400/40 bg-amber-950/60 p-4 text-white shadow-xl backdrop-blur-md"
    >
      <div className="flex items-start gap-3 pr-10">
        <div className="shrink-0 rounded-xl bg-amber-400/15 p-2 text-amber-300" aria-hidden="true">
          <Car className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-amber-200">Watching from your car?</h2>
          <ul className="mt-1.5 space-y-1 text-sm text-white/90">
            {lines.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss reminders"
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
