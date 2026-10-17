'use client';

import { useEffect, useState } from 'react';
import type { OffSeasonBanner } from '@/lib/jukebox-display';

/** The admin's off-season message, in the season's style. Renders nothing while it is switched off. */
export default function JukeboxBanner() {
  const [banner, setBanner] = useState<OffSeasonBanner | null>(null);

  useEffect(() => {
    fetch('/api/jukebox/banner-config')
      .then((res) => res.json())
      .then((data) => setBanner(data))
      .catch((err) => console.error('Failed to load banner config:', err));
  }, []);

  if (!banner?.enabled || !banner.heading) return null;

  return (
    <section aria-labelledby="off-season-heading" className="sp-panel text-center">
      <h2 id="off-season-heading" className="sp-display sp-h2 mt-0">{banner.heading}</h2>
      {banner.subtitle && <p className="sp-muted mt-1.5">{banner.subtitle}</p>}
    </section>
  );
}
