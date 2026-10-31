'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface EngagementData {
  overview: {
    total_unique_visitors: number;
    new_visitors_30d: number;
    returning_visitors_30d: number;
    repeat_visitor_percentage: number;
    avg_visits_per_repeat_visitor: string;
  };
  sessions: {
    total_sessions: number;
    avg_duration_seconds: number;
    min_duration_seconds: number;
    max_duration_seconds: number;
    avg_page_views: string;
  };
  geographic: Array<{
    country: string;
    city: string;
    visitor_count: number;
  }>;
  dailyVisitors: Array<{
    date: string;
    visitors: number;
  }>;
  hourlyActivity: Array<{
    hour: number;
    session_count: number;
  }>;
  topPages: Array<{
    page_path: string;
    view_count: number;
  }>;
}

export default function UserEngagementPanel() {
  const [engagementData, setEngagementData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEngagement();
  }, []);

  const fetchEngagement = async () => {
    try {
      const response = await fetch('/api/analytics/engagement');
      if (response.ok) {
        const data = await response.json();
        setEngagementData(data);
      }
    } catch (error) {
      console.error('Failed to fetch engagement data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  if (loading) {
    return <div className="bg-white p-6 rounded-lg shadow-md mb-8">
      <h2 className="text-2xl font-semibold mb-4">User Engagement</h2>
      <p className="text-gray-500">Loading engagement data...</p>
    </div>;
  }

  if (!engagementData) {
    return null;
  }

  // Prepare visitor type pie chart data
  const visitorTypeData = [
    { name: 'New Visitors', value: engagementData.overview.new_visitors_30d, color: '#3b82f6' },
    { name: 'Returning', value: engagementData.overview.returning_visitors_30d, color: '#10b981' }
  ];

  return (
    <div className="space-y-8">
      {/* Overview Section */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-4">User Engagement Overview</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-1">Total Unique Visitors</p>
            <p className="text-3xl font-bold text-blue-600">{engagementData.overview.total_unique_visitors}</p>
          </div>
          <div className="bg-green-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-1">New Visitors (30d)</p>
            <p className="text-3xl font-bold text-green-600">{engagementData.overview.new_visitors_30d}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-1">Returning (30d)</p>
            <p className="text-3xl font-bold text-purple-600">{engagementData.overview.returning_visitors_30d}</p>
          </div>
          <div className="bg-orange-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-1">Repeat Rate</p>
            <p className="text-3xl font-bold text-orange-600">{engagementData.overview.repeat_visitor_percentage}%</p>
          </div>
          <div className="bg-pink-50 p-4 rounded">
            <p className="text-sm text-gray-600 mb-1">Avg Visits</p>
            <p className="text-3xl font-bold text-pink-600">{engagementData.overview.avg_visits_per_repeat_visitor}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* New vs Returning Pie Chart */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Visitor Types (Last 30 Days)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={visitorTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {visitorTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Session Stats */}
          <div className="bg-gray-50 p-4 rounded">
            <h3 className="text-lg font-semibold mb-3">Session Statistics</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Sessions:</span>
                <span className="font-semibold">{engagementData.sessions.total_sessions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Duration:</span>
                <span className="font-semibold">{formatDuration(engagementData.sessions.avg_duration_seconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Min Duration:</span>
                <span className="font-semibold">{formatDuration(engagementData.sessions.min_duration_seconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Max Duration:</span>
                <span className="font-semibold">{formatDuration(engagementData.sessions.max_duration_seconds)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Avg Page Views:</span>
                <span className="font-semibold">{engagementData.sessions.avg_page_views}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Visitors Trend */}
      {engagementData.dailyVisitors.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Daily Unique Visitors (Last 30 Days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={engagementData.dailyVisitors}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="visitors" stroke="#3b82f6" name="Unique Visitors" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Hourly Activity */}
      {engagementData.hourlyActivity.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Session Activity by Hour</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={engagementData.hourlyActivity}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: 'Sessions', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="session_count" fill="#10b981" name="Sessions" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Geographic Distribution */}
      {engagementData.geographic.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Geographic Distribution</h3>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left">Country</th>
                  <th className="px-4 py-2 text-left">City</th>
                  <th className="px-4 py-2 text-center">Visitors</th>
                </tr>
              </thead>
              <tbody>
                {engagementData.geographic.map((loc, index) => (
                  <tr key={index} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2">{loc.country}</td>
                    <td className="px-4 py-2">{loc.city || '-'}</td>
                    <td className="px-4 py-2 text-center font-semibold">{loc.visitor_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Pages */}
      {engagementData.topPages.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">Most Visited Pages</h3>
          <div className="space-y-2">
            {engagementData.topPages.map((page, index) => {
              const maxViews = engagementData.topPages[0].view_count;
              const percentage = (page.view_count / maxViews) * 100;
              return (
                <div key={index} className="flex items-center gap-3">
                  <span className="text-sm w-32 font-mono">{page.page_path}</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                    <div
                      className="bg-blue-500 h-6 rounded-full"
                      style={{ width: `${percentage}%` }}
                    ></div>
                    <span className="absolute right-2 top-0.5 text-sm font-semibold">{page.view_count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
