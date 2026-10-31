# CLAUDE.md
**FPP Control Center** — Next.js web app that controls a Falcon Player (FPP) Christmas-light show: public jukebox/voting/Santa-letters/trivia pages for visitors, an admin dashboard for the operator, and one standalone Node poller process. Languages: TypeScript (a few legacy `.js` scripts in `scripts/` and the repo root). Frameworks: Next.js 16 (App Router, Turbopack), React 19.2, Tailwind CSS 4, next-auth v4, better-sqlite3 12 (no ORM). Package manager(s): npm.

## Commands

Build:
- `npx tsc --noEmit` — typecheck (~12 s)
- `npm run build` — Next build (~22 s); writes gitignored `.next/`, does not start background services

Test:
- `npx eslint <touched .ts/.tsx files>` — compare with the baseline before the change (see Project-specific rules)
- `npm run lint` — whole repo (~40 s); exits 0, warnings only; CI gate
- `node -r esbuild-register scripts/test-<name>.ts` — one script at a time; they use throwaway DBs under `tmp/` and a mocked mail transport
- `npm run test:ci` — all test scripts chained with `&&` (~25 s); one failure hides the rest, so use it only as the quick check
- `node -r esbuild-register scripts/check-security.js` — what CI runs; reads env, no side effects

Preflight (final gate): `npm run preflight` — typecheck, eslint on touched files (fails on errors or any new warning vs HEAD), each `test:ci` script individually, build; exit code 0 means pass. `-- --skip-build` skips the build; `PREFLIGHT_BASE=<commit>` compares lint against another commit.
Fast verify (also run by the Stop hook): `npx tsc --noEmit && npm run test:ci`

## Repository

- Key directories:
  - `app/` — pages and `app/api/**/route.ts` handlers; `components/` — React components
  - `lib/` — all server logic (`database.ts`, `auth-helpers.ts`, `rate-limit.ts`, `fpp-config.ts`, `jukebox-queue.ts`, `fpp-poller.ts`, …); `types/` — shared TS types
  - `migrations/` — numbered `NNN_name.sql` (highest is `024`, next is `025`); `scripts/` — ops scripts and `test-*.ts`
  - `proxy.ts` (Next 16 middleware), `instrumentation.ts` (background services), `server.js`, `ecosystem.config.js` (PM2)
- Architecture: route handler → `lib/` function → better-sqlite3. Handlers stay thin; do not add a controller/service/ORM layer. Production runs two PM2 processes: `fpp-control` (`server.js`) and `fpp-poller` (`lib/fpp-poller.ts`, polls FPP every 10 s into SQLite).
- CI environment: GitHub Actions `ubuntu-latest`, Node 24, on push/PR to `main`/`master`: `check-security.js`, lint, `init-database.js` (throwaway DB), build, `npm run test:ci`
- OS requirements: dev host is Windows (PowerShell, Node 22); production is an Ubuntu Server VM, x64, PM2. `*.sh` must stay LF, `*.ps1`/`*.bat` CRLF (`.gitattributes`).
- Build layout constraints: single Next app, not a monorepo. `votes.db` (+ `-wal`/`-shm`) in the repo root is live data.
- Large disk side-effects: `npm run build` writes `.next/`; `backups/` holds the only DB recovery copies
- Other constraints: native modules `better-sqlite3` and `sharp` need a recent glibc on the show machine (`sharp` also needs SSE4.2); check Node 22 and Node 24 before adding a dependency
- Special constraints:
  - Every commit to `master` can be deployed straight onto the live show machine (admin self-update: `git pull` → `npm install` → `npm run build` → `node scripts/migrate-database.js` → PM2 restart, `git reset --hard` rollback on failure). A broken build or migration has real cost.
  - Background services (Santa queue processor, device monitor, DB scheduler) start from `instrumentation.ts` at server boot and contact the real FPP player and SMTP. That is why running the server is forbidden.

### Project-specific rules

