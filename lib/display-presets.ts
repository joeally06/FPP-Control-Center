// One-click seasonal looks for the digital sign. Applying one only fills in the settings form; nothing is saved until the admin saves.
// A preset sets the look and the idle wording only, never the logo, FM frequency, QR code, ticker or sponsor text.

import type { DisplayConfig } from '@/types/display';

export type DisplayPresetValues = Pick<
  DisplayConfig,
  'colorTheme' | 'accentColor' | 'backgroundStyle' | 'idleAnimation' | 'idleMessage' | 'countdownLabel'
>;

export interface DisplayPreset {
  id: string;
  label: string;
  values: DisplayPresetValues;
}

export const DISPLAY_PRESETS: DisplayPreset[] = [
  {
    id: 'christmas',
    label: 'Christmas',
    values: {
      colorTheme: 'christmas', accentColor: '#ef4444', backgroundStyle: 'gradient', idleAnimation: 'snowflakes',
      idleMessage: 'The show will begin shortly', countdownLabel: 'Next show starts in',
    },
  },
  {
    id: 'winter',
    label: 'Winter',
    values: {
      colorTheme: 'winter', accentColor: '#38bdf8', backgroundStyle: 'gradient', idleAnimation: 'stars',
      idleMessage: 'Our winter light show starts soon', countdownLabel: 'Next show starts in',
    },
  },
  {
    id: 'halloween',
    label: 'Halloween',
    values: {
      colorTheme: 'custom', accentColor: '#f97316', backgroundStyle: 'particles', idleAnimation: 'stars',
      idleMessage: 'The spooky light show starts soon', countdownLabel: 'The haunting begins in',
    },
  },
  {
    id: 'thanksgiving',
    label: 'Thanksgiving',
    values: {
      colorTheme: 'custom', accentColor: '#d97706', backgroundStyle: 'gradient', idleAnimation: 'none',
      idleMessage: 'Giving thanks. The show starts soon', countdownLabel: 'Next show starts in',
    },
  },
];
