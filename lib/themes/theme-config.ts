// Theme configuration system for seasonal jukebox themes

export interface ThemeConfig {
  id: string;
  name: string;
  description: string;
  gradient: string; // Tailwind gradient classes
  cardBg: string; // Card background classes
  cardBorder: string; // Card border classes
  primaryColor: string; // Primary accent color
  secondaryColor: string; // Secondary accent color
  accentGlow: string; // Glow effect color
  icons: {
    nowPlaying: string;
    queue: string;
    popular: string;
    vote: string;
    time: string;
  };
  particles?: 'snowfall' | 'leaves' | 'hearts' | 'fireworks' | 'fog' | 'sparkles' | 'bats' | 'stars' | 'cherry-blossoms' | 'balloons' | 'wind-swirls' | 'ghosts' | 'spider-webs' | 'lightning' | 'candy-canes' | 'ornaments' | 'reindeer' | 'none';
  font?: string; // Optional custom font
  atmosphere?: 'haunted' | 'winter'; // Optional background layer drawn alongside the particles
}

export const THEME_PRESETS: Record<string, ThemeConfig> = {
  default: {
    id: 'default',
    name: 'Default',
    description: 'Classic purple and blue gradient',
    gradient: 'from-purple-900 via-blue-900 to-indigo-900',
    cardBg: 'bg-white/10',
    cardBorder: 'border-white/20',
    primaryColor: 'blue-500',
    secondaryColor: 'purple-500',
    accentGlow: 'blue-500/50',
    icons: {
      nowPlaying: '🎵',
      queue: '📋',
      popular: '🔥',
      vote: '👍',
      time: '⏱️',
    },
    particles: 'sparkles',
  },
  
  halloween: {
    id: 'halloween',
    name: 'Halloween',
    description: 'Spooky orange and purple with ghostly effects',
    gradient: 'from-orange-950 via-purple-950 to-gray-950',
    cardBg: 'bg-orange-500/10',
    cardBorder: 'border-orange-500/30',
    primaryColor: 'orange-500',
    secondaryColor: 'purple-600',
    accentGlow: 'orange-500/50',
    icons: {
      nowPlaying: '🎃',
      queue: '👻',
      popular: '🦇',
      vote: '💀',
      time: '🕷️',
    },
    particles: 'bats',
    font: 'Creepster',
    atmosphere: 'haunted',
  },
  
  christmas: {
    id: 'christmas',
    name: 'Christmas',
    description: 'Festive red and green with falling snow',
    gradient: 'from-red-950 via-green-950 to-blue-950',
    cardBg: 'bg-red-500/10',
    cardBorder: 'border-green-500/30',
    primaryColor: 'red-600',
    secondaryColor: 'green-600',
    accentGlow: 'red-500/50',
    icons: {
      nowPlaying: '🎅',
      queue: '🎁',
      popular: '⛄',
      vote: '🎄',
      time: '❄️',
    },
    particles: 'stars',
    font: 'Mountains of Christmas',
    atmosphere: 'winter',
  },
  
  valentines: {
    id: 'valentines',
    name: "Valentine's Day",
    description: 'Romantic pink and red with floating hearts',
    gradient: 'from-pink-950 via-red-950 to-rose-950',
    cardBg: 'bg-pink-500/10',
    cardBorder: 'border-red-500/30',
    primaryColor: 'pink-500',
    secondaryColor: 'red-500',
    accentGlow: 'pink-500/50',
    icons: {
      nowPlaying: '💝',
      queue: '💕',
      popular: '💖',
      vote: '💗',
      time: '💘',
    },
    particles: 'hearts',
    font: 'Dancing Script',
  },
  
  summer: {
    id: 'summer',
    name: 'Summer',
    description: 'Bright yellow and cyan with sunny vibes',
    gradient: 'from-yellow-900 via-orange-900 to-cyan-900',
    cardBg: 'bg-yellow-500/10',
    cardBorder: 'border-cyan-500/30',
    primaryColor: 'yellow-500',
    secondaryColor: 'cyan-500',
    accentGlow: 'yellow-500/50',
    icons: {
      nowPlaying: '☀️',
      queue: '🌊',
      popular: '🏖️',
      vote: '🌴',
      time: '🌅',
    },
    particles: 'balloons',
    font: 'Pacifico',
  },
  
  spring: {
    id: 'spring',
    name: 'Spring',
    description: 'Fresh green and pink with blooming flowers',
    gradient: 'from-green-900 via-teal-900 to-emerald-900',
    cardBg: 'bg-green-500/10',
    cardBorder: 'border-pink-500/30',
    primaryColor: 'green-500',
    secondaryColor: 'pink-500',
    accentGlow: 'green-500/50',
    icons: {
      nowPlaying: '🌸',
      queue: '🌺',
      popular: '🌻',
      vote: '🌼',
      time: '🌷',
    },
    particles: 'cherry-blossoms',
    font: 'Quicksand',
  },
  
  fourthOfJuly: {
    id: 'fourthOfJuly',
    name: '4th of July',
    description: 'Patriotic red, white, and blue with fireworks',
    gradient: 'from-blue-950 via-red-950 to-blue-950',
    cardBg: 'bg-blue-500/10',
    cardBorder: 'border-red-500/30',
    primaryColor: 'blue-600',
    secondaryColor: 'red-600',
    accentGlow: 'blue-500/50',
    icons: {
      nowPlaying: '🎆',
      queue: '🎇',
      popular: '🇺🇸',
      vote: '⭐',
      time: '🗽',
    },
    particles: 'fireworks',
    font: 'Archivo Black',
  },
  
  autumn: {
    id: 'autumn',
    name: 'Autumn',
    description: 'Warm orange and brown with falling leaves',
    gradient: 'from-orange-950 via-amber-950 to-yellow-950',
    cardBg: 'bg-orange-500/10',
    cardBorder: 'border-amber-500/30',
    primaryColor: 'orange-600',
    secondaryColor: 'amber-600',
    accentGlow: 'orange-500/50',
    icons: {
      nowPlaying: '🍂',
      queue: '🍁',
      popular: '🌰',
      vote: '🎃',
      time: '🦃',
    },
    particles: 'wind-swirls',
    font: 'Merriweather',
  },
};

export const getThemeById = (id: string): ThemeConfig => {
  return THEME_PRESETS[id] || THEME_PRESETS.default;
};

export const getAllThemes = (): ThemeConfig[] => {
  return Object.values(THEME_PRESETS);
};
