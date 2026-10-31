// CSV Export Utilities

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
  const requestedCSV = convertToCSV(mostRequested, requestedHeaders);
  downloadCSV(`most-requested-${new Date().toISOString().split('T')[0]}.csv`, requestedCSV);

  // Export Recent Activity
  setTimeout(() => {
    const activityHeaders = ['id', 'sequence_name', 'requester_name', 'status', 'created_at', 'played_at'];
    const activityCSV = convertToCSV(recentActivity, activityHeaders);
    downloadCSV(`recent-activity-${new Date().toISOString().split('T')[0]}.csv`, activityCSV);
  }, 500);
}

export function exportVoteAnalytics(data: { topVoted: object[]; controversial: object[]; votingTrend: object[] }) {
  const { topVoted, controversial, votingTrend } = data;

  // Export Top Voted Songs
  const votedHeaders = ['sequence_name', 'upvotes', 'downvotes', 'net_votes', 'total_votes', 'approval_rating'];
  const votedCSV = convertToCSV(topVoted, votedHeaders);
  downloadCSV(`top-voted-${new Date().toISOString().split('T')[0]}.csv`, votedCSV);

  // Export Controversial Songs
  setTimeout(() => {
    const controversialHeaders = ['sequence_name', 'upvotes', 'downvotes', 'total_votes', 'vote_difference', 'approval_rating'];
    const controversialCSV = convertToCSV(controversial, controversialHeaders);
    downloadCSV(`controversial-songs-${new Date().toISOString().split('T')[0]}.csv`, controversialCSV);
  }, 500);

  // Export Voting Trend
  setTimeout(() => {
    const trendHeaders = ['date', 'vote_count', 'upvotes', 'downvotes'];
    const trendCSV = convertToCSV(votingTrend, trendHeaders);
    downloadCSV(`voting-trend-${new Date().toISOString().split('T')[0]}.csv`, trendCSV);
  }, 1000);
}
