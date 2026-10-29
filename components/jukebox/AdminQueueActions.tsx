import { ADMIN_BUTTON } from './admin-buttons';

/** Admin buttons under the Now Playing card. */
export function NowPlayingAdminActions({ onComplete, onSkip }: { onComplete: () => void; onSkip: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onComplete}
        className={`${ADMIN_BUTTON} bg-green-600/90 hover:bg-green-600`}
      >
        ✓ Mark complete
      </button>
      <button
        type="button"
        onClick={onSkip}
        className={`${ADMIN_BUTTON} bg-red-600/90 hover:bg-red-600`}
      >
        ⏭️ Skip
      </button>
    </>
  );
}

/** Admin buttons on a row of the Up Next list. */
export function QueueItemAdminActions({ onPlayNow, onRemove }: { onPlayNow: () => void; onRemove: () => void }) {
  return (
    <>
      <button
        type="button"
        onClick={onPlayNow}
        className={`${ADMIN_BUTTON} bg-blue-600/90 hover:bg-blue-600`}
      >
        ▶️ Play now
      </button>
      <button
        type="button"
        onClick={onRemove}
        className={`${ADMIN_BUTTON} bg-red-600/90 hover:bg-red-600`}
      >
        ✕ Remove
      </button>
    </>
  );
}
