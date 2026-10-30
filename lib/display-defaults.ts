// The digital sign's settings before anything is saved, shared by the sign page, the settings form and the settings preview.

import type { DisplayConfig } from '@/types/display';

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  showName: 'Christmas Light Show',
  showQr: true,
  queueCount: 4,
  enabled: true,
  colorTheme: 'christmas',
  accentColor: '#ef4444',
  backgroundStyle: 'gradient',
  fontStyle: 'modern',
  fontScale: 100,
  idleMessage: 'The show will begin shortly',
  logoUrl: '',
  sponsorText: '',
  fmFrequency: '',
  idleAnimation: 'snowflakes',
  showClock: true,
  idleBackgroundUrl: '',
  tickerText: '',
  idleMode: 'info',
  slideshowUrl: '',
  idleSlideshowImages: [],
  idleSlideshowInterval: 8,
  countdownEnabled: false,
  countdownTime: '20:00',
  countdownLabel: 'Next show starts in',
};
