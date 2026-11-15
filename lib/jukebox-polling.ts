import { TIMING } from './constants';

export interface JukeboxLoaders {
  fetchAvailableSequences: () => void;
  fetchPlaylists: () => void;
  fetchData: () => void;
  fetchYouTubeVideos: () => void;
  fetchScheduleStatus: () => void;
  fetchJukeboxSettings: () => void;
  fetchLocationRestrictions: () => void;
  fetchRequestStatus: () => void;
  jukeboxRateLimit: number;
}

type Timers = Pick<typeof globalThis, 'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval'>;

// Wrappers, not the bare functions: a browser's setTimeout throws "Illegal invocation" when it is called as a method of another object.
const browserTimers = {
  setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
  clearTimeout: (id: Parameters<typeof clearTimeout>[0]) => clearTimeout(id),
  setInterval: (fn: () => void, ms?: number) => setInterval(fn, ms),
  clearInterval: (id: Parameters<typeof clearInterval>[0]) => clearInterval(id),
} as Timers;

/** Own every timer together so navigation/role changes cleanly stop polling. */
export function startJukeboxPolling(current: () => JukeboxLoaders, isAdmin: boolean, refreshCache: () => void, timers: Timers = browserTimers) {
  const initial = timers.setTimeout(() => {
    const c = current();
    c.fetchAvailableSequences(); c.fetchPlaylists(); c.fetchData(); c.fetchYouTubeVideos();
    c.fetchScheduleStatus(); c.fetchJukeboxSettings(); c.fetchLocationRestrictions();
  }, 0);
  const fast = timers.setInterval(() => current().fetchData(), TIMING.POLL_INTERVAL_FAST);
  const slow = timers.setInterval(() => current().fetchScheduleStatus(), TIMING.POLL_INTERVAL_SLOW);
  const requests = timers.setInterval(() => {
    const c = current();
    if (c.jukeboxRateLimit > 0) c.fetchRequestStatus();
  }, TIMING.POLL_INTERVAL_MEDIUM);
  const cache = isAdmin ? timers.setInterval(refreshCache, 10 * 60 * 1000) : undefined;
  return () => {
    timers.clearTimeout(initial);
    timers.clearInterval(fast); timers.clearInterval(slow); timers.clearInterval(requests);
    if (cache !== undefined) timers.clearInterval(cache);
  };
}
