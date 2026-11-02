// CSV Export Utilities

import { localDateStamp, utcSqlToLocal } from './analytics-time';

// Stored times are UTC; the downloads show the show's clock
function withLocalTimes(rows: object[], keys: string[]): object[] {
  return rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    for (const key of keys) {
      if (typeof copy[key] === 'string') copy[key] = utcSqlToLocal(copy[key] as string);
    }
    return copy;
  });
}

export function convertToCSV<T extends object>(data: T[], headers: string[]): string {
  if (!data || data.length === 0) return '';

  // Create header row
  const headerRow = headers.join(',');

  // Create data rows
  const dataRows = data.map(row => {
    return headers.map(header => {
      const value: unknown = row[header as keyof T];
      // Handle null/undefined
      if (value === null || value === undefined) return '';
      // Escape commas and quotes in strings
      if (typeof value === 'string') {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
      }
      return value;
    }).join(',');
  });

  return [headerRow, ...dataRows].join('\n');
}

export function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportRequestAnalytics(data: { mostRequested: object[]; recentActivity: object[] }) {
  const { mostRequested, recentActivity } = data;

  // Export Most Requested Songs
  const requestedHeaders = ['sequence_name', 'request_count', 'completed_count', 'skipped_count', 'first_requested', 'last_requested'];
  const requestedCSV = convertToCSV(withLocalTimes(mostRequested, ['first_requested', 'last_requested']), requestedHeaders);
  downloadCSV(`most-requested-${localDateStamp()}.csv`, requestedCSV);

  // Export Recent Activity
  setTimeout(() => {
    const activityHeaders = ['id', 'sequence_name', 'requester_name', 'status', 'created_at', 'played_at'];
    const activityCSV = convertToCSV(withLocalTimes(recentActivity, ['created_at', 'played_at']), activityHeaders);
    downloadCSV(`recent-activity-${localDateStamp()}.csv`, activityCSV);
  }, 500);
}

export function exportVoteAnalytics(data: { topVoted: object[]; controversial: object[]; votingTrend: object[] }) {
  const { topVoted, controversial, votingTrend } = data;

  // Export Top Voted Songs
  const votedHeaders = ['sequence_name', 'upvotes', 'downvotes', 'net_votes', 'total_votes', 'approval_rating'];
  const votedCSV = convertToCSV(topVoted, votedHeaders);
  downloadCSV(`top-voted-${localDateStamp()}.csv`, votedCSV);

  // Export Controversial Songs
  setTimeout(() => {
    const controversialHeaders = ['sequence_name', 'upvotes', 'downvotes', 'total_votes', 'vote_difference', 'approval_rating'];
    const controversialCSV = convertToCSV(controversial, controversialHeaders);
    downloadCSV(`controversial-songs-${localDateStamp()}.csv`, controversialCSV);
  }, 500);

  // Export Voting Trend
  setTimeout(() => {
    const trendHeaders = ['date', 'vote_count', 'upvotes', 'downvotes'];
    const trendCSV = convertToCSV(votingTrend, trendHeaders);
    downloadCSV(`voting-trend-${localDateStamp()}.csv`, trendCSV);
  }, 1000);
}
