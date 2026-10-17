# CSRF Origin Check — Specification

Feature name: `csrf_origin_check`
Phase: 1 (Research & Specification)
Scope: replace the broken Origin/Referer/Host CSRF check in `proxy.ts` with a correct one.

## 1. Current state

`proxy.ts` (lines 10-90) rejects `POST|PUT|DELETE|PATCH` requests to `/api/*` (except `/api/auth/*`)
unless one of three conditions holds:

1. `isValidOrigin` — `Origin` equals an allowed origin **or starts with** `allowed.split(':').slice(0,-1).join(':')`
2. `isValidReferer` — `Referer` starts with that same stripped string
3. `isTrustedProxy` — the request's **`Host` header** is in `TRUSTED_DOMAINS`, or is a substring of an
   https `NEXTAUTH_URL`

Allowed origins = `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, plus (when `NEXTAUTH_URL` is not https, or in dev)
localhost, `http(s)://<Host>`, and any LAN-IP origin.

## 2. Problem (reproduced)

`scratchpad/repro-old-csrf.js` is a verbatim copy of the logic above, fed attacker requests:

| Config | Request | Old result |
|---|---|---|
| prod (`NEXTAUTH_URL=https://show.example.com`) | cross-site POST, `Origin: https://evil.com` | **ALLOWED** |
| prod | cross-site POST, `Origin: null` | **ALLOWED** |
| prod | cross-site POST, no Origin/Referer | **ALLOWED** |
| LAN (`NEXTAUTH_URL=http://192.168.1.50:3000`) | `Origin: http://localhost.evil.com` | **ALLOWED** |
| LAN | `Origin: https://evil.com` | blocked |

Root causes:

- **B1 — `Host`-based trust.** `Host` is the *target* of the request. A cross-site browser POST to the
  site always carries the site's own `Host`, so `isTrustedProxy` is true for every attacker request.
  This disables the check entirely whenever `NEXTAUTH_URL` is https or `TRUSTED_DOMAINS` is set —
  i.e. every production install made by `setup.sh`.
- **B2 — prefix matching on a mangled string.** `'https://show.example.com'.split(':').slice(0,-1).join(':')`
  is `'https'`, so `origin.startsWith('https')` is true for any https origin. For
  `http://localhost:3000` it yields `http://localhost`, which also matches `http://localhost.evil.com`.
- **B3** — `Origin: null` / missing headers are handled only by accident.

Mitigating (not sufficient): next-auth v4 session cookies are `SameSite=Lax` (`node_modules/next-auth/core/lib/cookie.js`,
and explicitly in `app/api/auth/[...nextauth]/route.ts` for production), which blocks classic cross-**site**
POSTs from other sites but not same-site/sibling-subdomain attacks, and not the unauthenticated public
write endpoints (votes, jukebox requests, Santa letters, trivia), which have no cookie to protect.

Only server-side callers found in the repo are GET requests (`lib/santa-queue-processor.ts`,
`lib/device-monitor.ts`, `app/api/santa/trigger-queue/route.ts`) — they are not subject to this check.

## 3. Research (sources)

1. OWASP CSRF Prevention Cheat Sheet — verify Origin by **exact origin match, never prefix**
   (`example.org.attacker.com` must not pass); never allowlist `null`; missing headers are not proof of
   same-origin; use `Sec-Fetch-Site` as the primary signal with Origin/Referer fallback; do not trust
   `X-Forwarded-Host` unless set by a trusted proxy.
   https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
2. MDN `Sec-Fetch-Site` — values `same-origin | same-site | cross-site | none`; forbidden header (JS cannot
   set it); widely available since March 2023; reject unaccepted requests with 403.
   https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site
3. MDN `Origin` — sent on all cross-origin requests and all same-origin non-GET/HEAD requests; may be the
   literal `null` (sandboxed iframe, data: URL, cross-origin redirect, some form posts); forbidden header.
   https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Origin
4. Go `net/http.CrossOriginProtection` (stdlib reference implementation) — safe methods allowed; cross-origin
   detected via `Sec-Fetch-Site` or by comparing the `Origin` **host** to the `Host` header; "requests
   without Sec-Fetch-Site or Origin headers are assumed to be either same-origin or non-browser requests,
   and are allowed"; explicit trusted-origin list for exceptions.
   https://pkg.go.dev/net/http#CrossOriginProtection
5. Next.js 16 `proxy.ts` docs — exported function `proxy`; defaults to the Node.js runtime (no `runtime`
   config); importing a shared pure module is fine.
   https://nextjs.org/docs/app/api-reference/file-conventions/proxy
6. next-auth v4.24 `options#cookies` — CSRF token cookie is `httpOnly`, `sameSite: lax`; the docs page does not
   state session-cookie defaults, so they were verified in the installed package source (4.24.14: `lax`).
   https://next-auth.js.org/configuration/options#cookies
7. Cloudflare Tunnel origin parameters — `httpHostHeader` defaults to empty (no override), so the origin sees the
   public hostname unless the operator overrides it; an override means `Host` ≠ public origin, which is why
   `NEXTAUTH_URL` / `TRUSTED_DOMAINS` allowlisting must remain.
   https://developers.cloudflare.com/tunnel/reference/origin-parameters/

No new dependencies. Versions in use: Next 16.2.6, next-auth 4.24.14.

