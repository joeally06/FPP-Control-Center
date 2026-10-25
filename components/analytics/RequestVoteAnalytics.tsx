'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import CircuitBreakerWidget from '@/components/CircuitBreakerWidget';
import { VotingTrendChart, VotingByHourChart, TopSongsVoteDistribution } from '@/components/analytics/VotingCharts';
import AlertsPanel from '@/components/analytics/AlertsPanel';
import { exportRequestAnalytics, exportVoteAnalytics } from '@/lib/csv-export';
import { Users, Download, ThumbsUp, ThumbsDown } from 'lucide-react';
import { card, insetBox, eyebrow, button, badge } from '@/components/admin/ui-classes';

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
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-adm-line border-t-adm-accent"></div>
          <p className="text-sm text-adm-muted">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const totalRequests = requestData?.successRate.reduce((sum, item) => sum + item.count, 0) || 0;
  const completedCount = requestData?.successRate.find(s => s.status === 'completed')?.count || 0;
  const successPercentage = totalRequests > 0 ? ((completedCount / totalRequests) * 100).toFixed(1) : '0';

  const th = 'px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-adm-muted';
  const td = 'px-3 py-3 text-sm text-adm-soft';

  return (
    <div className="flex flex-col gap-4">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2.5">
        <button
          onClick={() => router.push('/engagement')}
          className={button}
        >
          <Users className="h-4 w-4" aria-hidden="true" />
          User Engagement
        </button>
        <button
          onClick={() => requestData && exportRequestAnalytics(requestData)}
          className={button}
          disabled={!requestData}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export Request Data
        </button>
        <button
          onClick={() => voteData && exportVoteAnalytics(voteData)}
          className={button}
          disabled={!voteData}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export Vote Data
        </button>
      </div>

      {/* Alerts Panel */}
      <AlertsPanel />

      {/* Circuit Breaker Widget */}
      <CircuitBreakerWidget />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className={card}>
          <p className={eyebrow}>Total Requests</p>
          <p className="mt-1 text-3xl font-semibold text-adm-text">{totalRequests}</p>
        </div>
        <div className={card}>
          <p className={eyebrow}>Success Rate</p>
          <p className="mt-1 text-3xl font-semibold text-adm-text">{successPercentage}%</p>
        </div>
        <div className={card}>
          <p className={eyebrow}>Avg Wait Time</p>
          <p className="mt-1 text-3xl font-semibold text-adm-text">
            {formatWaitTime(requestData?.avgWaitTime.avg_wait_seconds || null)}
          </p>
        </div>
        <div className={card}>
          <p className={eyebrow}>Total Votes</p>
          <p className="mt-1 text-3xl font-semibold text-adm-text">{voteData?.totalStats.total_votes || 0}</p>
        </div>
      </div>

        {/* Voting Analytics Charts (each chart is its own card) */}
        {voteData && voteData.votingTrend.length > 0 && (
          <VotingTrendChart data={voteData.votingTrend} />
        )}

        {voteData && voteData.votingByHour.length > 0 && (
          <VotingByHourChart data={voteData.votingByHour} />
        )}

        {voteData && voteData.topVoted.length > 0 && (
          <TopSongsVoteDistribution songs={voteData.topVoted} />
        )}

        {/* Request Status Breakdown */}
        <div className={card}>
          <h2 className="admin-h2">Request Status</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {requestData?.successRate.map((status) => (
              <div key={status.status} className={`${insetBox} text-center`}>
                <p className="mb-1 text-sm capitalize text-adm-muted">{status.status}</p>
                <p className="mb-0.5 text-3xl font-semibold text-adm-text">{status.count}</p>
                <p className="text-xs text-adm-faint">
                  {totalRequests > 0 ? ((status.count / totalRequests) * 100).toFixed(1) : '0'}%
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Requests by Hour */}
          <div className={card}>
            <h2 className="admin-h2">Requests by Hour</h2>
            <div className="space-y-2">
              {requestData?.requestsByHour.map((hourData) => {
                const maxCount = Math.max(...(requestData?.requestsByHour.map(h => h.request_count) || [1]));
                const percentage = (hourData.request_count / maxCount) * 100;
                return (
                  <div key={hourData.hour} className="flex items-center gap-3">
                    <span className="w-12 text-sm font-medium text-adm-soft">{hourData.hour}:00</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-adm-side">
                      <div
                        className="h-full rounded-full bg-adm-info transition-all"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                    <span className="w-10 text-right text-sm font-semibold text-adm-text">{hourData.request_count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Requests by Day */}
          <div className={card}>
            <h2 className="admin-h2">Requests by Day of Week</h2>
            <div className="space-y-3">
              {requestData?.requestsByDay.map((dayData) => {
                const maxCount = Math.max(...(requestData?.requestsByDay.map(d => d.request_count) || [1]));
                const percentage = (dayData.request_count / maxCount) * 100;
                return (
                  <div key={dayData.day} className="flex items-center gap-3">
                    <span className="w-24 text-sm font-medium text-adm-soft">{DAY_NAMES[dayData.day]}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-adm-side">
                      <div
                        className="h-full rounded-full bg-adm-accent transition-all"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                    <span className="w-10 text-right text-sm font-semibold text-adm-text">{dayData.request_count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Most Requested Songs */}
        <div className={card}>
          <h2 className="admin-h2">Most Requested Songs</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-auto">
              <thead>
                <tr className="border-b border-adm-line">
                  <th scope="col" className={`${th} text-left`}>Rank</th>
                  <th scope="col" className={`${th} text-left`}>Song Name</th>
                  <th scope="col" className={`${th} text-center`}>Requests</th>
                  <th scope="col" className={`${th} text-center`}>Completed</th>
                  <th scope="col" className={`${th} text-center`}>Skipped</th>
                  <th scope="col" className={`${th} text-center`}>Last Requested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-adm-line">
                {requestData?.mostRequested.slice(0, 10).map((song, index) => (
                  <tr key={song.sequence_name} className="hover:bg-adm-hover">
                    <td className={td}>
                      <span className={`font-semibold ${index < 3 ? 'text-adm-accent' : 'text-adm-muted'}`}>#{index + 1}</span>
                    </td>
                    <td className={`${td} font-medium text-adm-text`}>{song.sequence_name}</td>
                    <td className={`${td} text-center font-semibold text-adm-text`}>{song.request_count}</td>
                    <td className={`${td} text-center font-semibold text-adm-ok`}>{song.completed_count}</td>
                    <td className={`${td} text-center font-semibold text-adm-danger`}>{song.skipped_count}</td>
                    <td className={`${td} text-center`}>
                      {new Date(song.last_requested).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Top Voted Songs */}
          <div className={card}>
            <h2 className="admin-h2">Top Voted Songs</h2>
            <ul className="space-y-2">
              {voteData?.topVoted.slice(0, 10).map((song, index) => (
                <li key={song.sequence_name} className={`${insetBox} flex items-center gap-3`}>
                  <span className={`w-8 font-semibold ${index < 3 ? 'text-adm-accent' : 'text-adm-muted'}`}>#{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-adm-text">{song.sequence_name}</p>
                    <VoteCounts upvotes={song.upvotes} downvotes={song.downvotes}>
                      Score: {song.net_votes > 0 ? '+' : ''}{song.net_votes}
                    </VoteCounts>
                  </div>
                  <p className="text-sm font-semibold text-adm-info">{song.approval_rating.toFixed(0)}%</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Most Controversial Songs */}
          <div className={card}>
            <h2 className="admin-h2">Most Controversial Songs</h2>
            <ul className="space-y-2">
              {voteData?.controversial.slice(0, 10).map((song, index) => (
                <li key={song.sequence_name} className={`${insetBox} flex items-center gap-3`}>
                  <span className="w-8 font-semibold text-adm-muted">#{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-adm-text">{song.sequence_name}</p>
                    <VoteCounts upvotes={song.upvotes} downvotes={song.downvotes}>
                      Split: {song.approval_rating.toFixed(0)}%/{(100 - song.approval_rating).toFixed(0)}%
                    </VoteCounts>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Recent Activity */}
        <div className={card}>
          <h2 className="admin-h2">Recent Activity</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-auto">
              <thead>
                <tr className="border-b border-adm-line">
                  <th scope="col" className={`${th} text-left`}>Song Name</th>
                  <th scope="col" className={`${th} text-left`}>Requester</th>
                  <th scope="col" className={`${th} text-center`}>Status</th>
                  <th scope="col" className={`${th} text-center`}>Requested</th>
                  <th scope="col" className={`${th} text-center`}>Played</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-adm-line">
                {requestData?.recentActivity.slice(0, 20).map((activity) => (
                  <tr key={activity.id} className="hover:bg-adm-hover">
                    <td className={`${td} font-medium text-adm-text`}>{activity.sequence_name}</td>
                    <td className={td}>{activity.requester_name || 'Anonymous'}</td>
                    <td className={`${td} text-center`}>
                      <span className={
                        activity.status === 'completed' ? badge.ok :
                        activity.status === 'playing' ? badge.info :
                        activity.status === 'skipped' ? badge.danger :
                        badge.neutral
                      }>
                        {activity.status}
                      </span>
                    </td>
                    <td className={`${td} text-center`}>
                      {formatDate(activity.created_at)}
                    </td>
                    <td className={`${td} text-center`}>
                      {activity.played_at ? formatDate(activity.played_at) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
    </div>
  );
}

// Up/down vote counts under a song name, plus a trailing note (score or split)
function VoteCounts({ upvotes, downvotes, children }: { upvotes: number; downvotes: number; children: ReactNode }) {
  return (
    <div className="mt-1 flex gap-4 text-sm">
      <span className="inline-flex items-center gap-1 text-adm-ok">
        <ThumbsUp className="h-3.5 w-3.5" aria-label="Upvotes" /> {upvotes}
      </span>
      <span className="inline-flex items-center gap-1 text-adm-danger">
        <ThumbsDown className="h-3.5 w-3.5" aria-label="Downvotes" /> {downvotes}
      </span>
      <span className="text-adm-muted">{children}</span>
    </div>
  );
}
