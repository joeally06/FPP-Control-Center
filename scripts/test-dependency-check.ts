import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  emailDue,
  EMAIL_EVERY_MS,
  formatReportText,
  nodeStatus,
  parseAudit,
  parseOutdated,
  runDependencyCheck,
  runMonthlyEmail,
  type DependencyReport,
} from '../lib/dependency-check';

function print(msg: string) {
  console.log('[test-dependency-check] ' + msg);
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-30T12:00:00Z');

// Shaped like real `npm outdated --json` / `npm audit --json` output (npm 11)
const OUTDATED = JSON.stringify({
  '@types/better-sqlite3': { current: '7.6.13', wanted: '7.6.13', latest: '9.6.0', dependent: 'x', location: 'a' },
  dotenv: { current: '18.0.8', wanted: '18.0.8', latest: '18.1.0', dependent: 'x', location: 'b' },
  validator: { current: '13.15.35', wanted: '13.15.35', latest: '13.15.36', dependent: 'x', location: 'c' },
  sharp: { wanted: '0.35.5', latest: '0.35.5', dependent: 'x', location: 'd' },
});

const ADVISORY = {
  source: 1244012,
  name: 'minimatch',
  dependency: 'minimatch',
  title: 'minimatch has potential denial of service via globparts amplification',
  url: 'https://github.com/advisories/GHSA-g3hv-75wg-m249',
  severity: 'moderate',
  range: '<11.0.1',
};
const AUDIT = JSON.stringify({
  auditReportVersion: 2,
  vulnerabilities: {
    minimatch: { name: 'minimatch', severity: 'moderate', isDirect: false, via: [ADVISORY], fixAvailable: { name: 'eslint', version: '4.0.0', isSemVerMajor: true } },
    glob: { name: 'glob', severity: 'moderate', isDirect: false, via: ['minimatch'], fixAvailable: { name: 'exceljs', version: '4.1.1', isSemVerMajor: true } },
    rimraf: { name: 'rimraf', severity: 'moderate', isDirect: false, via: ['glob'], fixAvailable: true },
    exceljs: { name: 'exceljs', severity: 'moderate', isDirect: true, via: ['glob'], fixAvailable: { name: 'exceljs', version: '4.1.1', isSemVerMajor: true } },
    eslint: { name: 'eslint', severity: 'moderate', isDirect: true, via: ['minimatch', 'rimraf'], fixAvailable: { name: 'eslint', version: '4.0.0', isSemVerMajor: true } },
    // a loop must not hang the walk
    loopa: { name: 'loopa', severity: 'low', isDirect: true, via: ['loopb'], fixAvailable: true },
    loopb: { name: 'loopb', severity: 'low', isDirect: false, via: ['loopa'], fixAvailable: true },
  },
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 5, high: 0, critical: 0, total: 5 } },
});

print('Test 1: outdated packages are read, with major / minor / patch / missing');
{
  const list = parseOutdated(OUTDATED);
  const by = Object.fromEntries(list.map(p => [p.name, p]));
  assert.strictEqual(by['@types/better-sqlite3'].jump, 'major');
  assert.strictEqual(by['dotenv'].jump, 'minor');
  assert.strictEqual(by['validator'].jump, 'patch');
  assert.strictEqual(by['sharp'].jump, 'missing');
  // under semver a 0.x minor bump may break things, so it counts as major
  const zero = parseOutdated(JSON.stringify({ sharp: { current: '0.35.5', wanted: '0.35.5', latest: '0.36.0' }, tiny: { current: '0.35.5', wanted: '0.35.5', latest: '0.35.9' } }));
  assert.strictEqual(zero.find(p => p.name === 'sharp')?.jump, 'major');
  assert.strictEqual(zero.find(p => p.name === 'tiny')?.jump, 'patch');
  assert.strictEqual(by['sharp'].current, null);
  assert.strictEqual(list[0].jump, 'missing', 'not-installed first, then majors');
  // npm lists @types/sharp although its "latest" tag (0.31.1) is older than the installed 0.32.0
  const older = JSON.stringify({ '@types/sharp': { current: '0.32.0', wanted: '0.32.0', latest: '0.31.1' } });
  assert.deepStrictEqual(parseOutdated(older), [], 'a "latest" that is older than the installed version is not an update');
  assert.deepStrictEqual(parseOutdated('{}'), []);
  assert.deepStrictEqual(parseOutdated(''), [], 'npm prints nothing when everything is current');
}

print('Test 2: an npm error or broken JSON is reported, not read as "all current"');
assert.throws(() => parseOutdated('{"error":{"code":"ENOTFOUND","summary":"offline"}}'), /offline|ENOTFOUND/);
assert.throws(() => parseOutdated('not json'));
assert.throws(() => parseAudit('{"error":{"summary":"audit endpoint returned an error"}}'), /audit endpoint/);
assert.throws(() => parseAudit('<html>'));

