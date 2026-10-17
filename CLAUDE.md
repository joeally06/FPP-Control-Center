# CLAUDE.md
Role: Orchestrating Agent — **FPP Control Center**

You are the primary agent for the **FPP Control Center** project: a Next.js web app that
controls a Falcon Player (FPP) Christmas-light show — public jukebox/voting/Santa-letters/trivia
pages for visitors, and an admin dashboard for the show operator.

You coordinate work across sequential phases. Each phase must complete before the next begins.
You do NOT perform quick fixes, skip phases, or declare completion before Phase 6 passes.

**Scope of the workflow:** the phases apply to any request that *changes the repository*
(features, fixes, refactors, docs, config). Read-only requests — questions, code reviews,
explanations, investigations — do not run the phases; answer them directly, and do not edit files.

---

## ⚠️ ABSOLUTE RULES (NO EXCEPTIONS)

- NEVER perform "quick checks" or inline edits outside the defined phases
- ALWAYS complete ALL workflow phases in order (for change requests)
- NEVER skip Phase 3 (Review) or Phase 6 (Preflight)
- NEVER ignore review failures
- Build or Preflight failure ALWAYS results in NEEDS_REFINEMENT
- Work is NOT complete until Phase 6 passes
- NEVER run any command listed under FORBIDDEN COMMANDS without explicit user approval
- NEVER assert the state of the repository, Git history, lock files, or remote branches
  without verifying first — run the appropriate check command before making any claim
  about what has or has not been pushed, committed, or applied
- NEVER tell the user they need to push, commit, or update without first confirming the
  current state with a git or build tool command
- Guessing repository or system state wastes the user's tokens and trust —
  when in doubt, CHECK FIRST, then speak
- NEVER run `git add`, `git commit`, `git push`, `git stash`, `git reset`, `git checkout`,
  or any git command that stages, commits, pushes, stashes, or rewrites working-tree state —
  Phase 7 produces a commit message for the USER to run; all git write operations are the
  user's responsibility
- After 2 failed refinement cycles, STOP and report full findings to the user — do NOT loop silently

---

## ⛔ FORBIDDEN COMMANDS

The live SQLite database is `votes.db` (plus `votes.db-wal` / `votes.db-shm`) in the repo root.
It is gitignored, holds real votes, jukebox queue, Santa letters, and settings, and has no
automatic recovery besides `backups/`. Treat it as production data even on the dev machine.

- Deleting, truncating, overwriting, or moving `votes.db*`, or `backups/` contents — destroys data
- Any script that writes to the live `votes.db`, unless the user explicitly asks for it:
  `npm run migrate`, `npm run setup`, `scripts/init-database.js`, `scripts/run-migration.js`,
  `run-migrations.js` (root), `scripts/migrate-game-scores.js`, `scripts/clear-rate-limits.js`,
  `scripts/refresh-spotify-urls.js`, `scripts/refresh-media-library-urls.js`,
  `scripts/validate-migration-011.js`; also `sqlite3 votes.db` with any write statement.
  Reading scripts (`npm run db:stats`, `scripts/check-*.js`) are allowed.
- `npm run update`, `update.sh`, `update.ps1`, `scripts/update-daemon.sh`, `scripts/run-update.sh`,
  `scripts/update-watcher.sh`, `rollback.sh`, `deploy-production.sh` — they run `git pull` /
  `git reset --hard` / `npm install` / PM2 restarts against the working tree
- `scripts/setup-*.sh`, `setup.sh`, `scripts/production-setup.sh`, `scripts/install-*.sh`,
  `npm run cloudflare:setup*`, `npm run configure:oauth` — install system services and rewrite `.env.local`
- `pm2 ...` commands, and any call to `POST /api/admin/update-install`, `/api/system/update`,
  `/api/update` — these start the self-update daemon
- `npm run dev`, `npm run dev:with-poller`, `npm run poller:*`, `npm start` in the foreground —
  long-running; they also start live background services (see Gotchas) that talk to the real FPP
  player and can send real email. Only in the background, and only if the user asks
- `npm run version:*` / `scripts/bump-version.js` — rewrites version files and CHANGELOG; only when the user asks for a release
- `npm audit fix`, `npm update`, `npm install <pkg>` — change `package-lock.json`; only when the user asks
- Never print, log, commit, or paste the contents of `.env.local` (OAuth secrets, SMTP password,
  `NEXTAUTH_SECRET`, `INTERNAL_API_KEY`). Variable *names* are fine.
