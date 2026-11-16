import assert from 'assert';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

function print(msg: string) {
  console.log('[test-update-daemon-lockfile] ' + msg);
}

const script = fs.readFileSync(path.join(process.cwd(), 'scripts', 'update-daemon.sh'), 'utf-8');

// Only the helper is run; the updater itself is never started
const helper = script.match(/restore_lockfile_if_changed\(\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(helper, 'update-daemon.sh defines restore_lockfile_if_changed');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpp-daemon-lock-'));
const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf-8' });
const run = () =>
  execFileSync('bash', ['-c', `LOG_FILE=/dev/null; log() { echo "$1"; }\n${helper}\nrestore_lockfile_if_changed`], { cwd: dir, encoding: 'utf-8' });
const status = () => git('status', '--porcelain', '--untracked-files=no').trim();

try {
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"tested":true}\n');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'original\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');

  print('Test 1: a clean checkout is left alone');
  assert.strictEqual(run().trim(), '');
  assert.strictEqual(status(), '');

  print('Test 2: a rewritten lockfile is put back, and the check then sees a clean tree');
  fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"tested":false}\n');
  assert.ok(status().includes('package-lock.json'));
  assert.ok(run().includes('Restored package-lock.json'));
  assert.strictEqual(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf-8'), '{"tested":true}\n');
  assert.strictEqual(status(), '');

  print('Test 3: any other changed file is never touched, so the update still stops for it');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'edited by hand\n');
  fs.writeFileSync(path.join(dir, 'package-lock.json'), '{"tested":false}\n');
  run();
  assert.strictEqual(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf-8'), 'edited by hand\n');
  assert.strictEqual(status(), 'M notes.txt');

  print('Test 4: the updater restores the lockfile before its safety check and after every install');
  const lines = script.split('\n');
  const checkAt = lines.findIndex((l) => l.startsWith('LOCAL_CHANGES='));
  const firstCall = lines.findIndex((l) => l === 'restore_lockfile_if_changed');
  assert.ok(firstCall > 0 && firstCall < checkAt, 'restored just before the local-changes check');
  const installs = lines.map((l, i) => (l.includes('npm install --include=dev') ? i : -1)).filter((i) => i >= 0);
  assert.strictEqual(installs.length, 4, 'one install and three rollback installs');
  for (const at of installs) {
    // the main install is an `if` condition, so its restore is the first line of the branch; the others follow directly
    assert.ok(lines[at + 1].trim() === 'restore_lockfile_if_changed', `restore follows the install on line ${at + 1}`);
  }
  assert.ok(!script.includes('\r'), 'update-daemon.sh keeps LF line endings');

  print('All tests passed');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
