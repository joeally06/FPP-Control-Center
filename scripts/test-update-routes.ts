import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { startDetached } from '../lib/start-detached';

function print(msg: string) {
  console.log('[test-update-routes] ' + msg);
}

const root = process.cwd();
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf-8');

async function main() {
  print('Test 1: a command that cannot be started rejects, and nothing crashes later');
  // setsid is missing on Windows and on minimal Linux; an unhandled "error" event used to take the server down
  await assert.rejects(
    startDetached('definitely-not-a-command-xyz', [], {}),
    (error: NodeJS.ErrnoException) => error.code === 'ENOENT'
  );
  await new Promise((resolve) => setTimeout(resolve, 150)); // a late unhandled 'error' would throw here

  print('Test 2: a command that starts resolves with its process id');
  const pid = await startDetached(process.execPath, ['-e', ''], {});
  assert.ok(Number.isInteger(pid) && (pid as number) > 0, `pid ${String(pid)}`);

  print('Test 3: update-install starts the daemon through startDetached and records a failed start');
  const install = read('app', 'api', 'admin', 'update-install', 'route.ts');
  assert.ok(install.includes('await startDetached('), 'the route waits for the daemon to start');
  assert.ok(!/\bspawn\(/.test(install), 'no bare spawn() left in the route');
  const startCall = install.slice(install.indexOf('await startDetached('));
  assert.ok(/catch[\s\S]{0,250}'FAILED'/.test(startCall), 'a failed start writes FAILED to the status file');

  print('Test 4: every git call in update-status has a timeout');
  const status = read('app', 'api', 'admin', 'update-status', 'route.ts');
  const gitCalls = status.split('\n').filter((line) => line.includes('execAsync('));
  assert.ok(gitCalls.length >= 3, `found the git calls (${gitCalls.length})`);
  for (const line of gitCalls) assert.ok(/timeout/.test(line), `no timeout on: ${line.trim()}`);

  print('Test 5: the old duplicate update routes stay removed');
  // Nothing called them; /api/admin/update-* is the one update path
  for (const folder of [['app', 'api', 'update'], ['app', 'api', 'system']]) {
    assert.ok(!fs.existsSync(path.join(root, ...folder)), `${folder.join('/')} is gone`);
  }
  for (const used of ['update-check', 'update-install', 'update-status', 'update-stream']) {
    assert.ok(fs.existsSync(path.join(root, 'app', 'api', 'admin', used, 'route.ts')), `${used} is still there`);
  }

  print('All tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
