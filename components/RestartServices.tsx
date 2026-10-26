'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AdminH2, AdminTextSmall } from './admin/Typography';
import { button, dangerButton, notice } from './admin/ui-classes';
import { TIMING } from '@/lib/constants';

const MAX_ATTEMPTS = 24; // ~2 minutes at TIMING.RECONNECT_DELAY

export default function RestartServices() {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'waiting'>('idle');
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  // Reload once the new server answers
  const waitForServer = (n: number) => {
    if (n > MAX_ATTEMPTS) {
      setPhase('idle');
      setError('The server is not back yet. Check logs/restart.log or run "pm2 logs fpp-control" on the server.');
      return;
    }
    setAttempt(n);
    const retry = () => { timeoutRef.current = setTimeout(() => waitForServer(n + 1), TIMING.RECONNECT_DELAY); };
    fetch('/api/health', { cache: 'no-store' })
      .then(res => (res.ok ? window.location.reload() : retry()))
      .catch(retry);
  };

  const restart = async () => {
    if (!confirm(
      'Restart Services\n\n' +
      'This restarts the Control Center and the FPP poller so they pick up changes to .env.local.\n\n' +
      'Visitor pages (jukebox, voting, Santa letters) will be offline for about 30 seconds. ' +
      'FPP keeps running the show.\n\n' +
      'Continue?'
    )) {
      return;
    }

    setError(null);
    setPhase('starting');
    try {
      const response = await fetch('/api/admin/restart', { method: 'POST', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to restart');
        setPhase('idle');
        return;
      }
      setPhase('waiting');
      // Give the old server time to stop before checking for the new one
      timeoutRef.current = setTimeout(() => waitForServer(1), TIMING.RECONNECT_DELAY_LONG);
    } catch {
      setError('Failed to restart');
      setPhase('idle');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <AdminH2 className="mb-1">Restart Services</AdminH2>
        <AdminTextSmall>
          Restart the Control Center and the FPP poller to apply changes made to <code className="font-mono">.env.local</code>.
          Visitor pages are offline for about 30 seconds.
        </AdminTextSmall>
        <AdminTextSmall className="mt-1">
          <code className="font-mono">NEXT_PUBLIC_</code> values are built into the app, so changing those needs an update or rebuild instead.
        </AdminTextSmall>
      </div>

      {error && <div className={notice.danger}>{error}</div>}

      {phase === 'waiting' ? (
        <div className={`${notice.info} text-center`}>
          <RefreshCw className="mx-auto h-7 w-7 animate-spin" aria-hidden="true" />
          <p className="mt-2 text-[15px] font-semibold text-adm-info">Restarting...</p>
          <p className="mt-1 text-sm text-adm-soft">
            {attempt === 0 ? 'Waiting for the services to stop...' : `Waiting for the server (check ${attempt}/${MAX_ATTEMPTS})...`}
          </p>
          <button onClick={() => window.location.reload()} className={`${button} mt-4`}>
            Refresh Now
          </button>
        </div>
      ) : (
        <button onClick={restart} disabled={phase === 'starting'} className={dangerButton}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {phase === 'starting' ? 'Starting...' : 'Restart Services'}
        </button>
      )}
    </div>
  );
}
