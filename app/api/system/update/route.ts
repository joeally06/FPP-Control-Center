import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * @deprecated Use /api/admin/update-install instead
 * 
 * POST /api/system/update
 * This endpoint is deprecated and redirects to the unified update API.
 * Kept for backwards compatibility - will be removed in a future version.
 */
export async function POST() {
  try {
    await requireAdmin();

    console.log('[System Update] DEPRECATED: Redirecting to /api/admin/update-install');
    
    // Forward to the canonical update endpoint
    const response = await fetch(new URL('/api/admin/update-install', process.env.NEXTAUTH_URL || 'http://localhost:3000'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    return NextResponse.json({
      ...data,
      deprecated: true,
      message: 'This endpoint is deprecated. Use /api/admin/update-install instead.',
      redirectedFrom: '/api/system/update'
    }, { status: response.status });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[System Update] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to start update',
      details: errorMessage,
      deprecated: true,
      hint: 'Use /api/admin/update-install instead'
    }, { status: 500 });
  }
}

/**
 * GET /api/system/update
 * Check for available updates
 */
export async function GET() {
  try {
    await requireAdmin();

    const projectRoot = process.cwd();
    
    // Fetch latest from remote
    execSync('git fetch origin master', { 
      cwd: projectRoot,
      stdio: 'pipe',
      timeout: 30000
    });

    // Compare commits
    const localCommit = execSync('git rev-parse HEAD', { 
      cwd: projectRoot,
      encoding: 'utf-8' 
    }).trim();

    const remoteCommit = execSync('git rev-parse origin/master', { 
      cwd: projectRoot,
      encoding: 'utf-8' 
    }).trim();

    const upToDate = localCommit === remoteCommit;

    // Get current version
    let currentVersion = 'unknown';
    try {
      const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
      currentVersion = packageJson.version || 'unknown';
    } catch {
      // Ignore
    }

    // Get commit messages if update available
    let changes: string[] = [];
    let latestVersion = currentVersion;
    
    if (!upToDate) {
      try {
        const updateMessage = execSync(
          `git log --oneline ${localCommit}..${remoteCommit}`,
          { cwd: projectRoot, encoding: 'utf-8' }
        ).trim();
        changes = updateMessage ? updateMessage.split('\n') : [];
      } catch {
        // Ignore
      }
      
      // Try to get version from remote
      try {
        const remotePackage = execSync('git show origin/master:package.json', { 
          cwd: projectRoot, 
          encoding: 'utf-8' 
        });
        const remotePkg = JSON.parse(remotePackage);
        latestVersion = remotePkg.version || 'unknown';
      } catch {
        latestVersion = 'newer';
      }
    }

    return NextResponse.json({
      upToDate,
      updateAvailable: !upToDate,
      currentVersion,
      latestVersion,
      localCommit: localCommit.substring(0, 7),
      remoteCommit: remoteCommit.substring(0, 7),
      changes,
    });

  } catch (error) {
    console.error('[Update Check] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to check for updates',
      details: error instanceof Error ? error.message : undefined
    }, { status: 500 });
  }
}