## 4. Proposed solution

New pure module **`lib/csrf.ts`** (no imports; usable from `proxy.ts` and from a plain `esbuild-register` test):

```ts
export interface CsrfEnv { nextAuthUrl?: string; appUrl?: string; trustedDomains?: string }
export function isSameOriginRequest(headers: { get(name: string): string | null }, env: CsrfEnv): boolean
```

Decision order (modelled on Go's `CrossOriginProtection`, per OWASP guidance):

1. `Sec-Fetch-Site` is `same-origin` or `none` → **allow**. (`none` = user-initiated; browser-set, unforgeable.)
2. Take `Origin`; if absent, take the origin of `Referer`.
3. If neither Origin nor Referer exists:
   - and `Sec-Fetch-Site` is absent → **allow** (not a browser; a CSRF attack needs a browser, and every
     browser sends `Origin` on cross-origin and on same-origin non-GET requests — MDN #3).
   - and `Sec-Fetch-Site` is `same-site`/`cross-site` → **reject**.
4. Parse the value with `new URL()`; unparseable (including the literal `null`) or non-`http(s)` → **reject**.
5. Allow if the parsed origin's `host` **exactly equals**:
   - the request `Host` header (same-origin; covers localhost and LAN-IP access with no special-casing), or
   - the host of `NEXTAUTH_URL` or `NEXT_PUBLIC_APP_URL` (exact host:port equality, scheme ignored — see Risks), or
   - an entry of `TRUSTED_DOMAINS` (comma-separated hostnames, as `setup.sh` writes them).
6. Otherwise **reject**.

Behaviour removed on purpose: Host-only trust (B1), `startsWith` matching (B2), the dev/LAN regex special
cases (redundant with step 5 Host-equality), and `X-Forwarded-Host` (never trusted — OWASP #1).

`proxy.ts` keeps: the method filter, the `/api/auth/` exemption, the 403 JSON body, the `[SECURITY] CSRF
detected` warning (plus `sec-fetch-site` in the log, minus the long allowed-origins list), the admin page gate,
and all security headers. Only the allow/deny computation is replaced by one call to `isSameOriginRequest`.

Behaviour change to be aware of: non-browser clients that POST **without** Origin/Referer previously worked in
production by accident (via B1) and still do; non-browser clients that send a *foreign* Origin are now rejected
as intended.

## 5. Implementation steps

1. Create `lib/csrf.ts` as specified.
2. Edit `proxy.ts`: import `isSameOriginRequest` from `./lib/csrf`; replace lines 16-88's origin computation with the call;
   keep the log and 403 response.
3. Create `scripts/test-csrf.ts` (assert-based, same style as `scripts/test-trivia-logic.ts`) covering the
   reproduction table above plus legitimate cases: prod same-origin with/without Sec-Fetch-Site, LAN IP access,
   localhost dev, `TRUSTED_DOMAINS` origin, Referer fallback, missing-everything (allow), `Origin: null`,
   `Sec-Fetch-Site: same-site`/`cross-site` (reject), `localhost.evil.com`, `show.example.com.evil.com`,
   `http://show.example.com` (scheme differs but host equal → allowed; documented).
4. Append `&& node -r esbuild-register scripts/test-csrf.ts` to `test:ci` in `package.json`.
5. Docs: update the `TRUSTED_DOMAINS` comment in `setup.sh` (host list matched against the browser's `Origin`, not `Host`)
   — comment-only, keep LF endings. Add a `CHANGELOG.md` "Security" line only if the user asks for a release.

## 6. Validation commands (Phases 3 / 5 / 6 — from CLAUDE.md Commands table only)

- `npx tsc --noEmit`
- `npx eslint proxy.ts lib/csrf.ts` (compare `proxy.ts` to baseline)
- `node -r esbuild-register scripts/test-csrf.ts` and each existing `scripts/test-*.ts` individually
- `npm run build`

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Legit admin/public UI POSTs start failing (e.g. host mismatch behind a reverse proxy that rewrites `Host`) | `NEXTAUTH_URL` / `TRUSTED_DOMAINS` allowlist still applies; Sec-Fetch-Site `same-origin` short-circuits for all modern browsers regardless of `Host` |
| Tunnel configured with `httpHostHeader` override and `TRUSTED_DOMAINS` empty | `NEXTAUTH_URL` host is allowlisted; `setup.sh` sets both |
| Allowing "no Origin, no Referer, no Sec-Fetch-Site" | Matches Go stdlib; unreachable for browsers; auth/rate limits unchanged. Documented deviation from OWASP's stricter "reject" wording |
| Scheme-insensitive host match (`http://` Origin accepted for an https site) | Requires an on-path attacker who could already do worse; matches Go's behaviour; covered by a test |
| Breaking the auto-update on the live box | No schema/migration/env change; pure TS; build + tests gate it |

## 8. Out of scope (noted, not changed)

- State-changing **GET** endpoints (e.g. `/api/santa/trigger-queue`, `/api/santa/process-queue`) are not covered by
  any CSRF check; admin ones rely on `SameSite=Lax`. Worth a separate review.
- `requireAdmin()` is marked deprecated in favour of `requireAdminWithRateLimit()` but is still used widely.
- The CSP in `proxy.ts` hard-codes LAN hosts.
