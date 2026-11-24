import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

/** data/audio-mapping.json: sequence name → audio file in public/audio (read by the visitor phone sync) */
export const MAPPING_FILE = join(process.cwd(), 'data', 'audio-mapping.json');

export type AudioMapping = Record<string, string>;

// One queue for the whole process, kept on globalThis so routes that Next bundles separately still share it
const queue = globalThis as typeof globalThis & { __audioMappingQueue?: Promise<unknown> };

async function load(file: string): Promise<AudioMapping> {
  let text: string;
  try {
    text = await readFile(file, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as AudioMapping;
  } catch {
    // damaged, handled below
  }
  // Carry on from empty, as before, but keep what was there so nothing is destroyed
  const backup = `${file}.corrupt-${Date.now()}`;
  await copyFile(file, backup);
  console.warn(`[Audio Mapping] ${file} was damaged; a copy was kept at ${backup}`);
  return {};
}

/**
 * rename() over a file replaces it atomically on Linux, even while a reader has it open. Windows (the dev
 * machine) refuses with EPERM/EBUSY for the instant a reader has it open, so try again a few times.
 */
async function renameOverFile(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code !== 'EPERM' && code !== 'EBUSY') || attempt >= 8) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}

async function apply(change: (current: AudioMapping) => AudioMapping | null, file: string): Promise<AudioMapping | null> {
  const next = change({ ...(await load(file)) });
  if (next === null) return null;

  await mkdir(dirname(file), { recursive: true, mode: 0o755 });
  // Write beside the real file, then rename over it: a reader sees the old file or the new one, never half
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o644 });
    await renameOverFile(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  return next;
}

/**
 * Change the audio mappings safely. `change` gets a copy of the current mappings and returns the new full
 * set, or null when there is nothing to write. Updates run one at a time, so two requests at once cannot
 * overwrite each other's entry. Returns what was saved (null if nothing was).
 */
export function updateAudioMappings(
  change: (current: AudioMapping) => AudioMapping | null,
  file: string = MAPPING_FILE
): Promise<AudioMapping | null> {
  const run = (queue.__audioMappingQueue ?? Promise.resolve()).then(() => apply(change, file));
  // A failed update must not block the ones behind it
  queue.__audioMappingQueue = run.catch(() => undefined);
  return run;
}
