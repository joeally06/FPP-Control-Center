'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import { getAllThemes, ThemeConfig } from '@/lib/themes/theme-config';
import ParticleEffects from '@/lib/themes/particle-effects';
import ThemeAtmosphere from '@/components/ThemeAtmosphere';

export default function ThemeSettings() {
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  const router = useRouter();
  const [themes, setThemes] = useState<ThemeConfig[]>(getAllThemes());
  const [activeThemeId, setActiveThemeId] = useState<string>('default');
  const [previewTheme, setPreviewTheme] = useState<ThemeConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [customParticles, setCustomParticles] = useState<Record<string, string>>({});

  const particleOptions = [
    { value: 'none', label: 'None' },
    { value: 'sparkles', label: '✨ Sparkles' },
    { value: 'snowfall', label: '❄️ Snowfall' },
    { value: 'stars', label: '⭐ Twinkling Stars' },
    { value: 'bats', label: '🦇 Flying Bats' },
    { value: 'ghosts', label: '👻 Floating Ghosts' },
    { value: 'spider-webs', label: '🕸️ Spider Webs' },
    { value: 'lightning', label: '⚡ Lightning Flashes' },
    { value: 'fog', label: '🌫️ Fog' },
    { value: 'hearts', label: '💕 Hearts' },
    { value: 'fireworks', label: '🎆 Fireworks' },
    { value: 'leaves', label: '🍃 Falling Leaves' },
    { value: 'cherry-blossoms', label: '🌸 Cherry Blossoms' },
    { value: 'balloons', label: '🎈 Balloons' },
    { value: 'wind-swirls', label: '🍂 Wind Swirls' },
    { value: 'candy-canes', label: '🍬 Candy Canes' },
    { value: 'ornaments', label: '🎄 Ornaments' },
    { value: 'reindeer', label: '🦌 Reindeer' },
  ];

  // Redirect non-admins
  useEffect(() => {
    if (sessionStatus !== 'loading' && !isAdmin) {
      router.push('/jukebox');
    }
  }, [isAdmin, sessionStatus, router]);

  // Fetch active theme
  useEffect(() => {
    const fetchActiveTheme = async () => {
      try {
        const response = await fetch('/api/theme');
        if (response.ok) {
          const data = await response.json();
          setActiveThemeId(data.themeId);
          
          // Load custom particle settings if they exist
          if (data.customParticles) {
            setCustomParticles(data.customParticles);
            // Update themes with custom particles
            setThemes(prevThemes => 
              prevThemes.map(theme => ({
                ...theme,
                particles: (data.customParticles[theme.id] || theme.particles) as any
              }))
            );
          }
        }
      } catch (error) {
        console.error('Failed to fetch active theme:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (isAdmin) {
      fetchActiveTheme();
    }
  }, [isAdmin]);

  const handleSetTheme = async (themeId: string) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ themeId, customParticles }),
      });

      if (response.ok) {
        setActiveThemeId(themeId);
        // Give visual feedback
        setTimeout(() => {
          setIsSaving(false);
        }, 500);
      }
    } catch (error) {
      console.error('Failed to set theme:', error);
      setIsSaving(false);
    }
  };

  const handleParticleChange = (themeId: string, particleType: string) => {
    setCustomParticles(prev => ({
      ...prev,
      [themeId]: particleType
    }));
    
    // Update the theme in the list
    setThemes(prevThemes => 
      prevThemes.map(theme => 
        theme.id === themeId 
          ? { ...theme, particles: particleType as any }
          : theme
      )
    );
    
    // Save to API
    saveParticleSettings(themeId, particleType);
  };

  const saveParticleSettings = async (themeId: string, particleType: string) => {
    try {
      const updatedCustomParticles = {
        ...customParticles,
        [themeId]: particleType
      };
      
      await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          themeId: activeThemeId, 
          customParticles: updatedCustomParticles 
        }),
      });
    } catch (error) {
      console.error('Failed to save particle settings:', error);
    }
  };

  // Show loading while checking authentication
  if (sessionStatus === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl text-white">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <AdminLayout 
      title="🎨 Theme Settings" 
      subtitle="Customize the jukebox appearance for seasonal shows"
    >
      {/* Preview Modal */}
      {previewTheme && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPreviewTheme(null)}>
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className={`bg-linear-to-br ${previewTheme.gradient} rounded-2xl p-8 shadow-2xl relative overflow-hidden`}>
              <ThemeAtmosphere atmosphere={previewTheme.atmosphere} contained />
              {previewTheme.particles && previewTheme.particles !== 'none' && (
                <ParticleEffects type={previewTheme.particles} />
              )}
              
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-2">{previewTheme.name} Theme Preview</h2>
                    <p className="text-white/70">{previewTheme.description}</p>
                  </div>
                  <button
                    onClick={() => setPreviewTheme(null)}
                    className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg transition-all"
                  >
                    ✕ Close
                  </button>
                </div>

                {/* Sample Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className={`backdrop-blur-md ${previewTheme.cardBg} rounded-xl p-6 shadow-xl border ${previewTheme.cardBorder}`}>
                    <div className="flex items-center gap-4 mb-4">
                      <div className={`w-12 h-12 bg-${previewTheme.primaryColor}/30 rounded-full flex items-center justify-center`}>
                        <span className="text-2xl">{previewTheme.icons.nowPlaying}</span>
                      </div>
                      <div>
                        <p className="text-sm text-white/70">Now Playing</p>
                        <p className="text-xl font-bold text-white">Sample Song Title</p>
                      </div>
                    </div>
                    <button className={`w-full bg-linear-to-r from-${previewTheme.primaryColor} to-${previewTheme.secondaryColor} text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-all shadow-lg`}>
                      Vote {previewTheme.icons.vote}
                    </button>
                  </div>

                  <div className={`backdrop-blur-md ${previewTheme.cardBg} rounded-xl p-6 shadow-xl border ${previewTheme.cardBorder}`}>
                    <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                      <span>{previewTheme.icons.queue}</span>
                      Queue Preview
                    </h3>
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-white/5 p-3 rounded-lg text-white/80 text-sm">
                          Sample Song {i}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      handleSetTheme(previewTheme.id);
                      setPreviewTheme(null);
                    }}
                    disabled={isSaving || activeThemeId === previewTheme.id}
                    className={`flex-1 ${
                      activeThemeId === previewTheme.id
                        ? 'bg-green-500/80'
                        : 'bg-blue-500/80 hover:bg-blue-600'
                    } disabled:bg-gray-500/50 text-white px-6 py-3 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl disabled:cursor-not-allowed`}
                  >
                    {activeThemeId === previewTheme.id ? '✓ Active Theme' : 'Set as Active Theme'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Theme Grid */}
      <div className="backdrop-blur-md bg-white/10 rounded-xl p-6 shadow-2xl border border-white/20">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
          <span>🎭</span>
          Available Themes
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {themes.map((theme) => {
            const isActive = activeThemeId === theme.id;
            
            return (
              <div
                key={theme.id}
                className={`
                  backdrop-blur-sm rounded-lg overflow-hidden border-2 transition-all cursor-pointer
                  ${isActive 
                    ? 'border-green-400 shadow-lg shadow-green-500/50' 
                    : 'border-white/20 hover:border-white/40 hover:shadow-lg'
                  }
                `}
                onClick={() => setPreviewTheme(theme)}
              >
                {/* Theme Preview */}
                <div className={`bg-linear-to-br ${theme.gradient} h-32 relative overflow-hidden`}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-6xl opacity-50">{theme.icons.nowPlaying}</span>
                  </div>
                  {isActive && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-3 py-1 rounded-full font-semibold">
                      ✓ Active
                    </div>
                  )}
                </div>

                {/* Theme Info */}
                <div className="bg-white/5 p-4">
                  <h3 className="text-white font-bold text-lg mb-1">{theme.name}</h3>
                  <p className="text-white/60 text-sm mb-3">{theme.description}</p>
                  
                  {/* Icons Preview */}
                  <div className="flex gap-2 text-xl mb-3">
                    {Object.values(theme.icons).map((icon, i) => (
                      <span key={i}>{icon}</span>
                    ))}
                  </div>

                  {/* Particle Effect Selector */}
                  <div className="mb-3">
                    <label className="block text-white/70 text-xs mb-1">Particle Effect:</label>
                    <select
                      value={theme.particles || 'none'}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleParticleChange(theme.id, e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      {particleOptions.map(option => (
                        <option key={option.value} value={option.value} className="bg-gray-800 text-white">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewTheme(theme);
                      }}
                      className="flex-1 bg-blue-500/80 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                    >
                      Preview
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetTheme(theme.id);
                      }}
                      disabled={isSaving || isActive}
                      className={`flex-1 ${
                        isActive
                          ? 'bg-gray-500/50 cursor-not-allowed'
                          : 'bg-green-500/80 hover:bg-green-600'
                      } disabled:bg-gray-500/50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:cursor-not-allowed`}
                    >
                      {isActive ? 'Active' : 'Activate'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      <div className="backdrop-blur-md bg-blue-500/10 rounded-xl p-6 shadow-2xl border border-blue-500/30 mt-6">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <span>💡</span>
          Theme Instructions
        </h3>
        <ul className="text-white/80 space-y-2 text-sm">
          <li>• Click any theme card to preview it with sample content</li>
          <li>• Use the dropdown menu on each card to select a custom particle effect</li>
          <li>• Particle effects are saved automatically when you select them</li>
          <li>• Click "Activate" to set a theme as the active jukebox theme</li>
          <li>• The active theme will be applied to the public jukebox page immediately</li>
          <li>• Choose themes that match your seasonal light shows (Halloween, Christmas, etc.)</li>
        </ul>
      </div>

      {/* Available Particle Effects */}
      <div className="backdrop-blur-md bg-purple-500/10 rounded-xl p-6 shadow-2xl border border-purple-500/30 mt-6">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <span>✨</span>
          Available Particle Effects
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
          {particleOptions.map(option => (
            <div key={option.value} className="bg-white/5 rounded-lg px-3 py-2 text-white/80">
              {option.label}
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