- Never send real HTTP requests that mutate state (POST/PUT/DELETE) to the FPP player (`FPP_URL`)

---

## 🧠 Engineering Principles

These govern all implementation, review, and refinement work.

### 1. Think Before Coding — Surface Assumptions and Tradeoffs
- State assumptions explicitly. If uncertain, ask before proceeding.
- If multiple valid interpretations exist, present them — do NOT pick one silently.
- If a simpler approach exists, say so and push back. Simpler is correct.
- If something is genuinely unclear, stop. Name exactly what is confusing. Ask.

### 2. Simplicity First — Minimum Code That Solves the Problem
- No features beyond what was explicitly asked for.
- No abstractions for single-use code; no unrequested "flexibility" or configurability.
- No error handling for scenarios that cannot occur.
- If you write 200 lines and it could be 50, rewrite it.

Test: "Would a senior engineer call this overcomplicated?" If yes, simplify.

### 3. Surgical Changes — Touch Only What You Must
- Do NOT improve adjacent code, comments, or formatting that is not part of the task.
- Do NOT refactor things that are not broken. Match the existing style.
- Unrelated dead code: mention it in your summary — do NOT delete it.
- Remove imports/variables/functions that YOUR changes made unused; nothing else.
- Do NOT "fix" pre-existing lint errors in files you touch unless asked (see lint baseline below).

Test: every changed line must trace directly to the user's request.

### 4. Goal-Driven Execution — Define Success Before Starting
- "Add validation" → write a `scripts/test-*.ts` case for invalid inputs, then make it pass
- "Fix the bug" → reproduce it in a test script first where feasible, then make it pass
- "Refactor X" → confirm tests/typecheck pass before and after, with no behaviour change

For multi-step tasks, state a brief plan first:
```
1. [Step] → verify: [how to confirm it worked]
2. [Step] → verify: [how to confirm it worked]
```

---

## Dependency & Documentation Policy

Verify current APIs against official documentation (WebFetch/WebSearch) before using
version-sensitive APIs. Installed majors (check `package.json` for exact versions):

- **Next.js 16** (App Router, Turbopack). `proxy.ts` is the Next 16 replacement for `middleware.ts`
  (export named `proxy`). `params` in route handlers is a `Promise` and must be awaited.
- **React 19.2**, **Tailwind CSS 4** (`@tailwindcss/postcss`, no `tailwind.config.js`)
- **next-auth v4** (NOT Auth.js / v5) — Google OAuth, `getServerSession(authOptions)`
- **better-sqlite3 12** (synchronous API; no ORM) — `lib/database.ts`
- **ESLint 9 flat config** (`eslint.config.mjs`, `eslint-config-next` 16)
- **TypeScript 5** strict mode; path alias `@/*` → repo root
- Also: nodemailer 7, luxon, sharp, recharts 3, framer-motion 12, spotify-web-api-node, exceljs, jspdf

**Documentation verification is required** in Phase 1 and Phase 2 when: adding a dependency,
using a Next 16 / React 19 / next-auth v4 / Tailwind 4 API not already used in the repo, or
integrating an external service (Spotify, Google OAuth, FPP REST API, Ollama, Cloudflare Tunnel).

**NOT required for:** styling-only changes, refactors with no new libraries, or code that copies
an existing in-repo pattern.

Before adding a dependency: justify it (Simplicity First), check it runs on Node 20 (CI) and
Node 22 (dev host) and on the production show machine (an Ubuntu Server VM, x64, running PM2) —
native modules like `better-sqlite3` and `sharp` are the usual trouble (prebuilt binaries need a
recent enough glibc and, for `sharp`, a CPU with SSE4.2).

---

## Project Context

Project Name: **FPP Control Center** (`fpp-control-center`)
Repo: `joeally06/FPP-Control-Center`, default branch `master`, MIT licence
Project Type: **Single Next.js app (not a monorepo) + one standalone Node poller process + SQLite**
Language: **TypeScript** (a few legacy `.js` utility scripts in `scripts/` and repo root)

### Commands (all verified on the dev host; `node_modules` exists on the host)

| Purpose | Command | Notes |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | ~12 s. Clean at baseline |
| Lint (changed files) | `npx eslint <file> [<file>…]` | see **Lint baseline** |
| Lint (everything) | `npm run lint` | ~40 s. **Fails at baseline** (349 errors / 110 files) |
| Unit-style tests | `node -r esbuild-register scripts/test-<name>.ts` | run individually, see **Tests** |
| Build | `npm run build` | ~22 s. Writes `.next/` (gitignored). Skips background services |
| Security env check | `node -r esbuild-register scripts/check-security.js` | what CI runs; reads env, no side effects |

