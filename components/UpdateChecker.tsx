'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { formatDateTime, getUtcNow } from '@/lib/time-utils';
import { RefreshCw, Check } from 'lucide-react';
import { AdminH2, AdminH3, AdminH4, AdminTextSmall, AdminTextTiny } from './admin/Typography';
import { insetBox, eyebrow, button, accentButton, notice } from './admin/ui-classes';
import { TIMING } from '@/lib/constants';

interface UpdateStatus {
  status: 'idle' | 'starting' | 'downloading' | 'backing_up' | 'stopping' | 'updating' | 'installing' | 'building' | 'restarting' | 'verifying' | 'completed' | 'error' | 'up_to_date';
  message: string;
  timestamp: string;
  lastCheck?: string;
  currentCommit?: string;
  availableCommit?: string;
  logLines?: string[];
}

export default function UpdateChecker() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [hasUpdates, setHasUpdates] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [commitsAhead, setCommitsAhead] = useState(0);
  const [logOutput, setLogOutput] = useState<string[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [autoReloadCountdown, setAutoReloadCountdown] = useState<number | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const installingRef = useRef<boolean>(false); // Track installing state for callbacks

  // Auto-scroll log output
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logOutput]);

  // Cleanup on unmount
  // ✅ MEMORY LEAK FIX: Reset all refs and clear all timers/connections
  useEffect(() => {
    return () => {
      // Reset installing state flag
      installingRef.current = false;
      
      // Close EventSource connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // Clear countdown interval
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, []);

  // Get user-friendly status message
  const getStatusMessage = useCallback((statusStr: string): string => {
    const messages: Record<string, string> = {
      'idle': 'System ready',
      'starting': 'Starting update process...',
      'downloading': 'Downloading latest code from GitHub...',
      'backing_up': 'Backing up database and settings...',
      'stopping': 'Stopping services safely...',
      'updating': 'Pulling code updates...',
      'installing': 'Installing dependencies (npm install)...',
      'building': 'Building application (npm run build)...',
      'restarting': 'Restarting services (PM2)...',
      'verifying': 'Verifying deployment...',
      'completed': 'Update completed successfully! ✅',
      'success': 'Update completed successfully! ✅',
      'up_to_date': 'Already up to date ✅',
      'error': 'Update failed - check logs ❌',
      'failed': 'Update failed - check logs ❌',
    };
    return messages[statusStr] || statusStr;
  }, []);

  // Connect to SSE stream for live updates
  const connectToStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log('[UpdateChecker] Connecting to update stream...');
    const eventSource = new EventSource('/api/admin/update-stream');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[UpdateChecker] Stream connected');
    };

    eventSource.addEventListener('log', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.isInitial) {
          setLogOutput(data.lines || []);
        } else {
          setLogOutput(prev => [...prev, ...(data.lines || [])]);
        }
      } catch (error) {
        console.error('[UpdateChecker] Failed to parse log event:', error);
      }
    });

    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse(event.data);
        const statusLower = data.status?.toLowerCase() || 'idle';
        
        setStatus(prev => ({
          ...prev,
          status: statusLower as UpdateStatus['status'],
          message: getStatusMessage(statusLower),
          timestamp: data.timestamp || getUtcNow(),
        } as UpdateStatus));
      } catch (error) {
        console.error('[UpdateChecker] Failed to parse status event:', error);
      }
    });

    eventSource.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[UpdateChecker] Update complete:', data);
        
        setInstalling(false);
        installingRef.current = false;
        
        if (data.success) {
          setStatus({
            status: 'completed',
            message: 'Update completed successfully! 🎉',
            timestamp: getUtcNow(),
          });
          
          // Start auto-reload countdown
          setAutoReloadCountdown(5);
          countdownIntervalRef.current = setInterval(() => {
            setAutoReloadCountdown(prev => {
              if (prev === null || prev <= 1) {
                if (countdownIntervalRef.current) {
                  clearInterval(countdownIntervalRef.current);
                }
                window.location.reload();
                return null;
              }
              return prev - 1;
            });
          }, 1000);
        } else {
          setStatus({
            status: 'error',
            message: 'Update failed - check logs for details',
            timestamp: getUtcNow(),
          });
        }
        
        // Close stream
        eventSource.close();
        eventSourceRef.current = null;
      } catch (error) {
        console.error('[UpdateChecker] Failed to parse complete event:', error);
      }
    });

    eventSource.onerror = () => {
      // If we're installing and lose connection, the server is restarting
      // Use ref instead of state to avoid stale closure issue
      if (installingRef.current) {
        console.log('[UpdateChecker] SSE connection lost during update - server may be restarting');
        eventSource.close();
        eventSourceRef.current = null;
        setReconnecting(true);
        
        // Try to reconnect after a delay
        const attemptReconnect = (attempt: number) => {
          if (attempt > 30) { // Give up after 30 attempts (2.5 minutes)
            setReconnecting(false);
            setInstalling(false);
            installingRef.current = false;
            setStatus({
              status: 'completed',
              message: 'Update likely completed - please refresh the page',
              timestamp: getUtcNow(),
            });
            return;
          }
          
          setReconnectAttempt(attempt);
          
          // Try to fetch the status endpoint to see if server is back
          fetch('/api/admin/update-status', { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
              const serverStatus = (data.status || '').toLowerCase();
              console.log('[UpdateChecker] Reconnect attempt', attempt, '- server status:', serverStatus);
              
              // Check for all completion states (completed, success, up_to_date)
              if (serverStatus === 'completed' || serverStatus === 'success' || serverStatus === 'up_to_date') {
                // Update completed!
                setReconnecting(false);
                setInstalling(false);
                installingRef.current = false;
                setStatus({
                  status: serverStatus === 'up_to_date' ? 'up_to_date' : 'completed',
                  message: serverStatus === 'up_to_date' 
                    ? 'Already up to date - no changes needed! ✅' 
                    : 'Update completed successfully! 🎉',
                  timestamp: getUtcNow(),
                });
                
                // Start auto-reload countdown
                setAutoReloadCountdown(5);
                countdownIntervalRef.current = setInterval(() => {
                  setAutoReloadCountdown(prev => {
                    if (prev === null || prev <= 1) {
                      if (countdownIntervalRef.current) {
                        clearInterval(countdownIntervalRef.current);
                      }
                      window.location.reload();
                      return null;
                    }
                    return prev - 1;
                  });
                }, 1000);
              } else if (serverStatus === 'failed' || serverStatus === 'error') {
                // Update failed
                setReconnecting(false);
                setInstalling(false);
                installingRef.current = false;
                setStatus({
                  status: 'error',
                  message: 'Update failed - check logs for details',
                  timestamp: getUtcNow(),
                });
              } else if (serverStatus === 'idle') {
                // Server came back but status is idle - update likely completed
                // This can happen if status file was cleared or server restarted cleanly
                console.log('[UpdateChecker] Server returned idle status - assuming update completed');
                setReconnecting(false);
                setInstalling(false);
                installingRef.current = false;
                setStatus({
                  status: 'completed',
                  message: 'Update completed - server restarted successfully! 🎉',
                  timestamp: getUtcNow(),
                });
                
                // Start auto-reload countdown
                setAutoReloadCountdown(5);
                countdownIntervalRef.current = setInterval(() => {
                  setAutoReloadCountdown(prev => {
                    if (prev === null || prev <= 1) {
                      if (countdownIntervalRef.current) {
                        clearInterval(countdownIntervalRef.current);
                      }
                      window.location.reload();
                      return null;
                    }
                    return prev - 1;
                  });
                }, 1000);
              } else {
                // Still in progress or unknown, try again
                reconnectTimeoutRef.current = setTimeout(() => attemptReconnect(attempt + 1), TIMING.RECONNECT_DELAY);
              }
            })
            .catch(() => {
              // Server not responding yet, try again
              reconnectTimeoutRef.current = setTimeout(() => attemptReconnect(attempt + 1), TIMING.RECONNECT_DELAY);
            });
        };
        
        // Wait 10 seconds before first reconnect attempt (server needs time to restart)
        reconnectTimeoutRef.current = setTimeout(() => attemptReconnect(1), TIMING.RECONNECT_DELAY_LONG);
      } else {
        // Not installing, just close quietly
        eventSource.close();
        eventSourceRef.current = null;
      }
    };
  }, [installing, getStatusMessage]);

  // Fetch current update status
  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/admin/update-status', {
        cache: 'no-store'
      });
      
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        
        if (data.currentCommit && data.availableCommit) {
          setHasUpdates(data.currentCommit !== data.availableCommit);
        }

        if (data.logLines) {
          setLogOutput(data.logLines);
        }
      }
    } catch (error) {
      console.error('[UpdateChecker] Failed to fetch status:', error);
    }
  };

  // Check for updates
  const checkForUpdates = async () => {
    setChecking(true);

    try {
      const response = await fetch('/api/admin/update-check', {
        method: 'POST',
        cache: 'no-store'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setHasUpdates(data.hasUpdates);
        setCommitsAhead(data.commitsAhead || 0);
        
        setStatus({
          status: data.hasUpdates ? 'idle' : 'up_to_date',
          message: data.hasUpdates 
            ? `🎉 ${data.commitsAhead} new update${data.commitsAhead > 1 ? 's' : ''} available!` 
            : '✅ Your system is up to date',
          timestamp: getUtcNow(),
          lastCheck: getUtcNow(),
          currentCommit: data.currentCommit,
          availableCommit: data.remoteCommit
        });
      }
    } catch (error) {
      console.error('[UpdateChecker] Failed to check for updates:', error);
      setStatus({
        status: 'error',
        message: '❌ Failed to check for updates',
        timestamp: getUtcNow()
      });
    } finally {
      setChecking(false);
    }
  };

  // Install update
  const installUpdate = async () => {
    if (!confirm(
      '⚠️  System Update\n\n' +
      'This will:\n' +
      '1. Stop services and backup data\n' +
      '2. Download latest code from GitHub\n' +
      '3. Install dependencies and rebuild\n' +
      '4. Restart services\n\n' +
      'Expected downtime: 2-3 minutes\n' +
      'You\'ll see live progress below.\n\n' +
      'Continue?'
    )) {
      return;
    }

    setInstalling(true);
    installingRef.current = true;
    setShowTerminal(true);
    setLogOutput(['🚀 Starting update...', '']);

    try {
      const response = await fetch('/api/admin/update-install', {
        method: 'POST',
        cache: 'no-store'
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStatus({
          status: 'starting',
          message: 'Update started - monitoring progress...',
          timestamp: getUtcNow()
        });
        
        // Connect to SSE stream for live updates
        connectToStream();
      } else {
        setStatus({
          status: 'error',
          message: data.error || 'Failed to start update',
          timestamp: getUtcNow()
        });
        setInstalling(false);
        installingRef.current = false;
      }
    } catch (error) {
      console.error('[UpdateChecker] Failed to install update:', error);
      setStatus({
        status: 'error',
        message: '❌ Failed to start update',
        timestamp: getUtcNow()
      });
      setInstalling(false);
      installingRef.current = false;
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchStatus();
    checkForUpdates();
  }, []);

  // Get status display
  const getStatusDisplay = () => {
    if (!status) return { color: 'gray', text: 'Loading...' };

    const displays: Record<string, { color: string; text: string }> = {
      'starting': { color: 'blue', text: 'Starting update...' },
      'downloading': { color: 'blue', text: 'Downloading...' },
      'backing_up': { color: 'yellow', text: 'Backing up...' },
      'stopping': { color: 'yellow', text: 'Stopping services...' },
      'updating': { color: 'blue', text: 'Updating code...' },
      'installing': { color: 'yellow', text: 'Installing deps...' },
      'building': { color: 'yellow', text: 'Building...' },
      'restarting': { color: 'yellow', text: 'Restarting...' },
      'verifying': { color: 'blue', text: 'Verifying...' },
      'completed': { color: 'green', text: 'Complete!' },
      'up_to_date': { color: 'green', text: 'Up to date' },
      'error': { color: 'red', text: 'Failed' },
      'idle': { color: 'gray', text: 'Idle' },
    };

    return displays[status.status] || { color: 'gray', text: 'Idle' };
  };

  const statusDisplay = getStatusDisplay();
  const isUpdating = ['starting', 'downloading', 'backing_up', 'stopping', 'updating', 'installing', 'building', 'restarting', 'verifying'].includes(status?.status || '');

  return (
    <div className="space-y-5">
      <div>
        <AdminH2 className="mb-1">System Updates</AdminH2>
        <AdminTextSmall>
          Keep your FPP Control Center up to date with the latest features and fixes
        </AdminTextSmall>
      </div>

      {/* Update Available Banner */}
      {hasUpdates && !isUpdating && !installing && (
        <div className="flex flex-col gap-4 rounded-xl border border-adm-warn-line bg-adm-warn-bg p-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="mb-0.5 text-[15px] font-semibold text-adm-warn">
              Update Available!
            </p>
            <AdminTextSmall>
              {commitsAhead} new update{commitsAhead > 1 ? 's' : ''} ready to install.
            </AdminTextSmall>
          </div>
          <button
            onClick={installUpdate}
            disabled={installing}
            className={accentButton}
          >
            Install Now →
          </button>
        </div>
      )}

      {/* Auto-reload Countdown */}
      {autoReloadCountdown !== null && (
        <div className={`${notice.ok} text-center`}>
          <p className="text-[15px] font-semibold text-adm-ok">Update Complete!</p>
          <p className="mt-1 text-sm text-adm-soft">
            Page will reload in <span className="text-xl font-semibold text-adm-ok">{autoReloadCountdown}</span> seconds...
          </p>
        </div>
      )}

      {/* Reconnecting Banner */}
      {reconnecting && (
        <div className={`${notice.info} text-center`}>
          <RefreshCw className="mx-auto h-7 w-7 animate-spin" aria-hidden="true" />
          <p className="mt-2 text-[15px] font-semibold text-adm-info">Server Restarting...</p>
          <p className="mt-1 text-sm text-adm-soft">
            Reconnecting to server (attempt {reconnectAttempt}/30)...
          </p>
          <p className="mt-1 text-[13px] text-adm-muted">
            The update is completing. This page will refresh automatically when ready.
          </p>
          <button
            onClick={() => window.location.reload()}
            className={`${button} mt-4`}
          >
            Refresh Now
          </button>
        </div>
      )}

      {/* Current Status Card */}
      <div className={`rounded-xl border bg-adm-side p-4 ${
        statusDisplay.color === 'green' ? 'border-adm-ok-line' :
        statusDisplay.color === 'yellow' ? 'border-adm-warn-line' :
        statusDisplay.color === 'blue' ? 'border-adm-info-line' :
        statusDisplay.color === 'red' ? 'border-adm-danger-line' :
        'border-adm-line'
      }`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
              statusDisplay.color === 'green' ? 'bg-adm-ok' :
              statusDisplay.color === 'yellow' ? 'bg-adm-warn' :
              statusDisplay.color === 'blue' ? 'bg-adm-info' :
              statusDisplay.color === 'red' ? 'bg-adm-danger' :
              'bg-adm-faint'
            }`} aria-hidden="true" />
            <div>
              <AdminH3 className="mb-0.5">{statusDisplay.text}</AdminH3>
              <AdminTextSmall>
                {status?.message || 'No status available'}
              </AdminTextSmall>
            </div>
          </div>

          {status?.lastCheck && (
            <AdminTextTiny className="sm:shrink-0">
              Last checked: {formatDateTime(status.lastCheck, 'short')}
            </AdminTextTiny>
          )}
        </div>

        {/* Progress indicator */}
        {isUpdating && (
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-adm-line">
              <div className="h-full rounded-full bg-adm-info animate-pulse" style={{ width: '100%' }} />
            </div>
            <AdminTextSmall className="mt-2 text-center">
              Please wait... Do not close this page.
            </AdminTextSmall>
          </div>
        )}

        {/* Commit info */}
        {status?.currentCommit && status?.availableCommit && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-adm-line bg-adm-surface p-3">
              <p className={eyebrow}>Current</p>
              <code className="font-mono text-sm text-adm-text">
                {status.currentCommit.substring(0, 7)}
              </code>
            </div>
            <div className="rounded-lg border border-adm-line bg-adm-surface p-3">
              <p className={eyebrow}>Latest</p>
              <code className="font-mono text-sm text-adm-text">
                {status.availableCommit.substring(0, 7)}
              </code>
            </div>
          </div>
        )}
      </div>

      {/* Live Terminal Output */}
      {(showTerminal || logOutput.length > 0) && (
        <div className="overflow-hidden rounded-xl border border-adm-line">
          <div className="flex items-center justify-between border-b border-adm-line bg-adm-side px-4 py-2.5">
            <span className="font-mono text-sm text-adm-muted">update.log</span>
            {!isUpdating && (
              <button
                onClick={() => {
                  setShowTerminal(false);
                  setLogOutput([]);
                }}
                className="text-sm text-adm-muted hover:text-adm-text"
              >
                Clear
              </button>
            )}
          </div>
          <div
            ref={logContainerRef}
            className="h-64 overflow-y-auto bg-adm-field p-4 font-mono text-[13px]"
          >
            {logOutput.map((line, idx) => (
              <div
                key={idx}
                className={`${
                  line.includes('✅') || line.includes('SUCCESS') ? 'text-adm-ok' :
                  line.includes('❌') || line.includes('ERROR') || line.includes('FAILED') ? 'text-adm-danger' :
                  line.includes('⚠️') || line.includes('WARNING') ? 'text-adm-warn' :
                  line.includes('🚀') || line.includes('🔄') ? 'text-adm-info' :
                  'text-adm-soft'
                }`}
              >
                {line || ' '}
              </div>
            ))}
            {isUpdating && (
              <div className="text-adm-accent animate-pulse">▊</div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <button
          onClick={checkForUpdates}
          disabled={checking || isUpdating}
          className={`${button} sm:flex-1`}
        >
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} aria-hidden="true" />
          {checking ? 'Checking...' : 'Check for Updates'}
        </button>

        {hasUpdates && !isUpdating && (
          <button
            onClick={installUpdate}
            disabled={installing}
            className={`${accentButton} sm:flex-1`}
          >
            {installing ? 'Starting...' : 'Install Update'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Update Process Info */}
        <div className={insetBox}>
          <AdminH4 className="mb-2">Update Process</AdminH4>
          <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {['Check', 'Download', 'Install', 'Build', 'Restart'].map((step, idx) => (
              <li key={step} className="text-adm-soft">
                <span className="text-adm-faint">{idx + 1}.</span> {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Safety Info */}
        <div className={insetBox}>
          <AdminH4 className="mb-2">Update Safety</AdminH4>
          <ul className="grid grid-cols-2 gap-1 text-sm">
            {['Database preserved', 'Settings unchanged', 'Auto-rollback on failure', '~2-3 min downtime'].map((item) => (
              <li key={item} className="flex items-center gap-1.5 text-adm-soft">
                <Check className="h-3.5 w-3.5 shrink-0 text-adm-ok" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Manual fallback */}
      <p className="text-[13px] text-adm-muted">
        <strong className="text-adm-soft">Manual Update:</strong> SSH to server and run{' '}
        <code className="rounded bg-adm-field px-1.5 py-0.5 font-mono text-adm-text">./scripts/update-daemon.sh</code>
      </p>
    </div>
  );
}
