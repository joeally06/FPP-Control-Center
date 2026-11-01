'use client';

import { useSyncExternalStore } from 'react';

function formatNow(): string {
  const now = new Date();
  return now.toLocaleString('en-US', {
    timeZone: process.env.NEXT_PUBLIC_TIMEZONE || 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });
}

// Ticks once a second. The server renders no time (it would be the server's clock), so the first frame is "Loading..."
function subscribeToClock(onTick: () => void) {
  const interval = setInterval(onTick, 1000);
  return () => clearInterval(interval);
}

export default function TimezoneIndicator() {
  const time = useSyncExternalStore(subscribeToClock, formatNow, () => '');

  if (!time) {
    return <div className="text-white/70 text-sm font-mono">Loading...</div>;
  }

  return (
    <div className="text-white/70 text-sm font-mono">
      🕐 {time}
    </div>
  );
}