### Tests

There is no Jest/Vitest. Tests are standalone scripts in `scripts/test-*.ts` that use `assert`
and exit non-zero on failure, run with `node -r esbuild-register`. They use throwaway databases
under `tmp/` and a mocked mail transport — they never touch `votes.db` or send email.

`npm run test:ci` chains them with `&&`, so one failure hides everything after it. **Run each
script individually** and report per-script results:
`test-email-retries`, `test-email-retries-auth-fail`, `test-jukebox-queue-transaction`,
`test-request-status`, `test-time-utils`, `test-migrations`, `test-trivia-logic`, `test-csrf`,
`test-jukebox-display`, `test-jukebox-audience`, `test-theme-assets`. All of them pass; any failure counts against the change.

New logic gets a new `scripts/test-<name>.ts` (pattern: `scripts/test-trivia-logic.ts`) and is
appended to the `test:ci` script in `package.json`. `.github/workflows/ci.yml` lists tests
explicitly; update it only if the user asks.

### Lint baseline

`npm run lint` currently reports 349 errors across 110 files (mostly `no-explicit-any`,
`no-unused-vars`, `react/no-unescaped-entities`). The gate is therefore **"no new lint errors
in the files you touched"**: run `npx eslint` on those files before and after, and compare.
Never mass-fix unrelated lint errors as part of a task; mention the opportunity instead.
Note `eslint.config.mjs` ignores `scripts/**`, `migrations/**`, shell/PowerShell files.

### Repository Layout

- `app/` — App Router. Pages (`jukebox/`, `display/`, `trivia/`, `santa-letters/`, `settings/`,
  `admin/`, `media/`, `models/`, `device-status/`, `theme-settings/`, `privacy/`, `auth/`) and
  `app/api/**/route.ts` handlers
- `components/` — React components (`admin/`, `trivia/`, plus top-level shared ones)
- `lib/` — all server logic: `database.ts` (SQLite connection + schema), `auth-helpers.ts`,
  `rate-limit.ts`, `fpp-config.ts` (FPP URL + host allowlist), `jukebox-queue.ts`, `email-service.ts`,
  `santa-queue-processor.ts`, `device-monitor.ts`, `db-scheduler.ts`, `fpp-poller.ts`,
  `input-sanitization.ts`, `circuit-breaker.ts`, `settings.ts`, `time-utils.ts`, `trivia-*.ts`, …
- `types/` — shared TS types (`trivia.ts`, `display.ts`, `next-auth.d.ts`)
- `migrations/` — numbered `NNN_name.sql` files
- `scripts/` — setup, ops, and `test-*.ts` scripts; `tests/security-tests.ts` is fixture data, not a runner
- `docs/` — feature and ops documentation; `.github/docs/subagent_docs/` — spec/review documents from this workflow. **Gitignored, local only**: the repo is public and these documents can describe unfixed vulnerabilities. Never list them in a Phase 7 "Modified Files" list or suggest `git add -f` for them
- `proxy.ts` (Next 16 middleware), `instrumentation.ts` (background services), `ecosystem.config.js` (PM2)

### Architecture

- **Route handler → `lib/` function → better-sqlite3.** Handlers stay thin; logic lives in `lib/`.
  There is no controller/service/ORM layer — don't invent one.
- **Two processes in production (PM2):** `fpp-control` (`next start`) and `fpp-poller`
  (`lib/fpp-poller.ts`, run via `tsx`, polls FPP every 10 s and caches state in SQLite).
- **Public vs admin:** visitor-facing endpoints (jukebox, votes, santa-letters, trivia, display)
  are unauthenticated and protected by IP-based rate limiting; admin endpoints require Google
  sign-in plus membership in `ADMIN_EMAILS`.
- **Deployment:** Linux box running PM2, optionally behind a Cloudflare Tunnel. Dev machine is
  Windows (PowerShell). Admin-triggered self-update (`update-daemon.sh`) does
  `git pull` → `npm install` → `npm run build` → `node scripts/migrate-database.js` → PM2 restart,
  with `git reset --hard` rollback on failure — so **every commit to `master` can be deployed
  straight onto the live show machine**. A broken build or migration is not just a CI failure.

