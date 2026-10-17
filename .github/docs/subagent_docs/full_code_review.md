# FPP Control Center — Full Code Review

Date: 2026-10-16 · Branch: `master` (HEAD `4bdd99b`, plus uncommitted trivia + CSRF work)
Scope: whole repository, read-only review. Close reading of every API route's auth, the auth
layer, file/shell operations, SQL, public write paths, trivia, update/backup scripts, and
dependencies. React components and shell scripts other than `scripts/update-daemon.sh` were
skimmed, not reviewed line by line.

Each finding says how it was established: **Verified** = read in code or reproduced with a
command; **Unverified** = could not be confirmed (reason given).

Use this file as the work list: tick the box when a fix has passed its own spec → review →
preflight cycle (CLAUDE.md). Suggested batches are at the end.

---

## Summary

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| C1 | Critical | Database backups with visitor data are committed to the public repo | [~] repo change done; owner runbook pending (`c1_db_history_purge_spec.md`) |
| C2 | Critical | Any Google account can read and rewrite all settings | [x] fixed, uncommitted (`c2_settings_admin_auth_*.md`) |
| C3 | Critical | Runtime dependencies with critical advisories (`next`, `next-auth`, `jspdf`) | [ ] |
| C4 | Critical | CSRF check allowed every cross-site request in production | [x] fixed, uncommitted |
| H1 | High | Unauthenticated `PUT /api/jukebox/status` changes any queue item | [ ] |
| H2 | High | Santa letters: public, unmoderated email sending to any address | [ ] |
| H3 | High | Every rate limit trusts client-supplied IP headers | [ ] |
| H4 | High | Self-update stashes and loses runtime data (audio mappings, uploads) | [ ] |
| H5 | High | CI has failed on every recent `master` push | [ ] |
| M1 | Medium | Jukebox queue accepts any sequence name; fans out to FPP per request | [ ] |
| M2 | Medium | `process-queue` is unauthenticated and its state machine is not atomic | [ ] |
| M3 | Medium | Backups are torn copies of a live WAL database; no retention | [ ] |
| M4 | Medium | PM2 starts the poller with `npx tsx`, which is not installed | [ ] |
| M5 | Medium | Two inconsistent sources of truth for "is admin" | [ ] |
| M6 | Medium | Trivia: joining after a round ends deletes the joiner; dead grace period | [ ] |
| M7 | Medium | Slideshow delete/upload overwrite images still in use | [ ] |
| M8 | Medium | Route modules start never-ending 2 s polling loops | [ ] |
| M9 | Medium | Database layer: swallowed migration errors, 38 ad-hoc connections, leak | [ ] |
| M10 | Medium | Privacy: public show coordinates, guessable IP-hash salt, PII in logs | [ ] |
| L1–L8 | Low | Hygiene and hardening items | [ ] |

---

## Critical

### C1 — Database backups with visitor data are committed to the public repo
**Verified** (files tracked; repo confirmed public on GitHub). **Unverified:** whether the rows are real people — inspecting them, even masked, was blocked by the session's PII safeguard. The owner must check.

- Tracked files: `votes.db.backup-before-migration-011` (516 KB), `backups/2025-10-31_01-39-23/votes.db-wal` (4.1 MB), `backups/2025-10-31_01-39-23/votes.db-shm`.
- Added in commits `e7114ac` ("Secuirty Harding of site") and `f18b996` (v1.0.1-rc.2).
- Row counts in the backup: `santa_letters` 3 (columns include `child_name`, `parent_email`, `ip_address`, `letter_content`), `jukebox_queue` 3 (`requester_name`, `requester_ip`), `sessions` 138, `visitors` 2, `page_views` 138.
- Why `.gitignore` missed them: `*.db.backup` does not match a name ending in `-011`; `backups/` was tracked before the ignore rule.

**Impact:** if the rows are real, children's names, parents' emails and IPs are public, and remain in git history even after the files are deleted.

**Fix:**
1. Owner checks whether the data is real.
2. `git rm --cached` the files; widen `.gitignore` (`votes.db*`, `*.db.backup*`, `backups/**`).
3. If real: rewrite history (`git filter-repo --path ... --invert-paths`), force-push, ask GitHub support to purge cached views; consider whether affected families need notifying.
4. The WAL file can contain data the main backup lacks — treat it the same way.

