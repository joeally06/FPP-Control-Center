# C2 — Settings API Admin-Only + Upload Delete Containment — Review (Phase 3)

Spec: `.github/docs/subagent_docs/c2_settings_admin_auth_spec.md`
Result: **PASS** (no CRITICAL issues; no refinement cycle needed)

## Files changed

- `app/api/settings/route.ts` — `GET` and `PUT` now call `requireAdminWithRateLimit(request)` first (401 on failure); unused `getServerSession` / `authOptions` imports removed; handler bodies unchanged.
- `app/api/display/upload/route.ts` — DELETE resolves the stored slideshow path and unlinks only inside `public/uploads/display/`; otherwise logs a warning and still removes the entry from the list.
- `git diff --stat`: 2 files, +22 / −17. Line endings preserved (settings LF; upload route CRLF as before, normalized by `.gitattributes` on commit).

## Validation (verbatim)

Harness `scratchpad/c2-harness.ts` (throwaway; real handlers, stubbed `getServerSession`, temp dir + temp DB with schema copied read-only from `votes.db`):

| Case | Before | After |
|---|---|---|
| GET anonymous | 401 | 401 |
| GET non-admin | **200** | 401 |
| PUT non-admin `{site_name:'pwned'}` | **200, value changed** | 401, value unchanged |
| GET / PUT admin | 200 / 200, value updated | 200 / 200, value updated |
| admin DELETE, entry `"/../sentinel.txt"` | 200, **sentinel deleted** | 200, sentinel kept, entry removed from list |
| admin DELETE, legit entry | file deleted | file deleted |
| non-admin DELETE | 401 | 401 |

After: **13/13 PASS**, exit 0.

Gate: `npx tsc --noEmit` exit 0 · `npx eslint app/api/settings/route.ts app/api/display/upload/route.ts` exit 0 (baseline also 0) · `test-csrf`, `test-email-retries`, `test-email-retries-auth-fail`, `test-request-status`, `test-time-utils`, `test-migrations`, `test-trivia-logic` exit 0 · `test-jukebox-queue-transaction` exit 3 (documented baseline) · `npm run build` exit 0.

## Review against criteria

1. **Spec compliance** — exactly §4.1 and §4.2; allowlist intentionally omitted as documented.
2. **Consistency** — same helper + 401 shape as `app/api/trivia/*`; auth check in its own `try` before the existing one, as in `app/api/fppd/[...slug]/route.ts`.
3. **Security** — closes the any-Google-account read/write; containment uses `path.resolve` + `UPLOAD_DIR + sep` prefix (canonicalize-then-check, OWASP); `existing[idx]` is only read after the index bounds check already present.
4. **Functionality** — the only caller (`app/settings/page.tsx`) is the admin page; admin flows unchanged in the harness.
5. **Performance** — one extra `ADMIN_EMAILS` parse + in-memory rate-limit bookkeeping per call; negligible.
6. **Deployability** — no schema, env, or dependency change.

## Observations (non-blocking)

- The helper's rate-limit failure also returns 401 (same as trivia routes) rather than 429 — consistent, slightly imprecise; fold into M5 when admin checks are unified.
- New finding recorded under M9: `lib/database.ts` crashes on import against a brand-new empty DB (`no such table: settings`, then `no column named playlist_order`) — fresh installs depend on `npm run setup` running first.
- A malformed (non-string) entry in `display_slideshow_images` would still 500 the DELETE — admin-only data now; left as is.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A+ |
| Best Practices | 96% | A |
| Functionality | 100% | A+ |
| Code Quality | 97% | A+ |
| Security | 97% | A+ |
| Performance | 100% | A+ |
| Consistency | 98% | A+ |
| Build Success | 100% | A+ |

**Overall Grade: A+ (98%)** — **PASS**
