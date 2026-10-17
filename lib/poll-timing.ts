// When the FPP poller should check again. Pure, so scripts/test-poll-timing.ts can cover it
// (lib/fpp-poller.ts starts polling as soon as it is imported).

/** How long after a song's expected end to check, so FPP has already moved on to the next one */
export const SONG_CHANGE_GRACE_MS = 1000;

/**
 * The normal poll interval, or less when the current song ends sooner: the cache then picks up the next song
 * about a second after it starts instead of up to a whole interval later. Always at least the grace period,
 * so a song that keeps reporting "about to end" can't make the poller spin.
 */
export function nextPollDelay(intervalMs: number, secondsRemaining: number | null | undefined): number {
  if (typeof secondsRemaining !== 'number' || !Number.isFinite(secondsRemaining) || secondsRemaining <= 0) return intervalMs;
  return Math.min(intervalMs, secondsRemaining * 1000 + SONG_CHANGE_GRACE_MS);
}
