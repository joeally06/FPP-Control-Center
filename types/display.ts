export type ColorTheme     = 'christmas' | 'winter' | 'classic' | 'custom';
export type BackgroundStyle = 'solid' | 'gradient' | 'particles';
export type FontStyle       = 'modern' | 'display' | 'serif';
export type LayoutVariant   = 'sidebar' | 'centered' | 'minimal';
export type QueuePosition   = 'bottom' | 'right' | 'hidden';
export type IdleAnimation   = 'snowflakes' | 'notes' | 'stars' | 'none';

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
}
