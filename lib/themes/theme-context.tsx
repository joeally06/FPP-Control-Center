'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ThemeConfig, getThemeById, NO_ASSETS, type SeasonAssets } from './theme-config';

interface ThemeContextType {
  theme: ThemeConfig;
  /** Logo and badge uploaded for the active theme */
  assets: SeasonAssets;
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeConfig>(getThemeById(null));
  const [assets, setAssets] = useState<SeasonAssets>(NO_ASSETS);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch active theme from API
  useEffect(() => {
    const fetchActiveTheme = async () => {
      try {
        const response = await fetch('/api/theme');
        if (response.ok) {
          const data = await response.json();
          const activeTheme = getThemeById(data.themeId);
          setTheme(activeTheme);
          setAssets(data.assets?.[activeTheme.id] ?? NO_ASSETS);
        }
      } catch (error) {
        console.error('Failed to fetch active theme:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchActiveTheme();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, assets, isLoading }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
