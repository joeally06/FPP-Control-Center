import assert from 'assert';
import { execFileSync, spawnSync } from 'child_process';
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

  // ── The update lock ────────────────────────────────────────────────────────
  // Only the lock functions are run, in a scratch folder; the updater itself is never started.
  const extract = (name: string) => {
    const fn = script.match(new RegExp(`\\n${name}\\(\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
    assert.ok(fn, `update-daemon.sh defines ${name}()`);
    return fn;
  };
  const lockFns = ['write_status', 'log', 'cleanup', 'acquire_lock'].map(extract).join('\n');
  assert.ok(script.includes('HAVE_LOCK=false'), 'the daemon starts out not owning the lock');
  const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpp-daemon-lock-owner-'));
  const read = (name: string) => (fs.existsSync(path.join(lockDir, name)) ? fs.readFileSync(path.join(lockDir, name), 'utf-8').trim() : null);
  const reset = () => {
    for (const name of ['update.lock', 'update_status', 'update.log']) fs.rmSync(path.join(lockDir, name), { force: true });
  };
  // Relative paths, so this works the same under Git Bash on Windows
  const bash = (body: string) =>
    spawnSync('bash', ['-c', `LOCK_FILE=./update.lock; STATUS_FILE=./update_status; LOG_FILE=./update.log; UPDATE_SUCCESS=false; HAVE_LOCK=false\n${lockFns}\n${body}`], { cwd: lockDir, encoding: 'utf-8' });

  try {
    print('Test 5: a run that is turned away leaves the running update\'s lock and status alone');
    reset();
    fs.writeFileSync(path.join(lockDir, 'update.lock'), '4242\n');
    fs.writeFileSync(path.join(lockDir, 'update_status'), 'DOWNLOADING');
    const turnedAway = bash('trap cleanup EXIT\nif ! acquire_lock; then log "Another update is already running"; exit 1; fi\necho "got the lock"');
    assert.strictEqual(turnedAway.status, 1, 'it exits with an error');
    assert.ok(!turnedAway.stdout.includes('got the lock'), 'it did not carry on');
    assert.strictEqual(read('update.lock'), '4242', 'the running update still has its lock');
    assert.strictEqual(read('update_status'), 'DOWNLOADING', 'the running update\'s status is not overwritten (not LOCKED, not FAILED)');
    assert.ok(!script.includes('write_status "LOCKED"'), 'a refused run no longer writes LOCKED over the status');

    print('Test 6: the run that holds the lock removes it on the way out and reports how it ended');
    reset();
    const failed = bash('trap cleanup EXIT\nacquire_lock || exit 9\ntest -f ./update.lock && echo "lock held"\nexit 1');
    assert.ok(failed.stdout.includes('lock held'), 'the lock exists while the run is going');
    assert.strictEqual(read('update.lock'), null, 'the lock is removed afterwards');
    assert.strictEqual(read('update_status'), 'FAILED');
    reset();
    bash('trap cleanup EXIT\nacquire_lock || exit 9\nUPDATE_SUCCESS=true\nexit 0');
    assert.strictEqual(read('update.lock'), null);
    assert.strictEqual(read('update_status'), 'COMPLETED');

    print('Test 7: the lock is taken in one step (noclobber), so an empty lock file is refused too');
    assert.ok(/set -o noclobber/.test(extract('acquire_lock')), 'acquire_lock uses noclobber');
    reset();
    fs.writeFileSync(path.join(lockDir, 'update.lock'), '');
    assert.strictEqual(bash('acquire_lock').status, 1, 'an existing (even empty) lock file is not taken over');

    print('Test 8: eight runs started together, exactly one gets the lock');
    reset();
    const together = bash('for i in 1 2 3 4 5 6 7 8; do ( trap cleanup EXIT; if acquire_lock; then echo GOT; sleep 2; fi ) & done\nwait');
    assert.strictEqual((together.stdout.match(/GOT/g) ?? []).length, 1);
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }

  print('All tests passed');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
