'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, CircleCheck } from 'lucide-react';
import {
  AdminH2,
  AdminH3,
  AdminTextMuted,
} from '@/components/admin/Typography';
import { card, insetBox, eyebrow, smallButton, smallDangerButton, notice } from '@/components/admin/ui-classes';

export default function DatabaseSettings() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/database/maintenance');
      const data = await response.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch database stats:', error);
      setMessage('❌ Failed to load database statistics');
    } finally {
      setLoading(false);
    }
  };

  const runMaintenance = async (action: string) => {
    try {
      setLoading(true);
      setMessage(`⏳ Running ${action} maintenance...`);
      
      const response = await fetch('/api/database/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Ensure session cookies are sent
        body: JSON.stringify({ action }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        // Handle authentication and other HTTP errors
        setMessage(`❌ Maintenance failed: ${data.error || 'Unknown error'}`);
        return;
      }
      
      if (data.success) {
        setMessage(`✅ ${action.charAt(0).toUpperCase() + action.slice(1)} maintenance completed successfully`);
        await fetchStats(); // Refresh stats
      } else {
        setMessage(`❌ Maintenance failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Maintenance error:', error);
      setMessage('❌ Maintenance operation failed');
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(''), 5000); // Clear message after 5 seconds
    }
  };

  // Load stats on component mount
  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className={`${card} max-w-3xl`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <AdminH2 className="mb-0">Database Management</AdminH2>
        <button
          onClick={fetchStats}
          disabled={loading}
          className={smallButton}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh Statistics
        </button>
      </div>
      
      {message && (
        <p className={`${notice.info} mb-6`}>{message}</p>
      )}

      <div className="space-y-6">
        {/* Database Statistics */}
        <section>
          <AdminH3>Database Statistics</AdminH3>
          {loading && !stats ? (
            <div className={insetBox}>
              <AdminTextMuted>Loading statistics...</AdminTextMuted>
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {([
                ['Database Size', `${stats.approximateSizeMB?.toFixed(2) || '0'} MB`],
                ['Journal Mode', stats.journalMode || 'Unknown'],
                ['Page Views', stats.pageViews?.count?.toLocaleString() || '0'],
                ['Visitors', stats.visitors?.count?.toLocaleString() || '0'],
                ['Song Requests', stats.jukeboxQueue?.count?.toLocaleString() || '0'],
                ['Santa Letters', stats.santaLetters?.count?.toLocaleString() || '0'],
              ] as const).map(([label, value]) => (
                <div key={label} className={insetBox}>
                  <p className={eyebrow}>{label}</p>
                  <p className="mt-1 text-xl font-semibold text-adm-text sm:text-2xl">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className={insetBox}>
              <AdminTextMuted>No statistics available</AdminTextMuted>
            </div>
          )}
        </section>

        {/* Maintenance Actions */}
        <section className="border-t border-adm-line pt-5">
          <AdminH3>Maintenance Operations</AdminH3>
          <ul className="space-y-2.5">
            {([
              ['quick', 'Quick Maintenance', 'Analyze database statistics for query optimization (fast, ~1 second)', 'Run Quick'],
              ['full', 'Full Maintenance', 'ANALYZE, REINDEX, and VACUUM database (slow, ~30-60 seconds)', 'Run Full'],
              ['archive', 'Archive Old Data', 'Remove page views older than 1 year and device status older than 90 days', 'Archive'],
              ['integrity', 'Integrity Check', 'Verify database integrity and check for corruption', 'Check'],
            ] as const).map(([action, title, description, label]) => (
              <li key={action} className={`${insetBox} flex flex-col gap-3 sm:flex-row sm:items-center`}>
                <div className="flex-1">
                  <p className="text-sm font-medium text-adm-text">{title}</p>
                  <p className="mt-0.5 text-[13px] text-adm-muted">{description}</p>
                </div>
                <button
                  onClick={() => runMaintenance(action)}
                  disabled={loading}
                  className={`${action === 'archive' ? smallDangerButton : smallButton} self-start sm:self-auto`}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Automated Maintenance Info */}
        <div className={notice.ok}>
          <p className="mb-1.5 flex items-center gap-2 font-semibold text-adm-ok">
            <CircleCheck className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
            Automated Maintenance Active
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-adm-soft">
            <li className="text-adm-soft">Quick maintenance runs daily (every 24 hours)</li>
            <li className="text-adm-soft">Full maintenance runs weekly (every 7 days)</li>
            <li className="text-adm-soft">Data archival is MANUAL ONLY (use button above)</li>
            <li className="text-adm-soft">WAL mode enabled for better performance</li>
            <li className="text-adm-soft">64MB cache size for faster queries</li>
            <li className="text-adm-soft">30+ indexes created for optimal performance</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
