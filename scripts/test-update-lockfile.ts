import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { spawnSync } from 'child_process';

// scripts/check-lockfile.js runs before the updater's `npm install`, so a package-lock.json that
// disagrees with package.json stops the update instead of being rewritten on the show machine.

function print(msg: string) {
  console.log('[test-update-lockfile] ' + msg);
}

const root = path.join(process.cwd(), 'tmp', 'test-update-lockfile');
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });

const script = path.join(process.cwd(), 'scripts', 'check-lockfile.js');

function runCheck(dir: string) {
  return spawnSync(process.execPath, [script, dir], { encoding: 'utf-8' });
}

function lockfile(rootEntry: Record<string, unknown>) {
  return JSON.stringify({
    name: 'fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: { '': { name: 'fixture', version: '1.0.0', ...rootEntry } },
  }, null, 2);
}

function fixture(name: string, pkg: Record<string, unknown>, lock: string | null) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', ...pkg }, null, 2));
  if (lock !== null) fs.writeFileSync(path.join(dir, 'package-lock.json'), lock);
  return dir;
}

function snapshot(dir: string) {
  const read = (f: string) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf-8') : null);
  return { pkg: read('package.json'), lock: read('package-lock.json') };
}

function assertUntouched(dir: string, before: ReturnType<typeof snapshot>) {
  assert.deepStrictEqual(snapshot(dir), before, 'package.json and package-lock.json must not change');
  assert.ok(!fs.existsSync(path.join(dir, 'node_modules')), 'the check must not create node_modules');
}

print('Test 1: package.json and lockfile agree → passes');
{
  const dir = fixture('in-sync', {}, lockfile({}));
  const before = snapshot(dir);
  const result = runCheck(dir);
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
  assertUntouched(dir, before);
}

print('Test 2: a dependency added to package.json but not to the lockfile → fails with a clear message');
{
  const dir = fixture('added-dep', { dependencies: { 'left-pad': '^1.3.0' } }, lockfile({}));
  const before = snapshot(dir);
  const result = runCheck(dir);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /out of sync/);
  assert.match(result.stdout + result.stderr, /left-pad/);
  assertUntouched(dir, before);
}

print('Test 3: a changed version spec against an unchanged lockfile → fails');
{
  const dir = fixture(
    'changed-spec',
    { devDependencies: { 'left-pad': '^2.0.0' } },
    lockfile({ devDependencies: { 'left-pad': '^1.0.0' } })
  );
  const before = snapshot(dir);
  const result = runCheck(dir);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /left-pad/);
  assertUntouched(dir, before);
}

print('Test 4: a dependency removed from package.json but still in the lockfile → fails');
{
  const dir = fixture('removed-dep', {}, lockfile({ dependencies: { 'left-pad': '^1.3.0' } }));
  const before = snapshot(dir);
  const result = runCheck(dir);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /left-pad/);
  assertUntouched(dir, before);
}

print('Test 5: no package-lock.json → fails');
{
  const dir = fixture('no-lock', {}, null);
  const before = snapshot(dir);
  const result = runCheck(dir);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /package-lock\.json/);
  assertUntouched(dir, before);
  assert.ok(!fs.existsSync(path.join(dir, 'package-lock.json')), 'the check must not create a lockfile');
}

print('Test 6: an existing node_modules survives a passing check (npm 10.5.0 and older empty it during ci --dry-run)');
{
  const dir = fixture('with-node-modules', {}, lockfile({}));
  const marker = path.join(dir, 'node_modules', 'marker', 'index.js');
  fs.mkdirSync(path.dirname(marker), { recursive: true });
  fs.writeFileSync(marker, 'module.exports = 1;');
  const result = runCheck(dir);
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
  assert.ok(fs.existsSync(marker), 'node_modules must not be touched by the check');
}

print('Test 7: an npm failure is not reported as a lockfile mismatch');
{
  const dir = fixture('no-npm', {}, lockfile({}));
  const result = spawnSync(process.execPath, [script, dir], { encoding: 'utf-8', env: { PATH: '' } as unknown as NodeJS.ProcessEnv });
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /npm could not verify/);
  assert.doesNotMatch(result.stdout + result.stderr, /out of sync with package\.json\n/);
}

print('Test 8: this repository\'s own package.json and lockfile agree');
{
  const repo = process.cwd();
  const before = snapshot(repo);
  const result = runCheck(repo);
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
  assert.deepStrictEqual(snapshot(repo), before);
}

fs.rmSync(root, { recursive: true, force: true });
print('All tests passed');
