'use client';

import { useEffect, useState } from 'react';
import ThemedJukeboxWrapper from '@/components/ThemedJukeboxWrapper';
import RadioBar from '@/components/jukebox/RadioBar';
import ShowHero from '@/components/jukebox/ShowHero';
import JukeboxBanner from '@/components/JukeboxBanner';
import CourtesyCard from '@/components/jukebox/CourtesyCard';
import ShowSpecsCard from '@/components/jukebox/ShowSpecsCard';
import Footer from '@/components/Footer';
import { showStatus, type ShowSpec } from '@/lib/jukebox-display';

interface PreviewSettings {
  siteName: string;
  fmFrequency: string;
  courtesyLines: string[];
  specs: ShowSpec[];
}

interface ScheduleStatus {
  isActive: boolean;
  currentShowEndTime?: string | null;
  nextShowDay: string | null;
  nextShowStartTime: string | null;
  countdown?: string | null;
}

/**
 * The top of the visitor jukebox page as visitors see it, built from the same components and the saved
 * settings. Shown in a frame on Settings → Jukebox → Visitor page. Unlike /jukebox it records no visit,
 * shows no admin controls and takes no requests.
 */
export default function VisitorPagePreview() {
  const [settings, setSettings] = useState<PreviewSettings | null>(null);
  const [schedule, setSchedule] = useState<ScheduleStatus | null>(null);

  useEffect(() => {
    fetch('/api/jukebox/settings')
      .then((res) => res.json())
      .then((data) =>
        setSettings({
          siteName: data.siteName || '',
          fmFrequency: data.fmFrequency || '',
          courtesyLines: data.courtesy?.enabled && Array.isArray(data.courtesy.lines) ? data.courtesy.lines : [],
          specs: Array.isArray(data.specs) ? data.specs : [],
        })
      )
      .catch((error) => console.error('Failed to load jukebox settings:', error));

    fetch('/api/jukebox/schedule-status')
      .then((res) => res.json())
      .then((data: ScheduleStatus) => setSchedule(data))
      .catch((error) => console.error('Failed to load schedule status:', error));
  }, []);

  if (!settings) return null;

  const siteName = settings.siteName || 'Light Show Jukebox';
  const isActive = Boolean(schedule?.isActive);

  return (
    <ThemedJukeboxWrapper>
      <RadioBar siteName={siteName} fmFrequency={settings.fmFrequency} isPlaying={isActive} />

      {/* Same spacing as /jukebox: clears the fixed radio bar and the string lights under it */}
      <div className="mx-auto max-w-6xl px-4 pb-4" style={{ paddingTop: 'calc(5.75rem + env(safe-area-inset-top))' }}>
        <ShowHero
          siteName={siteName}
          fmFrequency={settings.fmFrequency}
          status={showStatus({
            isActive,
            currentShowEndTime: schedule?.currentShowEndTime ?? null,
            nextShowDay: schedule?.nextShowDay ?? null,
            nextShowStartTime: schedule?.nextShowStartTime ?? null,
            countdown: schedule?.countdown ?? null,
          })}
          showActions={isActive}
          listening={false}
          onToggleListen={() => {}}
          audienceCount={null}
        />

        <div className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-5">
          <JukeboxBanner />
          <CourtesyCard lines={settings.courtesyLines} />
          <ShowSpecsCard specs={settings.specs} />
        </div>
      </div>

      <Footer siteName={siteName} />
    </ThemedJukeboxWrapper>
  );
}
