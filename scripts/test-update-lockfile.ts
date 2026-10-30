import path from 'path';
import fs from 'fs';
import assert from 'assert';
import { spawnSync } from 'child_process';

// scripts/check-lockfile.js runs before the updater's `npm install`, so a package-lock.json that
// disagrees with package.json, or locked packages that need a newer Node.js than the machine runs,
// stop the update instead of changing anything on the show machine.

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

function lockfile(rootEntry: Record<string, unknown>, extraPackages: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: 'fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: { '': { name: 'fixture', version: '1.0.0', ...rootEntry }, ...extraPackages },
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

print('Test 8: the project itself needs a newer Node.js than the machine runs → fails with the Node message');
{
  const dir = fixture('root-engines', { engines: { node: '>=99' } }, lockfile({ engines: { node: '>=99' } }));
  const before = snapshot(dir);
  const result = runCheck(dir);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /newer Node\.js/);
  assert.match(result.stdout + result.stderr, />=99/, 'the message shows which Node.js version is required');
  assert.doesNotMatch(result.stdout + result.stderr, /out of sync/);
  assertUntouched(dir, before);
}

print('Test 9: engines the machine satisfies → passes');
{
  const dir = fixture('root-engines-ok', { engines: { node: '>=1' } }, lockfile({ engines: { node: '>=1' } }));
  const result = runCheck(dir);
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
}

print('Test 10: a locked dependency that needs a newer Node.js than the machine runs → fails with the Node message');
{
  const dir = fixture(
    'dep-engines',
    { dependencies: { 'needs-new-node': '^1.0.0' } },
    lockfile(
      { dependencies: { 'needs-new-node': '^1.0.0' } },
      {
        'node_modules/needs-new-node': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/needs-new-node/-/needs-new-node-1.0.0.tgz',
          integrity: 'sha512-' + 'A'.repeat(86) + '==',
          engines: { node: '>=99' },
        },
      }
    )
  );
  const before = snapshot(dir);
  const result = runCheck(dir);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /newer Node\.js/);
  assert.match(result.stdout + result.stderr, /needs-new-node/);
  assertUntouched(dir, before);
}

print('Test 11: this repository\'s own package.json and lockfile agree');
{
  const repo = process.cwd();
  const before = snapshot(repo);
  const result = runCheck(repo);
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
  assert.deepStrictEqual(snapshot(repo), before);
}

print('Test 12: this repository\'s lockfile and package.json support exactly the Node.js versions we run');
{
  // npm cannot simulate another Node.js version (npm 11 ignores npm_config_node_version), so the
  // engines of the locked packages are compared here directly. SUPPORTED are the versions the app runs on
  // (CI and the show machine); REFUSED is a version the updater must turn away instead of installing.
  const SUPPORTED = ['22.22.2', '24.22.2'];
  const REFUSED = '20.20.2';
  // `semver` is not a direct dependency; it is hoisted from other packages. If this line fails with
  // MODULE_NOT_FOUND after a dependency change, add semver as a devDependency.
  const semver = require('semver') as { satisfies(version: string, range: string): boolean };
  const lock = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package-lock.json'), 'utf-8')) as {
    packages: Record<string, { version?: string; engines?: { node?: string }; optional?: boolean }>;
  };
  // npm skips optional packages for other platforms (e.g. sharp-win32-ia32), so they never block an install
  const unmetFor = (node: string) => Object.entries(lock.packages)
    .filter(([, p]) => !p.optional && p.engines?.node && !semver.satisfies(node, p.engines.node))
    .map(([name, p]) => `${name || '(root)'} ${p.version} needs ${p.engines?.node}`);
  for (const node of SUPPORTED) {
    assert.deepStrictEqual(unmetFor(node), [], `these locked packages do not support Node.js ${node}`);
  }
  assert.ok(unmetFor(REFUSED).length > 0, `the lockfile should need a newer Node.js than ${REFUSED}, so the updater refuses it`);

  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')) as { engines?: { node?: string } };
  assert.ok(pkg.engines?.node, 'package.json must declare engines.node');
  for (const node of SUPPORTED) assert.ok(semver.satisfies(node, pkg.engines.node), `package.json engines.node must allow ${node}`);
  assert.ok(!semver.satisfies(REFUSED, pkg.engines.node), `package.json engines.node must not allow ${REFUSED}`);
}

fs.rmSync(root, { recursive: true, force: true });
print('All tests passed');
