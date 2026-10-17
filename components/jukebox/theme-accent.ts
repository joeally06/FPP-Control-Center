// Static accent classes for the visitor jukebox, keyed by theme id.
// Tailwind only generates classes it can see as complete strings, so never build these dynamically.

export interface ThemeAccent {
  /** Primary action button */
  button: string;
  /** Accent text (labels, artist line) */
  text: string;
  /** Small pill / badge */
  chip: string;
  /** Progress bar fill (gradient stops) */
  bar: string;
  /** Equalizer bars / live dot */
  dot: string;
  /** Keyboard focus ring */
  focus: string;
}

const ACCENTS: Record<string, ThemeAccent> = {
  christmas: {
    button: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    text: 'text-emerald-300',
    chip: 'bg-emerald-950/80 text-emerald-200 border-emerald-700/60',
    bar: 'from-emerald-400 to-red-400',
    dot: 'bg-emerald-400',
    focus: 'focus-visible:ring-emerald-300',
  },
  halloween: {
    button: 'bg-orange-600 hover:bg-orange-500 text-white',
    text: 'text-orange-300',
    chip: 'bg-purple-950/80 text-orange-200 border-purple-700/60',
    bar: 'from-orange-400 to-purple-400',
    dot: 'bg-orange-400',
    focus: 'focus-visible:ring-orange-300',
  },
  default: {
    button: 'bg-indigo-600 hover:bg-indigo-500 text-white',
    text: 'text-indigo-300',
    chip: 'bg-indigo-950/80 text-indigo-200 border-indigo-700/60',
    bar: 'from-indigo-400 to-pink-400',
    dot: 'bg-indigo-400',
    focus: 'focus-visible:ring-indigo-300',
  },
};

export function getThemeAccent(themeId: string): ThemeAccent {
  return ACCENTS[themeId] ?? ACCENTS.default;
}

/** Shared card surface: dark enough for white text on any theme gradient. */
export const CARD = 'rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl';