print('Test 3: 5 audit entries from one advisory become ONE advisory with the direct packages that pull it in');
{
  const { advisories, totals } = parseAudit(AUDIT);
  assert.strictEqual(advisories.length, 1);
  const a = advisories[0];
  assert.strictEqual(a.id, 'GHSA-g3hv-75wg-m249');
  assert.strictEqual(a.severity, 'moderate');
  assert.deepStrictEqual(a.vulnerable, ['minimatch']);
  assert.deepStrictEqual(a.viaDirect, ['eslint', 'exceljs']);
  assert.strictEqual(totals.moderate, 5);
  assert.strictEqual(totals.total, 5);
}

print('Test 4: worst advisories come first');
{
  const mk = (id: string, severity: string) => ({ source: 1, name: id, dependency: id, title: id, url: 'https://github.com/advisories/' + id, severity, range: '*' });
  const json = JSON.stringify({
    vulnerabilities: {
      a: { name: 'a', severity: 'low', isDirect: true, via: [mk('GHSA-aaaa', 'low')] },
      b: { name: 'b', severity: 'critical', isDirect: true, via: [mk('GHSA-bbbb', 'critical')] },
      c: { name: 'c', severity: 'high', isDirect: true, via: [mk('GHSA-cccc', 'high')] },
    },
    metadata: { vulnerabilities: { info: 0, low: 1, moderate: 0, high: 1, critical: 1, total: 3 } },
  });
  assert.deepStrictEqual(parseAudit(json).advisories.map(a => a.id), ['GHSA-bbbb', 'GHSA-cccc', 'GHSA-aaaa']);
}

print('Test 5: a clean audit gives an empty list');
{
  const clean = JSON.stringify({ auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } });
  const { advisories, totals } = parseAudit(clean);
  assert.deepStrictEqual(advisories, []);
  assert.strictEqual(totals.total, 0);
}

print('Test 6: Node.js end-of-life status');
assert.strictEqual(nodeStatus('v24.22.2', NOW).status, 'ok');
assert.strictEqual(nodeStatus('v24.22.2', NOW).eol, '2028-04-30');
assert.strictEqual(nodeStatus('v22.22.2', Date.parse('2026-12-01T00:00:00Z')).status, 'eol-soon', 'under about 6 months left');
assert.strictEqual(nodeStatus('v20.20.2', NOW).status, 'eol');
assert.strictEqual(nodeStatus('v99.0.0', NOW).status, 'unknown');
assert.strictEqual(nodeStatus('v99.0.0', NOW).eol, null);

