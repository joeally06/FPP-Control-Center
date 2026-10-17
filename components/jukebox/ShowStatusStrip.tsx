'use client';

import { Users } from 'lucide-react';
import { formatShowTime } from '@/lib/jukebox-display';
import type { ThemeAccent } from './theme-accent';

interface ShowStatusStripProps {
  isActive: boolean;
  nextShowDay: string | null;
  nextShowStartTime: string | null;
  nextShowEndTime: string | null;
  countdown: string | null;
  /** Visitors with the page open right now; null hides the counter */
  audienceCount: number | null;
  accent: ThemeAccent;
}

/** One-line show status: live now, or when the next show starts. */
export default function ShowStatusStrip({
  isActive,
  nextShowDay,
  nextShowStartTime,
  nextShowEndTime,
  countdown,
  audienceCount,
  accent,
}: ShowStatusStripProps) {
  const start = formatShowTime(nextShowStartTime);
  const end = formatShowTime(nextShowEndTime);

  let text: string;
  if (isActive) {
    text = 'The show is live right now!';
  } else if (nextShowDay && start) {
    text = `Next show: ${nextShowDay}, ${start}${end ? ` – ${end}` : ''}${countdown ? ` · starts in ${countdown}` : ''}`;
  } else {
    text = 'No show is running right now.';
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white backdrop-blur-md">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? `${accent.dot} motion-safe:animate-pulse` : 'bg-white/40'}`}
        aria-hidden="true"
      />
      {/* Only the show status is a live region; the audience count changes too often to announce */}
      <span role="status" className="font-semibold">{text}</span>
      {audienceCount !== null && audienceCount > 0 && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-white/80">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          {audienceCount} online now
        </span>
      )}
    </div>
  );
}
