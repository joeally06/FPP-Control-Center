import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import db from '@/lib/database';

/**
 * GET /api/models
 * Get all models
 * ADMIN ONLY - Models contain sensitive network configuration
 */
export async function GET() {
  try {
    await requireAdmin();
    
    const models = db.prepare(`
      SELECT * FROM fpp_models 
      ORDER BY controller_name, controller_ports, start_channel_no
    `).all();

    return NextResponse.json(models);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('Error fetching models:', error);
    return NextResponse.json({ error: 'Failed to fetch 3D models' }, { status: 500 });
  }
}