- **Authorization is per-route.** `proxy.ts` only does a best-effort Origin/Referer check on mutating `/api/*` and JWT-gates the pages `/dashboard*` and `/settings*`; it does not protect `/api/*`. Every admin API route must call `requireAdmin()` / `requireAdminWithRateLimit(request)` (`lib/auth-helpers.ts`) first. Client-side checks are display-only.
- **New public mutating endpoints** need IP rate limiting (`lib/rate-limit.ts`, `getClientIP`), validation/sanitization (`lib/input-sanitization.ts`), and must not trust client-supplied scores, timestamps, or identities.
- **Two schema mechanisms.** `lib/database.ts` runs `CREATE TABLE IF NOT EXISTS` plus an add-column-if-missing loop on every import. New tables/columns normally go in a new `migrations/NNN_name.sql` (pattern: `migrations/018_trivia.sql`), applied by `scripts/migrate-database.js` in filename order. Number `013` is used twice; check the highest number before adding one. Never edit an applied migration. Write them idempotently (`IF NOT EXISTS`, `INSERT OR IGNORE`). `lib/migrations-runner.ts` is a legacy `game_scores` helper, not the real runner.
- **`votes.db` path:** `lib/database.ts` honours `VOTES_DB_PATH`, but `lib/rate-limit.ts` and others hard-code `process.cwd()/votes.db`.
- **FPP access** goes through `lib/fpp-config.ts` (`getFppUrl()` with a host allowlist). Never build FPP URLs from request input; `/api/fppd/*` and `/api/web/*` stay admin-only.
- **Next 16 / React 19 / next-auth v4:** `proxy.ts` replaces `middleware.ts` (export named `proxy`); `params` in route handlers is a `Promise` and must be awaited; next-auth is v4 (`getServerSession(authOptions)`), not Auth.js; Tailwind 4 has no `tailwind.config.js`; ESLint 10 flat config. Look up docs for the pinned version, not latest.
- **CSP lives in `proxy.ts`** with hard-coded LAN hosts. New external scripts, images, frames, or `connect-src` targets need a CSP update there.
- **Env vars:** `NEXT_PUBLIC_*` values ship to browsers — never put a secret there. There is no `.env.example`; document any new variable in `README.md` / `docs/INSTALLATION.md`.
- **Tests:** there is no Jest/Vitest. New logic gets a `scripts/test-<name>.ts` (pattern: `scripts/test-trivia-logic.ts`, uses `assert`, exits non-zero on failure) appended to `test:ci` in `package.json`. Report results per script.
- **Lint baseline:** `no-explicit-any`, `react/no-unescaped-entities`, `react-hooks/set-state-in-effect`, `react-hooks/immutability` and `no-unused-vars` are warnings in `eslint.config.mjs`; all else is an error. Run `npx eslint` on touched files before and after; add no new warnings. Do not mass-fix existing ones. `scripts/**` and `migrations/**` are not linted.
- **Versions** are tracked in several drifted places; never hand-edit them. Releases go through `npm run version:*` when the user asks (`docs/RELEASE-CHECKLIST.md`).
- **Docs:** keep `README.md`, `SECURITY.md`, and `docs/` in sync when behaviour changes. `.github/copilot-instructions.md` is stale and not authoritative.
- **Commit scopes** used in history: `jukebox`, `display`, `trivia`, `santa`, `admin`, `auth`, `db`, `poller`, `update`, `setup`, `ci`.

## Forbidden commands

Never run these. They are also blocked in `.claude/settings.json` where possible.

### Universal (all repositories)

- `git add` (any form)
- `git commit` (any form, including `--amend`)
- `git push` (any form, including `--force`)
- `git stash` (any form, including `pop`, `apply`, `drop`)
- Any other git command that stages, commits, pushes, or stashes changes

What gets staged, committed, pushed, or stashed is the user's decision; the commit message at the end of every change is what the user runs. Read-only git (`status`, `log`, `diff`, `show`) is allowed.

### Project-specific

The live SQLite database `votes.db` holds real votes, the jukebox queue, Santa letters, and settings. Treat it as production data even on the dev machine.

