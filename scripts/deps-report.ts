// npm run deps:report -- prints what is out of date, which security advisories apply, and the Node.js
// support status for this machine. Read-only: it changes no files and never touches votes.db.
import { formatReportText, runDependencyCheck } from '../lib/dependency-check';

runDependencyCheck()
  .then(report => {
    console.log(formatReportText(report));
    if (!report.outdated && !report.advisories) process.exitCode = 1; // both checks failed (offline? npm missing?)
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
