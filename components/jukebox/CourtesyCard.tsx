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
    <section aria-labelledby="courtesy-heading" className="sp-panel relative">
      <span className="sp-eyebrow pr-10">While you watch</span>
      <h2 id="courtesy-heading" className="sp-display sp-h2 pr-10">Be a good neighbor</h2>
      <ul className="mt-3.5 space-y-3">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-3">
            <Car className="sp-soft mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss reminders"
        className="sp-muted absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
