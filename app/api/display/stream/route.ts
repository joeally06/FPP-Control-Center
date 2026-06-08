import { NextRequest, NextResponse } from 'next/server';
import {
  getFPPState,
  getCurrentlyPlaying,
  getQueue,
  getSequenceMetadata,
  getMediaLibraryMetadata,
  getActiveScheduleRule,
} from '@/lib/database';
import { getFppUrl } from '@/lib/fpp-config';
import { getSetting } from '@/lib/settings';
import type { DisplayConfig, DisplayState, UpcomingQueueItem, ColorTheme, BackgroundStyle, FontStyle, LayoutVariant, QueuePosition, IdleAnimation, ZoneConfig } from '@/types/display';

// ─── Singleton state & clients ──────────────────────────────────────────────

const clients = new Set<ReadableStreamDefaultController>();

const JUKEBOX_URL = `${process.env.NEXTAUTH_URL ?? 'http://localhost:3000'}/jukebox`;

function readConfig(): DisplayConfig {
  const s = (key: string, fb: string) => getSetting(key) ?? fb;
  const b = (key: string, fb: boolean) => (getSetting(key) ?? String(fb)) === 'true';
  const n = (key: string, fb: number) => parseInt(getSetting(key) ?? String(fb), 10);

  return {
    showName:           s('display_show_name',           'Christmas Light Show'),
    showQr:             b('display_show_qr',             true),
    queueCount:         n('display_queue_count',         4),
    enabled:            b('display_enabled',             true),
    colorTheme:         s('display_color_theme',         'christmas') as ColorTheme,
    accentColor:        s('display_accent_color',        '#ef4444'),
    backgroundStyle:    s('display_background_style',    'gradient') as BackgroundStyle,
    fontStyle:          s('display_font_style',          'modern') as FontStyle,
    fontScale:          n('display_font_scale',          100),
    layoutVariant:      s('display_layout_variant',      'sidebar') as LayoutVariant,
    albumArtSize:       n('display_album_art_size',      34),
    queuePosition:      s('display_queue_position',      'bottom') as QueuePosition,
    idleMessage:        s('display_idle_message',        'The show will begin shortly'),
    logoUrl:            s('display_logo_url',            ''),
    sponsorText:        s('display_sponsor_text',        ''),
    fmFrequency:        s('display_fm_frequency',        ''),
    idleAnimation:      s('display_idle_animation',      'snowflakes') as IdleAnimation,
    showClock:          b('display_show_clock',          true),
    idleBackgroundUrl:  s('display_idle_background_url', ''),
    tickerText:         s('display_ticker_text',         ''),
    slideshowUrl:       s('display_slideshow_url',       ''),
    zoneConfig:         (() => { try { return JSON.parse(s('display_zone_config', '{}')); } catch { return undefined; } })(),
  };
}

