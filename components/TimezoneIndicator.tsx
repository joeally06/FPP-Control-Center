'use client';

import { useState, useEffect } from 'react';

export default function TimezoneIndicator() {
  const [time, setTime] = useState<string>('');
  const [mounted, setMounted] = useState(false);

  const updateTime = () => {
    const now = new Date();
    const timeStr = now.toLocaleString('en-US', {
      timeZone: process.env.NEXT_PUBLIC_TIMEZONE || 'America/Chicago',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
    setTime(timeStr);
  };

  useEffect(() => {
    setMounted(true);
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) {
    return <div className="text-white/70 text-sm font-mono">Loading...</div>;
  }

  return (
    <div className="text-white/70 text-sm font-mono">
      🕐 {time}
    </div>
  );
}
