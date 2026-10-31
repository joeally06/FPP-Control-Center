/**
 * Dependency report: what is out of date, which security advisories apply, and whether this
 * machine's Node.js is still supported. It only reads (npm outdated / npm audit); it never
 * installs or changes anything.
 *
 * This file must not import the database, settings or email code (importing lib/database opens
 * votes.db); lib/dependency-scheduler.ts connects it to those.
 */
import { exec, execFile } from 'child_process';

export type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';
const SEVERITIES: Severity[] = ['critical', 'high', 'moderate', 'low', 'info'];

export interface OutdatedPackage {
  name: string;
  current: string | null; // null = listed in package.json but not installed
  wanted: string;
  latest: string;
  jump: 'major' | 'minor' | 'patch' | 'missing';
}

export interface Advisory {
  id: string;
  title: string;
  url: string;
  severity: Severity;
  range: string;
  vulnerable: string[]; // packages that contain the bug
  viaDirect: string[]; // our own dependencies that pull it in
}

export interface NodeStatus {
  version: string;
  major: number;
  eol: string | null;
  status: 'ok' | 'eol-soon' | 'eol' | 'unknown';
}

export interface DependencyReport {
  checkedAt: string;
  node: NodeStatus;
  outdated: OutdatedPackage[] | null;
  outdatedError?: string;
  advisories: Advisory[] | null;
  auditError?: string;
  auditTotals?: Record<Severity | 'total', number>;
}

// End-of-life dates: https://nodejs.org/en/about/previous-releases (nodejs/Release schedule.json).
// Add the next even-numbered major when it ships; a major missing here shows as "unknown".
export const NODE_EOL: Record<number, string> = {
  20: '2026-04-30',
  22: '2027-04-30',
  24: '2028-04-30',
  26: '2029-04-30',
};
const EOL_SOON_DAYS = 183;
const DAY_MS = 24 * 60 * 60 * 1000;

export function nodeStatus(version: string, now: number): NodeStatus {
  const major = Number(/^v?(\d+)/.exec(version)?.[1] ?? NaN);
  const eol = NODE_EOL[major] ?? null;
  if (!eol) return { version, major, eol: null, status: 'unknown' };
  const daysLeft = (Date.parse(eol) - now) / DAY_MS;
  const status = daysLeft < 0 ? 'eol' : daysLeft < EOL_SOON_DAYS ? 'eol-soon' : 'ok';
  return { version, major, eol, status };
}

function parseJson(text: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('npm returned output that is not JSON');
  }
  const error = (data as { error?: { summary?: string; code?: string } } | null)?.error;
  if (error) throw new Error(error.summary || error.code || 'npm reported an error');
  return (data ?? {}) as Record<string, unknown>;
}

const JUMP_ORDER = { missing: 0, major: 1, minor: 2, patch: 3 } as const;

function jumpBetween(current: string | null, latest: string): OutdatedPackage['jump'] {
  if (!current) return 'missing';
  const [cMajor, cMinor] = current.split('.');
  const [lMajor, lMinor] = latest.split('.');
  if (cMajor !== lMajor || (cMajor === '0' && cMinor !== lMinor)) return 'major'; // in 0.x a minor bump may break things
  return cMinor !== lMinor ? 'minor' : 'patch';
}

