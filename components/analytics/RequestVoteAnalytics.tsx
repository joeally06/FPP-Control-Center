'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CircuitBreakerWidget from '@/components/CircuitBreakerWidget';
import { VotingTrendChart, VotingByHourChart, TopSongsVoteDistribution } from '@/components/analytics/VotingCharts';
import AlertsPanel from '@/components/analytics/AlertsPanel';
import { exportRequestAnalytics, exportVoteAnalytics } from '@/lib/csv-export';

interface RequestAnalytics {
  mostRequested: Array<{
    sequence_name: string;
    request_count: number;
    completed_count: number;
    skipped_count: number;
    first_requested: string;
    last_requested: string;
  }>;
  requestsByHour: Array<{
    hour: number;
    request_count: number;
  }>;
  requestsByDay: Array<{
    day: number;
    request_count: number;
  }>;
  successRate: Array<{
    status: string;
    count: number;
  }>;
  recentActivity: Array<{
    id: number;
    sequence_name: string;
    requester_name: string;
    status: string;
    created_at: string;
    played_at: string | null;
  }>;
  avgWaitTime: {
    avg_wait_seconds: number | null;
  };
}

interface VoteAnalytics {
  topVoted: Array<{
    sequence_name: string;
    upvotes: number;
    downvotes: number;
    net_votes: number;
    total_votes: number;
    approval_rating: number;
  }>;
  controversial: Array<{
    sequence_name: string;
    upvotes: number;
    downvotes: number;
    total_votes: number;
    vote_difference: number;
    approval_rating: number;
  }>;
  totalStats: {
    sequences_with_votes: number;
    total_upvotes: number;
    total_downvotes: number;
    total_votes: number;
  };
  votingTrend: Array<{
    date: string;
    vote_count: number;
    upvotes: number;
    downvotes: number;
  }>;
  votingByHour: Array<{
    hour: number;
    vote_count: number;
    upvotes: number;
    downvotes: number;
  }>;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Requests & votes view of /analytics (was the separate /admin page)
export default function RequestVoteAnalytics() {
  const router = useRouter();
  const [requestData, setRequestData] = useState<RequestAnalytics | null>(null);
  const [voteData, setVoteData] = useState<VoteAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const [requestsRes, votesRes] = await Promise.all([
        fetch('/api/analytics/requests'),
        fetch('/api/analytics/votes')
      ]);

      if (requestsRes.ok) {
        const data = await requestsRes.json();
        setRequestData(data);
      }

      if (votesRes.ok) {
        const data = await votesRes.json();
        setVoteData(data);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatWaitTime = (seconds: number | null) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mx-auto mb-4"></div>
          <p className="text-white/80">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const totalRequests = requestData?.successRate.reduce((sum, item) => sum + item.count, 0) || 0;
  const completedCount = requestData?.successRate.find(s => s.status === 'completed')?.count || 0;
  const successPercentage = totalRequests > 0 ? ((completedCount / totalRequests) * 100).toFixed(1) : '0';

  return (
    <>
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => router.push('/engagement')}
          className="backdrop-blur-sm bg-indigo-500/80 hover:bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
        >
          <span>👥</span>
          User Engagement
        </button>
        <button
          onClick={() => requestData && exportRequestAnalytics(requestData)}
          className="backdrop-blur-sm bg-green-500/80 hover:bg-green-600 disabled:bg-gray-500/50 text-white px-6 py-3 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl disabled:cursor-not-allowed flex items-center gap-2"
          disabled={!requestData}
        >
          <span>📊</span>
          Export Request Data
        </button>
        <button
          onClick={() => voteData && exportVoteAnalytics(voteData)}
          className="backdrop-blur-sm bg-purple-500/80 hover:bg-purple-600 disabled:bg-gray-500/50 text-white px-6 py-3 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl disabled:cursor-not-allowed flex items-center gap-2"
          disabled={!voteData}
        >
          <span>📈</span>
          Export Vote Data
        </button>
      </div>

      {/* Alerts Panel */}
      <AlertsPanel />

      {/* Circuit Breaker Widget */}
      <div className="mb-8">
        <CircuitBreakerWidget />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <div className="backdrop-blur-md bg-linear-to-br from-blue-500/80 to-blue-600/80 rounded-xl p-6 shadow-2xl border border-white/20 transform transition-all hover:scale-105">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">🎵</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white/80 mb-1">Total Requests</h3>
              <p className="text-3xl font-bold text-white">{totalRequests}</p>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-md bg-linear-to-br from-green-500/80 to-emerald-600/80 rounded-xl p-6 shadow-2xl border border-white/20 transform transition-all hover:scale-105">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">✅</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white/80 mb-1">Success Rate</h3>
              <p className="text-3xl font-bold text-white">{successPercentage}%</p>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-md bg-linear-to-br from-purple-500/80 to-purple-600/80 rounded-xl p-6 shadow-2xl border border-white/20 transform transition-all hover:scale-105">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">⏱️</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white/80 mb-1">Avg Wait Time</h3>
              <p className="text-3xl font-bold text-white">
                {formatWaitTime(requestData?.avgWaitTime.avg_wait_seconds || null)}
              </p>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-md bg-linear-to-br from-orange-500/80 to-amber-600/80 rounded-xl p-6 shadow-2xl border border-white/20 transform transition-all hover:scale-105">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-2xl">🗳️</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white/80 mb-1">Total Votes</h3>
              <p className="text-3xl font-bold text-white">{voteData?.totalStats.total_votes || 0}</p>
            </div>
          </div>
        </div>
      </div>

        {/* Voting Analytics Charts */}
        {voteData && voteData.votingTrend.length > 0 && (
          <div className="backdrop-blur-md bg-white/10 rounded-xl p-6 shadow-2xl border border-white/20 mb-8">
            <VotingTrendChart data={voteData.votingTrend} />
          </div>
        )}

        {voteData && voteData.votingByHour.length > 0 && (
          <div className="backdrop-blur-md bg-white/10 rounded-xl p-6 shadow-2xl border border-white/20 mb-8">
            <VotingByHourChart data={voteData.votingByHour} />
          </div>
        )}

        {voteData && voteData.topVoted.length > 0 && (
          <div className="backdrop-blur-md bg-white/10 rounded-xl p-6 shadow-2xl border border-white/20 mb-8">
            <TopSongsVoteDistribution songs={voteData.topVoted} />
          </div>
        )}

        {/* Request Status Breakdown */}
        <div className="backdrop-blur-md bg-white/10 rounded-xl p-6 shadow-2xl border border-white/20 mb-8">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <span>📈</span>
            Request Status
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {requestData?.successRate.map((status) => (
              <div key={status.status} className="text-center p-6 bg-white/10 rounded-lg backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all">
                <p className="text-sm text-white/70 capitalize mb-2">{status.status}</p>
                <p className="text-3xl font-bold text-white mb-1">{status.count}</p>
                <p className="text-xs text-white/60">
                  {totalRequests > 0 ? ((status.count / totalRequests) * 100).toFixed(1) : '0'}%
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Requests by Hour */}
          <div className="backdrop-blur-md bg-white/10 rounded-xl p-6 shadow-2xl border border-white/20">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
              <span>🕐</span>
              Requests by Hour
            </h2>
            <div className="space-y-2">
              {requestData?.requestsByHour.map((hourData) => {
                const maxCount = Math.max(...(requestData?.requestsByHour.map(h => h.request_count) || [1]));
                const percentage = (hourData.request_count / maxCount) * 100;
                return (
                  <div key={hourData.hour} className="flex items-center gap-2">
                    <span className="text-sm w-12 text-white/80 font-semibold">{hourData.hour}:00</span>
                    <div className="flex-1 bg-white/10 rounded-full h-6 relative border border-white/20">
                      <div
                        className="bg-linear-to-r from-blue-500 to-cyan-500 h-6 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      ></div>
                      <span className="absolute right-2 top-0.5 text-xs font-semibold text-white">{hourData.request_count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Requests by Day */}
          <div className="backdrop-blur-md bg-white/10 rounded-xl p-6 shadow-2xl border border-white/20">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
              <span>📅</span>
              Requests by Day of Week
            </h2>
            <div className="space-y-3">
              {requestData?.requestsByDay.map((dayData) => {
                const maxCount = Math.max(...(requestData?.requestsByDay.map(d => d.request_count) || [1]));
                const percentage = (dayData.request_count / maxCount) * 100;
                return (
                  <div key={dayData.day} className="flex items-center gap-2">
                    <span className="text-sm w-24 text-white/80 font-semibold">{DAY_NAMES[dayData.day]}</span>
                    <div className="flex-1 bg-white/10 rounded-full h-7 relative border border-white/20">
                      <div
                        className="bg-linear-to-r from-green-500 to-emerald-500 h-7 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      ></div>
                      <span className="absolute right-2 top-1 text-sm font-semibold text-white">{dayData.request_count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Most Requested Songs */}
        <div className="backdrop-blur-md bg-white/10 rounded-xl p-6 shadow-2xl border border-white/20 mb-8">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <span>🏆</span>
            Most Requested Songs
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="px-4 py-3 text-left text-white/80 font-semibold">Rank</th>
                  <th className="px-4 py-3 text-left text-white/80 font-semibold">Song Name</th>
                  <th className="px-4 py-3 text-center text-white/80 font-semibold">Requests</th>
                  <th className="px-4 py-3 text-center text-white/80 font-semibold">Completed</th>
                  <th className="px-4 py-3 text-center text-white/80 font-semibold">Skipped</th>
                  <th className="px-4 py-3 text-center text-white/80 font-semibold">Last Requested</th>
                </tr>
              </thead>
              <tbody>
                {requestData?.mostRequested.slice(0, 10).map((song, index) => (
                  <tr key={song.sequence_name} className="border-t border-white/10 hover:bg-white/5">
                    <td className="px-4 py-3">
                      <span className={`font-bold ${
                        index === 0 ? 'text-yellow-400 text-lg' :
                        index === 1 ? 'text-gray-300 text-lg' :
                        index === 2 ? 'text-orange-400 text-lg' :
                        'text-white/60'
                      }`}>#{index + 1}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{song.sequence_name}</td>
                    <td className="px-4 py-3 text-center text-white font-semibold">{song.request_count}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-green-400 font-semibold">{song.completed_count}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-red-400 font-semibold">{song.skipped_count}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-white/70">
                      {new Date(song.last_requested).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Top Voted Songs */}
          <div className="backdrop-blur-md bg-white/10 rounded-xl p-6 shadow-2xl border border-white/20">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
              <span>⭐</span>
              Top Voted Songs
            </h2>
            <div className="space-y-3">
              {voteData?.topVoted.slice(0, 10).map((song, index) => (
                <div key={song.sequence_name} className="flex items-center gap-2 p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-all">
                  <span className={`font-bold w-8 ${
                    index < 3 ? 'text-yellow-400 text-lg' : 'text-white/60'
                  }`}>#{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-white">{song.sequence_name}</p>
                    <div className="flex gap-4 text-sm mt-1">
                      <span className="text-green-400">👍 {song.upvotes}</span>
                      <span className="text-red-400">👎 {song.downvotes}</span>
                      <span className="text-white/70">Score: {song.net_votes > 0 ? '+' : ''}{song.net_votes}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-blue-400">{song.approval_rating.toFixed(0)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Most Controversial Songs */}
          <div className="backdrop-blur-md bg-white/10 rounded-xl p-6 shadow-2xl border border-white/20">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
              <span>⚡</span>
              Most Controversial Songs
            </h2>
            <div className="space-y-3">
              {voteData?.controversial.slice(0, 10).map((song, index) => (
                <div key={song.sequence_name} className="flex items-center gap-2 p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-all">
                  <span className="font-bold text-white/60 w-8">#{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-white">{song.sequence_name}</p>
                    <div className="flex gap-4 text-sm mt-1">
                      <span className="text-green-400">👍 {song.upvotes}</span>
                      <span className="text-red-400">👎 {song.downvotes}</span>
                      <span className="text-white/70">Split: {song.approval_rating.toFixed(0)}%/{(100 - song.approval_rating).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="backdrop-blur-md bg-white/10 rounded-xl p-6 shadow-2xl border border-white/20">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <span>📋</span>
            Recent Activity
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="px-4 py-3 text-left text-white/80 font-semibold">Song Name</th>
                  <th className="px-4 py-3 text-left text-white/80 font-semibold">Requester</th>
                  <th className="px-4 py-3 text-center text-white/80 font-semibold">Status</th>
                  <th className="px-4 py-3 text-center text-white/80 font-semibold">Requested</th>
                  <th className="px-4 py-3 text-center text-white/80 font-semibold">Played</th>
                </tr>
              </thead>
              <tbody>
                {requestData?.recentActivity.slice(0, 20).map((activity) => (
                  <tr key={activity.id} className="border-t border-white/10 hover:bg-white/5">
                    <td className="px-4 py-3 font-medium text-white">{activity.sequence_name}</td>
                    <td className="px-4 py-3 text-white/80">{activity.requester_name || 'Anonymous'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        activity.status === 'completed' ? 'bg-green-500/80 text-white' :
                        activity.status === 'playing' ? 'bg-blue-500/80 text-white' :
                        activity.status === 'skipped' ? 'bg-red-500/80 text-white' :
                        'bg-gray-500/80 text-white'
                      }`}>
                        {activity.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-white/70">
                      {formatDate(activity.created_at)}
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-white/70">
                      {activity.played_at ? formatDate(activity.played_at) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
    </>
  );
}