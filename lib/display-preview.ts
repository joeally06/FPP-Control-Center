// The settings page shows the sign in a frame and sends it the settings as they are being edited (before they are saved).
// This is the message between the two pages, and the sample song the frame plays.

import type { DisplayConfig, DisplayState } from '@/types/display';
import { DEFAULT_DISPLAY_CONFIG } from '@/lib/display-defaults';

export type PreviewScreen = 'playing' | 'idle';

export interface PreviewMessage {
  type: 'display-preview';
  screen: PreviewScreen;
  config: DisplayConfig;
}

/** Sent by the frame once it is listening, so the settings page can send the current draft */
export const PREVIEW_READY = { type: 'display-preview-ready' } as const;

const sameKind = (value: unknown, sample: unknown): boolean =>
  Array.isArray(sample) ? Array.isArray(value) && value.every((v) => typeof v === 'string') : typeof value === typeof sample;

/** Keep only the settings the sign knows, each with the right kind of value; anything else falls back to the default */
export function sanitizePreviewConfig(raw: unknown): DisplayConfig {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const clean: Record<string, unknown> = { ...DEFAULT_DISPLAY_CONFIG };
  for (const key of Object.keys(DEFAULT_DISPLAY_CONFIG)) {
    const sample = (DEFAULT_DISPLAY_CONFIG as unknown as Record<string, unknown>)[key];
    if (key in source && sameKind(source[key], sample)) clean[key] = source[key];
  }
  return clean as unknown as DisplayConfig;
}

/** The message's content if it is a well-formed preview message, otherwise null. Check where it came from before calling this. */
export function parsePreviewMessage(data: unknown): PreviewMessage | null {
  if (data === null || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  if (message.type !== 'display-preview') return null;
  if (message.screen !== 'playing' && message.screen !== 'idle') return null;
  if (message.config === null || typeof message.config !== 'object' || Array.isArray(message.config)) return null;
  return { type: 'display-preview', screen: message.screen, config: sanitizePreviewConfig(message.config) };
}

// A gradient stands in for album art, so the blurred background and the art tile both show
const SAMPLE_ART = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
  + '<stop offset="0" stop-color="#0ea5e9"/><stop offset="0.55" stop-color="#1e3a8a"/><stop offset="1" stop-color="#0f172a"/>'
  + '</linearGradient></defs><rect width="600" height="600" fill="url(#g)"/></svg>',
)}`;

/** What the sign shows while a song plays, with a made-up song and queue */
export function sampleNowPlaying(config: DisplayConfig, jukeboxUrl: string): DisplayState {
  return {
    isPlaying: true,
    sequenceName: 'jingle-bell-rock.fseq',
    songTitle: 'Jingle Bell Rock',
    artist: 'Bobby Helms',
    albumArtUrl: SAMPLE_ART,
    secondsPlayed: 83,
    secondsRemaining: 102,
    playlistName: 'Main Show',
    trackIndex: 7,
    trackCount: 24,
    requesterName: 'Maria',
    upcomingQueue: [
      { sequenceName: 'sleigh-ride.fseq', songTitle: 'Sleigh Ride', artist: 'The Ronettes', requesterName: 'Daniel' },
      { sequenceName: 'carol-of-the-bells.fseq', songTitle: 'Carol of the Bells', artist: 'Trans-Siberian Orchestra', requesterName: 'FPP Schedule' },
      { sequenceName: 'white-christmas.fseq', songTitle: 'White Christmas', artist: 'Bing Crosby', requesterName: 'Sam' },
    ].slice(0, Math.max(1, config.queueCount)),
    jukeboxUrl,
    config,
    activeAnnouncement: null,
    activeScheduleRule: null,
  };
}
