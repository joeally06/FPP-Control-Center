import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getUtcNow } from '@/lib/time-utils';
import { isAdminSession } from '@/lib/auth-helpers';

const execAsync = promisify(exec);

const STATUS_FILE = path.join(process.cwd(), 'logs', 'update_status');
const LOG_FILE = path.join(process.cwd(), 'logs', 'update.log');

/**
 * GET /api/admin/update-status
 * Get current update status and latest commits
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!isAdminSession(session)) {
      return NextResponse.json({ 
        error: 'Unauthorized - Admin access required' 
      }, { status: 401 });
    }

    // Read update status from file
    let status = 'idle';
    let message = 'No update in progress';

    if (existsSync(STATUS_FILE)) {
      const statusContent = readFileSync(STATUS_FILE, 'utf-8').trim();
      
      // Map status codes to user-friendly messages
      // NOTE: Daemon writes COMPLETED (not SUCCESS), so we map both for compatibility
      const statusMap: { [key: string]: { status: string; message: string } } = {
        'IDLE': { status: 'idle', message: 'System ready' },
        'STARTING': { status: 'starting', message: 'Starting update process...' },
        'DOWNLOADING': { status: 'downloading', message: 'Downloading latest code from GitHub...' },
        'BACKING_UP': { status: 'backing_up', message: 'Backing up database and settings...' },
        'STOPPING': { status: 'stopping', message: 'Stopping services safely...' },
        'UPDATING': { status: 'updating', message: 'Pulling code updates...' },
        'INSTALLING': { status: 'installing', message: 'Installing dependencies (npm install)...' },
        'BUILDING': { status: 'building', message: 'Building application (npm run build)...' },
        'RESTARTING': { status: 'restarting', message: 'Restarting services (PM2)...' },
        'VERIFYING': { status: 'verifying', message: 'Verifying deployment...' },
        'SUCCESS': { status: 'completed', message: 'Update completed successfully! ✅' },
        'COMPLETED': { status: 'completed', message: 'Update completed successfully! ✅' },
        'UP_TO_DATE': { status: 'up_to_date', message: 'Already up to date - no updates needed ✅' },
        'FAILED': { status: 'error', message: 'Update failed - check logs for details ❌' },
        'LOCKED': { status: 'error', message: 'Another update is already in progress' }
      };

      const mappedStatus = statusMap[statusContent] || { status: 'idle', message: statusContent };
      status = mappedStatus.status;
      message = mappedStatus.message;
    }

    // Get current and remote commits
    let currentCommit = null;
    let availableCommit = null;

    try {
      const { stdout: current } = await execAsync('git rev-parse HEAD');
      currentCommit = current.trim();

      await execAsync('git fetch origin master');
      const { stdout: remote } = await execAsync('git rev-parse origin/master');
      availableCommit = remote.trim();
    } catch (error) {
      console.error('[Update Status] Failed to get commit info:', error);
    }

    // Read last few lines of log file for details
    let logLines: string[] = [];
    if (existsSync(LOG_FILE)) {
      try {
        const logContent = readFileSync(LOG_FILE, 'utf-8');
        const lines = logContent.split('\n').filter(line => line.trim());
        logLines = lines.slice(-10); // Last 10 lines
      } catch (error) {
        console.error('[Update Status] Failed to read log:', error);
      }
    }

    return NextResponse.json({
      status,
      message,
      timestamp: getUtcNow(),
      lastCheck: getUtcNow(),
      currentCommit,
      availableCommit,
      logLines
    });

  } catch (error) {
    console.error('[Update Status] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to get update status' 
    }, { status: 500 });
  }
}
