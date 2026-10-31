export function debugLog(...args: unknown[]) {
  const debugEnabled = process.env.JUKEBOX_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
  if (debugEnabled) console.log(...args);
}