print('Test 7: npm exits 1 when it finds something; the output is still used');
async function main() {
  {
    const calls: string[][] = [];
    const report = await runDependencyCheck({
      exec: async args => { calls.push(args); return args[0] === 'outdated' ? OUTDATED : AUDIT; },
      now: () => NOW,
      nodeVersion: 'v24.22.2',
    });
    assert.deepStrictEqual(calls.map(c => c[0]).sort(), ['audit', 'outdated']);
    assert.ok(calls.every(c => c.includes('--json')));
    // PM2 sets NODE_ENV=production, which makes npm skip dev packages (audit 23 -> 8, outdated 11 -> 4 here);
    // the show machine builds with those tools, so the report must include them
    assert.ok(calls.every(c => c.includes('--include=dev')), 'both commands must include dev dependencies');
    assert.strictEqual(report.checkedAt, new Date(NOW).toISOString());
    assert.strictEqual(report.outdated?.length, 4);
    assert.strictEqual(report.advisories?.length, 1);
    assert.strictEqual(report.outdatedError, undefined);
    assert.strictEqual(report.auditError, undefined);
  }

  print('Test 8: one npm command failing leaves the other section and the Node line intact');
  {
    const report = await runDependencyCheck({
      exec: async args => { if (args[0] === 'audit') throw new Error('npm not found on PATH'); return OUTDATED; },
      now: () => NOW,
      nodeVersion: 'v24.22.2',
    });
    assert.strictEqual(report.outdated?.length, 4);
    assert.strictEqual(report.advisories, null);
    assert.match(report.auditError ?? '', /npm not found on PATH/);
    assert.strictEqual(report.node.status, 'ok');
  }

  print('Test 9: both failing gives two errors, not a crash');
  {
    const report = await runDependencyCheck({ exec: async () => { throw new Error('offline'); }, now: () => NOW, nodeVersion: 'v24.22.2' });
    assert.strictEqual(report.outdated, null);
    assert.strictEqual(report.advisories, null);
    assert.match(report.outdatedError ?? '', /offline/);
    assert.match(report.auditError ?? '', /offline/);
  }

  print('Test 10: the text report is plain, grouped, and never suggests npm audit fix');
  const full = await runDependencyCheck({
    exec: async args => (args[0] === 'outdated' ? OUTDATED : AUDIT),
    now: () => NOW,
    nodeVersion: 'v24.22.2',
  });
  {
    const text = formatReportText(full);
    assert.ok(text.includes('GHSA-g3hv-75wg-m249'));
    assert.strictEqual(text.split('minimatch has potential denial of service').length - 1, 1, 'advisory listed once');
    assert.ok(text.includes('eslint, exceljs'));
    assert.ok(text.includes('@types/better-sqlite3'));
    assert.ok(!/audit fix/i.test(text), 'must not suggest npm audit fix');
    assert.ok(!/4\.0\.0|4\.1\.1/.test(text), 'the bogus downgrade targets must not leak');
    assert.ok(text.includes('Nothing has been changed'));
    assert.ok(text.includes('Node.js v24.22.2'));
    const failed = formatReportText({ ...full, advisories: null, auditError: 'npm not found on PATH' });
    assert.ok(failed.includes('npm not found on PATH'));
  }

  print('Test 11: the monthly email is due when never sent or 30 days after the last one');
  assert.strictEqual(emailDue(null, NOW), true);
  assert.strictEqual(emailDue('garbage', NOW), true);
  assert.strictEqual(emailDue(new Date(NOW - 29 * DAY).toISOString(), NOW), false);
  assert.strictEqual(emailDue(new Date(NOW - EMAIL_EVERY_MS).toISOString(), NOW), true);

  print('Test 12: monthly job: runs the check only when due, records the send date only on success');
  {
    const store = new Map<string, string>();
    let clock = NOW;
    const sent: { subject: string; text: string }[] = [];
    let sendOk = true;
    let checks = 0;
    const deps = {
      get: (k: string) => store.get(k) ?? null,
      set: (k: string, v: string) => { store.set(k, v); },
      check: async (): Promise<DependencyReport | undefined> => { checks++; return full; },
      send: async (subject: string, text: string) => { sent.push({ subject, text }); return sendOk; },
      now: () => clock,
    };

    assert.strictEqual(await runMonthlyEmail(deps), 'sent');
    assert.strictEqual(sent.length, 1);
    assert.match(sent[0].subject, /4 outdated, 1 advisory, Node 24 \(end of life 2028-04-30\)/);
    assert.ok(sent[0].text.includes('GHSA-g3hv-75wg-m249'));
    assert.strictEqual(store.get('deps_last_emailed_at'), new Date(NOW).toISOString());

    clock = NOW + 29 * DAY;
    assert.strictEqual(await runMonthlyEmail(deps), 'not-due');
    assert.strictEqual(checks, 1, 'no npm run when nothing is due');

    clock = NOW + 30 * DAY;
    sendOk = false;
    assert.strictEqual(await runMonthlyEmail(deps), 'send-failed');
    assert.strictEqual(store.get('deps_last_emailed_at'), new Date(NOW).toISOString(), 'failed send keeps the old date, so tomorrow retries');
    sendOk = true;
    assert.strictEqual(await runMonthlyEmail(deps), 'sent');
    assert.strictEqual(store.get('deps_last_emailed_at'), new Date(NOW + 30 * DAY).toISOString());

    clock = NOW + 61 * DAY;
    const busy = await runMonthlyEmail({ ...deps, check: async () => undefined });
    assert.strictEqual(busy, 'busy');
    assert.strictEqual(sent.length, 3, 'a busy check sends nothing');
  }

  print('Test 13: the command and library never open the database or send mail on their own');
  {
    const root = process.cwd();
    const forbidden = /['"]\.\/(database|settings|email-service)['"]|@\/lib\/(database|settings|email-service)|\.\.\/lib\/(database|settings|email-service)/;
    for (const file of ['lib/dependency-check.ts', 'scripts/deps-report.ts']) {
      const src = fs.readFileSync(path.join(root, file), 'utf-8');
      assert.ok(!forbidden.test(src), file + ' must not import the database, settings or email');
    }
    const route = fs.readFileSync(path.join(root, 'app/api/admin/dependencies/route.ts'), 'utf-8');
    const get = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));
    assert.ok(get.length > 0 && !/checkNow|runDependencyCheck/.test(get), 'GET must only read the stored report');
    assert.ok(/requireAdmin\(\)/.test(get), 'GET must require admin');
    assert.ok(/requireAdminWithRateLimit\(/.test(route.slice(route.indexOf('export async function POST'))), 'POST must require admin with rate limit');
  }

  print('All tests passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
