#!/usr/bin/env node
// Stops an update before `npm install` when package-lock.json does not match package.json, or when the
// project or a locked package needs a newer Node.js than the one running the update (--engine-strict).
// `npm install` would rewrite the lockfile and install versions nobody tested on the show machine.
// Read-only: never touches node_modules or either file.
//
//   node scripts/check-lockfile.js [dir]     (default: current directory)

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = path.resolve(process.argv[2] || process.cwd());
const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

function fail(headline, lines, hint = 'Run `npm install` on a development machine and commit the updated package-lock.json.') {
  console.error(`❌ ${headline}`);
  for (const line of lines) console.error(`   ${line}`);
  console.error(`   ${hint}`);
  process.exit(1);
}

function readJson(file) {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) fail(`${file} not found in ${dir}`, []);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (error) {
    return fail(`${file} is not valid JSON`, [error.message]);
  }
}

// 1. The lockfile's root entry lists the same dependency specs as package.json
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const root = (lock.packages && lock.packages['']) || {};

const differences = [];
for (const section of SECTIONS) {
  const wanted = pkg[section] || {};
  const locked = root[section] || {};
  for (const name of new Set([...Object.keys(wanted), ...Object.keys(locked)])) {
    if (wanted[name] === locked[name]) continue;
    if (locked[name] === undefined) differences.push(`${name}: in package.json ${section} (${wanted[name]}), missing from the lockfile`);
    else if (wanted[name] === undefined) differences.push(`${name}: in the lockfile ${section} (${locked[name]}), missing from package.json`);
    else differences.push(`${name} (${section}): package.json says ${wanted[name]}, lockfile says ${locked[name]}`);
  }
}
if (differences.length > 0) {
  fail('package-lock.json is out of sync with package.json', differences);
}

// 2. npm's own check (npm ci --dry-run, no network). npm 10.5.0 and older delete node_modules even with
// --dry-run, so it runs on a temporary copy of the two files and never in the project directory.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'check-lockfile-'));
let npm;
try {
  for (const file of ['package.json', 'package-lock.json', '.npmrc']) {
    if (fs.existsSync(path.join(dir, file))) fs.copyFileSync(path.join(dir, file), path.join(scratch, file));
  }
  const npmArgs = ['ci', '--dry-run', '--engine-strict', '--include=dev', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'];
  const options = { cwd: scratch, encoding: 'utf8', timeout: 120000 };
  // Windows needs a shell to start npm.cmd; Node 24 deprecates passing an args array together with a shell,
  // so the (fixed, constant) command goes in as one string there
  npm = process.platform === 'win32'
    ? spawnSync(`npm.cmd ${npmArgs.join(' ')}`, { ...options, shell: true })
    : spawnSync('npm', npmArgs, options);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
if (npm.error || npm.status !== 0) {
  const output = `${npm.stdout || ''}${npm.stderr || ''}`.trim().split('\n').slice(-12);
  if (!npm.error && output.some((line) => line.includes('EBADENGINE'))) {
    // --engine-strict: the project or a locked package needs a newer Node.js than the one running now
    fail(
      `The locked packages need a newer Node.js or npm than this machine runs (Node.js ${process.version})`,
      output.filter((line) => /engine|notsup|Required|Actual/i.test(line)).map((line) => line.replace(/^npm error /, '')),
      'Upgrade Node.js (or npm) on this machine (see docs/INSTALLATION.md), then run the update again. Nothing was installed.'
    );
  }
  fail(
    'npm could not verify package-lock.json (npm ci --dry-run failed)',
    npm.error ? [npm.error.message] : output,
    'This can be a problem on this machine (npm missing or too slow) or a real mismatch; the lines above are npm\'s own output.'
  );
}

console.log('✅ package-lock.json matches package.json');