### C2 — Any Google account can read and rewrite all settings
**Verified.**

- `app/api/auth/[...nextauth]/route.ts:72` — `signIn` returns `true` for every Google user ("Allow all Google OAuth users").
- `app/api/settings/route.ts:13-16` (GET) and `:45-48` (PUT) only check that a session exists — no admin check.
- `lib/settings.ts:88-113` — `updateSettings` updates existing keys and **creates any new key** it is given.

**Impact:** any Gmail user can toggle Santa letters, raise `santa_daily_limit`, change `ollama_model`, monitoring schedule, `site_name`, `timezone`, display announcement text (shown on the public sign), and any `display_*` key.
Chained with M7's delete code: setting `display_slideshow_images` to `["../votes.db"]` makes the admin's next slideshow "delete" unlink the live database (`app/api/display/upload/route.ts:106` joins `public/` with the stored value, no containment check).

**Fix:** `requireAdmin()` (or `requireAdminWithRateLimit`) in both handlers; allowlist the keys PUT may write; in the upload DELETE, resolve the path and require it to stay under `public/uploads/display/`.

### C3 — Runtime dependencies with critical advisories
**Verified** (`npm audit`: 35 advisories — 5 critical, 23 high, 6 moderate, 1 low).

| Package | Installed | Notable advisories | Fix |
|---|---|---|---|
| `next` | 16.2.6 | Critical: unauthenticated RCE in Image Optimization API (AVIF); critical: unauthenticated RCE on Windows-hosted servers; high: Middleware/Proxy bypass (Turbopack); several SSRF, cache-poisoning, DoS | ≥ 16.3.8 (non-major) |
| `next-auth` | 4.24.14 | Critical: email homoglyph bypass (affects Email provider — this app uses Google, so lower real risk); high: `getToken()` crash on malformed Bearer header; moderate: OAuth check cookies not provider-bound | 4.24.15 |
| `jspdf` | 3.0.4 | Critical: local file inclusion / path traversal; critical: HTML injection; multiple PDF-injection highs | 4.2.1 (**major**) |
| `isomorphic-dompurify` → `dompurify` | ≤ 3.4.15 | High XSS + IN_PLACE bypasses | update |
| others | — | `nanoid`, `form-data`, `braces`, `micromatch`, `js-yaml` (mostly transitive/dev), `concurrently` via `shell-quote` | `npm audit fix` after the above |

Context: the `/dashboard` and `/settings` page gate lives in `proxy.ts`, so the proxy-bypass advisory is directly relevant. `next/image` is not used in the codebase, which lowers but does not remove exposure of `/_next/image`.

**Fix:** bump `next` and `eslint-config-next` together, `next-auth` patch; plan `jspdf` 4.x separately (check `jspdf-autotable` compatibility and the PDF export code); run build + tests.

### C4 — CSRF check allowed every cross-site request in production — FIXED (uncommitted)
**Verified** (reproduced before, tests after). Old `proxy.ts` trusted the request's own `Host` header and matched `Origin` by a mangled prefix, so with an https `NEXTAUTH_URL` every cross-site POST/PUT/DELETE passed. Replaced by `lib/csrf.ts` + `scripts/test-csrf.ts`. Spec/review: `csrf_origin_check_spec.md`, `csrf_origin_check_review.md`. Remaining: commit it.

---

## High

### H1 — Unauthenticated `PUT /api/jukebox/status`
**Verified.** `app/api/jukebox/status/route.ts:90-110` — no auth; takes `{ id, status }` and runs `updateQueueStatus`.
**Impact:** any visitor can mark any queue item `skipped`/`completed`/`playing`, disrupting the show queue.
**Fix:** `requireAdmin()`; check whether any client code calls it (if the queue processor needs it, call the lib function directly instead of over HTTP).

### H2 — Santa letters: public, unmoderated email sending to any address
**Verified.**
- `app/api/santa/send-letter/route.ts` — public; accepts any `parentEmail`.
- `app/api/santa/process-queue/route.ts:70-91` — background job generates an LLM reply and emails it via the operator's SMTP. No moderation step (`santa_letters.status` has `approved`/`rejected`, but the auto path never waits for approval).
- Limits: per-email and per-IP per day — per-IP is bypassable (H3), the limit itself is writable by any Google user (C2), and per-email only stops repeats to the same address.
- Prompt-injection defence in `lib/ollama-client.ts` is pattern-based.

