import { execFileSync } from 'child_process';

function readGitHead(): string | null {
  try {
    const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'], // no "not a git repository" noise in the server log
    }).trim();
    return hash || null;
  } catch {
    // Not in a git repository, or git isn't installed
    return null;
  }
}

/**
 * A reader that asks only once, on first use. The commit can't change while the process runs: an update
 * restarts the server, and a blocking git call on every request would stall everything else.
 */
export function createBuildHashReader(read: () => string | null): () => string | null {
  let cached: string | null | undefined;
  return () => {
    if (cached === undefined) cached = read();
    return cached;
  };
}

export const getBuildHash = createBuildHashReader(readGitHead);
