'use client';

import { useEffect, useState } from 'react';

interface BannerConfig {
  countdownEnabled: boolean;
  countdownHeading: string;
  countdownSubtitle: string;
  countdownBgColor: string;
  countdownTextColor: string;
  countdownBorderColor: string;
  offSeasonEnabled: boolean;
  offSeasonHeading: string;
  offSeasonSubtitle: string;
  offSeasonBgColor: string;
  offSeasonTextColor: string;
  offSeasonBorderColor: string;
  offlineEnabled: boolean;
  offlineHeading: string;
  offlineSubtitle: string;
  offlineBgColor: string;
  offlineTextColor: string;
  offlineBorderColor: string;
}

interface JukeboxBannerProps {
  fppStatus: string;
  isMonitoringActive: boolean;
  timeUntilNextShow?: string;
}

function TriviaButton() {
  return (
    <a
      href="/trivia"
      className="inline-block px-6 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-bold rounded-lg transition-all shadow-lg hover:shadow-xl hover:scale-105 border-2 border-white/30"
    >
      🎅 Play Christmas Trivia!
    </a>
  );
}

export default function JukeboxBanner({
  fppStatus,
  isMonitoringActive,
  timeUntilNextShow,
}: JukeboxBannerProps) {
  const [config, setConfig] = useState<BannerConfig | null>(null);

  useEffect(() => {
    fetch('/api/jukebox/banner-config')
      .then((res) => res.json())
      .then((data) => setConfig(data))
      .catch((err) => console.error('Failed to load banner config:', err));
  }, []);

  if (!config) return null;

  // Priority 1: Countdown Banner
  // Show when there's a next show scheduled and monitoring is not active yet
  if (
    config.countdownEnabled &&
    !isMonitoringActive &&
    timeUntilNextShow
  ) {
    return (
      <div
        className={`${config.countdownBgColor} ${config.countdownTextColor} ${config.countdownBorderColor} border-2 rounded-lg p-6 mb-6 text-center shadow-lg`}
      >
        <h2 className="text-2xl font-bold mb-2">{config.countdownHeading}</h2>
        <p className="text-lg mb-4">
          {config.countdownSubtitle.replace('{time}', timeUntilNextShow)}
        </p>
        <TriviaButton />
      </div>
    );
  }

  // Priority 2: Off-Season Banner
  if (config.offSeasonEnabled) {
    return (
      <div
        className={`${config.offSeasonBgColor} ${config.offSeasonTextColor} ${config.offSeasonBorderColor} border-2 rounded-lg p-6 mb-6 text-center shadow-lg`}
      >
        <h2 className="text-2xl font-bold mb-2">{config.offSeasonHeading}</h2>
        <p className="text-lg mb-4">{config.offSeasonSubtitle}</p>
        <TriviaButton />
      </div>
    );
  }

  // Priority 3: Offline Banner
  if (config.offlineEnabled && fppStatus !== 'playing') {
    return (
      <div
        className={`${config.offlineBgColor} ${config.offlineTextColor} ${config.offlineBorderColor} border-2 rounded-lg p-6 mb-6 text-center shadow-lg`}
      >
        <h2 className="text-2xl font-bold mb-2">{config.offlineHeading}</h2>
        <p className="text-lg mb-4">{config.offlineSubtitle}</p>
        <TriviaButton />
      </div>
    );
  }

  // No banner to show
  return null;
}