**Impact:** strangers can make your mail server send AI-written messages to arbitrary addresses — harassment, spam complaints, SMTP account suspension.
**Fix (choose):** admin approval before sending (statuses already exist); or double opt-in (confirm link to the parent first); plus a global daily send cap and CAPTCHA/turnstile on the form.

### H3 — Every rate limit trusts client-supplied IP headers
**Verified.** `lib/rate-limit.ts:63-86`, `lib/visitor-tracking.ts:16-37`, `lib/santa-rate-limit.ts:92-111`, and inline copies in `app/api/votes/route.ts:88-90, 187-189` take `cf-connecting-ip`, then `x-forwarded-for`, then `x-real-ip`.
**Impact:** unless every request truly comes through Cloudflare *and* port 3000 is unreachable on the LAN/internet, a client sets its own IP per request → unlimited votes, jukebox requests, Santa letters, trivia joins/answers.
**Fix:** one shared `getClientIP` that trusts forwarding headers only when the socket peer is a configured trusted proxy (e.g. `TRUSTED_PROXY_IPS`, default loopback for cloudflared), otherwise uses the connection address; bind Next to `127.0.0.1` when running behind the tunnel.

### H4 — Self-update stashes and loses runtime data
**Verified.** `scripts/update-daemon.sh:203` runs `git stash` before `git pull`; there is no `git stash pop` anywhere. Files the app writes at runtime are tracked in git: `data/audio-mapping.json`, `data/export-models.*`, `public/uploads/display/display-background.{jpg,png}`, `display-logo.png`.
**Impact:** each UI-triggered update silently moves the operator's audio mappings and uploaded display images into a stash; the running site loses them. Rollbacks use `git reset --hard`, which has the same effect.
**Fix:** stop tracking runtime-written files (ship `*.example` defaults instead, created on first run); remove the stash, or abort the update when `git status --porcelain` is dirty and report it.

