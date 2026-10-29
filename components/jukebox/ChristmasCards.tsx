import { Mail } from 'lucide-react';

/** Write to Santa (Christmas theme only) */
export function SantaCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section aria-labelledby="santa-heading" className="sp-panel sp-santa grid gap-3.5">
      <div className="flex items-start gap-3.5">
        <Mail className="sp-title mt-1 h-10 w-10 shrink-0" aria-hidden="true" />
        <div>
          <span className="sp-eyebrow">North Pole mail</span>
          <h2 id="santa-heading" className="sp-display sp-h2">Write a letter to Santa</h2>
          <p className="sp-muted mt-1 text-sm">
            Send your Christmas wishes to the North Pole and get a reply from Santa himself.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="sp-btn-accent min-h-12 rounded-full px-6 font-extrabold transition"
      >
        Write to Santa
      </button>
    </section>
  );
}

/** The trivia game is Christmas trivia */
export function TriviaCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section aria-labelledby="trivia-heading" className="sp-panel grid gap-3.5">
      <div>
        <span className="sp-eyebrow">Play along</span>
        <h2 id="trivia-heading" className="sp-display sp-h2">Christmas trivia</h2>
        <p className="sp-muted mt-1 text-sm">Test your holiday know-how while the lights play.</p>
      </div>
      <button
        onClick={onOpen}
        className="sp-btn-outline inline-flex min-h-12 items-center justify-center rounded-full px-6 font-extrabold transition"
      >
        Play Christmas trivia
      </button>
    </section>
  );
}
