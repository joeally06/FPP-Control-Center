'use client';

import { ReactNode } from 'react';
import { useTheme } from '@/lib/themes/theme-context';
import ParticleEffects from '@/lib/themes/particle-effects';
import ThemeAtmosphere from '@/components/ThemeAtmosphere';

interface ThemedJukeboxWrapperProps {
  children: ReactNode;
}

export default function ThemedJukeboxWrapper({ children }: ThemedJukeboxWrapperProps) {
  const { theme, isLoading } = useTheme();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl text-white">Loading jukebox...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-linear-to-br ${theme.gradient} p-4 relative overflow-hidden`} data-atmosphere={theme.atmosphere}>
      {/* Seasonal background (fog, moon, snow…) under the particles */}
      <ThemeAtmosphere atmosphere={theme.atmosphere} />

      {/* Particle Effects */}
      {theme.particles && theme.particles !== 'none' && (
        <ParticleEffects type={theme.particles} />
      )}
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>

      {/* Add custom font if specified */}
      {theme.font && (
        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=${theme.font.replace(/ /g, '+')}:wght@400;700&display=swap');
          .themed-font {
            font-family: '${theme.font}', sans-serif;
          }
        `}</style>
      )}
    </div>
  );
}