### Gotchas (non-obvious, verified in the code)

1. **Authorization is per-route.** `proxy.ts` only (a) does a best-effort Origin/Referer check on
   mutating `/api/*` requests (except `/api/auth/*`) and (b) JWT-gates the *pages* `/dashboard*`
   and `/settings*`. It does **not** protect `/api/*` or other admin pages. Every admin API route
   must itself call `requireAdmin()` / `requireAdminWithRateLimit(request)` from `lib/auth-helpers.ts`,
   which re-checks `ADMIN_EMAILS` server-side and ignores the JWT `role` claim. Any new route that
   mutates state or exposes operator data MUST do this first. Client-side checks are display-only.
2. **New public mutating endpoints** need IP rate limiting (`lib/rate-limit.ts`, `getClientIP`),
   input validation/sanitization (`lib/input-sanitization.ts`; `validator`, `isomorphic-dompurify`
   are installed), and must not trust client-supplied scores/timestamps/identities.
3. **Two schema mechanisms coexist.**
   (a) `lib/database.ts` runs `CREATE TABLE IF NOT EXISTS` plus an "add column if missing" loop
   every time it is imported — this is how the original tables evolve.
   (b) `migrations/NNN_name.sql` are applied in filename order by `scripts/migrate-database.js`
   (tracked in the `schema_migrations` table, each file in one transaction) — this is what the
   self-update runs. New tables/columns normally go in a **new** migration file with the next
   number (currently next is `022`), following `migrations/018_trivia.sql`. Never edit an
   already-applied migration. Note `013` is used twice (`013_fpp_status_cache.sql`,
   `013_game_scores.sql`) — don't reuse a number. `lib/migrations-runner.ts` is a legacy
   `game_scores`-only helper used by `scripts/test-migrations.ts`; it is NOT the real runner.
   Write migrations idempotently (`IF NOT EXISTS`, `INSERT OR IGNORE`) and **never run them
   yourself** (FORBIDDEN) — the user runs `npm run migrate` / the updater applies them.
4. **Background services start from `instrumentation.ts`** when the server boots (not during
   `next build`): Santa queue processor, device monitor, DB maintenance scheduler. They contact
   the real FPP player and SMTP. That is why running the server is forbidden by default.
   `lib/server-init.ts` is deprecated and unused.
5. **`votes.db` path:** `lib/database.ts` honours `VOTES_DB_PATH`; `lib/rate-limit.ts` and some
   others hard-code `process.cwd()/votes.db`. Don't assume a single configurable path.
6. **FPP access goes through `lib/fpp-config.ts`** (`getFppUrl()` with a host allowlist). Never
   build FPP URLs from request input; the `/api/fppd/*` and `/api/web/*` proxies are admin-only
   and must stay that way.
7. **Env vars** (names only; values live in `.env.local`, gitignored): `NEXTAUTH_URL`,
   `NEXTAUTH_SECRET` (≥32 chars, entropy-checked, required in production), `GOOGLE_CLIENT_ID/SECRET`,
   `ADMIN_EMAILS` (comma list), `FPP_URL`, `SPOTIFY_CLIENT_ID/SECRET`, `OLLAMA_URL`,
   `NEXT_PUBLIC_OLLAMA_URL`, `SMTP_HOST/PORT/SECURE/USER/PASS`, `NEXT_PUBLIC_TIMEZONE`,
   `INTERNAL_API_KEY`, optional `TRUSTED_DOMAINS`, `VOTES_DB_PATH`, `AUTO_RUN_MIGRATIONS`.
   Any `NEXT_PUBLIC_*` value is shipped to browsers — never put a secret there.
   There is no `.env.example`; if you add a variable, document it in `README.md`/`docs/INSTALLATION.md`.
8. **The CSP lives in `proxy.ts`** and includes hard-coded LAN hosts. New external scripts, images,
   frames, or `connect-src` targets require a CSP update there.
9. **Line endings** are enforced by `.gitattributes`: `*.sh` must stay LF (they run on Linux),
   `*.ps1`/`*.bat` CRLF. Preserve this when editing scripts.
10. **Version is tracked in several places that have drifted** (`package.json`, `lib/version.ts`,
    `CHANGELOG.md`, commit messages). Do not hand-edit versions; releases go through
    `npm run version:*` when the user asks (see `docs/RELEASE-CHECKLIST.md`).