- Deleting, truncating, overwriting, or moving `votes.db*` or `backups/` contents — reason: destroys production data with no recovery besides `backups/`. Use instead: none — ask the user
- Any script that writes to the live `votes.db`: `npm run migrate`, `npm run setup`, `scripts/init-database.js`, `scripts/run-migration.js`, `run-migrations.js`, `scripts/migrate-game-scores.js`, `scripts/clear-rate-limits.js`, `scripts/refresh-spotify-urls.js`, `scripts/refresh-media-library-urls.js`, `scripts/validate-migration-011.js`, and `sqlite3 votes.db` with any write statement — reason: modifies live data. Use instead: `npm run db:stats`, `scripts/check-*.js` (read-only); the user runs migrations
- `npm run update`, `update.sh`, `update.ps1`, `scripts/update-daemon.sh`, `scripts/run-update.sh`, `scripts/update-watcher.sh`, `rollback.sh`, `deploy-production.sh` — reason: `git pull` / `git reset --hard` / `npm install` / PM2 restarts against the working tree. Use instead: none — ask the user
- `scripts/setup-*.sh`, `setup.sh`, `install.sh`, `scripts/production-setup.sh`, `scripts/install-*.sh`, `npm run cloudflare:setup*`, `npm run configure:oauth` — reason: install system services and rewrite `.env.local`. Use instead: none — ask the user
- `pm2 ...`, `scripts/restart-services.sh`, and any call to `POST /api/admin/update-install`, `/api/admin/restart`, `/api/system/update`, `/api/update` — reason: restart live services or start the self-update daemon. Use instead: none — ask the user
- `npm run dev`, `npm run dev-unsafe`, `npm run dev:with-poller`, `npm run poller:*`, `npm start`, `node server.js` — reason: long-running, and they start live background services that talk to the real FPP player and can send real email. Use instead: `npm run build` plus the test scripts; run a server only in the background and only if the user asks
- `npm run version:*`, `scripts/bump-version.js` — reason: rewrites version files and `CHANGELOG.md`. Use instead: none — only when the user asks for a release
- `npm audit fix`, `npm update`, `npm install <pkg>` — reason: change `package-lock.json`. Use instead: none — only when the user asks
- Printing, logging, committing, or pasting `.env.local` contents (OAuth secrets, SMTP password, `NEXTAUTH_SECRET`, `INTERNAL_API_KEY`) — reason: secrets. Use instead: variable names only
- POST/PUT/DELETE requests to the FPP player (`FPP_URL`) — reason: mutates the live show. Use instead: none — ask the user
- `git reset`, `git checkout`, `git restore`, `git clean` — reason: discard uncommitted work, and the working tree often holds work in progress. Use instead: `git diff`, `git status`

## How to work

### Task size

State the tier in one line before starting.

- **Tier 1 — ask or explore** (questions, reading code, anything that changes no files): just answer. No commit message.
- **Tier 2 — standard change** (bug fix, small feature, config or docs change, tests; a few files, no new dependency, no change to a public interface, schema, or build/CI config): research → brief plan in chat (goal, assumptions, docs consulted, steps with how each is verified) → implement → verify → preflight → commit message.
- **Tier 3 — major change** (new dependency; many files or modules; public interface, schema, or migration; security-sensitive code; build, CI, or deploy config; hard to reverse): in plan mode: research → full plan (including docs consulted) → **wait for approval** (the user approving the plan) → implement → verify → independent review → preflight → commit message.

If a task fits two tiers, use the larger. If a Tier 2 task grows, stop, say so, and continue as Tier 3. The user can ask for more or less process ("just do it", "full process"); verification, forbidden commands, and the commit message still apply.

Plan mode: for Tier 3, and before any new feature or design decision with real tradeoffs, enter plan mode yourself if you can; otherwise ask the user to switch (Shift+Tab) before planning. With the `opusplan` model setting, planning then runs on Opus and implementation on Sonnet.

### Principles

1. **Think before coding.** State your assumptions. If a request has several valid readings, present them or ask; never pick one silently. If a simpler approach exists, say so.
2. **Simplicity first.** Write the minimum code that solves the problem: no extra features, no abstractions for single-use code, no unrequested configurability, no handling for cases that cannot happen. If 200 lines could be 50, rewrite it.
3. **Surgical changes.** Every changed line must trace to the request. Do not refactor or tidy adjacent code; match the existing style. Remove only the imports, variables, and functions your change orphaned. Mention unrelated dead code instead of deleting it.
4. **Goal-driven.** Turn the task into a check you can run before you start: bug fix → a failing test first, then make it pass; new behaviour → tests for it; refactor → tests pass before and after. For multi-step work, list the steps with "→ verify: …" for each.

### Done means verified

- Do not call work finished until the build and tests have actually run and you have reported the real output. Never write "passes" for something you did not run.
- After a scripted or multi-file edit, confirm it applied (`git diff`) before running checks. Formatters can change lines between your edit and the check.
- Final gate: run the preflight command; the exit code must be 0. If none exists, run the build and test commands instead, say so, and offer to create a preflight script (do not create it unasked). A failure means the work is not finished.
- A Stop hook (`.claude/hooks/verify.sh`) re-runs the fast verify command when files have changed and blocks finishing on failure. Treat its report as a failed verification: fix it and re-run.
- Mechanical bugs in tooling or scripts that block a check (a shell error, a typo, a broken path) are fixed without asking, reported in one line, and listed in the commit message. Anything that changes behaviour still needs the user.
- If your first attempt at a bug fix fails, stop and re-plan before the next attempt (plan mode for Tier 3, a revised plan in chat for Tier 2). Do not stack more edits on an approach that did not work.
- Do not create spec, plan, or review files in the repository unless asked.

