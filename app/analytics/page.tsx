'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import {
  AdminH1,
  AdminH2,
  AdminH3,
  AdminText,
  AdminTextSmall,
  AdminValue,
  AdminInfo,
} from '@/components/admin/Typography';
import { Download, TrendingUp, Star, Mail, FileText } from 'lucide-react';
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

export default function AnalyticsPage() {
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
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mx-auto mb-4"></div>
            <AdminText>Loading analytics...</AdminText>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <AdminH1>📊 Show Analytics</AdminH1>
          
          {/* Time Range Selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                timeRange === '7d'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                timeRange === '30d'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              Last 30 Days
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="relative overflow-hidden rounded-xl p-6 bg-linear-to-br from-blue-500/80 to-blue-600/80 backdrop-blur-md border border-white/20 shadow-lg hover:scale-105 transition-transform duration-200">
            <div className="flex items-start justify-between">
              <div>
                <AdminTextSmall className="text-white/90 mb-2">Total Views</AdminTextSmall>
                <AdminValue className="text-white">{data.overview.totalViews.toLocaleString()}</AdminValue>
              </div>
              <div className="text-4xl opacity-80">👥</div>
            </div>
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl p-6 bg-linear-to-br from-green-500/80 to-emerald-600/80 backdrop-blur-md border border-white/20 shadow-lg hover:scale-105 transition-transform duration-200">
            <div className="flex items-start justify-between">
              <div>
                <AdminTextSmall className="text-white/90 mb-2">Today&apos;s Views</AdminTextSmall>
                <AdminValue className="text-white">{data.overview.todayViews.toLocaleString()}</AdminValue>
              </div>
              <div className="text-4xl opacity-80">📅</div>
            </div>
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl p-6 bg-linear-to-br from-purple-500/80 to-purple-600/80 backdrop-blur-md border border-white/20 shadow-lg hover:scale-105 transition-transform duration-200">
            <div className="flex items-start justify-between">
              <div>
                <AdminTextSmall className="text-white/90 mb-2">Peak Hour</AdminTextSmall>
                <AdminValue className="text-white">{data.overview.peakHour}</AdminValue>
              </div>
              <div className="text-4xl opacity-80">⏰</div>
            </div>
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          </div>

          <div className="relative overflow-hidden rounded-xl p-6 bg-linear-to-br from-orange-500/80 to-amber-600/80 backdrop-blur-md border border-white/20 shadow-lg hover:scale-105 transition-transform duration-200">
            <div className="flex items-start justify-between">
              <div>
                <AdminTextSmall className="text-white/90 mb-2">Avg Rating</AdminTextSmall>
                <AdminValue className="text-white">{data.overview.avgRating.toFixed(1)}</AdminValue>
              </div>
              <div className="text-4xl opacity-80">⭐</div>
            </div>
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
          </div>
        </div>

        {/* Visitor Trends Chart */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <AdminH2 className="mb-0">📈 Visitor Trends</AdminH2>
            <TrendingUp className="w-6 h-6 text-green-400" />
          </div>
          
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.trends}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis 
                  dataKey="date" 
                  stroke="rgba(255,255,255,0.6)"
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(0,0,0,0.8)', 
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  labelFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                />
                <Legend 
                  wrapperStyle={{ color: 'rgba(255,255,255,0.8)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="views" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  fill="url(#colorViews)"
                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6, fill: '#06b6d4' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Performing Content */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
          <AdminH2>🏆 Top Performing Content</AdminH2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Top Sequence */}
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-5 h-5 text-yellow-400" />
                <AdminH3 className="mb-0">Most Voted Sequence</AdminH3>
              </div>
              {data.topContent.sequences[0] ? (
                <>
                  <AdminText className="font-semibold text-white">
                    {data.topContent.sequences[0].name}
                  </AdminText>
                  <AdminTextSmall>
                    {data.topContent.sequences[0].votes} votes • {data.topContent.sequences[0].rating.toFixed(1)}⭐
                  </AdminTextSmall>
                </>
              ) : (
                <AdminTextSmall>No data yet</AdminTextSmall>
              )}
            </div>

            {/* Top Playlist */}
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Mail className="w-5 h-5 text-green-400" />
                <AdminH3 className="mb-0">Most Popular Playlist</AdminH3>
              </div>
              {data.topContent.playlists[0] && data.topContent.playlists[0].name !== 'No data yet' ? (
                <>
                  <AdminText className="font-semibold text-white">
                    {data.topContent.playlists[0].name}
                  </AdminText>
                  <AdminTextSmall>
                    {data.topContent.playlists[0].plays} plays
                  </AdminTextSmall>
                </>
              ) : (
                <AdminTextSmall>No data yet</AdminTextSmall>
              )}
            </div>

            {/* Top Page */}
            <div className="bg-white/5 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-5 h-5 text-purple-400" />
                <AdminH3 className="mb-0">Most Visited Page</AdminH3>
              </div>
              {data.topContent.pages[0] ? (
                <>
                  <AdminText className="font-semibold text-white">
                    {data.topContent.pages[0].name}
                  </AdminText>
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
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
          <div className="flex justify-between items-center mb-6">
            <AdminH2 className="mb-0">🎵 Top Sequences by Votes</AdminH2>
            <Star className="w-6 h-6 text-yellow-400" />
          </div>
          
          <div className="h-80">
            {data.topContent.sequences.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.topContent.sequences.slice(0, 10)}
                  margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
                >
                  <defs>
                    <linearGradient id="colorVotes" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.9}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.7}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis 
                    dataKey="name" 
                    stroke="rgba(255,255,255,0.6)"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    interval={0}
                  />
                  <YAxis stroke="rgba(255,255,255,0.6)" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(0,0,0,0.8)', 
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                    formatter={(value: any, name: string | undefined) => {
                      if (name === 'votes') return [value, 'Votes'];
                      if (name === 'rating') return [Number(value).toFixed(1), 'Rating'];
                      return [value, name ?? ''];
                    }}
                  />
                  <Legend wrapperStyle={{ color: 'rgba(255,255,255,0.8)' }} />
                  <Bar 
                    dataKey="votes" 
                    fill="url(#colorVotes)" 
                    radius={[8, 8, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <AdminText className="text-white/60">No sequence data yet</AdminText>
              </div>
            )}
          </div>
        </div>

        {/* Santa Letters Insights */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <Mail className="w-6 h-6 text-red-400" />
            <AdminH2 className="mb-0">🎅 Santa Letters Insights</AdminH2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-500/20 rounded-lg p-4 border border-blue-500/30">
                <AdminTextSmall>Total Letters</AdminTextSmall>
                <AdminValue className="text-2xl">{data.santaLetters.total}</AdminValue>
              </div>
              <div className="bg-amber-500/20 rounded-lg p-4 border border-amber-500/30">
                <AdminTextSmall>Pending</AdminTextSmall>
                <AdminValue className="text-2xl">{data.santaLetters.pending}</AdminValue>
              </div>
              <div className="bg-green-500/20 rounded-lg p-4 border border-green-500/30">
                <AdminTextSmall>Sent</AdminTextSmall>
                <AdminValue className="text-2xl">{data.santaLetters.sent}</AdminValue>
              </div>
              <div className="bg-red-500/20 rounded-lg p-4 border border-red-500/30">
                <AdminTextSmall>Failed</AdminTextSmall>
                <AdminValue className="text-2xl">{data.santaLetters.failed}</AdminValue>
              </div>
            </div>

            {/* Pie Chart */}
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Pending', value: data.santaLetters.pending, color: '#f59e0b' },
                      { name: 'Sent', value: data.santaLetters.sent, color: '#10b981' },
                      { name: 'Failed', value: data.santaLetters.failed, color: '#ef4444' },
                    ].filter(item => item.value > 0)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {[
                      { name: 'Pending', value: data.santaLetters.pending, color: '#f59e0b' },
                      { name: 'Sent', value: data.santaLetters.sent, color: '#10b981' },
                      { name: 'Failed', value: data.santaLetters.failed, color: '#ef4444' },
                    ].filter(item => item.value > 0).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(0,0,0,0.8)', 
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown Tabs */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
          <AdminH2>📊 Detailed Breakdown</AdminH2>
          
          {/* Tabs */}
          <div className="flex gap-2 mb-6 border-b border-white/10 pb-2">
            <button
              onClick={() => setActiveTab('sequences')}
              className={`px-4 py-2 rounded-t-lg font-semibold transition-all ${
                activeTab === 'sequences'
                  ? 'bg-white/20 text-white border-b-2 border-blue-400'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              Sequences
            </button>
            <button
              onClick={() => setActiveTab('playlists')}
              className={`px-4 py-2 rounded-t-lg font-semibold transition-all ${
                activeTab === 'playlists'
                  ? 'bg-white/20 text-white border-b-2 border-blue-400'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              Playlists
            </button>
            <button
              onClick={() => setActiveTab('pages')}
              className={`px-4 py-2 rounded-t-lg font-semibold transition-all ${
                activeTab === 'pages'
                  ? 'bg-white/20 text-white border-b-2 border-blue-400'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              Pages
            </button>
            <button
              onClick={() => setActiveTab('santa')}
              className={`px-4 py-2 rounded-t-lg font-semibold transition-all ${
                activeTab === 'santa'
                  ? 'bg-white/20 text-white border-b-2 border-blue-400'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              Santa Letters
            </button>
          </div>

          {/* Tab Content */}
          <div className="overflow-x-auto">
            {activeTab === 'sequences' && (
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-white font-semibold">Sequence</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Votes</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topContent.sequences.length > 0 ? (
                    data.topContent.sequences.map((seq, index) => (
                      <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-4 text-white/80">{seq.name}</td>
                        <td className="py-3 px-4 text-white/80">{seq.votes}</td>
                        <td className="py-3 px-4 text-white/80">{seq.rating.toFixed(1)}⭐</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-white/60">No sequence data yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'playlists' && (
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-white font-semibold">Playlist</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Plays</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topContent.playlists.length > 0 && data.topContent.playlists[0].name !== 'No data yet' ? (
                    data.topContent.playlists.map((playlist, index) => (
                      <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-4 text-white/80">{playlist.name}</td>
                        <td className="py-3 px-4 text-white/80">{playlist.plays}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="py-8 text-center text-white/60">No playlist data yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'pages' && (
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-white font-semibold">Page</th>
                    <th className="text-left py-3 px-4 text-white font-semibold">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topContent.pages.length > 0 ? (
                    data.topContent.pages.map((page, index) => (
                      <tr key={index} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-4 text-white/80">{page.name}</td>
                        <td className="py-3 px-4 text-white/80">{page.views.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="py-8 text-center text-white/60">No page data yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}

            {activeTab === 'santa' && (
              <div className="p-4 bg-blue-500/10 rounded-lg">
                <AdminInfo>
                  View detailed Santa letter information on the <a href="/santa-letters" className="underline hover:text-blue-300">Santa Letters page</a>
                </AdminInfo>
              </div>
            )}
          </div>
        </div>

        {/* Export Section */}
        <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 shadow-lg">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <AdminH2 className="mb-2">💾 Export Data</AdminH2>
              <AdminTextSmall>
                Download your analytics data in various formats for further analysis
              </AdminTextSmall>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => exportData('csv')}
                className="px-6 py-3 bg-linear-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all font-semibold flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                CSV
              </button>
              <button
                onClick={() => exportData('json')}
                className="px-6 py-3 bg-linear-to-r from-blue-500 to-cyan-600 text-white rounded-lg hover:from-blue-600 hover:to-cyan-700 transition-all font-semibold flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                JSON
              </button>
              <button
                onClick={() => exportData('pdf')}
                className="px-6 py-3 bg-linear-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:from-purple-600 hover:to-indigo-700 transition-all font-semibold flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                PDF Report
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