### H5 — CI has failed on every recent `master` push
**Verified** (GitHub Actions: runs #183–#187 all failed; locally `npm run lint` = 349 errors in 110 files).
- `npm run lint` fails at baseline, so CI is red regardless of the change.
- `test:ci` chains with `&&`; `test-jukebox-queue-transaction` fails (its fixture schema lacks `latitude`, added by migration 016), so the 5 tests after it never run.
- `.github/workflows/ci.yml` lists tests separately and omits `test-trivia-logic` and `test-csrf`.

**Fix:** fix the jukebox test fixture; make CI call `npm run test:ci`; either fix lint debt or temporarily lint only changed files / downgrade the noisiest rules to warnings, then ratchet.

---

## Medium

### M1 — Jukebox queue accepts any sequence name; fans out to FPP per request
**Verified.** `app/api/jukebox/queue/route.ts:30-50` validates characters only; `:131-179` then calls FPP `/api/schedule` and `/api/playlist/<name>` for every scheduled playlist, sequentially, on each public request. No check that the sequence is one the operator exposes.
**Impact:** visitors can queue hidden sequences; each request costs 1 + N HTTP calls to the FPP player (a Pi), unauthenticated.
**Fix:** validate against the poller's cached sequence/playlist tables (already in SQLite) and read `media_name` from the cache too.

### M2 — `process-queue` is unauthenticated and not atomic
**Verified.** `app/api/jukebox/process-queue/route.ts:294-339` has no auth (comment says it is public by design). In `IDLE` (`:182-213`) it reads state, picks the first pending item, `await`s an FPP insert, then writes `MONITORING_SEQUENCE`. Two concurrent calls can both see `IDLE` and both insert the same item.
**Fix:** claim the item atomically before calling FPP (`UPDATE queue_processor_state SET processing_state='MONITORING_SEQUENCE' ... WHERE processing_state='IDLE'`, proceed only if `changes === 1`); require admin or the internal key for HTTP callers. Also: `getInsertMode()` and the monitor path open a new DB connection on each call (`:70-77`, `:223-226`).

### M3 — Backups are torn copies of a live WAL database; no retention
**Verified.** `scripts/backup.js:27-42` copies `votes.db`, `-wal`, `-shm` as separate files while the app is running; `scripts/update-daemon.sh:149` copies only `votes.db` (no WAL — recent transactions are missing); `lib/migrations-runner.ts:21` same. No script deletes old backups.
**Impact:** backups may be stale or inconsistent exactly when they are needed (failed update); `backups/` grows until the SD card fills.
**Fix:** use better-sqlite3 `db.backup(dest)` or `VACUUM INTO`; keep the last N backups.

### M4 — PM2 starts the poller with `npx tsx`, which is not installed
**Verified.** `ecosystem.config.js:30-31` (`interpreter: 'npx'`, `interpreter_args: 'tsx'`); `tsx` is absent from `package.json`, the lock file and `node_modules/.bin`.
**Impact:** on a fresh/updated box npx downloads whatever `tsx` version is current at runtime (unpinned supply chain), or the poller fails to start offline.
**Fix:** use the existing `esbuild-register` (as `npm run poller:start` already does), or add `tsx` as a pinned devDependency.

### M5 — Two inconsistent sources of truth for "is admin"
**Verified.**
- ~30 routes check the JWT claim `session.user.role === 'admin'`; others call `requireAdmin()`, which re-reads `ADMIN_EMAILS` (`lib/auth-helpers.ts`).
- The JWT callback (`route.ts:78-80`) does not trim or lowercase `ADMIN_EMAILS`; the helpers do. `ADMIN_EMAILS="a@x.com, b@x.com"` makes `b` admin on helper routes only.
- The role is fixed at sign-in; sessions are rolling (30 min, refreshed on activity), so removing an admin from `ADMIN_EMAILS` doesn't revoke role-based routes while they stay active.
- `requireAdmin()` is marked `@deprecated` but is the most-used helper.

**Fix:** one helper used everywhere (normalised list, checked per request); drop role-claim checks from routes; remove the misleading deprecation or migrate to the rate-limited variant.

### M6 — Trivia: joining after a round ends deletes the joiner; dead grace period
**Verified** (code path traced; not reproduced against a running server).
- `app/api/trivia/join/route.ts` inserts the player, then calls `triggerPlayIfNeeded()`. In phase `ended`, that calls `resetToLobby()` (`lib/trivia-state.ts:329-331`), which deletes all `trivia_players` for the session — including the player just inserted. The client then fetches `/api/trivia/me`, gets `joined: false`, and shows the join form again. The first player after each round must join twice.
- `ANSWER_GRACE_MS` (`app/api/trivia/answer/route.ts`) never applies: the auto-reveal timer flips `phase` to `reveal` at exactly `questionEndsAt`, and the phase check runs first.
- Note: the first player to join an armed lobby starts the round for everyone (by design — confirm that's intended for a live show).

**Fix:** in the join route, reset before inserting (or re-insert after reset); move the reveal timer to `questionEndsAt + ANSWER_GRACE_MS`. Add both cases to `scripts/test-trivia-logic.ts` or a new test with a temp DB.

### M7 — Slideshow delete/upload overwrite images still in use
**Verified.** `app/api/display/upload/route.ts:52-57` names a new slideshow image `display-slideshow-${existing.length}.jpg`; the DELETE handler (`:109-111`) says "re-number files" but only filters the array. Images 0,1,2 → delete 0 → list is [1,2] → next upload is named `-2.jpg` and overwrites an image still in the list.
Also: SVGs are saved and served as-is (`:76-80`) — admin-only, but a stored-XSS vector given `script-src 'unsafe-inline'`.
**Fix:** unique filenames (timestamp/uuid); path containment check (see C2); rasterise or sanitise SVG, or drop SVG support.

### M8 — Route modules start never-ending 2 s polling loops
**Verified.** `app/api/audio/sync/route.ts:197-204` and `app/api/display/stream/route.ts:424` call `setInterval` at module scope. Once loaded, the web process polls FPP / the DB every 2 s forever, even with no SSE clients — on top of the dedicated `fpp-poller` process.
**Fix:** start polling on first client and stop on last; or read the poller's cached state instead of polling FPP again.

### M9 — Database layer
**Verified.**
- `lib/database.ts:155-161` swallows every `ALTER TABLE` error, not only "duplicate column" — a locked/busy DB at start-up silently leaves a column missing.
- Two schema mechanisms (import-time DDL in `lib/database.ts` + `migrations/*.sql` via `scripts/migrate-database.js`); duplicate migration number `013`.
- 38 `new Database(...)` opens across `app/` and `lib/`, many per request, several hard-coding `process.cwd()/votes.db` instead of honouring `VOTES_DB_PATH`.
- `app/api/analytics/track/route.ts:17` opens a connection with no `try/finally`; any thrown error leaks it.
- Found during C2: `lib/database.ts` cannot be imported against a brand-new empty database — it throws `no such table: settings` (line 554) and then `cached_sequences has no column named playlist_order` (line 796), because those come from `migrations/004` and `017`. Fresh installs work only because `npm run setup` runs first; any process that opens a new `VOTES_DB_PATH` crashes.

**Fix:** re-throw unless the error is "duplicate column name"; route all access through `getDb()`; move new schema only into `migrations/`.

### M10 — Privacy
**Verified.**
- `GET /api/location-restrictions` is public and returns `show_latitude` / `show_longitude` — exact show (likely home) coordinates. Distance is already computed server-side in votes/queue, so the client likely doesn't need them.
- `lib/visitor-tracking.ts:5` — IP-hash salt defaults to the constant `'fpp-jukebox-salt-2025'`, published in the repo; IPv4 hashes can be brute-forced back to IPs.
- Logs contain child names and parent emails (`santa/send-letter:28`, `santa/process-queue:60,68,80,91`) and every settings value (`lib/settings.ts:90,101`) — at odds with the "GDPR: hashed email" logging elsewhere.

**Fix:** stop returning coordinates publicly; require `IP_HASH_SALT` (generate in setup) and refuse the default in production; strip PII from logs.

---

## Low / hygiene

- **L1** — CSP defined twice with different content (`next.config.js` headers and `proxy.ts`); `connect-src` in `proxy.ts` hard-codes LAN IPs. Keep one.
- **L2** — `POST /api/analytics/track` has no rate limit, writes unbounded rows, accepts any `sessionId`, and makes an outbound geolocation call for each new (spoofable, see H3) IP.
- **L3** — `GET /api/version` runs `execSync('git rev-parse --short HEAD')` on every request (blocks the event loop); compute once.
- **L4** — Tracked junk: `Export Models.xlsx`, `build-log.txt`, `setup.sh.backup-20251127_063432`, `components/AudioSyncPlayer.tsx.backup`, root-level `check-db.js`, `test-*.js`, `run-migrations.js`.
- **L5** — Version drift: `package.json` 1.7.0, `lib/version.ts` 1.4.0, last commit message says v1.8.0.
- **L6** — Very large files: `app/settings/page.tsx` (2,283 lines), `app/media/page.tsx`, `app/jukebox/page.tsx` (~1,650 each), `lib/database.ts` (1,203); 271 `no-explicit-any` errors.
- **L7** — `@types/*` packages in `dependencies`; `eslint-config-next` pinned to 16.0.0 while `next` is `^16.0.7`.
- **L8** — Admin pages are only cosmetically gated (some use `AdminLayout` / `useSession`, `app/device-status` and `app/settings` rely on `proxy.ts`); acceptable because the APIs enforce auth, but keep it that way.

---

## What is in good shape

- SQL uses bound parameters everywhere checked; the only interpolations are constants, a whitelisted table name, or placeholder lists.
- No `dangerouslySetInnerHTML` anywhere in `app/`, `components/`, `lib/`.
- FPP proxies (`/api/fppd/*`, `/api/web/*`) are admin-only; file routes check for path traversal.
- Jukebox queue insert is transactional; `NEXTAUTH_SECRET` strength is validated at start-up; the poller has timeouts, signal handling and a circuit breaker.
- New trivia code is well typed and its scoring function is pure and tested.

---

## Suggested fix batches

Each batch goes through its own spec → implementation → review → preflight cycle.

1. **Repo data exposure** — C1 (owner decision first: real data? history rewrite?).
2. **Authorization gaps** — C2, H1, M2 (auth part), M5. Small diffs, biggest risk reduction.
3. **Dependency upgrades** — C3 (`next`, `next-auth` now; `jspdf` 4.x separately).
4. **Abuse controls** — H3 (trusted-proxy IP), then H2 (Santa moderation/opt-in), M1, L2.
5. **Ops safety** — H4, M3, M4.
6. **CI back to green** — H5.
7. **Correctness** — M6, M7, M8, M9.
8. **Privacy & hygiene** — M10, L1–L8.
