import type { DisplayConfig, ColorTheme } from '@/types/display';

export interface ThemeVars {
  bgFrom: string;
  bgTo: string;
  accent: string;
  barFrom: string;
  barTo: string;
  fontFamily: string;
}

const THEMES: Record<ColorTheme, Omit<ThemeVars, 'fontFamily'>> = {
  christmas: { bgFrom: '#1a0000', bgTo: '#001a00', accent: '#ef4444', barFrom: '#dc2626', barTo: '#16a34a' },
  winter:    { bgFrom: '#0a1628', bgTo: '#0a2533', accent: '#38bdf8', barFrom: '#1d4ed8', barTo: '#06b6d4' },
  classic:   { bgFrom: '#1a1000', bgTo: '#0a0800', accent: '#f59e0b', barFrom: '#d97706', barTo: '#78350f' },
  custom:    { bgFrom: '#111111', bgTo: '#0a0a0a', accent: '#22c55e', barFrom: '#22c55e', barTo: '#15803d' },
};

const FONT_FAMILIES: Record<string, string> = {
  modern:  'system-ui, -apple-system, sans-serif',
  display: '"Oswald", system-ui, sans-serif',
  serif:   '"Playfair Display", Georgia, serif',
};

export function resolveTheme(config: DisplayConfig): ThemeVars {
  const preset = THEMES[config.colorTheme] ?? THEMES.christmas;
  const accent = config.colorTheme === 'custom'
    ? (config.accentColor || preset.accent)
    : preset.accent;
  const barFrom = config.colorTheme === 'custom'
    ? (config.accentColor || preset.barFrom)
    : preset.barFrom;

  return {
    ...preset,
    accent,
    barFrom,
    fontFamily: FONT_FAMILIES[config.fontStyle] ?? FONT_FAMILIES.modern,
  };
}