### Review findings

- Tier 3: before preflight, have the `reviewer` subagent review the diff. Give it the approved plan and the changed files, not your conclusions. If it is unavailable, review `git diff` yourself and say it was a self-review.
- Fix every in-scope finding, CRITICAL or RECOMMENDED, without asking. Then re-run the checks and the review. Repeat until the review has nothing left that needs a code change.
- Ask the user before fixing a finding only if the fix would change behaviour the user specified, add or upgrade a dependency, touch state outside the repository, or go beyond the task's scope.
- After 3 fix cycles that still fail (a failed review or preflight, fixed, failed again), STOP and report everything. Do not loop silently.
- Done means nothing in scope is left to fix. Do not end with "not implemented", "known issues", or "things I didn't touch" lists. Anything genuinely out of scope gets one line.

### Outside the repository

- Never change state outside the repository without asking: containers, volumes, database roles or passwords, images, installed packages, system or user configuration. Reading it is fine.
- If the harness or a permission rule denies a command, do not work around it with another command. Say what was denied and ask.

### Do not guess state

Before saying what is committed, pushed, or up to date, check: `git status`; `git log --oneline origin/$(git branch --show-current)..HEAD` (empty output means fully pushed); `stat <lockfile>`. Never tell the user to push, commit, or update without checking first.

### Research before changing

For Tier 2 and Tier 3, research comes before the plan, and the plan shows what you found.

1. **Read the code first.** Read the files you will change and the nearest existing code that does something similar. Reuse its patterns and helpers.
2. **Check current docs for every external library, framework, CLI, or API the change uses or touches, including ones already in the lock file.** Look up the version in use (the manifest or lock file says which). Use the Context7 MCP if available (resolve the library, then query its docs); otherwise the official documentation. Do not rely on memory for signatures, options, flags, or default behaviour. When a failure involves a library, search its docs and issue tracker for the error before choosing a fix. You may hand lookups to the `docs` subagent (if present); it returns quoted excerpts with source and version. Check the excerpt supports its answer before relying on it.
3. **Tier 3 only:** for any dependency being added or upgraded, also read its release notes or changelog and check for deprecations and known advisories. When choosing between libraries, compare at least two.
4. **Show it.** The plan has a line `Docs consulted:` naming each source and what it settled. Write `Docs consulted: none needed — <reason>` only when the change uses no external library or API (pure internal logic, comments, docs, formatting). If a lookup fails or the docs contradict the code, say so and ask; do not guess.

### Communication

- Lead with the answer or result. Use short sentences and plain words.
- Include only what the user needs: the result, what changed, what they must decide, and real check output. Do not restate the request, narrate your steps, or summarize what you just showed.
- Prefer plain wording to jargon and abbreviations. If a technical term is needed, explain it once.
- Use a list only for three or more parallel items. No headings in short replies.
- This does not shorten required content: the plan, the `Docs consulted:` line, failure output, and the commit message stay complete.

### Commit message (final step of every change)

Every change that modifies files ends with a commit message, however small (a one-line typo fix included). It is the last thing in your reply. You never run `git commit`; the user does.

The user commits all changed files at once, so give exactly **one** commit message covering every uncommitted change in the working tree, including work from earlier tasks that has not been committed yet. Never split the work into several messages.

Format, ready to paste into `git commit`:

```
<type>(<scope>): <description — MAX 72 characters total>

<PARAGRAPH EXPLAINING WHAT CHANGED AND WHY>

Modified Files:
- path/to/file1
- path/to/file2
- path/to/file3

✔ Build successful
✔ Tests passed
✔ Review approved
✔ Preflight passed
```

Valid types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`. Example first line: `fix(network): disable swap on ZFS server roles`

Inside the message: no "Commit Message" heading, no "Edited" summary, no diff statistics, nothing outside the template. List new files under Modified Files too.

Checkmark lines appear only for checks that actually ran and passed on the final code in this session; never include a line for a skipped check. `✔ Review approved` means the Tier 3 review returned PASS (write `✔ Review approved (self-review)` if no independent reviewer was used). Omit the Preflight line if no preflight exists.

After the message, if every check that ran passed, add one line:
> All checks passed. Code is ready to push to GitHub.
