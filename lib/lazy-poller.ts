import { singleFlight } from './single-flight';

interface LazyPollerOptions {
  intervalMs: number;
  /** Whether anyone is still listening; checked on every tick */
  hasClients: () => boolean;
  poll: () => Promise<void> | void;
  /** Called once each time the poller stops itself */
  onStop?: () => void;
}

/**
 * A repeating poll that only runs while someone is listening. It starts on ensureRunning() and
 * stops itself on the first tick that finds no clients, so a missed disconnect can't leave it
 * running. A poll that is still in progress is never started a second time.
 */
export function createLazyPoller(options: LazyPollerOptions) {
  let timer: NodeJS.Timeout | null = null;
  const runPoll = singleFlight(async () => {
    try {
      await options.poll();
    } catch {
      // A failed poll must never stop the timer
    }
  });

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    options.onStop?.();
  }

  return {
    /** Starts the timer if it isn't running. Call after registering the client. */
    ensureRunning() {
      if (timer) return;
      timer = setInterval(() => {
        if (!options.hasClients()) {
          stop();
          return;
        }
        void runPoll();
      }, options.intervalMs);
    },
    /** One poll right now (skipped if one is already in progress) */
    pollNow: () => runPoll(),
    isRunning: () => timer !== null,
  };
}
