'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AdminH2, AdminH4, AdminTextSmall } from './admin/Typography';
import { badge, insetBox, notice, smallButton } from './admin/ui-classes';
import type { DependencyReport as Report, Severity } from '@/lib/dependency-check';

const JUMP_BADGE = { major: badge.danger, minor: badge.warn, patch: badge.neutral, missing: badge.info } as const;
const SEVERITY_BADGE: Record<Severity, string> = {
  critical: badge.danger,
  high: badge.danger,
  moderate: badge.warn,
  low: badge.neutral,
  info: badge.neutral,
};

export default function DependencyReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/dependencies', { cache: 'no-store' })
      .then(async response => (response.ok ? (await response.json()).report : null))
      .then(stored => {
        if (!cancelled) setReport(stored);
      })
      .catch(() => {
        // the card just shows "never checked"
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const checkNow = async () => {
    setError(null);
    setChecking(true);
    try {
      const response = await fetch('/api/admin/dependencies', { method: 'POST', cache: 'no-store' });
      const data = await response.json();
      if (response.ok) setReport(data.report);
      else setError(data.error || 'The check failed');
    } catch {
      setError('The check failed');
    } finally {
      setChecking(false);
    }
  };

  const node = report?.node;

  return (
    <div className="space-y-4">
      <div>
        <AdminH2 className="mb-1">Dependencies</AdminH2>
        <AdminTextSmall>
          What is out of date on this machine and which security advisories apply. This only looks; nothing is changed.
          Work on updates on the development machine, push, then press Update. A summary is also emailed about once a month.
        </AdminTextSmall>
        <AdminTextSmall className="mt-1">
          {report ? `Last checked ${new Date(report.checkedAt).toLocaleString()}` : loaded ? 'Never checked on this machine.' : 'Loading...'}
        </AdminTextSmall>
      </div>

      {error && <div className={notice.danger}>{error}</div>}

      <button onClick={checkNow} disabled={checking} className={smallButton}>
        <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
        {checking ? 'Checking (up to 45 seconds)...' : 'Check now'}
      </button>

      {report && node && (
        <div className="space-y-3">
          <div className={node.status === 'ok' ? insetBox : node.status === 'unknown' ? notice.info : node.status === 'eol' ? notice.danger : notice.warn}>
            <AdminH4 className="mb-1">Node.js {node.version}</AdminH4>
            <AdminTextSmall>
              {node.status === 'ok' && `Supported until ${node.eol}.`}
              {node.status === 'eol-soon' && `Support ends ${node.eol}. Plan the upgrade.`}
              {node.status === 'eol' && `Reached end of life on ${node.eol}. It no longer gets security fixes.`}
              {node.status === 'unknown' && 'This version is not in the end-of-life table in lib/dependency-check.ts.'}
            </AdminTextSmall>
          </div>

          <div className={insetBox}>
            <AdminH4 className="mb-2">Outdated packages{report.outdated ? ` (${report.outdated.length})` : ''}</AdminH4>
            {!report.outdated && <div className={notice.warn}>Could not check: {report.outdatedError}</div>}
            {report.outdated?.length === 0 && <AdminTextSmall>Everything is current.</AdminTextSmall>}
            {!!report.outdated?.length && (
              <ul className="space-y-1.5">
                {report.outdated.map(p => (
                  <li key={p.name} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-adm-soft">
                    <span className="font-mono text-adm-text">{p.name}</span>
                    <span>{p.current ?? 'not installed'} to {p.latest}</span>
                    {p.jump !== 'missing' && <span className={JUMP_BADGE[p.jump]}>{p.jump}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={insetBox}>
            <AdminH4 className="mb-2">Security advisories{report.advisories ? ` (${report.advisories.length})` : ''}</AdminH4>
            {!report.advisories && <div className={notice.warn}>Could not check: {report.auditError}</div>}
            {report.advisories?.length === 0 && <AdminTextSmall>None found.</AdminTextSmall>}
            {!!report.advisories?.length && (
              <ul className="space-y-3">
                {report.advisories.map(a => (
                  <li key={a.id} className="text-sm text-adm-soft">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={SEVERITY_BADGE[a.severity]}>{a.severity}</span>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-medium text-adm-accent hover:underline">
                        {a.title}
                      </a>
                    </div>
                    <p className="mt-1">
                      In <span className="font-mono">{a.vulnerable.join(', ')}</span> ({a.range})
                      {a.viaDirect.length > 0 && <>, pulled in by <span className="font-mono">{a.viaDirect.join(', ')}</span></>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
