import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import path from 'path';
import { requireAdminWithRateLimit } from '@/lib/auth-helpers';
import { toErrorMessage } from '@/lib/api-errors';
import { restartBlocker, startServiceRestart } from '@/lib/service-restart';

/**
 * POST /api/admin/restart
 * Restart fpp-control and fpp-poller (via scripts/restart-services.sh) so they re-read .env.local.
 * Returns once the script is started; the server goes down a moment later. ADMIN ONLY.
 */
export async function POST(request: NextRequest) {
  let email: string;
  try {
    const session = await requireAdminWithRateLimit(request);
    email = session.user?.email || 'unknown';
  } catch (error) {
    return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
  }

  if (process.platform !== 'linux') {
    return NextResponse.json({ error: 'Restarting is only available on the show server' }, { status: 400 });
  }

  const root = /*turbopackIgnore: true*/ process.cwd();
  if (!existsSync(path.join(root, 'scripts', 'restart-services.sh'))) {
    return NextResponse.json({ error: 'Restart script not found' }, { status: 500 });
  }

  const blocker = restartBlocker(path.join(root, 'logs'));
  if (blocker) {
    return NextResponse.json({ error: blocker }, { status: 409 });
  }

  try {
    console.log(`[Restart] Service restart triggered by admin: ${email}`);
    startServiceRestart();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/admin/restart:', error);
    return NextResponse.json({ error: 'Failed to start the restart' }, { status: 500 });
  }
}
