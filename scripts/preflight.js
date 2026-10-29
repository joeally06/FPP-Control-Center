#!/usr/bin/env node
/**
 * Preflight: the final gate before a change is committed.
 *
 *   npm run preflight              everything below
 *   npm run preflight -- --skip-build   skip the (slow) Next build
 *   PREFLIGHT_BASE=<commit> npm run preflight   lint what changed since <commit> instead of since HEAD
 *
 * 1. Typecheck            tsc --noEmit
 * 2. ESLint               touched .ts/.tsx files only; fails on any error or on MORE warnings than the file has at the base commit (HEAD)
 * 3. Test scripts         every scripts/test-*.ts listed in package.json "test:ci", each run on its own and reported
 * 4. Build                next build
 *
 * Every step runs even if an earlier one fails, so one run shows everything that is wrong.
 * Exit code is 0 only if every step passed. Safe to run: it only reads the git tree, uses the
 * throwaway databases the test scripts create under tmp/, and never starts the server or touches votes.db.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
process.chdir(root);

const skipBuild = process.argv.includes('--skip-build');
const base = process.env.PREFLIGHT_BASE || 'HEAD';
const bin = (...parts) => path.join(root, 'node_modules', ...parts);
const results = [];

function run(args, label) {
  const started = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  return { ok: r.status === 0, seconds, output, label };
}

function report(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function tail(text, lines = 25) {
  console.log(text.trim().split(/\r?\n/).slice(-lines).map((l) => `        ${l}`).join('\n'));
}

function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

// ── 1. Typecheck ────────────────────────────────────────────────────────────
console.log('\n[preflight] 1/4 Typecheck (tsc --noEmit)');
{
  const r = run([bin('typescript', 'bin', 'tsc'), '--noEmit']);
  report('tsc --noEmit', r.ok, `${r.seconds}s`);
  if (!r.ok) tail(r.output);
}

// ── 2. ESLint on touched files, no new warnings ─────────────────────────────
console.log('\n[preflight] 2/4 ESLint on touched files (no new warnings)');
if (base !== 'HEAD') console.log(`  comparing against ${base}`);
async function lintTouched() {
  const changed = git(['diff', '--name-only', '--no-renames', base]);
  const untracked = git(['ls-files', '--others', '--exclude-standard']);
  if (changed === null || untracked === null) {
    report('eslint', false, 'git is not available, cannot tell which files changed');
    return;
  }
  const files = [...new Set(`${changed}\n${untracked}`.split(/\r?\n/).filter(Boolean))]
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/^(scripts|migrations)\//.test(f) && fs.existsSync(path.join(root, f)));
  if (files.length === 0) {
    report('eslint', true, 'no touched .ts/.tsx files');
    return;
  }

  const { ESLint } = require('eslint');
  const eslint = new ESLint({ cwd: root });
  const lintable = [];
  for (const f of files) if (!(await eslint.isPathIgnored(f))) lintable.push(f);

  const after = await eslint.lintFiles(lintable);
  let failed = false;
  for (const result of after) {
    const file = path.relative(root, result.filePath).split(path.sep).join('/');
    const headSource = git(['show', `${base}:${file}`]);
    const before = headSource === null
      ? 0 // new file: every warning is new
      : (await eslint.lintText(headSource, { filePath: path.join(root, file) }))[0].warningCount;
    const ok = result.errorCount === 0 && result.warningCount <= before;
    if (!ok) failed = true;
    report(file, ok, `errors ${result.errorCount}, warnings ${before} -> ${result.warningCount}`);
    if (!ok) {
      for (const m of result.messages.filter((x) => x.severity === 2 || result.warningCount > before)) {
        console.log(`        ${m.line}:${m.column}  ${m.severity === 2 ? 'error' : 'warning'}  ${m.message}  ${m.ruleId || ''}`);
      }
    }
  }
  if (failed) console.log('        (fix the errors; for warnings, remove the ones your change added - do not mass-fix old ones)');
}

// ── 3. Test scripts, one by one ─────────────────────────────────────────────
function runTests() {
  console.log('\n[preflight] 3/4 Test scripts (every script in "test:ci", each on its own)');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const tests = (pkg.scripts['test:ci'] || '').match(/scripts\/test-[\w-]+\.ts/g) || [];
  if (tests.length === 0) {
    report('test:ci', false, 'no test scripts found in package.json');
    return;
  }
  for (const file of tests) {
    const r = run(['-r', 'esbuild-register', file]);
    report(file, r.ok, `${r.seconds}s`);
    if (!r.ok) tail(r.output);
  }
  const unlisted = fs.readdirSync(path.join(root, 'scripts'))
    .filter((f) => /^test-.*\.ts$/.test(f) && !tests.includes(`scripts/${f}`));
  if (unlisted.length) console.log(`  note  not in test:ci, so not run: ${unlisted.join(', ')}`);
}

// ── 4. Build ────────────────────────────────────────────────────────────────
function runBuild() {
  console.log('\n[preflight] 4/4 Build (next build)');
  if (skipBuild) {
    console.log('  SKIP  build (--skip-build)');
    return;
  }
  const r = run([bin('next', 'dist', 'bin', 'next'), 'build']);
  report('next build', r.ok, `${r.seconds}s`);
  if (!r.ok) tail(r.output, 40);
}

(async () => {
  await lintTouched();
  runTests();
  runBuild();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[preflight] ${results.length - failed.length}/${results.length} checks passed${skipBuild ? ' (build skipped)' : ''}`);
  if (failed.length) {
    console.log('[preflight] FAILED:');
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exit(1);
  }
  console.log('[preflight] OK');
})().catch((err) => {
  console.error('[preflight] crashed:', err);
  process.exit(1);
});
