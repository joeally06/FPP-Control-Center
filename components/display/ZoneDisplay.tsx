'use client';

import type { DisplayState } from '@/types/display';
import { ZONE_TEMPLATE_SLOTS } from '@/types/display';
import { resolveTheme } from '@/lib/display-theme';
import ZoneWidget from './ZoneWidget';
import AnnouncementOverlay from './AnnouncementOverlay';
import TickerBar from './TickerBar';

interface Props {
  state: DisplayState;
}

const TEMPLATE_GRID: Record<string, string> = {
  'two-column':   'grid grid-cols-2 w-full flex-1',
  'pip':          'relative w-full flex-1',
  'banner-main':  'grid grid-rows-[1fr_3fr] w-full flex-1',
  'sidebar-main': 'grid w-full flex-1 grid-cols-[1fr_3fr]',
};

export default function ZoneDisplay({ state }: Props) {
  const { config, activeAnnouncement } = state;
  const zone = config.zoneConfig;
  const theme = resolveTheme(config);

  if (!zone?.enabled) return null;

  const slots = ZONE_TEMPLATE_SLOTS[zone.template] ?? [];

  // Background style (same logic as IdleScreen)
  let bgStyle: React.CSSProperties;
  if (config.backgroundStyle === 'solid') {
    bgStyle = { backgroundColor: theme.bgFrom };
  } else {
    bgStyle = { background: `linear-gradient(180deg, ${theme.bgFrom} 0%, #050505 50%, ${theme.bgTo} 100%)` };
  }

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col overflow-hidden" style={bgStyle}>
      <AnnouncementOverlay text={activeAnnouncement ?? null} accent={theme.accent} />

      {zone.template === 'pip' ? (
        // PiP: main fills screen, overlay in bottom-right corner
        <div className="relative w-full h-full">
          <div className="absolute inset-0">
            <ZoneWidget widget={zone.slots['main'] ?? { type: 'now-playing' }} state={state} />
          </div>
          <div
            className="absolute bottom-6 right-6 rounded-xl overflow-hidden border-2 shadow-2xl"
            style={{ width: '28%', aspectRatio: '16/9', borderColor: theme.accent }}
          >
            <ZoneWidget widget={zone.slots['overlay'] ?? { type: 'queue' }} state={state} />
          </div>
        </div>
      ) : (
        <div className={TEMPLATE_GRID[zone.template]}>
          {slots.map((slotKey) => (
            <div key={slotKey} className="overflow-hidden relative border border-white/5">
              <ZoneWidget widget={zone.slots[slotKey] ?? { type: 'empty' }} state={state} />
            </div>
          ))}
        </div>
      )}

      {/* Ticker always at the very bottom */}
      {config.tickerText && (
        <div className="flex-shrink-0">
          <TickerBar text={config.tickerText} accent={theme.accent} />
        </div>
      )}
    </div>
  );
}
