import { getSetting, setSetting } from './settings';
import { sendDependencyReportEmail } from './email-service';
import { singleFlight } from './single-flight';
import {
  DEPS_LAST_REPORT_KEY,
  runDependencyCheck,
  runMonthlyEmail,
  type DependencyReport,
} from './dependency-check';

const FIRST_TICK_MS = 10 * 60 * 1000;
const TICK_MS = 24 * 60 * 60 * 1000;

let started = false;

/** Runs the check and keeps the result so the admin card can show it. Returns undefined if a check is already running. */
export const checkNow = singleFlight(async (): Promise<DependencyReport> => {
  const report = await runDependencyCheck();
  setSetting(DEPS_LAST_REPORT_KEY, JSON.stringify(report));
  return report;
});

export function getStoredReport(): DependencyReport | null {
  const stored = getSetting(DEPS_LAST_REPORT_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as DependencyReport;
  } catch {
    return null;
  }
}

/**
 * Emails a dependency summary about once a month. Checked daily; "due" comes from the stored date of the
 * last email, so a restart does not reset the month. Production mode only (PM2 / npm start), so a dev machine
 * running `npm run dev` does not send mail. Without SMTP credentials it does nothing, rather than running npm daily for no result.
 */
export function startDependencyScheduler() {
  if (process.env.NODE_ENV !== 'production') return;
  if (started) return;
  started = true;

  const tick = () => {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;
    return runMonthlyEmail({
      get: getSetting,
      set: setSetting,
      check: checkNow,
      send: sendDependencyReportEmail,
      now: Date.now,
    })
      .then(result => {
        if (result !== 'not-due') console.log(`[Dependencies] Monthly report: ${result}`);
      })
      .catch(err => console.error('[Dependencies] Monthly report failed:', err));
  };

  setTimeout(() => {
    tick();
    setInterval(tick, TICK_MS);
  }, FIRST_TICK_MS);
}
