/**
 * A small in-memory limiter: at most `max` calls per key in each `windowMs`. Resets when the
 * server restarts, which is fine for cheap public endpoints that only need a brake on abuse.
 */
export function createFixedWindowLimiter(options: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; windowStart: number }>();
  let lastSweep = 0;

  return {
    /** True if this call is allowed; false once the key is over its limit for the window */
    allow(key: string, now: number = Date.now()): boolean {
      // Drop windows that have ended so the map can't grow without bound. Once per window at
      // most, so a flood of different keys doesn't make every call walk the whole map.
      if (now - lastSweep >= options.windowMs) {
        lastSweep = now;
        for (const [existingKey, entry] of hits) {
          if (now - entry.windowStart >= options.windowMs) hits.delete(existingKey);
        }
      }

      const entry = hits.get(key);
      if (!entry || now - entry.windowStart >= options.windowMs) {
        hits.set(key, { count: 1, windowStart: now });
        return true;
      }
      if (entry.count >= options.max) return false;
      entry.count++;
      return true;
    },
  };
}
