'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import RequestVoteAnalytics from '@/components/analytics/RequestVoteAnalytics';
import {
  AdminH1,
  AdminH2,
  AdminTextSmall,
} from '@/components/admin/Typography';
import { card, insetBox, eyebrow, button, notice, tabClass } from '@/components/admin/ui-classes';
import { chartColors, axisTick, legendStyle, tooltipStyle } from '@/components/analytics/chart-theme';
import { Download, TrendingUp, Star, FileText, Users, CalendarDays, Clock, ListMusic } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface AnalyticsData {
  overview: {
    totalViews: number;
    todayViews: number;
    peakHour: string;
    avgRating: number;
  };
  trends: {
    date: string;
    views: number;
  }[];
  topContent: {
    sequences: { name: string; votes: number; rating: number }[];
    playlists: { name: string; plays: number }[];
    pages: { name: string; views: number }[];
  };
  santaLetters: {
    total: number;
    pending: number;
    sent: number;
    failed: number;
  };
}

// useSearchParams needs a Suspense boundary on this prerendered page
export default function AnalyticsPage() {
  return (
    <AdminLayout>
      <Suspense fallback={null}>
        <AnalyticsViews />
      </Suspense>
    </AdminLayout>
  );
}

const VIEWS = [
  { key: 'overview', label: 'Overview', href: '/analytics' },
  { key: 'requests', label: 'Requests & votes', href: '/analytics?view=requests' },
] as const;

// Two views in one page: site analytics, and the requests & votes analytics that used to live at /admin
function AnalyticsViews() {
  const view = useSearchParams().get('view') === 'requests' ? 'requests' : 'overview';

  return (
    <>
      <nav aria-label="Analytics views" className="mb-6 flex gap-1 overflow-x-auto border-b border-adm-line">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.href}
            aria-current={view === v.key ? 'page' : undefined}
            className={`${tabClass(view === v.key)} inline-flex items-center`}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      {view === 'requests' ? <RequestVoteAnalytics /> : <SiteAnalytics />}
    </>
  );
}

function SiteAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d'>('7d');
  const [activeTab, setActiveTab] = useState<'sequences' | 'playlists' | 'pages' | 'santa'>('sequences');

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/analytics?range=${timeRange}`);
      const result = await response.json();
      
      console.log('[Analytics] Response status:', response.status);
      console.log('[Analytics] Response data:', result);
      
      if (!response.ok) {
        console.error('[Analytics] API error:', result.error || 'Unknown error');
        alert(`Failed to load analytics: ${result.error || 'Unknown error'}`);
        return;
      }
      
      if (!result.data) {
        console.error('[Analytics] No data in response:', result);
        alert('No analytics data received from server');
        return;
      }
      
      console.log('[Analytics] Top sequences:', result.data.topContent.sequences);
      setData(result.data);
    } catch (error) {
      console.error('[Analytics] Failed to fetch analytics:', error);
      alert(`Error loading analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const exportData = async (format: 'csv' | 'json' | 'pdf') => {
    try {
      if (format === 'pdf') {
        // Generate PDF client-side for better compatibility
        console.log('[PDF Export] Starting PDF generation...');
        
        const response = await fetch(`/api/analytics/export?format=pdf&range=${timeRange}`);
        
        if (!response.ok) {
          throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }
        
        const reportData = await response.json();
        
        if (!reportData || !reportData.summary) {
          throw new Error('Invalid data received from API');
        }
        
        console.log('[PDF Export] Data received:', reportData);
        
        // Create PDF using jsPDF
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        let yPos = 20;
        
        // Title
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('FPP Show Analytics Report', pageWidth / 2, yPos, { align: 'center' });
        yPos += 10;
        
        // Metadata
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Generated: ${new Date(reportData.generated).toLocaleString()}`, 14, yPos);
        yPos += 6;
        doc.text(`Range: ${reportData.range}`, 14, yPos);
        yPos += 10;
        
        // Summary Section
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Summary', 14, yPos);
        yPos += 8;
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total Page Views: ${reportData.summary.totalPageViews.toLocaleString()}`, 14, yPos);
        yPos += 6;
        doc.text(`Total Votes: ${reportData.summary.totalVotes.toLocaleString()}`, 14, yPos);
        yPos += 6;
        doc.text(`Total Santa Letters: ${reportData.summary.totalSantaLetters.toLocaleString()}`, 14, yPos);
        yPos += 12;
        
        // Page Views Table
        if (reportData.pageViews && reportData.pageViews.length > 0) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('Recent Page Views', 14, yPos);
          yPos += 6;
          
          const pageViewRows = reportData.pageViews.slice(0, 30).map((view: any) => [
            view.page_path,
            new Date(view.view_time).toLocaleString(),
          ]);
          
          autoTable(doc, {
            startY: yPos,
            head: [['Page', 'Date/Time']],
            body: pageViewRows,
            theme: 'striped',
            headStyles: { fillColor: [66, 139, 202] },
            margin: { left: 14, right: 14 },
            styles: { fontSize: 9 },
          });
          
          yPos = (doc as any).lastAutoTable.finalY + 10;
        }
        
        // Check if we need a new page
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }
        
        // Votes Table
        if (reportData.votes && reportData.votes.length > 0) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('Recent Votes', 14, yPos);
          yPos += 6;
          
          const voteRows = reportData.votes.slice(0, 30).map((vote: any) => [
            vote.sequence_name,
            vote.vote_type === 'up' ? '👍 Up' : '👎 Down',
            new Date(vote.created_at).toLocaleString(),
          ]);
          
          autoTable(doc, {
            startY: yPos,
            head: [['Sequence', 'Vote', 'Date/Time']],
            body: voteRows,
            theme: 'striped',
            headStyles: { fillColor: [92, 184, 92] },
            margin: { left: 14, right: 14 },
            styles: { fontSize: 9 },
          });
          
          yPos = (doc as any).lastAutoTable.finalY + 10;
        }
        
        // Check if we need a new page for Santa Letters
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }
        
        // Santa Letters Table
        if (reportData.santaLetters && reportData.santaLetters.length > 0) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text('Santa Letters', 14, yPos);
          yPos += 6;
          
          const letterRows = reportData.santaLetters.slice(0, 20).map((letter: any) => [
            letter.child_name,
            letter.child_age || 'N/A',
            letter.status,
            new Date(letter.created_at).toLocaleDateString(),
          ]);
          
          autoTable(doc, {
            startY: yPos,
            head: [['Child Name', 'Age', 'Status', 'Date']],
            body: letterRows,
            theme: 'striped',
            headStyles: { fillColor: [217, 83, 79] },
            margin: { left: 14, right: 14 },
            styles: { fontSize: 9 },
          });
        }
        
        // Save the PDF
        const filename = `analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(filename);
        
        console.log('[PDF Export] PDF saved successfully:', filename);
        return;
      }
      
      // For CSV and JSON, use the API endpoint
      const response = await fetch(`/api/analytics/export?format=${format}&range=${timeRange}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${timeRange}-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('[Export] Export failed:', error);
      console.error('[Export] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        format,
        timeRange
      });
      alert(`Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (loading || !data) {
    return (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-adm-line border-t-adm-accent"></div>
            <p className="text-sm text-adm-muted">Loading analytics...</p>
          </div>
        </div>
    );
  }

  const santaSlices = [
    { name: 'Pending', value: data.santaLetters.pending, color: chartColors.warn },
    { name: 'Sent', value: data.santaLetters.sent, color: chartColors.ok },
    { name: 'Failed', value: data.santaLetters.failed, color: chartColors.danger },
  ].filter(item => item.value > 0);

  const th = 'px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.06em] text-adm-muted';
  const td = 'px-3 py-3 text-sm text-adm-soft';

  return (
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <AdminH1 className="mb-0">Show Analytics</AdminH1>

          {/* Time Range Selector */}
          <div className="inline-flex self-start rounded-xl border border-adm-control-line bg-adm-side p-1 sm:self-auto">
            {([['7d', 'Last 7 Days'], ['30d', 'Last 30 Days']] as const).map(([range, label]) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                aria-pressed={timeRange === range}
                className={`min-h-9 rounded-lg px-3.5 text-sm font-medium transition-colors ${
                  timeRange === range
                    ? 'bg-adm-raised text-adm-text'
                    : 'text-adm-muted hover:text-adm-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {([
            ['Total Views', data.overview.totalViews.toLocaleString(), Users],
            ["Today's Views", data.overview.todayViews.toLocaleString(), CalendarDays],
            ['Peak Hour', data.overview.peakHour, Clock],
            ['Avg Rating', data.overview.avgRating.toFixed(1), Star],
          ] as const).map(([label, value, Icon]) => (
            <div key={label} className={card}>
              <div className="flex items-start justify-between gap-2">
                <p className={eyebrow}>{label}</p>
                <Icon className="h-4.5 w-4.5 shrink-0 text-adm-faint" aria-hidden="true" />
              </div>
              <p className="mt-1 text-2xl font-semibold text-adm-text sm:text-3xl">{value}</p>
            </div>
          ))}
        </div>

        {/* Visitor Trends Chart */}
        <div className={card}>
          <div className="mb-4 flex items-center justify-between">
            <AdminH2 className="mb-0">Visitor Trends</AdminH2>
            <TrendingUp className="h-5 w-5 text-adm-faint" aria-hidden="true" />
          </div>

          <div className="h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.trends}
                margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis
                  dataKey="date"
                  tick={axisTick}
                  stroke={chartColors.grid}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis tick={axisTick} stroke={chartColors.grid} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                />
                <Legend wrapperStyle={legendStyle} />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke={chartColors.accent}
                  strokeWidth={2.5}
                  dot={{ fill: chartColors.accent, strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 5, fill: chartColors.accent }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Performing Content */}
        <div className={card}>
          <AdminH2>Top Performing Content</AdminH2>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* Top Sequence */}
            <div className={insetBox}>
              <div className="mb-2 flex items-center gap-2">
                <Star className="h-4 w-4 text-adm-accent" aria-hidden="true" />
                <p className={eyebrow}>Most Voted Sequence</p>
              </div>
              {data.topContent.sequences[0] ? (
                <>
                  <p className="font-semibold text-adm-text">
                    {data.topContent.sequences[0].name}
                  </p>
                  <AdminTextSmall>
                    {data.topContent.sequences[0].votes} votes • {data.topContent.sequences[0].rating.toFixed(1)} rating
                  </AdminTextSmall>
                </>
              ) : (
                <AdminTextSmall>No data yet</AdminTextSmall>
              )}
            </div>

            {/* Top Playlist */}
            <div className={insetBox}>
              <div className="mb-2 flex items-center gap-2">
                <ListMusic className="h-4 w-4 text-adm-accent" aria-hidden="true" />
                <p className={eyebrow}>Most Popular Playlist</p>
              </div>
              {data.topContent.playlists[0] && data.topContent.playlists[0].name !== 'No data yet' ? (
                <>
                  <p className="font-semibold text-adm-text">
                    {data.topContent.playlists[0].name}
                  </p>
                  <AdminTextSmall>
                    {data.topContent.playlists[0].plays} plays
                  </AdminTextSmall>
                </>
              ) : (
                <AdminTextSmall>No data yet</AdminTextSmall>
              )}
            </div>

            {/* Top Page */}
            <div className={insetBox}>
              <div className="mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-adm-accent" aria-hidden="true" />
                <p className={eyebrow}>Most Visited Page</p>
              </div>
              {data.topContent.pages[0] ? (
                <>
                  <p className="font-semibold text-adm-text">
                    {data.topContent.pages[0].name}
                  </p>
                  <AdminTextSmall>
                    {data.topContent.pages[0].views.toLocaleString()} views
                  </AdminTextSmall>
                </>
              ) : (
                <AdminTextSmall>No data yet</AdminTextSmall>
              )}
            </div>
          </div>
        </div>

        {/* Top Sequences Bar Chart */}
        <div className={card}>
          <AdminH2>Top Sequences by Votes</AdminH2>

          <div className="h-80">
            {data.topContent.sequences.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.topContent.sequences.slice(0, 10)}
                  margin={{ top: 5, right: 16, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis
                    dataKey="name"
                    tick={axisTick}
                    stroke={chartColors.grid}
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                  />
                  <YAxis tick={axisTick} stroke={chartColors.grid} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    formatter={(value: any, name: string | number | undefined) => {
                      if (name === 'votes') return [value, 'Votes'];
                      if (name === 'rating') return [Number(value).toFixed(1), 'Rating'];
                      return [value, name ?? ''];
                    }}
                  />
                  <Legend wrapperStyle={legendStyle} />
                  <Bar
                    dataKey="votes"
                    fill={chartColors.accent}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-adm-muted">No sequence data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Santa Letters Insights */}
        <div className={card}>
          <AdminH2>Santa Letters Insights</AdminH2>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className={insetBox}>
                <p className={eyebrow}>Total Letters</p>
                <p className="mt-1 text-2xl font-semibold text-adm-text">{data.santaLetters.total}</p>
              </div>
              <div className={insetBox}>
                <p className={eyebrow}>Pending</p>
                <p className="mt-1 text-2xl font-semibold text-adm-warn">{data.santaLetters.pending}</p>
              </div>
              <div className={insetBox}>
                <p className={eyebrow}>Sent</p>
                <p className="mt-1 text-2xl font-semibold text-adm-ok">{data.santaLetters.sent}</p>
              </div>
              <div className={insetBox}>
                <p className={eyebrow}>Failed</p>
                <p className={`mt-1 text-2xl font-semibold ${data.santaLetters.failed > 0 ? 'text-adm-danger' : 'text-adm-text'}`}>{data.santaLetters.failed}</p>
              </div>
            </div>

            {/* Pie Chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={santaSlices}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    stroke="none"
                  >
                    {santaSlices.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown Tabs */}
        <div className={card}>
          <AdminH2>Detailed Breakdown</AdminH2>

          {/* Tabs */}
          <div className="mb-4 flex gap-1 overflow-x-auto border-b border-adm-line">
            {([
              ['sequences', 'Sequences'],
              ['playlists', 'Playlists'],
              ['pages', 'Pages'],
              ['santa', 'Santa Letters'],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-pressed={activeTab === tab}
                className={tabClass(activeTab === tab)}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="overflow-x-auto">
            {activeTab === 'sequences' && (
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="border-b border-adm-line">
                    <th scope="col" className={th}>Sequence</th>
                    <th scope="col" className={th}>Votes</th>
                    <th scope="col" className={th}>Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-adm-line">
                  {data.topContent.sequences.length > 0 ? (
                    data.topContent.sequences.map((seq, index) => (
                      <tr key={index} className="hover:bg-adm-hover">
                        <td className={`${td} text-adm-text`}>{seq.name}</td>
                        <td className={td}>{seq.votes}</td>
                        <td className={td}>{seq.rating.toFixed(1)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-sm text-adm-muted">No sequence data yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'playlists' && (
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="border-b border-adm-line">
                    <th scope="col" className={th}>Playlist</th>
                    <th scope="col" className={th}>Plays</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-adm-line">
                  {data.topContent.playlists.length > 0 && data.topContent.playlists[0].name !== 'No data yet' ? (
                    data.topContent.playlists.map((playlist, index) => (
                      <tr key={index} className="hover:bg-adm-hover">
                        <td className={`${td} text-adm-text`}>{playlist.name}</td>
                        <td className={td}>{playlist.plays}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="py-8 text-center text-sm text-adm-muted">No playlist data yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'pages' && (
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="border-b border-adm-line">
                    <th scope="col" className={th}>Page</th>
                    <th scope="col" className={th}>Views</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-adm-line">
                  {data.topContent.pages.length > 0 ? (
                    data.topContent.pages.map((page, index) => (
                      <tr key={index} className="hover:bg-adm-hover">
                        <td className={`${td} text-adm-text`}>{page.name}</td>
                        <td className={td}>{page.views.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="py-8 text-center text-sm text-adm-muted">No page data yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'santa' && (
              <p className={notice.info}>
                View detailed Santa letter information on the <Link href="/santa-letters" className="font-semibold text-adm-info underline hover:no-underline">Santa Letters page</Link>
              </p>
            )}
          </div>
        </div>

        {/* Export Section */}
        <div className={card}>
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <AdminH2 className="mb-1">Export Data</AdminH2>
              <AdminTextSmall>
                Download your analytics data in various formats for further analysis
              </AdminTextSmall>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button onClick={() => exportData('csv')} className={button}>
                <Download className="h-4 w-4" aria-hidden="true" />
                CSV
              </button>
              <button onClick={() => exportData('json')} className={button}>
                <Download className="h-4 w-4" aria-hidden="true" />
                JSON
              </button>
              <button onClick={() => exportData('pdf')} className={button}>
                <Download className="h-4 w-4" aria-hidden="true" />
                PDF Report
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}
