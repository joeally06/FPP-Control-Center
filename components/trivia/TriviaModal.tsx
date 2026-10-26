'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import TriviaGame from '@/components/trivia/TriviaGame';

interface TriviaModalProps {
  onClose: () => void;
}

/**
 * Trivia played in a dialog over the visitor page. Closing it ends the game in progress.
 * A tap on the backdrop deliberately does not close it, so a stray tap can't throw a game away.
 */
export default function TriviaModal({ onClose }: TriviaModalProps) {
  // Latest onClose without re-running the key handler effect on every parent render
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Close on Escape, and give focus back to the trigger afterwards (the game's name field takes focus on open)
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Christmas trivia"
        className="sp-modal w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-[1.25rem] p-5 shadow-2xl"
      >
        <div className="-mr-2 -mt-2 flex justify-end">
          <button
            onClick={onClose}
            aria-label="Close trivia"
            className="sp-muted grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <TriviaGame />
      </div>
    </div>
  );
}
