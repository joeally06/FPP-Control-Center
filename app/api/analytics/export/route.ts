import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import db from '@/lib/database';

/**
 * GET /api/analytics/export
 * Export analytics data in CSV or JSON format
 * ADMIN ONLY - Contains sensitive visitor data, votes, and Santa letters
 */
interface PageViewRow {
  session_id: number;
  page_path: string;
  view_time: string;
}

interface VoteRow {
  user_ip: string;
  sequence_name: string;
  vote_type: string;
  created_at: string;
}

interface SantaLetterRow {
  child_name: string;
  child_age: number | null;
  parent_email: string;
  letter_content: string;
  status: string;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const range = searchParams.get('range') || '7d';
    const days = range === '30d' ? 30 : 7;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    // Get all data
    const pageViews = db.prepare(`
      SELECT * FROM page_views WHERE view_time >= ? ORDER BY view_time DESC
    `).all(startDateStr) as PageViewRow[];

    const votes = db.prepare(`
      SELECT * FROM votes WHERE created_at >= ? ORDER BY created_at DESC
    `).all(startDateStr) as VoteRow[];

    const santaLetters = db.prepare(`
      SELECT * FROM santa_letters ORDER BY created_at DESC
    `).all() as SantaLetterRow[];

    if (format === 'json') {
      return NextResponse.json({
        exportDate: new Date().toISOString(),
        range,
        data: {
          pageViews,
          votes,
          santaLetters,
        },
      }, {
        headers: {
          'Content-Disposition': `attachment; filename="analytics-${range}-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    if (format === 'csv') {
      let csv = 'PAGE VIEWS\n';
      csv += 'Session ID,Page,View Time\n';
      pageViews.forEach((view) => {
        csv += `"${view.session_id}","${view.page_path}","${view.view_time}"\n`;
      });

      csv += '\n\nVOTES\n';
      csv += 'User IP,Sequence,Vote Type,Created At\n';
      votes.forEach((vote) => {
        csv += `"${vote.user_ip}","${vote.sequence_name}","${vote.vote_type}","${vote.created_at}"\n`;
      });

      csv += '\n\nSANTA LETTERS\n';
      csv += 'Name,Age,Email,Letter Content,Status,Created At\n';
      santaLetters.forEach((letter) => {
        csv += `"${letter.child_name}","${letter.child_age || 'N/A'}","${letter.parent_email}","${letter.letter_content.replace(/"/g, '""')}","${letter.status}","${letter.created_at}"\n`;
      });

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="analytics-${range}-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    if (format === 'pdf') {
      // For PDF, return a properly formatted text file with print-ready content
      // This will be handled by the client-side to generate a proper PDF
      const reportData = {
        generated: new Date().toISOString(),
        range: `Last ${days} days`,
        summary: {
          totalPageViews: pageViews.length,
          totalVotes: votes.length,
          totalSantaLetters: santaLetters.length,
        },
        pageViews: pageViews.slice(0, 100),
        votes: votes.slice(0, 100),
        santaLetters: santaLetters.slice(0, 50),
      };

      return NextResponse.json(reportData, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="analytics-${range}-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
