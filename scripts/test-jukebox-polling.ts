import assert from 'assert';
import { startJukeboxPolling, type JukeboxLoaders } from '../lib/jukebox-polling';

function print(msg: string) {
  console.log('[test-jukebox-polling] ' + msg);
}

const calls: string[] = [];
const loaders: JukeboxLoaders = {
  fetchAvailableSequences: () => calls.push('sequences'),
  fetchPlaylists: () => calls.push('playlists'),
  fetchData: () => calls.push('data'),
  fetchYouTubeVideos: () => calls.push('youtube'),
  fetchScheduleStatus: () => calls.push('schedule'),
  fetchJukeboxSettings: () => calls.push('settings'),
  fetchLocationRestrictions: () => calls.push('location'),
  fetchRequestStatus: () => calls.push('request'),
  jukeboxRateLimit: 1,
};

print('Test 1: the default timers work the way a browser needs (window.setTimeout throws "Illegal invocation" when called as a method of another object)');
// Browsers reject a timer function whose `this` is neither the window nor undefined. Node does not, so imitate it.
const real = { setTimeout, clearTimeout, setInterval, clearInterval };
const browserLike = <F extends (...args: never[]) => unknown>(fn: F) =>
  function (this: unknown, ...args: Parameters<F>) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return fn(...args);
  };
Object.assign(globalThis, {
  setTimeout: browserLike(real.setTimeout as (...a: never[]) => unknown),
  clearTimeout: browserLike(real.clearTimeout as (...a: never[]) => unknown),
  setInterval: browserLike(real.setInterval as (...a: never[]) => unknown),
  clearInterval: browserLike(real.clearInterval as (...a: never[]) => unknown),
});
try {
  const stop = startJukeboxPolling(() => loaders, true, () => {});
  stop();
} finally {
  Object.assign(globalThis, real);
}

print('Test 2: stopping clears every timer, and the first load runs once');
const cleared: string[] = [];
const fake = {
  setTimeout: (fn: () => void) => { fn(); return 't'; },
  clearTimeout: (id: unknown) => { cleared.push(String(id)); },
  setInterval: (_fn: () => void, ms?: number) => 'i' + ms,
  clearInterval: (id: unknown) => { cleared.push(String(id)); },
} as unknown as Parameters<typeof startJukeboxPolling>[3];
const stopFake = startJukeboxPolling(() => loaders, true, () => {}, fake);
assert.deepStrictEqual(calls, ['sequences', 'playlists', 'data', 'youtube', 'schedule', 'settings', 'location']);
stopFake();
assert.strictEqual(cleared.length, 5, 'the first-load timer, three polls and the admin cache refresh');
cleared.length = 0;
startJukeboxPolling(() => loaders, false, () => {}, fake)();
assert.strictEqual(cleared.length, 4, 'no cache refresh timer for visitors');

print('All tests passed');
