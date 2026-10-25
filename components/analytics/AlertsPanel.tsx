'use client';

import { useEffect, useState } from 'react';
import { TIMING } from '@/lib/constants';
import { RefreshCw, OctagonAlert, TriangleAlert, Info, CircleCheck } from 'lucide-react';
import { card, insetBox, eyebrow, smallButton, notice } from '@/components/admin/ui-classes';

interface Alert {
  type: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  value: number;
  threshold: number;
}

interface AlertData {
  stats: {
    total_pending: number;
    currently_playing: number;
    avg_wait_minutes: number | null;
    requests_per_minute: string;
  };
  alerts: Alert[];
  hasAlerts: boolean;
}

export default function AlertsPanel() {
  const [alertData, setAlertData] = useState<AlertData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/analytics/alerts');
      if (response.ok) {
        const data = await response.json();
        setAlertData(data);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    // Refresh alerts every 30 seconds
    const interval = setInterval(fetchAlerts, TIMING.POLL_INTERVAL_SLOW);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className={card}>
        <h2 className="admin-h2">Queue Alerts</h2>
        <p className="text-sm text-adm-muted">Loading alerts...</p>
      </div>
    );
  }

  if (!alertData) {
    return null;
  }

  const getAlertColor = (type: string) => {
    switch (type) {
      case 'critical':
        return notice.danger;
      case 'warning':
        return notice.warn;
      case 'info':
        return notice.info;
      default:
        return `${insetBox} text-sm text-adm-soft`;
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return OctagonAlert;
      case 'warning':
        return TriangleAlert;
      default:
        return Info;
    }
  };

  return (
    <div className={card}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="admin-h2 mb-0">Queue Status & Alerts</h2>
        <button
          onClick={fetchAlerts}
          className={smallButton}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* Current Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={insetBox}>
          <p className={eyebrow}>Pending Requests</p>
          <p className="mt-1 text-2xl font-semibold text-adm-text">{alertData.stats.total_pending}</p>
        </div>
        <div className={insetBox}>
          <p className={eyebrow}>Currently Playing</p>
          <p className="mt-1 text-2xl font-semibold text-adm-text">{alertData.stats.currently_playing}</p>
        </div>
        <div className={insetBox}>
          <p className={eyebrow}>Avg Wait Time</p>
          <p className="mt-1 text-2xl font-semibold text-adm-text">
            {alertData.stats.avg_wait_minutes ? `${alertData.stats.avg_wait_minutes}m` : 'N/A'}
          </p>
        </div>
        <div className={insetBox}>
          <p className={eyebrow}>Request Rate</p>
          <p className="mt-1 text-2xl font-semibold text-adm-text">{alertData.stats.requests_per_minute}/min</p>
        </div>
      </div>

      {/* Alerts */}
      {alertData.hasAlerts ? (
        <div className="space-y-2">
          <h3 className="mb-2 text-sm font-semibold text-adm-soft">Active Alerts:</h3>
          {alertData.alerts.map((alert, index) => {
            const Icon = getAlertIcon(alert.type);
            return (
              <div
                key={index}
                className={`flex items-start gap-2.5 ${getAlertColor(alert.type)}`}
              >
                <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-semibold text-inherit">{alert.message}</p>
                  <p className="text-xs text-inherit opacity-80">
                    Threshold: {alert.threshold} | Current: {alert.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={`${notice.ok} flex items-center gap-2 font-semibold`}>
          <CircleCheck className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
          All systems normal - No alerts
        </p>
      )}
    </div>
  );
}
