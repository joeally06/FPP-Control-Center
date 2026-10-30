export type ColorTheme     = 'christmas' | 'winter' | 'classic' | 'custom';
export type BackgroundStyle = 'solid' | 'gradient' | 'particles';
export type FontStyle       = 'modern' | 'display' | 'serif';
export type IdleAnimation   = 'snowflakes' | 'notes' | 'stars' | 'none';
// What the sign shows when no song is playing
export type IdleMode        = 'info' | 'photos' | 'slides';

// ─── Schedule (Plan B) ───────────────────────────────────────────────────────
export type ScheduleActionType = 'slideshow' | 'theme' | 'announcement' | 'custom_display';

export interface ScheduleRule {
  id: number;
  name: string;
  enabled: boolean;
  days: string;        // comma-separated 0–6 (Sun–Sat)
  startTime: string;   // HH:MM 24 h
  endTime: string;     // HH:MM 24 h
  actionType: ScheduleActionType;
  actionPayload: string; // JSON string
  priority: number;
  createdAt: string;
}

// ─── Core config ─────────────────────────────────────────────────────────────
export interface DisplayConfig {
  // Core
  showName: string;
  showQr: boolean;
  queueCount: number;
  enabled: boolean;
  // Theme & colors
  colorTheme: ColorTheme;
  accentColor: string;
  backgroundStyle: BackgroundStyle;
  // Typography
  fontStyle: FontStyle;
  fontScale: number;
  // Text & branding
  idleMessage: string;
  logoUrl: string;
  sponsorText: string;
  fmFrequency: string;
  // Idle screen
  idleAnimation: IdleAnimation;
  showClock: boolean;
  idleBackgroundUrl: string;
  // Ticker
  tickerText: string;
  // Which idle screen is on: the info panels, the photo slideshow, or Google Slides
  idleMode: IdleMode;
  // Idle slideshow (Google Slides)
  slideshowUrl: string;
  // Local image slideshow (Option 1)
  idleSlideshowImages: string[];   // array of /uploads/display/slideshow-N.jpg URLs
  idleSlideshowInterval: number;   // seconds between images (3–30)
  // Countdown timer (Option 2)
  countdownEnabled: boolean;
  countdownTime: string;           // HH:MM 24h local time
  countdownLabel: string;          // e.g. "Next show starts in"
}

export interface UpcomingQueueItem {
  sequenceName: string;
  songTitle: string | null;
  artist: string | null;
  requesterName: string;
}

export interface DisplayState {
  isPlaying: boolean;
  sequenceName: string | null;
  songTitle: string | null;
  artist: string | null;
  albumArtUrl: string | null;
  secondsPlayed: number;
  secondsRemaining: number;
  playlistName: string | null;
  trackIndex: number | null;
  trackCount: number | null;
  requesterName: string | null;
  upcomingQueue: UpcomingQueueItem[];
  jukeboxUrl: string;
  config: DisplayConfig;
  activeAnnouncement: string | null;
  activeScheduleRule: string | null; // Plan B: name of currently active schedule rule
}
