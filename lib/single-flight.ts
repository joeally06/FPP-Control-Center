/**
 * Wraps an async function so only one call runs at a time. A call made while another is
 * running returns undefined right away instead of starting a second run.
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T | undefined> {
  let running = false;
  return async () => {
    if (running) return undefined;
    running = true;
    try {
      return await fn();
    } finally {
      running = false;
    }
  };
}
