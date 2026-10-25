'use client';

import { useState, useEffect } from 'react';
import {
  AdminH2,
  AdminH3,
  AdminH4,
  AdminTextMuted,
  AdminTextSmall,
  AdminValue,
  AdminInfo,
} from '@/components/admin/Typography';

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
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <AdminH2>💾 Database Management</AdminH2>
      
      {message && (
        <div className="mb-6 p-4 bg-blue-500/20 rounded-lg border border-blue-500/30">
          <AdminInfo>{message}</AdminInfo>
        </div>
      )}

      <div className="space-y-6">
        {/* Database Statistics */}
        <div>
          <AdminH3>📊 Database Statistics</AdminH3>
          {loading && !stats ? (
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <AdminTextMuted>Loading statistics...</AdminTextMuted>
            </div>
          ) : stats ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Database Size</AdminTextSmall>
                <AdminValue>
                  {stats.approximateSizeMB?.toFixed(2) || '0'} MB
                </AdminValue>
              </div>
              
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Journal Mode</AdminTextSmall>
                <AdminValue>{stats.journalMode || 'Unknown'}</AdminValue>
              </div>
              
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Page Views</AdminTextSmall>
                <AdminValue>{stats.pageViews?.count?.toLocaleString() || '0'}</AdminValue>
              </div>
              
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Visitors</AdminTextSmall>
                <AdminValue>{stats.visitors?.count?.toLocaleString() || '0'}</AdminValue>
              </div>
              
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Song Requests</AdminTextSmall>
                <AdminValue>{stats.jukeboxQueue?.count?.toLocaleString() || '0'}</AdminValue>
              </div>
              
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <AdminTextSmall className="mb-1">Santa Letters</AdminTextSmall>
                <AdminValue>{stats.santaLetters?.count?.toLocaleString() || '0'}</AdminValue>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <AdminTextMuted>No statistics available</AdminTextMuted>
            </div>
          )}
        </div>

        {/* Maintenance Actions */}
        <div>
          <AdminH3>🔧 Maintenance Operations</AdminH3>
          <div className="space-y-3">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <AdminH4>Quick Maintenance</AdminH4>
                  <AdminTextSmall>
                    Analyze database statistics for query optimization (fast, ~1 second)
                  </AdminTextSmall>
                </div>
                <button
                  onClick={() => runMaintenance('quick')}
                  disabled={loading}
                  className="ml-4 px-4 py-2 bg-blue-500/80 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Run Quick
                </button>
              </div>
            </div>

            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <AdminH4>Full Maintenance</AdminH4>
                  <AdminTextSmall>
                    ANALYZE, REINDEX, and VACUUM database (slow, ~30-60 seconds)
                  </AdminTextSmall>
                </div>
                <button
                  onClick={() => runMaintenance('full')}
                  disabled={loading}
                  className="ml-4 px-4 py-2 bg-purple-500/80 hover:bg-purple-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Run Full
                </button>
              </div>
            </div>

            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <AdminH4>Archive Old Data</AdminH4>
                  <AdminTextSmall>
                    Remove page views older than 1 year and device status older than 90 days
                  </AdminTextSmall>
                </div>
                <button
                  onClick={() => runMaintenance('archive')}
                  disabled={loading}
                  className="ml-4 px-4 py-2 bg-orange-500/80 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Archive
                </button>
              </div>
            </div>

            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <AdminH4>Integrity Check</AdminH4>
                  <AdminTextSmall>
                    Verify database integrity and check for corruption
                  </AdminTextSmall>
                </div>
                <button
                  onClick={() => runMaintenance('integrity')}
                  disabled={loading}
                  className="ml-4 px-4 py-2 bg-green-500/80 hover:bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Check
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Automated Maintenance Info */}
        <div className="p-4 bg-green-500/20 rounded-lg border border-green-500/30">
          <AdminH4>✅ Automated Maintenance Active</AdminH4>
          <ul className="space-y-1">
            <li><AdminTextSmall>• Quick maintenance runs daily (every 24 hours)</AdminTextSmall></li>
            <li><AdminTextSmall>• Full maintenance runs weekly (every 7 days)</AdminTextSmall></li>
            <li><AdminTextSmall>• Data archival is MANUAL ONLY (use button above)</AdminTextSmall></li>
            <li><AdminTextSmall>• WAL mode enabled for better performance</AdminTextSmall></li>
            <li><AdminTextSmall>• 64MB cache size for faster queries</AdminTextSmall></li>
            <li><AdminTextSmall>• 30+ indexes created for optimal performance</AdminTextSmall></li>
          </ul>
        </div>

        <button
          onClick={fetchStats}
          disabled={loading}
          className="w-full px-6 py-3 bg-linear-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-600 hover:to-blue-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🔄 Refresh Statistics
        </button>
      </div>
    </div>
  );
}
