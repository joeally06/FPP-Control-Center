// The two seasonal looks for the visitor jukebox. Colours live in app/globals.css under [data-season="…"];
// this file holds what the components need. Logos and badges are uploaded on Theme Settings (lib/theme-assets.ts).

export type ThemeId = 'halloween' | 'christmas';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  /** Google Fonts css2 `family=` query for this season's faces (body + display) */
  fontQuery: string;
  /** String-light bulb colours, taken from the season's logo */
  bulbs: string[];
  /** Background behind the page */
  sky: 'stars' | 'snow';
  /** Stands in for album art and the badge when nothing has been uploaded */
  icon: string;
  /** Footer sign-off */
  greeting: string;
}

export type ThemeAssetKind = 'logo' | 'badge';

/** An uploaded logo or badge, as /api/theme describes it (the image itself comes from `url`) */
export interface ThemeAssetInfo {
  url: string;
  width: number;
  height: number;
}

export type SeasonAssets = Record<ThemeAssetKind, ThemeAssetInfo | null>;

export const NO_ASSETS: SeasonAssets = { logo: null, badge: null };

/** Used when the stored theme id is missing or belongs to a theme that has been removed */
export const DEFAULT_THEME_ID: ThemeId = 'christmas';

const BODY_FONT = 'family=Figtree:wght@400;500;600;700;800';

export const THEME_PRESETS: Record<ThemeId, ThemeConfig> = {
  halloween: {
    id: 'halloween',
    name: 'Halloween',
    description: 'Neon purple and jack-o\'-lantern orange on a starry night',
    fontQuery: `family=Rye&${BODY_FONT}`,
    bulbs: ['#ff4d5e', '#ffb12b', '#3ee07a', '#4fb6ff', '#c26bff', '#ff8a1f'],
    sky: 'stars',
    icon: '🎃',
    greeting: 'Thanks for stopping by. Happy Halloween!',
  },
  christmas: {
    id: 'christmas',
    name: 'Christmas',
    description: 'Candy-cane red and warm window light under falling snow',
    fontQuery: `family=Oswald:wght@500;600&family=Great+Vibes&${BODY_FONT}`,
    bulbs: ['#ff3b4e', '#fff1c9', '#2fd06b', '#ffc93c', '#4fa8ff'],
    sky: 'snow',
    icon: '🎅',
    greeting: 'Thanks for stopping by. Merry Christmas!',
  },
};

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(THEME_PRESETS, value);
}

export function normalizeThemeId(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME_ID;
}

export const getThemeById = (id: unknown): ThemeConfig => THEME_PRESETS[normalizeThemeId(id)];

export const getAllThemes = (): ThemeConfig[] => Object.values(THEME_PRESETS);
