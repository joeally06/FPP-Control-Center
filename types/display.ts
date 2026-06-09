export type ColorTheme     = 'christmas' | 'winter' | 'classic' | 'custom';
export type BackgroundStyle = 'solid' | 'gradient' | 'particles';
export type FontStyle       = 'modern' | 'display' | 'serif';
export type LayoutVariant   = 'sidebar' | 'centered' | 'minimal';
export type QueuePosition   = 'bottom' | 'right' | 'hidden';
export type IdleAnimation   = 'snowflakes' | 'notes' | 'stars' | 'none';

// ─── Zone Layout (Plan C) ────────────────────────────────────────────────────
export type ZoneTemplate   = 'two-column' | 'pip' | 'banner-main' | 'sidebar-main';
export type ZoneWidgetType = 'now-playing' | 'queue' | 'clock' | 'message' | 'image' | 'slides' | 'qr' | 'empty';

export const ZONE_TEMPLATE_SLOTS: Record<ZoneTemplate, string[]> = {
  'two-column':   ['left', 'right'],
  'pip':          ['main', 'overlay'],
  'banner-main':  ['banner', 'main'],
  'sidebar-main': ['sidebar', 'main'],
};

export interface ZoneWidgetConfig {
  type: ZoneWidgetType;
  text?: string;
  imageUrl?: string;
  slidesUrl?: string;
}

export interface ZoneConfig {
  enabled: boolean;
  template: ZoneTemplate;
  slots: Record<string, ZoneWidgetConfig>;
}

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
  // Layout
  layoutVariant: LayoutVariant;
  albumArtSize: number;
  queuePosition: QueuePosition;
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
  // Idle slideshow
  slideshowUrl: string;
  // Zone layout (Plan C)
  zoneConfig?: ZoneConfig;
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
