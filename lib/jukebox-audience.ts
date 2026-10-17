// "Online now" counter for the visitor jukebox page.
// Counts distinct visitors (salted hashes of their IP) seen in the last minute. Kept in memory only:
// nothing is written to the database or logged, and the salt changes every time the server restarts.

import crypto from 'crypto';

export interface PresenceTracker {
  /** Record that `key` was seen at `now` (ms) */
  touch(key: string, now: number): void;
  /** Number of distinct keys seen within the window ending at `now` */
  count(now: number): number;
}

export function createPresenceTracker({ windowMs, maxTracked }: { windowMs: number; maxTracked: number }): PresenceTracker {
  // Insertion order = last-seen order, so expired keys are always at the front
  const lastSeen = new Map<string, number>();

  const prune = (now: number) => {
    for (const [key, seenAt] of lastSeen) {
      if (now - seenAt < windowMs && lastSeen.size <= maxTracked) break;
      lastSeen.delete(key);
    }
  };

  return {
    touch(key, now) {
      lastSeen.delete(key);
      lastSeen.set(key, now);
      prune(now);
    },
    count(now) {
      prune(now);
      return lastSeen.size;
    },
  };
}

const AUDIENCE_WINDOW_MS = 60_000;
const AUDIENCE_MAX_TRACKED = 5000;

// One tracker per server process (PM2 runs a single fpp-control instance); on globalThis so dev hot reloads keep it
const globalForAudience = globalThis as typeof globalThis & {
  jukeboxAudience?: { tracker: PresenceTracker; salt: string };
};

function getAudience() {
  globalForAudience.jukeboxAudience ??= {
    tracker: createPresenceTracker({ windowMs: AUDIENCE_WINDOW_MS, maxTracked: AUDIENCE_MAX_TRACKED }),
    salt: crypto.randomBytes(16).toString('hex'),
  };
  return globalForAudience.jukeboxAudience;
}

/** Count this visitor as present and return how many visitors are online now. */
export function recordAudienceVisit(ip: string, now: number = Date.now()): number {
  const audience = getAudience();
  const key = crypto.createHash('sha256').update(audience.salt + ip).digest('hex');
  audience.tracker.touch(key, now);
  return audience.tracker.count(now);
}
