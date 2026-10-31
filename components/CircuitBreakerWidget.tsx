/**
 * Circuit Breaker Status Widget
 * 
 * Admin dashboard component showing FPP circuit breaker state.
 * 
 * FEATURES:
 * - Real-time circuit state indicator
 * - Visual status (CLOSED/OPEN/HALF_OPEN)
 * - Statistics and health metrics
 * - Manual reset button (admin only)
 * - Auto-refresh every 5 seconds
 * 
 * SECURITY:
 * - Admin-only component
 * - Confirmation dialog for manual reset
 * - Read-only by default
 */

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { TIMING } from '@/lib/constants';
import { CircleCheck, CircleX, RefreshCw, Wrench } from 'lucide-react';
import { card, insetBox, eyebrow, accentButton, notice } from '@/components/admin/ui-classes';

interface CircuitBreakerStats {
  circuit: {
    state: string;
    stateLabel: string;
    isFPPOnline: boolean;
    isFPPOffline: boolean;
    isTestingRecovery: boolean;
  };
  statistics: {
    currentFailureCount: number;
    currentSuccessCount: number;
    totalTransitions: number;
    timeSinceLastFailure: string;
    timeSinceStateChange: string;
    uptime: string;
    nextRetryIn: string | null;
    nextRetrySeconds: number | null;
  };
  health: {
    totalPolls: number;
    successfulPolls: number;
    failedPolls: number;
    uptimePercentage: number;
  };
  recommendations: string[];
}

export default function CircuitBreakerWidget() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<CircuitBreakerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch circuit breaker stats
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/circuit-breaker');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        console.error('Failed to fetch circuit breaker stats');
      }
    } catch (error) {
      console.error('Error fetching circuit breaker stats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Manual reset circuit breaker
  const handleReset = async () => {
    if (!confirm('Are you sure you want to manually reset the circuit breaker?\n\nThis should only be done if FPP is back online but the circuit hasn\'t recovered automatically.')) {
      return;
    }

    setResetting(true);
    setMessage('');

    try {
      const response = await fetch('/api/admin/circuit-breaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(`✅ ${result.message}`);
        fetchStats(); // Refresh stats
      } else {
        setMessage(`❌ ${result.error || 'Reset failed'}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setResetting(false);
      setTimeout(() => setMessage(''), TIMING.MESSAGE_DISPLAY_DURATION);
    }
  };

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (session?.user?.role === 'admin') {
      fetchStats();
      const interval = setInterval(fetchStats, TIMING.POLL_INTERVAL_FAST);
      return () => clearInterval(interval);
    }
  }, [session]);

  // Only show to admins
  if (session?.user?.role !== 'admin') {
    return null;
  }

  if (loading) {
    return (
      <div className={card}>
        <h3 className="admin-h2">Circuit Breaker Status</h3>
        <p className="text-sm text-adm-muted">Loading...</p>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  // Determine status color and icon
  const getStatusColor = () => {
    if (stats.circuit.isFPPOnline) return 'bg-adm-ok';
    if (stats.circuit.isTestingRecovery) return 'bg-adm-warn';
    return 'bg-adm-danger';
  };

  const getStatusIcon = () => {
    if (stats.circuit.isFPPOnline) return <CircleCheck className="h-7 w-7 text-adm-ok" aria-hidden="true" />;
    if (stats.circuit.isTestingRecovery) return <RefreshCw className="h-7 w-7 text-adm-warn" aria-hidden="true" />;
    return <CircleX className="h-7 w-7 text-adm-danger" aria-hidden="true" />;
  };

  const statusColor = getStatusColor();

  return (
    <div className={card}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="admin-h2 mb-0">FPP Circuit Breaker</h3>
        <div className={`${statusColor} h-2.5 w-2.5 rounded-full`}></div>
      </div>

      {/* Current State */}
      <div className="mb-5 flex items-center gap-3">
        {getStatusIcon()}
        <div>
          <p className="text-xl font-semibold text-adm-text">{stats.circuit.state}</p>
          <p className="text-sm text-adm-muted">{stats.circuit.stateLabel}</p>
        </div>
      </div>

      {/* Health Metrics */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className={insetBox}>
          <p className={eyebrow}>Uptime</p>
          <p className="mt-1 text-lg font-semibold text-adm-text">{stats.health.uptimePercentage.toFixed(1)}%</p>
        </div>
        <div className={insetBox}>
          <p className={eyebrow}>Total Polls</p>
          <p className="mt-1 text-lg font-semibold text-adm-text">{stats.health.totalPolls}</p>
        </div>
        <div className={insetBox}>
          <p className={eyebrow}>Successful</p>
          <p className="mt-1 text-lg font-semibold text-adm-ok">{stats.health.successfulPolls}</p>
        </div>
        <div className={insetBox}>
          <p className={eyebrow}>Failed</p>
          <p className="mt-1 text-lg font-semibold text-adm-danger">{stats.health.failedPolls}</p>
        </div>
      </div>

      {/* Statistics */}
      <dl className="mb-5 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-adm-muted">Failures:</dt>
          <dd className="font-semibold text-adm-text">{stats.statistics.currentFailureCount}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-adm-muted">State Changes:</dt>
          <dd className="font-semibold text-adm-text">{stats.statistics.totalTransitions}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-adm-muted">Since State Change:</dt>
          <dd className="font-semibold text-adm-text">{stats.statistics.timeSinceStateChange}</dd>
        </div>
        {stats.statistics.nextRetryIn && (
          <div className="flex justify-between gap-3">
            <dt className="text-adm-muted">Next Retry:</dt>
            <dd className="font-semibold text-adm-warn">{stats.statistics.nextRetryIn}</dd>
          </div>
        )}
      </dl>

      {/* Recommendations */}
      {stats.recommendations.length > 0 && (
        <div className={`${notice.info} mb-5`}>
          <p className="mb-2 text-xs font-semibold text-adm-info">Recommendations:</p>
          <ul className="space-y-1 text-xs">
            {stats.recommendations.map((rec, index) => (
              <li key={index} className="text-adm-info">{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Manual Reset Button */}
      {stats.circuit.isFPPOffline && (
        <button
          onClick={handleReset}
          disabled={resetting}
          className={`${accentButton} w-full`}
        >
          <Wrench className="h-4 w-4" aria-hidden="true" />
          {resetting ? 'Resetting...' : 'Manual Reset'}
        </button>
      )}

      {/* Message */}
      {message && (
        <p className={`mt-4 ${message.startsWith('✅') ? notice.ok : notice.danger}`}>{message}</p>
      )}

      {/* Footer */}
      <p className="mt-4 border-t border-adm-line pt-4 text-center text-xs text-adm-faint">
        Auto-refreshes every 5 seconds
      </p>
    </div>
  );
}
