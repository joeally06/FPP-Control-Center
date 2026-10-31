import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Require admin authentication
    await requireAdmin();
    
    console.log('[Update Check] Checking for updates...');
    
    // Get current version (local commit)
    const { stdout: localCommit } = await execAsync('git rev-parse HEAD');
    const currentVersion = localCommit.trim().substring(0, 7);
    
    // Get current branch
    const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD');
    const currentBranch = branch.trim();
    
    // Fetch latest from GitHub (doesn't modify local files)
    console.log('[Update Check] Fetching from GitHub...');
    await execAsync('git fetch origin --quiet');
    
    // Get remote version
    const { stdout: remoteCommit } = await execAsync(`git rev-parse origin/${currentBranch}`);
    const latestVersion = remoteCommit.trim().substring(0, 7);
    
    // Check if update available
    const updateAvailable = currentVersion !== latestVersion;
    
    // Count commits ahead
    let commitsAhead = 0;
    if (updateAvailable) {
      const { stdout: countStr } = await execAsync(
        `git rev-list HEAD..origin/${currentBranch} --count`
      );
      commitsAhead = parseInt(countStr.trim(), 10);
    }
    
    // Get changelog if update available
    let changelog: string[] = [];
    let latestCommit = null;
    let changedFiles: string[] = [];
    
    if (updateAvailable) {
      // Get commit messages
      const { stdout: logOutput } = await execAsync(
        `git log HEAD..origin/${currentBranch} --oneline --max-count=10`
      );
      changelog = logOutput.trim().split('\n').filter(Boolean);
      
      // Get latest commit details
      const { stdout: commitInfo } = await execAsync(
        `git log origin/${currentBranch} -1 --pretty=format:"%h|%an|%ar|%s"`
      );
      const [hash, author, time, message] = commitInfo.split('|');
      latestCommit = { hash, author, time, message };
      
      // Get changed files
      const { stdout: filesOutput } = await execAsync(
        `git diff --name-only HEAD origin/${currentBranch}`
      );
      changedFiles = filesOutput.trim().split('\n').filter(f => f.length > 0);
    }
    
    console.log('[Update Check] Update available:', updateAvailable);
    console.log('[Update Check] Current:', currentVersion, 'Latest:', latestVersion);
    console.log('[Update Check] Commits ahead:', commitsAhead);
    
    return NextResponse.json({
      updatesAvailable: updateAvailable,
      updateAvailable, // Keep for backwards compatibility
      commitsAhead,
      currentVersion,
      latestVersion,
      remoteVersion: latestVersion, // Alias for consistency
      currentBranch,
      changelog,
      latestCommit,
      changedFiles,
      checked: new Date().toISOString(),
      lastChecked: new Date().toISOString(), // Keep for backwards compatibility
    });
    
  } catch (error) {
    console.error('[Update Check] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check for updates', 
        details: error instanceof Error ? error.message : undefined,
        stderr: (typeof error === 'object' && error !== null && 'stderr' in error ? error.stderr : null) || null,
      },
      { status: 500 }
    );
  }
}
