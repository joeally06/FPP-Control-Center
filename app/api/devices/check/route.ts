import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import db from '@/lib/database';
import { checkAllDevices } from '@/lib/device-check';
import { isMonitoringActive } from '@/lib/monitoring-schedule';

/**
 * GET /api/devices/check
 * Check device health status now (the Check button). Runs at any time;
 * alert emails only go out during the monitoring schedule.
 * ADMIN ONLY - Device monitoring
 */
export async function GET() {
  try {
    // Require admin authentication
    await requireAdmin();

    const alertsActive = isMonitoringActive();
    const results = await checkAllDevices(db, { alertsActive });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...(results.length === 0 ? { message: 'No enabled devices to check' } : {}),
      monitoringActive: alertsActive,
      results
    });

  } catch (error: any) {
    if (error.message?.includes('Authentication required')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error.message?.includes('Admin access required')) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    console.error('[Device Monitor] Error checking devices:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check devices' },
      { status: 500 }
    );
  }
}
