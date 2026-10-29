'use client';

import { useEffect, useState } from 'react';

/**
 * The "N watching now" count, or null while it is off or unknown. Only polls when the admin has switched it on
 * (`enabled`); each poll also counts this visitor.
 */
export function useAudienceCount(enabled: boolean): number | null {
  const [audienceCount, setAudienceCount] = useState<number | null>(null);

  // "Online now" counter - only when the admin has switched it on; each poll also counts this visitor
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch('/api/jukebox/audience');
        if (!response.ok || cancelled) return;
        const data = await response.json();
        setAudienceCount(data.enabled && typeof data.count === 'number' ? data.count : null);
      } catch {
        // Keep the last count; the next poll will correct it
      }
    };
    poll();
    const interval = setInterval(poll, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  return audienceCount;
}
