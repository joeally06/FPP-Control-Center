'use client';

import { ReactNode } from 'react';
import { useTheme } from '@/lib/themes/theme-context';
import ThemeAtmosphere from '@/components/ThemeAtmosphere';

interface ThemedJukeboxWrapperProps {
  children: ReactNode;
}

export default function ThemedJukeboxWrapper({ children }: ThemedJukeboxWrapperProps) {
  const { theme, isLoading } = useTheme();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0c0a18] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl text-white">Loading jukebox...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sp-page" data-season={theme.id}>
      {/* Seasonal sky (stars or snow) behind everything */}
      <ThemeAtmosphere sky={theme.sky} />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>

      {/* This season's faces; the CSS falls back to system fonts until they arrive */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?${theme.fontQuery}&display=swap');
      `}</style>
    </div>
  );
}
