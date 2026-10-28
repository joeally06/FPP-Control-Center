import { NextResponse } from 'next/server';
import { getReadOnlyDb } from '@/lib/database';

/**
 * GET /api/santa/settings
 * Public endpoint - Returns santa letter configuration (daily limit only)
 * No authentication required - safe to expose rate limit setting
 */
export async function GET() {
  try {
    const db = getReadOnlyDb();
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('santa_daily_limit') as { value: string } | undefined;
    
    const limit = setting ? parseInt(setting.value, 10) : 1;
    
    return NextResponse.json({ limit });
  } catch (error) {
    console.error('[Santa Settings] Failed to fetch settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}
