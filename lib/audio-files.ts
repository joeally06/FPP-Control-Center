/** The audio types the app keeps in public/audio */
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];

/**
 * Is this a plain audio file name, safe to save as public/audio/<name>? No folders or `..`, something before
 * the extension, and one of the audio extensions. (A file in public/ is served as a web page address, so a
 * name like x.html must never get in.)
 */
export function isSafeAudioFileName(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
  const dot = name.lastIndexOf('.');
  if (dot < 1 || name.slice(0, dot).trim() === '') return false;
  return AUDIO_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}
