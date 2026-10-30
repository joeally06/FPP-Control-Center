// The Digital Sign settings form: what is saved on the server, and the draft being edited. Plain functions so they can be tested.

import type { DisplayConfig } from '@/types/display';
import { DEFAULT_DISPLAY_CONFIG } from '@/lib/display-defaults';

export interface DisplayForm {
  saved: DisplayConfig;
  config: DisplayConfig;
}

/** A form with nothing edited, from settings as the server sent them */
export function formFrom(server: Partial<DisplayConfig>): DisplayForm {
  const config = { ...DEFAULT_DISPLAY_CONFIG, ...server };
  return { saved: config, config };
}

/** True when the draft differs from what is saved. Every copy is built the same way, so key order matches. */
export function isDirty(form: DisplayForm): boolean {
  return JSON.stringify(form.saved) !== JSON.stringify(form.config);
}

export function withEdit(form: DisplayForm, patch: Partial<DisplayConfig>): DisplayForm {
  return { ...form, config: { ...form.config, ...patch } };
}

/** Photos are written on the server as soon as they are added or removed, so they count as saved and are never lost by Discard */
export function withPhotosSaved(form: DisplayForm, images: string[]): DisplayForm {
  return {
    saved: { ...form.saved, idleSlideshowImages: images },
    config: { ...form.config, idleSlideshowImages: images },
  };
}

export function discarded(form: DisplayForm): DisplayForm {
  return { ...form, config: form.saved };
}