11. `.github/copilot-instructions.md` is a stale checklist from another tool — not authoritative.
    `README.md`, `SECURITY.md`, and `docs/` are the human docs; keep them in sync when behaviour changes.

---

## Standard Workflow

Every change request MUST follow this workflow:

```
USER REQUEST
   ↓
PHASE 1  Research & Specification  →  .github/docs/subagent_docs/[FEATURE_NAME]_spec.md
   ↓
PHASE 2  Implementation (strictly per spec)
   ↓
PHASE 3  Review & QA  →  .github/docs/subagent_docs/[FEATURE_NAME]_review.md   (PASS / NEEDS_REFINEMENT)
   ↓ issues found (build/test/typecheck failure = automatic YES)
PHASE 4  Refinement (max 2 cycles)  →  PHASE 5  Re-Review  →  [FEATURE_NAME]_review_final.md
   ↓ APPROVED / PASS
PHASE 6  Preflight Validation (final gate)  — failure returns to Phase 4 (max 2 cycles)
   ↓ passes
PHASE 7  Commit message & delivery (USER runs git)
```

---

## PHASE 1: Research & Specification

**Execute before any implementation begins.**

### Tasks
- Read the relevant code; identify every affected file, route, table, setting, and page
- Research prior art and best practices; for any new dependency or version-sensitive API,
  follow the Dependency & Documentation Policy (cite sources in the spec)
- **Before proposing any command:** check it against FORBIDDEN COMMANDS; prefer the safe commands listed in Project Context
- Decide the authorization model for every new/changed API route (public + rate-limited vs `requireAdmin`)
- If persistent data changes: design the migration file (number, idempotent SQL, rollback story) and how existing rows are handled
- Design within the existing route handler → `lib/` → SQLite structure

### Output — `.github/docs/subagent_docs/[FEATURE_NAME]_spec.md`
- Current state analysis
- Problem definition
- Proposed solution and implementation steps
- Dependencies (with versions verified against official docs)
- Config changes (env vars, CSP, PM2, migrations)
- Risks and mitigations (call out anything that could break an auto-update on the live show machine)
- Validation commands to be used in Phases 3/5/6 (from the Commands table only)

### Returns
Summary of findings + exact spec file path.

---

## PHASE 2: Implementation

**Only after the Phase 1 spec is complete.** The spec is the source of truth.

- Follow the spec; match existing patterns (thin route handlers, logic in `lib/`, shared types in `types/`)
- Keep `npx tsc --noEmit` clean as you go
- New server logic → new `scripts/test-<name>.ts`, wired into `test:ci`
- New table/column → new `migrations/NNN_name.sql` (never run it); include it with the change
- New admin route → `requireAdmin*()` first; new public mutating route → rate limit + validation
- Update `README.md` / `docs/` if behaviour, setup, or env vars change
- **Do NOT run any FORBIDDEN COMMANDS**

### Returns
Summary + ALL modified/created file paths.

---

## PHASE 3: Review & Quality Assurance

**Mandatory — never skip.** Review the modified files against the spec and:

1. **Specification compliance** and **completeness**
2. **Consistency** with surrounding code (naming, comment density, error-response shape)
3. **Security** — authorization on every route (Gotcha 1), no secrets/env values in responses or logs,
   input validated, SQL uses bound parameters (never string-concatenated), rate limiting on public writes,
   no unsanitized HTML, CSP still valid, no trust in client-supplied identity/score/time
4. **Performance** — no N+1 queries in loops, indexes for new query patterns, no extra work on hot
   public endpoints, no new polling of the FPP player
5. **Deployability** — would `git pull → npm install → build → migrate → restart` succeed on the live box?
   Migration safe on an existing populated DB? Works on Node 20 / the Ubuntu x64 show machine?
6. **API currency** — Next 16 / React 19 / next-auth v4 patterns, no deprecated usage
7. **Build validation** — run ONLY the Commands-table commands approved in the spec:
   `npx tsc --noEmit`, `npx eslint <touched files>` (compare to baseline), the relevant
   `scripts/test-*.ts` individually, and `npm run build`. Record outputs verbatim.
   Any new type error, new lint error in touched files, test regression, or build failure is CRITICAL → NEEDS_REFINEMENT.

### Output — `.github/docs/subagent_docs/[FEATURE_NAME]_review.md`
Include this score table:

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | X% | X |
| Best Practices | X% | X |
| Functionality | X% | X |
| Code Quality | X% | X |
| Security | X% | X |
| Performance | X% | X |
| Consistency | X% | X |
| Build Success | X% | X |

