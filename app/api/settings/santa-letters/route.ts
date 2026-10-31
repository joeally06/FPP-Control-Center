import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { getDb } from '@/lib/database';

/**
 * GET /api/settings/santa-letters
 * Get Santa letter settings
 * ADMIN ONLY
 */
export async function GET() {
  try {
    await requireAdmin();
    
    const db = getDb();

    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('santa_daily_limit') as { value: string } | undefined;


    const limit = setting ? parseInt(setting.value, 10) : 1;

    return NextResponse.json({ limit });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Failed to fetch letter limit:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}
