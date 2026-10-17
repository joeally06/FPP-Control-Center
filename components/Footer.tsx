'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/lib/themes/theme-context';

interface VersionInfo {
  version: string;
  build?: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/** Visitor-page footer: the season's badge and greeting, privacy link and app version. */
export default function Footer({ siteName }: { siteName: string }) {
  const { theme, assets } = useTheme();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    fetch('/api/version')
      .then(res => res.json())
      .then(data => setVersionInfo(data))
      .catch(err => console.error('Failed to load version info:', err));
  }, []);

  const badgeSrc = assets.badge?.url ?? assets.logo?.url ?? null;

  return (
    <footer className="mt-10 px-4 pb-8 text-center">
      <div className="sp-muted mx-auto flex max-w-6xl flex-col items-center gap-2 text-[13px]">
        {badgeSrc && (
          // eslint-disable-next-line @next/next/no-img-element -- served from /api/theme/asset
          <img src={badgeSrc} alt="" className="sp-badge h-14 w-14" />
        )}
        <p className="sp-display sp-title text-lg">{siteName}</p>
        <p>{theme.greeting}</p>
        <p className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            Privacy policy
          </Link>
          {versionInfo && (
            <span>
              FPP Control Center v{versionInfo.version}
              {versionInfo.build && <code className="ml-1.5 font-mono">{versionInfo.build.substring(0, 7)}</code>}
            </span>
          )}
        </p>
      </div>
    </footer>
  );
}
