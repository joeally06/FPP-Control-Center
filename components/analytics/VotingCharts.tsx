'use client';

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
  ResponsiveContainer
} from 'recharts';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { card, insetBox } from '@/components/admin/ui-classes';
import { chartColors, axisTick, legendStyle, tooltipStyle } from '@/components/analytics/chart-theme';

interface VotingTrendData {
  date: string;
  vote_count: number;
  upvotes: number;
  downvotes: number;
}

interface VotingByHourData {
  hour: number;
  vote_count: number;
  upvotes: number;
  downvotes: number;
}

interface VoteRatioData {
  sequence_name: string;
  upvotes: number;
  downvotes: number;
}

const COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

export function VotingTrendChart({ data }: { data: VotingTrendData[] }) {
  return (
    <div className={card}>
      <h2 className="admin-h2">Voting Activity Trend (Last 30 Days)</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis
            dataKey="date"
            tick={axisTick}
            stroke={chartColors.grid}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis tick={axisTick} stroke={chartColors.grid} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={legendStyle} />
          <Line
            type="monotone"
            dataKey="upvotes"
            stroke={chartColors.ok}
            name="Upvotes"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="downvotes"
            stroke={chartColors.danger}
            name="Downvotes"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="vote_count"
            stroke={chartColors.info}
            name="Total Votes"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VotingByHourChart({ data }: { data: VotingByHourData[] }) {
  return (
    <div className={card}>
      <h2 className="admin-h2">Voting Activity by Hour</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis
            dataKey="hour"
            tick={axisTick}
            stroke={chartColors.grid}
            label={{ value: 'Hour of Day', position: 'insideBottom', offset: -5, fill: chartColors.axis }}
          />
          <YAxis tick={axisTick} stroke={chartColors.grid} label={{ value: 'Votes', angle: -90, position: 'insideLeft', fill: chartColors.axis }} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Legend wrapperStyle={legendStyle} />
          <Bar dataKey="upvotes" stackId="a" fill={chartColors.ok} name="Upvotes" />
          <Bar dataKey="downvotes" stackId="a" fill={chartColors.danger} name="Downvotes" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VoteRatioPieChart({ song }: { song: VoteRatioData }) {
  const data = [
    { name: 'Upvotes', value: song.upvotes, color: chartColors.ok },
    { name: 'Downvotes', value: song.downvotes, color: chartColors.danger }
  ];

  return (
    <div className={insetBox}>
      <h3 className="mb-2 truncate text-center text-sm font-semibold text-adm-text">{song.sequence_name}</h3>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(entry: any) => `${entry.name}: ${(entry.percent * 100).toFixed(0)}%`}
            outerRadius={60}
            fill="#8884d8"
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <p className="mt-2 flex items-center justify-center gap-2 text-xs text-adm-muted">
        <span className="inline-flex items-center gap-1 font-semibold text-adm-ok">
          <ThumbsUp className="h-3.5 w-3.5" aria-label="Upvotes" /> {song.upvotes}
        </span>
        vs
        <span className="inline-flex items-center gap-1 font-semibold text-adm-danger">
          <ThumbsDown className="h-3.5 w-3.5" aria-label="Downvotes" /> {song.downvotes}
        </span>
      </p>
    </div>
  );
}

export function TopSongsVoteDistribution({ songs }: { songs: VoteRatioData[] }) {
  return (
    <div className={card}>
      <h2 className="admin-h2">Vote Distribution - Top 6 Songs</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {songs.slice(0, 6).map((song, index) => (
          <VoteRatioPieChart key={index} song={song} />
        ))}
      </div>
    </div>
  );
}
