# C2 — Settings API Admin-Only + Upload Delete Containment — Specification

Feature name: `c2_settings_admin_auth`
Source finding: `full_code_review.md` → C2

## 1. Current state (verified)

- `app/api/auth/[...nextauth]/route.ts:72` — `signIn` returns `true` for every Google account.
- `app/api/settings/route.ts` — `GET` (lines 13-16) and `PUT` (lines 45-48) check only `if (!session)`. No admin check.
- `lib/settings.ts:88-113` — `updateSettings` updates existing keys and inserts any new key.
- `app/api/display/upload/route.ts:104-107` (DELETE) — `unlink(join(process.cwd(), 'public', existing[idx].replace(/^\//, '')))` where `existing` is the JSON in setting `display_slideshow_images`. No check that the path stays inside the upload folder.
- Only caller of `/api/settings`: `app/settings/page.tsx` (lines 351, 377, 1523, 1637) — the admin settings page. No public page reads it.
- House pattern for admin routes: `requireAdminWithRateLimit(request)` (`lib/auth-helpers.ts`, re-checks `ADMIN_EMAILS`, rate-limits 100 req/min) with a 401 on failure, e.g. `app/api/trivia/questions/route.ts`. `requireAdmin()` is marked `@deprecated` in favour of it.

## 2. Problem (reproduced)

Throwaway harness `scratchpad/c2-harness.ts` runs the **real** route handlers with a stubbed `getServerSession`, in a temp working dir with a temp SQLite DB (schema copied read-only from `votes.db`, no rows):

| Case | Before |
|---|---|
| `GET /api/settings`, anonymous | 401 ✔ |
| `GET /api/settings`, signed-in non-admin Google user | **200** ✘ |
| `PUT /api/settings` `{site_name:'pwned'}`, non-admin | **200, `site_name` = `pwned`** ✘ |
| admin GET / PUT | 200 ✔ |
| admin `DELETE /api/display/upload?slot=slideshow&index=0` with entry `"/../sentinel.txt"` | **200, file outside `public/uploads/display/` deleted** ✘ |
| admin DELETE of a legit entry | file deleted ✔ |
| non-admin DELETE | 401 ✔ |

Chain: any Google user writes `display_slideshow_images = ["/../../votes.db"]` → the admin's next slideshow delete unlinks the live database.

## 3. Research

No new dependency; this copies the in-repo pattern (`requireAdminWithRateLimit`), so CLAUDE.md does not require external docs. Two references for the containment check:
1. Node.js `path.resolve` / `path.sep` — `resolve` returns a normalized absolute path (collapses `..`), so a prefix check on `UPLOAD_DIR + sep` is a correct containment test. https://nodejs.org/api/path.html#pathresolvepaths
2. OWASP Path Traversal — canonicalize, then verify the result is under the intended base directory. https://owasp.org/www-community/attacks/Path_Traversal

## 4. Solution

1. **`app/api/settings/route.ts`** — in both `GET` and `PUT`, replace the `getServerSession` / `!session` block with:
   ```ts
   try {
     await requireAdminWithRateLimit(request);
   } catch (error) {
     return NextResponse.json({ error: toErrorMessage(error, 'Unauthorized') }, { status: 401 });
   }
   ```
   Remove the now-unused `getServerSession` and `authOptions` imports. Everything else in the handlers is unchanged. 401 for all helper failures (including its rate-limit error) matches the trivia admin routes.
2. **`app/api/display/upload/route.ts`** DELETE — resolve the stored path and only unlink when it is inside `UPLOAD_DIR`:
   ```ts
   const filePath = resolve(process.cwd(), 'public', existing[idx].replace(/^\//, ''));
   if (filePath.startsWith(UPLOAD_DIR + sep)) {
     try { await unlink(filePath); } catch { /* file already gone */ }
   } else {
     console.warn('[Display Upload] Refusing to delete path outside upload dir:', existing[idx]);
   }
   ```
   The entry is still removed from the list either way (so a bad entry can be cleaned up from the UI).

**Deliberately not done — key allowlist on PUT.** Once PUT is admin-only the attack is closed; an allowlist would have to be kept in sync with every form in `app/settings/page.tsx` (2,283 lines) and the display settings, and a missed key would silently stop that setting saving. Recommend revisiting only if non-admin writers ever exist.

Out of scope (own items): slideshow renumbering/overwrite bug (M7), SVG upload sanitising (M7), unifying admin checks (M5), fresh-DB import crash (new observation, §7).

## 5. Implementation steps

1. Edit `app/api/settings/route.ts` as §4.1.
2. Edit `app/api/display/upload/route.ts` as §4.2 (`import { join, resolve, sep } from 'path'`).
3. Re-run the harness — every row must PASS.

## 6. Validation (Phases 3/5/6)

- Harness (throwaway, not committed): all 13 rows PASS.
- `npx tsc --noEmit`; `npx eslint app/api/settings/route.ts app/api/display/upload/route.ts` (no new errors vs. baseline); each `scripts/test-*.ts`; `npm run build`.

No committed test: route-level tests need the next-auth stub + alias hooks used by the harness, which is heavier than this two-file fix warrants; the harness is recorded in the review.

## 7. Risks and observations

| Risk | Mitigation |
|---|---|
| Admin settings page breaks for an admin whose JWT `role` passes the `/settings` page gate but `ADMIN_EMAILS` check fails | The helper trims + lowercases `ADMIN_EMAILS`, the JWT callback does not — so anyone passing the page gate also passes the helper |
| Settings page now hits the 100 req/min admin rate limit | Page makes 2–4 calls per load/save; far below the limit |
| Legit slideshow entries rejected by containment | Entries are always written as `/uploads/display/<file>` by the POST handler; harness confirms legit delete still works |

**New observation (not fixed here):** `lib/database.ts` cannot be imported against a brand-new empty database — it fails with `no such table: settings` (line 554) and then `cached_sequences has no column named playlist_order` (line 796), because those come from `migrations/004` and `017`. A fresh install only works because `npm run setup` runs first. Worth adding to `full_code_review.md` (M9).