let currentState: DisplayState = {
  isPlaying: false,
  sequenceName: null,
  songTitle: null,
  artist: null,
  albumArtUrl: null,
  secondsPlayed: 0,
  secondsRemaining: 0,
  playlistName: null,
  trackIndex: null,
  trackCount: null,
  requesterName: null,
  upcomingQueue: [],
  jukeboxUrl: JUKEBOX_URL,
  config: readConfig(),
  activeAnnouncement: null,
  activeScheduleRule: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanName(name: string): string {
  return name
    .replace(/\.(fseq|mp3|wav|ogg|m4a|flac|aac)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

/**
 * Normalise a raw FPP sequence/media name into a bare name for DB lookups.
 * e.g. "Pick Out A Christmas Tree.fseq" → "Pick Out A Christmas Tree"
 *      "intro_25.mp3" → "intro_25" and also "intro" (strip trailing _NN)
 */
function candidateKeys(rawName: string): string[] {
  const bare = rawName.replace(/\.(fseq|mp3|wav|ogg|m4a|flac|aac)$/i, '').trim();
  const keys: string[] = [bare];
  // Also try with the original .mp3 form (sequence_metadata keys)
  keys.push(`${bare}.mp3`);
  // Strip trailing _YY / _25 year/version suffixes added by FPP
  const stripped = bare.replace(/_\d{2,4}$/, '').trim();
  if (stripped !== bare) {
    keys.push(stripped);
    keys.push(`${stripped}.mp3`);
  }
  return [...new Set(keys)];
}

interface MetaResult {
  songTitle: string | null;
  artist: string | null;
  albumArtUrl: string | null;
}

/**
 * Look up Spotify metadata for a sequence, checking all available DB tables.
 * Priority: spotify_metadata (media library) > sequence_metadata (jukebox cache)
 * Returns null fields rather than throwing so callers can fall back to cleanName.
 */
function lookupMeta(rawName: string): MetaResult {
  const keys = candidateKeys(rawName);

  // 1. Check spotify_metadata (media library) — uses bare name, has artist_name / track_name
  for (const k of keys) {
    const row = getMediaLibraryMetadata.get(k) as any;
    if (row?.album_art_url || row?.track_name) {
      return {
        songTitle: row.track_name ?? null,
        artist: row.artist_name ?? null,
        albumArtUrl: row.album_art_url ?? null,
      };
    }
  }

  // 2. Check sequence_metadata (jukebox Spotify cache) — uses .mp3 keys, has song_title / artist
  for (const k of keys) {
    const row = getSequenceMetadata.get(k) as any;
    if (row?.album_cover_url || row?.song_title) {
      return {
        songTitle: row.song_title ?? null,
        artist: row.artist ?? null,
        albumArtUrl: row.album_cover_url ?? null,
      };
    }
  }

  return { songTitle: null, artist: null, albumArtUrl: null };
}

/**
 * Fetch the upcoming sequence names from a FPP playlist, starting at the
 * item AFTER currentIndex (0-based), capped at `limit`.
 */
async function fetchUpcomingFromPlaylist(
  playlistName: string,
  currentIndex: number,
  limit: number,
): Promise<string[]> {
  try {
    const url = `${getFppUrl()}/api/playlist/${encodeURIComponent(playlistName)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();

    // FPP playlist response: { mainPlaylist: [ { sequenceName, mediaName, ... }, ... ] }
    const items: any[] = data.mainPlaylist ?? data.entries ?? [];
    const next = items.slice(currentIndex + 1, currentIndex + 1 + limit);
    return next
      .map((item: any) => item.sequenceName ?? item.mediaName ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Polling ─────────────────────────────────────────────────────────────────

/**
 * Resolve FPP status, preferring the DB cache (fpp_state) but falling back
 * to a direct FPP API call when the cache is stale or the poller isn't running.
 * This mirrors the logic in app/api/jukebox/status/route.ts.
 */
async function resolveFPPStatus(): Promise<{
  statusName: string;
  currentSequence: string | null;
  secondsPlayed: number;
  secondsRemaining: number;
  currentPlaylist: string | null;
  trackIndex: number | null;
  trackCount: number | null;
} | null> {
  // 1. Try DB cache first
  try {
    const fppState = getFPPState.get() as any;
    if (fppState && fppState.status === 'playing' && fppState.current_sequence) {
      const cacheAgeMs = Date.now() - new Date(fppState.last_updated).getTime();
      // Accept cache if fresher than 30 seconds
      if (cacheAgeMs < 30_000) {
        return {
          statusName: fppState.status,
          currentSequence: fppState.current_sequence,
          secondsPlayed: Number(fppState.seconds_played) || 0,
          secondsRemaining: Number(fppState.seconds_remaining) || 0,
          currentPlaylist: fppState.current_playlist ?? null,
          trackIndex: fppState.current_playlist_index != null
            ? Number(fppState.current_playlist_index) + 1
            : null,
          trackCount: fppState.current_playlist_count != null
            ? Number(fppState.current_playlist_count)
            : null,
        };
      }
    }
    // Cache is idle/stale/unknown — fall through to direct FPP query
  } catch {
    // DB unavailable — fall through
  }

  // 2. Fallback: query FPP directly (same as jukebox status route)
  try {
    const fppResponse = await fetch(`${getFppUrl()}/api/fppd/status`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });

    if (!fppResponse.ok) return null;
    const data = await fppResponse.json();

    if (data.status_name !== 'playing') return null;

    const sp = typeof data.seconds_played === 'string'
      ? parseFloat(data.seconds_played)
      : Number(data.seconds_played ?? 0);
    const sr = typeof data.seconds_remaining === 'string'
      ? parseFloat(data.seconds_remaining)
      : Number(data.seconds_remaining ?? 0);

    return {
      statusName: 'playing',
      currentSequence: data.current_sequence ?? data.current_song?.replace(/\.mp3$/i, '.fseq') ?? null,
      secondsPlayed: sp,
      secondsRemaining: sr,
      currentPlaylist: data.current_playlist?.playlist ?? null,
      trackIndex: data.current_playlist?.index != null
        ? Number(data.current_playlist.index) + 1
        : null,
      trackCount: data.current_playlist?.count ?? null,
    };
  } catch {
    return null;
  }
}

async function pollDisplayState(): Promise<void> {
  try {
    const fppStatus = await resolveFPPStatus();
    const isPlaying = fppStatus !== null;

    let sequenceName: string | null = null;
    let songTitle: string | null = null;
    let artist: string | null = null;
    let albumArtUrl: string | null = null;
    let secondsPlayed = 0;
    let secondsRemaining = 0;
    let playlistName: string | null = null;
    let trackIndex: number | null = null;
    let trackCount: number | null = null;
    let requesterName: string | null = null;

    if (isPlaying && fppStatus) {
      sequenceName = fppStatus.currentSequence;
      secondsPlayed = fppStatus.secondsPlayed;
      secondsRemaining = fppStatus.secondsRemaining;
      playlistName = fppStatus.currentPlaylist;
      trackIndex = fppStatus.trackIndex;
      trackCount = fppStatus.trackCount;

      // Enrich with cached Spotify metadata (DB only — no external calls)
      if (sequenceName) {
        const meta = lookupMeta(sequenceName);
        songTitle = meta.songTitle ?? cleanName(sequenceName);
        artist = meta.artist;
        albumArtUrl = meta.albumArtUrl;
      }

      // Requester: prefer jukebox playing item, fall back to "FPP Schedule"
      const jukeboxCurrent = getCurrentlyPlaying.get() as any;
      requesterName =
        jukeboxCurrent?.requester_name?.trim()
          ? jukeboxCurrent.requester_name
          : 'FPP Schedule';
    }

    // Re-read config on every poll so admin changes take effect immediately
    const config = readConfig();
    const maxQueue = Math.max(1, Math.min(5, config.queueCount));

    // Compute active announcement
    const announcementText    = getSetting('display_announcement_text')    ?? '';
    const announcementExpires = parseInt(getSetting('display_announcement_expires') ?? '0', 10);
    const nowSec = Math.floor(Date.now() / 1000);
    let activeAnnouncement  = announcementExpires > nowSec && announcementText ? announcementText : null;

    // Apply active schedule rule overrides (Plan B)
    let activeScheduleRule: string | null = null;
    try {
      const rule = getActiveScheduleRule();
      if (rule) {
        activeScheduleRule = rule.name;
        const payload = JSON.parse(rule.actionPayload || '{}');
        switch (rule.actionType) {
          case 'slideshow':
            config.slideshowUrl = typeof payload.url === 'string' ? payload.url : '';
            break;
          case 'custom_display':
            config.slideshowUrl = '';
            break;
          case 'theme':
            if (payload.colorTheme) config.colorTheme = payload.colorTheme as ColorTheme;
            if (payload.accentColor) config.accentColor = payload.accentColor;
            break;
          case 'announcement':
            // Manual announcements win over scheduled ones
            if (!activeAnnouncement && typeof payload.text === 'string') {
              activeAnnouncement = payload.text;
            }
            break;
        }
      }
    } catch {
      // Ignore schedule errors — never crash the poll
    }

    // Upcoming songs: prefer jukebox queue, fall back to FPP playlist API
    let upcomingQueue: UpcomingQueueItem[] = [];
    const pendingJukebox = (getQueue.all() as any[]).slice(0, maxQueue);

    if (pendingJukebox.length > 0) {
      upcomingQueue = pendingJukebox.map((row: any) => {
        const meta = lookupMeta(row.sequence_name as string);
        return {
          sequenceName: row.sequence_name,
          songTitle: meta.songTitle ?? cleanName(row.sequence_name as string),
          artist: meta.artist,
          requesterName: row.requester_name ?? 'FPP Schedule',
        };
      });
    } else if (fppStatus?.currentPlaylist && fppStatus.trackIndex != null) {
      // Scheduled playlist — fetch next songs from FPP playlist API
      // trackIndex is 1-based; convert back to 0-based for the slice
      const zeroBasedIndex = fppStatus.trackIndex - 1;
      const nextSeqNames = await fetchUpcomingFromPlaylist(
        fppStatus.currentPlaylist,
        zeroBasedIndex,
        maxQueue,
      );
      upcomingQueue = nextSeqNames.map((seqName) => {
        const meta = lookupMeta(seqName);
        return {
          sequenceName: seqName,
          songTitle: meta.songTitle ?? cleanName(seqName),
          artist: meta.artist,
          requesterName: 'FPP Schedule',
        };
      });
    }

    const newState: DisplayState = {
      isPlaying,
      sequenceName,
      songTitle,
      artist,
      albumArtUrl,
      secondsPlayed,
      secondsRemaining,
      playlistName,
      trackIndex,
      trackCount,
      requesterName,
      upcomingQueue,
      jukeboxUrl: JUKEBOX_URL,
      config,
      activeAnnouncement,
      activeScheduleRule,
    };

    // Broadcast on meaningful change, or continuously while playing (for progress)
    const configChanged = JSON.stringify(config) !== JSON.stringify(currentState.config);
    const significantChange =
      configChanged ||
      newState.isPlaying !== currentState.isPlaying ||
      newState.sequenceName !== currentState.sequenceName ||
      newState.requesterName !== currentState.requesterName ||
      newState.upcomingQueue.length !== currentState.upcomingQueue.length ||
      newState.activeAnnouncement !== currentState.activeAnnouncement;

    if (significantChange || isPlaying) {
      currentState = newState;
      broadcast(currentState);
    }
  } catch {
    // Fail silently — never crash the polling interval
  }
}

function broadcast(data: DisplayState): void {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  const dead: ReadableStreamDefaultController[] = [];

  clients.forEach((ctrl) => {
    try {
      ctrl.enqueue(message);
    } catch {
      dead.push(ctrl);
    }
  });

  dead.forEach((c) => clients.delete(c));
}

// ─── Module-level singleton polling (2 s) ────────────────────────────────────

let pollingInterval: NodeJS.Timeout | null = null;
if (!pollingInterval) {
  // Fire immediately so the first SSE push reflects live state
  pollDisplayState();
  pollingInterval = setInterval(() => { pollDisplayState(); }, 2000);
}

// ─── SSE route (no auth — publicly accessible for the Raspberry Pi kiosk) ───

export async function GET(req: NextRequest) {
  // Trigger an immediate poll so the connecting client gets fresh data right away
  pollDisplayState();

  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller);

      // Push current state immediately on connect
      try {
        controller.enqueue(`data: ${JSON.stringify(currentState)}\n\n`);
      } catch {
        // ignore
      }

      // Keep-alive ping every 30 s to prevent proxy timeouts
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(': ping\n\n');
        } catch {
          clearInterval(keepAlive);
          clients.delete(controller);
        }
      }, 30_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        clients.delete(controller);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
