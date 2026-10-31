import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { checkNow, getStoredReport } from '@/lib/dependency-scheduler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/dependencies
 * The report saved by the last check on this machine (or null). Never runs npm. ADMIN ONLY.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }
  return NextResponse.json({ report: getStoredReport() });
}

/**
 * POST /api/admin/dependencies
 * Runs a check now (npm outdated + npm audit, read-only; can take up to ~30 s) and saves it. ADMIN ONLY.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithRateLimit(request);
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  try {
    const report = await checkNow();
    if (!report) return NextResponse.json({ error: 'A check is already running' }, { status: 409 });
    return NextResponse.json({ report });
  } catch (error) {
    console.error('Error in POST /api/admin/dependencies:', error);
    return NextResponse.json({ error: 'The dependency check failed' }, { status: 500 });
  }
}
