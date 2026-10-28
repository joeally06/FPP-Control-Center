import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { exec } from 'child_process';
import { promisify } from 'util';
import { isAdminSession } from '@/lib/auth-helpers';

const execAsync = promisify(exec);

/**
 * POST /api/admin/update-check
 * Check if updates are available from GitHub without installing
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!isAdminSession(session)) {
      return NextResponse.json({ 
        error: 'Unauthorized - Admin access required' 
      }, { status: 401 });
    }

    console.log('[Update Check] Checking for updates from GitHub...');

    // Get current commit
    const { stdout: currentCommit } = await execAsync('git rev-parse HEAD');
    const current = currentCommit.trim();

    // Fetch latest from remote
    await execAsync('git fetch origin master');

    // Get remote commit
    const { stdout: remoteCommit } = await execAsync('git rev-parse origin/master');
    const remote = remoteCommit.trim();

    // Check how many commits behind
    const { stdout: behindCount } = await execAsync('git rev-list --count HEAD..origin/master');
    const behind = parseInt(behindCount.trim()) || 0;

    const hasUpdates = current !== remote;

    console.log(`[Update Check] Current: ${current.substring(0, 7)}, Remote: ${remote.substring(0, 7)}, Behind: ${behind} commits`);

    return NextResponse.json({
      success: true,
      hasUpdates,
      currentCommit: current,
      remoteCommit: remote,
      commitsAhead: behind
    });

  } catch (error) {
    console.error('[Update Check] Error:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to check for updates' 
    }, { status: 500 });
  }
}