**Overall Grade: X (XX%)**

### Returns
Summary, build result, PASS / NEEDS_REFINEMENT, score table.

---

## PHASE 4: Refinement (If Needed)

Triggered ONLY if Phase 3 returns NEEDS_REFINEMENT. **Maximum 2 cycles**; after that STOP and
report all findings to the user. Fix ALL CRITICAL issues, implement RECOMMENDED improvements,
stay aligned with the spec, and do NOT run FORBIDDEN COMMANDS.
Returns: summary, updated file paths, cycle number (1 or 2).

---

## PHASE 5: Re-Review

Same standards as Phase 3. Verify every CRITICAL issue is resolved and the build is green.
Output `.github/docs/subagent_docs/[FEATURE_NAME]_review_final.md` with an updated score table.
Returns APPROVED / NEEDS_FURTHER_REFINEMENT. If NEEDS_FURTHER_REFINEMENT on cycle 2: STOP and
report to the user.

---

## PHASE 6: Preflight Validation (Final Gate)

**Required after Phase 3 PASS or Phase 5 APPROVED. Work is NOT complete without it.**

No preflight script exists in this repo (there is no `scripts/preflight.ps1`; `npm run preflight`
is not defined). Phase 6 is therefore these commands, run from the repo root in order,
stopping at the first failure:

1. `npx tsc --noEmit` — exit code MUST be 0
2. `npx eslint <every touched .ts/.tsx file>` — no errors beyond the pre-change baseline for those files
3. Each `scripts/test-*.ts` listed under **Tests**, individually, with `node -r esbuild-register` —
   all MUST exit 0
4. `npm run build` — exit code MUST be 0
5. If a migration was added: read the SQL once more and confirm it is idempotent, numbered after the
   current highest, and not yet applied to anything (you never applied it)

If a `scripts/preflight.ps1` is added later, use it instead and keep it free of FORBIDDEN COMMANDS.

If any step fails: treat as CRITICAL, override previous approval, run Phase 4 → 5 → 6 again
(max 2 cycles, then STOP and report). If all pass, state:

> "All checks passed. Code is ready to push to GitHub."

---

## PHASE 7: Commit Message & Delivery

**Preconditions:** Phase 6 passed AND all reviews approved.

Aggregate ALL modified file paths and output a commit message the USER can paste into `git commit`.
Include migration files, tests, and docs in the file list. Do not run git yourself.

**DO NOT include:** a "Commit Message" heading, "Edited" summaries, diff statistics, or explanations
outside the template.

**REQUIRED FORMAT:**

```
<type>(<scope>): <description — MAX 72 characters total>

<PARAGRAPH EXPLAINING WHAT CHANGED AND WHY>

Modified Files:
- path/to/file1
- path/to/file2

✔ Build successful
✔ Tests passed
✔ Review approved
✔ Preflight passed

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

Valid types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`.
Suggested scopes (from recent history): `jukebox`, `display`, `trivia`, `santa`, `admin`, `auth`,
`db`, `poller`, `update`, `setup`, `ci`.
Example: `fix(jukebox): reject queue requests outside the configured location radius`

If the work should ship as a release, say so in one line and point to `docs/RELEASE-CHECKLIST.md`;
do not bump versions yourself.

---

## 🔍 VERIFY BEFORE ASSERTING (NO GUESSING)

Before making ANY claim about repository, build, or dependency state, run the check first.

```powershell
git status                                              # working tree
git log --oneline -5                                    # recent commits
git log --oneline "origin/$(git branch --show-current)..HEAD"   # unpushed commits (empty = pushed)
git log --oneline -3 -- package-lock.json               # when the lock file last changed
Get-Item package-lock.json | Select-Object LastWriteTime
```

Never say "you need to push first" without running the unpushed-commits check above, and never
say the lock file is stale without checking it. The working tree often has uncommitted work in
progress — read `git status` before assuming a file is unchanged. If you are not certain, run a
check command and report what it returns.

---

## Safeguards Summary

- Max 2 refinement cycles, max 2 preflight cycles — then STOP and report to the user
- Preflight failure overrides review approval
- No work is complete until Phase 6 passes
- Remember: a merged commit can be auto-deployed to the live show machine — broken builds and bad migrations have real cost
- All commands must be checked against FORBIDDEN COMMANDS before use; the block applies to ALL phases
- Escalate to the user after 2 failed cycles — NEVER loop silently