// npm also lists packages whose "latest" tag is older than what is installed (e.g. @types/sharp); that is not an update
function isNewer(latest: string, current: string): boolean {
  const a = latest.split('.').map(n => parseInt(n, 10) || 0);
  const b = current.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

export function parseOutdated(text: string): OutdatedPackage[] {
  if (!text.trim()) return []; // npm prints nothing when everything is current
  const data = parseJson(text) as Record<string, { current?: string; wanted?: string; latest?: string }>;
  return Object.entries(data)
    .filter(([, p]) => !p.current || !p.latest || isNewer(p.latest, p.current))
    .map(([name, p]) => {
      const current = p.current ?? null;
      const latest = p.latest ?? '';
      return { name, current, wanted: p.wanted ?? '', latest, jump: jumpBetween(current, latest) };
    })
    .sort((a, b) => JUMP_ORDER[a.jump] - JUMP_ORDER[b.jump] || a.name.localeCompare(b.name));
}

interface AuditVia {
  title: string;
  url: string;
  severity: Severity;
  range: string;
}
interface AuditEntry {
  isDirect?: boolean;
  via?: Array<string | AuditVia>;
}

export function parseAudit(text: string): { advisories: Advisory[]; totals: Record<Severity | 'total', number> } {
  const data = parseJson(text) as {
    vulnerabilities?: Record<string, AuditEntry>;
    metadata?: { vulnerabilities?: Partial<Record<Severity | 'total', number>> };
  };
  const entries = data.vulnerabilities ?? {};
  const byId = new Map<string, Advisory>();
  const idOf = (via: AuditVia) => /GHSA-[0-9a-z-]+/i.exec(via.url ?? '')?.[0] ?? via.url ?? via.title;

  for (const [name, entry] of Object.entries(entries)) {
    for (const via of entry.via ?? []) {
      if (typeof via === 'string') continue;
      const id = idOf(via);
      const advisory = byId.get(id) ?? { id, title: via.title, url: via.url, severity: via.severity, range: via.range, vulnerable: [], viaDirect: [] };
      if (!advisory.vulnerable.includes(name)) advisory.vulnerable.push(name);
      byId.set(id, advisory);
    }
  }

  // For each direct dependency, follow the package-to-package links and note which advisories it reaches
  for (const [name, entry] of Object.entries(entries)) {
    if (!entry.isDirect) continue;
    const seen = new Set<string>();
    const walk = (pkg: string) => {
      if (seen.has(pkg)) return;
      seen.add(pkg);
      for (const via of entries[pkg]?.via ?? []) {
        if (typeof via === 'string') walk(via);
        else byId.get(idOf(via))?.viaDirect.push(name);
      }
    };
    walk(name);
  }

  const rank = (s: Severity) => SEVERITIES.indexOf(s);
  const advisories = [...byId.values()]
    .map(a => ({ ...a, vulnerable: a.vulnerable.sort(), viaDirect: [...new Set(a.viaDirect)].sort() }))
    .sort((a, b) => rank(a.severity) - rank(b.severity) || a.id.localeCompare(b.id));

  const counts = data.metadata?.vulnerabilities ?? {};
  const totals = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
  for (const key of Object.keys(totals) as Array<keyof typeof totals>) totals[key] = counts[key] ?? 0;
  return { advisories, totals };
}

export type NpmExec = (args: string[]) => Promise<string>;

// Kept short enough to finish inside a proxy's request limit (Cloudflare Tunnel allows about 100 s); the two npm commands run in parallel
export const NPM_TIMEOUT_MS = 45_000;

interface ExecFailure extends Error {
  code?: string | number | null;
  killed?: boolean;
}

/** Runs npm and resolves with its output even when npm exits 1 (it does that whenever it finds something). */
export const npmExec: NpmExec = args =>
  new Promise((resolve, reject) => {
    const options = { cwd: process.cwd(), timeout: NPM_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' as const, windowsHide: true };
    const done = (err: ExecFailure | null, stdout: string) => {
      if (err?.killed) return reject(new Error(`npm timed out after ${NPM_TIMEOUT_MS / 1000}s`)); // partial output is not usable
      if (stdout.trim() || !err) return resolve(stdout);
      if (err.code === 'ENOENT') return reject(new Error('npm not found on PATH'));
      reject(new Error(err.message.split('\n')[0]));
    };
    // On Windows npm is a .cmd file, which needs a shell; the arguments are fixed constants
    if (process.platform === 'win32') exec(`npm.cmd ${args.join(' ')}`, options, (err, stdout) => done(err, stdout));
    else execFile('npm', args, options, (err, stdout) => done(err, stdout));
  });

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function runDependencyCheck(
  opts: { exec?: NpmExec; now?: () => number; nodeVersion?: string } = {}
): Promise<DependencyReport> {
  const run = opts.exec ?? npmExec;
  const now = (opts.now ?? Date.now)();
  const report: DependencyReport = {
    checkedAt: new Date(now).toISOString(),
    node: nodeStatus(opts.nodeVersion ?? process.version, now),
    outdated: null,
    advisories: null,
  };

  await Promise.all([
    // --include=dev: PM2 runs the app with NODE_ENV=production, and then npm would leave dev packages out
    // although the show machine builds with them
    run(['outdated', '--json', '--include=dev']).then(parseOutdated).then(
      list => { report.outdated = list; },
      err => { report.outdatedError = errorMessage(err); }
    ),
    run(['audit', '--json', '--include=dev']).then(parseAudit).then(
      ({ advisories, totals }) => { report.advisories = advisories; report.auditTotals = totals; },
      err => { report.auditError = errorMessage(err); }
    ),
  ]);
  return report;
}

function nodeLine(node: NodeStatus): string {
  const head = `Node.js ${node.version}`;
  if (node.status === 'unknown') return `${head} - not in our end-of-life table (update NODE_EOL in lib/dependency-check.ts)`;
  if (node.status === 'eol') return `${head} - WARNING: reached end of life on ${node.eol}; it no longer gets security fixes`;
  if (node.status === 'eol-soon') return `${head} - WARNING: support ends ${node.eol}; plan the upgrade`;
  return `${head} - supported until ${node.eol}`;
}

export function formatReportText(report: DependencyReport): string {
  const lines = [`Dependency report - checked ${report.checkedAt.replace('T', ' ').slice(0, 16)} UTC`, '', nodeLine(report.node), ''];

  if (!report.outdated) {
    lines.push(`Outdated packages: could not check (${report.outdatedError ?? 'unknown error'})`);
  } else if (report.outdated.length === 0) {
    lines.push('Outdated packages: none, everything is current');
  } else {
    lines.push(`Outdated packages (${report.outdated.length})`);
    for (const p of report.outdated) {
      lines.push(`  ${p.name}  ${p.current ?? 'not installed'} -> ${p.latest}${p.jump === 'missing' ? '' : `  (${p.jump})`}`);
    }
  }
  lines.push('');

  if (!report.advisories) {
    lines.push(`Security advisories: could not check (${report.auditError ?? 'unknown error'})`);
  } else if (report.advisories.length === 0) {
    lines.push('Security advisories: none found');
  } else {
    lines.push(`Security advisories (${report.advisories.length})`);
    for (const a of report.advisories) {
      lines.push(`  [${a.severity}] ${a.title}`, `    ${a.id}  ${a.url}`, `    in: ${a.vulnerable.join(', ')} (${a.range})`);
      if (a.viaDirect.length) lines.push(`    pulled in by: ${a.viaDirect.join(', ')}`);
    }
  }

  lines.push('', 'Nothing has been changed. Work on updates on the development machine, push, then press Update.');
  return lines.join('\n');
}

export function reportSubject(report: DependencyReport): string {
  const outdated = report.outdated ? `${report.outdated.length} outdated` : 'outdated check failed';
  const advisories = report.advisories
    ? `${report.advisories.length} ${report.advisories.length === 1 ? 'advisory' : 'advisories'}`
    : 'advisory check failed';
  const { major, eol, status } = report.node;
  const node = status === 'unknown' ? `Node ${major}` : `Node ${major} (${status === 'eol' ? 'END OF LIFE' : 'end of life'} ${eol})`;
  return `Dependency report: ${outdated}, ${advisories}, ${node}`;
}

export const EMAIL_EVERY_MS = 30 * DAY_MS;
export const DEPS_LAST_REPORT_KEY = 'deps_last_report';
export const DEPS_LAST_EMAILED_KEY = 'deps_last_emailed_at';

export function emailDue(lastEmailedAt: string | null, now: number): boolean {
  const last = lastEmailedAt ? Date.parse(lastEmailedAt) : NaN;
  return Number.isNaN(last) || now - last >= EMAIL_EVERY_MS;
}

/** Sends the monthly summary when due. The date is stored only after a successful send, so a failed send is retried on the next daily tick. */
export async function runMonthlyEmail(deps: {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  check: () => Promise<DependencyReport | undefined>; // undefined = a check is already running
  send: (subject: string, text: string) => Promise<boolean>;
  now: () => number;
}): Promise<'not-due' | 'busy' | 'sent' | 'send-failed'> {
  if (!emailDue(deps.get(DEPS_LAST_EMAILED_KEY), deps.now())) return 'not-due';
  const report = await deps.check();
  if (!report) return 'busy';
  if (!(await deps.send(reportSubject(report), formatReportText(report)))) return 'send-failed';
  deps.set(DEPS_LAST_EMAILED_KEY, new Date(deps.now()).toISOString());
  return 'sent';
}
