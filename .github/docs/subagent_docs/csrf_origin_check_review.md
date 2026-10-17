# CSRF Origin Check — Review (Phase 3)

Spec: `.github/docs/subagent_docs/csrf_origin_check_spec.md`
Result: **PASS** (no CRITICAL issues; no refinement cycle needed)

## Files reviewed

- `lib/csrf.ts` (new)
- `proxy.ts` (CSRF block replaced by one call; rest unchanged — `git diff --stat`: +10 / −58)
- `scripts/test-csrf.ts` (new)
- `package.json` (`test:ci` gains one command)
- `setup.sh` (one comment line, LF preserved)
- `.github/docs/subagent_docs/csrf_origin_check_spec.md` (one wording fix made during implementation: "full-origin" → "host:port equality")

## Validation (verbatim results)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint proxy.ts lib/csrf.ts` | exit 0, no output (no new errors; the two files are clean) |
| `node -r esbuild-register scripts/test-csrf.ts` | exit 0, "All tests passed." (8 groups, 28 assertions) |
| `test-email-retries`, `test-email-retries-auth-fail`, `test-request-status`, `test-time-utils`, `test-migrations`, `test-trivia-logic` | all exit 0 |
| `test-jukebox-queue-transaction` | exit 3 — **pre-existing baseline failure** (`table jukebox_queue has no column named latitude`), unrelated to this change |
| `npm run build` | exit 0 |
| Real `proxy()` driven with constructed `NextRequest`s (throwaway script, not committed) | 7/7 as expected: evil-origin POST, `Origin: null` POST, cross-site/no-Origin POST and evil-origin DELETE → **403**; same-origin POST, `/api/auth/*` exemption, and safe-method GET → **200** |

Reproduction before the fix (`scratchpad/repro-old-csrf.js`): 4 of 5 attacker requests were ALLOWED by the old logic.
After the fix the same requests are rejected (Test 1 in `scripts/test-csrf.ts`, plus the real-`proxy()` run above).

## Review against criteria

1. **Specification compliance** — implemented exactly per spec §4/§5. Decision order, removed behaviours, and kept behaviours (log, 403 body, method filter, `/api/auth/` exemption, admin gate, headers) all match.
2. **Best practices** — exact host comparison via `URL` parsing instead of string prefixes; `Origin: null` and malformed values fail closed; `Sec-Fetch-Site` used as primary signal with Origin/Referer fallback (OWASP); `X-Forwarded-Host` deliberately not trusted.
3. **Consistency** — pure `lib/` module with no imports, test script in the `scripts/test-*.ts` assert style, wired into `test:ci`. Relative import in `proxy.ts` (root-level file).
4. **Security** — fixes root causes B1 (Host-only trust), B2 (mangled prefix match), B3 (null/missing handling). No new secrets or env vars; log line no longer prints the allowed-origins list and now includes `sec-fetch-site`.
5. **Performance** — a handful of string operations and one `URL` parse per mutating request; a `Set` is built per call (≤ a few entries). Negligible.
6. **Deployability** — no schema, migration, or env change; pure TS; Node 20/22 safe (`URL`, `Set`); build passes. Existing installs keep working because `NEXTAUTH_URL` / `TRUSTED_DOMAINS` remain honoured and same-origin browsers are matched via `Sec-Fetch-Site`/`Host`.
7. **API currency** — uses Next 16 `proxy` export and Node runtime as documented; no deprecated patterns.

## Observations (non-blocking, no action taken)

- **Deliberate deviation from OWASP's strictest wording:** requests with *no* Origin, Referer, or Sec-Fetch-Site are allowed (as Go's stdlib does). Browsers always send at least one of these on state-changing requests, so this only admits non-browser clients, which cannot ride a victim's cookies. If the operator prefers fail-closed, change `return !fetchSite` to `return false` in `lib/csrf.ts` and `Test 6` — at the cost of breaking curl/script POSTs.
- **Scheme is not compared** (`http://` Origin accepted for an https host). Documented in the spec and covered by Test 8.
- `Host` is compared lower-cased as-is; browsers omit default ports so this matches. A non-browser sending `Host: x:443` would simply not get the same-host shortcut (it falls back to the allowlist or, lacking an Origin, is allowed as non-browser).
- The `ip` log field still trusts `x-forwarded-for` when `cf-connecting-ip` is absent — pre-existing, log-only.
- Out of scope (see spec §8): state-changing GET endpoints are not covered by any CSRF check.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A+ |
| Best Practices | 96% | A |
| Functionality | 98% | A+ |
| Code Quality | 96% | A |
| Security | 95% | A |
| Performance | 100% | A+ |
| Consistency | 97% | A+ |
| Build Success | 100% | A+ |

**Overall Grade: A (98%)**

**PASS** — proceed to Phase 6 (Preflight).
