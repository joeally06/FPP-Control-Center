import { spawn, type SpawnOptions } from 'child_process';

/**
 * Start a command that keeps running after this process, and say whether it really started.
 * Resolves with the process id once the child has spawned; rejects if it could not be started
 * (for example the command is not installed), which a bare spawn() reports only as an "error"
 * event that nothing was listening for.
 */
export function startDetached(command: string, args: string[], options: SpawnOptions): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, detached: true, stdio: 'ignore' });
    // Stays attached for good, so an error after the start is logged instead of crashing the server
    child.on('error', (error) => {
      console.error(`[Spawn] ${command} failed:`, error.message);
      reject(error);
    });
    child.once('spawn', () => {
      child.unref();
      resolve(child.pid);
    });
  });
}
