# FPP 10 Upgrade Plan

Status: **plan only, nothing implemented.** Tier 3 work waits for approval.
Target: FPP 10.3 (released 21 Oct 2026). Sources: the FPP 10.0, 10.1, 10.2 and 10.3 release notes on GitHub (`FalconChristmas/fpp`).

## Assumptions

- Code review done 2 Nov 2026: `lib/fpp-poller.ts`, `lib/fpp-sync.ts`, `lib/fpp-config.ts`, `lib/jukebox-queue-processor.ts`, the refresh-cache route, the `/api/fppd` and `/api/web` proxies and every FPP caller in `app/`, `lib/` and `components/` were read. Findings are folded into the parts below.
- The only browser caller of `/api/fppd/*` is `status` (home page and playlist controls). The only browser caller of `/api/web/*` is the volume control.
- The 10.x status JSON field names and the `/fppdws` message format are not verified.
- The player has not been upgraded yet (still 9.x), so nothing can be tested against 10.x yet.
- Code changes must work on both 9.x and 10.x, because a rollback is possible and FPP 11 is still ahead.
- The 10.3 "Deprecations & Behavior Changes" notes were only read through a summary. Re-read them word for word before Part A step 3.

## Why the upgrade should not break this app

- All FPP calls are server-to-server: the poller, the queue processor and the API routes. The new 10.3 rule that blocks other websites from reading or changing the API only affects browsers.
- The browser only talks to this app's own `/api/*` routes. The only `/api/fppd/*` caller is `status`.
- The queue processor already POSTs to `/api/command`.
- The release notes name no removed or renamed endpoints for the ones we use. They are not a full API list.

## Biggest risks found in the code review

These two could cause a visible outage on the day of the upgrade, so they are Part A steps 1 and 2.

1. **The poller rejects any status name it does not know.** `validateFPPStatus` in `lib/fpp-poller.ts` accepts only `idle`, `playing`, `stopped`, `testing` and `unknown`. Any other `status_name` throws the whole poll away, which counts as a failure, and repeated failures open the circuit breaker and show FPP as offline. 10.1's "media playing outside a playlist" could trigger it, and FPP 9's "stopping gracefully" statuses may already (not verified).
2. **A partial sync silently drops a playlist.** In `lib/fpp-sync.ts` and `app/api/jukebox/refresh-cache/route.ts` a playlist that fails to load is skipped with a log line, then the caches are cleared and rewritten without it. In `fpp-sync.ts` a non-list reply from `/api/playlists` is treated as an empty list and wipes everything. Stricter 404 and 400 answers on 10.x make this more likely.

## Part A: Harden for FPP 10.3 (Tier 2, one commit)

**Goal:** Nothing in this app breaks after the upgrade, and nothing relies on behaviour 10.3 deprecated.

1. **Accept unknown poller statuses.** In `lib/fpp-poller.ts` stop rejecting a poll because of an unfamiliar `status_name`. Keep the numeric checks (volume range, `seconds_played`), store any status string as received (length-limited by the existing `sanitizeString`), and log a one-time warning for a name not seen before. Do this first: it is independent of the new fixtures and is safe on 9.x.
   - Verify: new fixture-style test (extract the validator so it can be tested without starting the poller) with `idle`, `playing`, an unknown name, a bad volume and a missing field.
2. **Never wipe a cache on a partial failure.** In `lib/fpp-sync.ts` and `app/api/jukebox/refresh-cache/route.ts`: if the playlist list is not a list, or any listed playlist fails to load (404, 400, timeout), keep the old cache and return the error instead of writing a partial result. A 200 with a genuinely empty list is a valid empty result. Check what `syncJukeboxPlaylists` (`lib/jukebox-playlists.ts`) does with a playlist that has no details, and make it keep that playlist's stored songs.
   - Verify: tests with mocked FPP responses (404, 400, timeout, non-array, 200 with an empty list) asserting the cache is not cleared on errors and is replaced on a clean read.
3. **Capture a baseline.** After the upgrade, one read-only GET of `/api/fppd/status` and `/api/system/status`, plus a 9.x sample if available. Save as fixtures under `scripts/fixtures/` with host and IP values scrubbed.
   - Verify: fixtures exist and parse.
4. **Proxy allowlists.** Restrict `app/api/fppd/[...slug]/route.ts` to the paths the app uses (`status` for GET, plus whatever POSTs the admin UI needs, found by grep) and `app/api/web/[...slug]/route.ts`, which today forwards any `/api/*` path to FPP, to what the volume control needs. Keep `requireAdmin()`. Anything else gets 404 or 403.
   - Verify: new `scripts/test-fppd-proxy.ts` (mocked auth and fetch) covering both proxies: allowed paths forward, unlisted paths are refused, non-admins get 401.
5. **"Is something playing" checks.** 10.1 reports media playing outside a playlist instead of "idle". Check every place that decides this against the new fixtures: `lib/jukebox-queue-processor.ts`, `lib/jukebox-queue.ts`, `lib/fpp-state.ts` (`isFreshPlaying`), `app/api/audio/sync/route.ts`, `app/api/jukebox/status/route.ts`, `app/api/display/stream/route.ts`, `app/page.tsx` and `components/PlaylistControls.tsx`.
   - Verify: fixture-driven tests for both status shapes for the `lib/` checks; a read-through for the components.
6. **Command names.** The queue processor depends on the FPP commands "Insert Playlist After Current" and "Insert Playlist Immediate" (`getFppCommand`), and `app/api/fpp/command/route.ts` allows a fixed list of commands. Confirm each still exists in 10.x (FPP's command list in the upgraded player, read-only) and note any rename.
   - Verify: a checked list in the commit message.
7. **Secrets check.** Done in the 2 Nov review: nothing in `app/`, `lib/` or `components/` reads FPP's `/api/settings`, `/api/configfile`, plugin, backup or network endpoints. Re-run the grep before the commit and note the result in the commit message.
8. **Docs.** Add an "FPP 10 compatibility" section to `README.md` and `docs/INSTALLATION.md`: Debian 13 (Trixie), the 64-bit re-image requirement, plugins needing reinstall, and the "Let other websites read the API" setting (not needed by this app).
   - Verify: read-through.

**Docs consulted:** FPP 10.0–10.3 release notes (GitHub).
**Out of scope:** polling interval, new FPP calls.
**Final gate:** `npm run preflight`, exit 0.

## Part A2: Public-release hardening found in the review (Tier 2, separate commits)

Not caused by FPP 10, but each one bites a second install or a bigger show. Independent of Part A, in this order:

1. **Configurable FPP address.** `ALLOWED_FPP_HOSTS` in `lib/fpp-config.ts` is hard-coded to `fpp.local` and `192.168.5.2`, so any other install (or a changed IP) is refused with "not whitelisted". Read the allowed hosts from an env var (default: the host of `FPP_URL`), keep the SSRF checks, and document the variable in `README.md` and `docs/INSTALLATION.md`.
   - Verify: extend the existing config test or add `scripts/test-fpp-config.ts`: host from `FPP_URL` allowed, other hosts refused, localhost and metadata hosts still blocked.
2. **One way to read the FPP address.** Replace the direct `process.env.FPP_URL || 'http://fpp.local'` reads with `getFppUrl()`: `app/api/fpp/health`, `command`, `playlists/list`, `playlists/[name]`, `sequences/list`, `media/list`, `media/download`, and `app/api/jukebox/schedule-status`. They skip the allowlist today.
   - Verify: grep shows no remaining direct reads outside `lib/fpp-config.ts` and the poller; test-api-auth and existing tests pass.
3. **Poll log retention.** Nothing deletes old rows from `fpp_poll_log` (about 8,600 a day). Delete rows older than a set age (for example 30 days) from the poller, in the same place that already trims `fpp_status_cache`.
   - Verify: a test with seeded old and new rows.
4. **Rate limits on the public FPP routes.** `fpp/health`, `playlists/list`, `playlists/[name]`, `sequences/list` and `cached-status` are public on purpose (see `scripts/test-api-auth.ts`) but each request calls FPP. Serve them from the cached state where the data is already stored, or add IP rate limiting (`lib/rate-limit.ts`).
   - Verify: tests for the limit; no change to the public route list.
5. **Log noise.** Remove the "Sample playlist" and "Sample sequence" dumps in `lib/fpp-sync.ts`.

## FPP 10 conflict summary

| Area | Conflict | Where it is handled |
|---|---|---|
| Poller status check | Unknown `status_name` rejects the poll | Part A step 1 |
| Sync caches | Partial failure wipes data | Part A step 2 |
| Proxies | `/api/web` forwards any path | Part A step 4 |
| Playing checks | Eight places read `status_name` | Part A step 5 |
| FPP commands | Names not checked on 10.x | Part A step 6 |
| FPP address | Hard-coded allowlist | Part A2 step 1 |

## Part B: WebSocket status client for the poller (Tier 3)

**Goal:** Now-playing, queue handoff and the TV sign react within about a second of an FPP change, with polling kept as the fallback.

### Research first (the plan is not final until this is done)

- The `/fppdws` endpoint: URL, message framing, frame rate, what `quiet=1` filters, whether authentication is needed.
- Whether 9.x has the endpoint. If not, detect that and stay on polling.
- Node 24's built-in `WebSocket` versus a library. Prefer the built-in so no dependency is added (Node 22 and 24 must both work).
- **Docs consulted:** none yet. This is the first research step, and the plan comes back for approval with exact sources named.

### Design

- **Who reads FPP status.** Today four places fetch `/api/fppd/status` themselves instead of reading the poller's database copy: the queue processor (`lib/jukebox-queue-processor.ts`), the display stream (`app/api/display/stream/route.ts`), `app/api/jukebox/status/route.ts` and `app/api/audio/sync/route.ts`. A WebSocket in the poller alone would not speed them up, and they add load on the Pi. Step 0 below moves them to the poller's data first.
- The poller writes the same SQLite fields the 10-second poll writes. No schema change, no route changes, pages untouched.
- One shared "apply status" function used by both the WebSocket path and the poll path, so parsing is not duplicated.
- Reconnect with capped exponential backoff, plus a stall timer: if no frame arrives within N seconds, close and reconnect.
- Polling drops to a slow safety net (about 30–60 s) while the socket is healthy, and returns to 10 s as soon as it is not.
- Host comes from `getFppUrl()`, never from request input.
- Only the `fpp-poller` PM2 process changes; the app server is untouched.

### Steps

0. Make the four direct readers above use the status the poller stores (with a short-lived live fetch only as a fallback when that data is stale), so one component talks to FPP for status. Include the display stream's per-viewer call.
   - Verify: tests for each reader with fresh and stale stored state; the display stream and jukebox status keep their current output.
1. Extract the shared status parser from the poll path with no behaviour change.
   - Verify: existing tests plus a new fixture test pass before and after.
2. Write the WebSocket client behind an injectable socket factory so tests need no network.
   - Verify: new `scripts/test-fpp-ws.ts` covering a normal frame, a malformed frame, a stall, a disconnect with reconnect, and fallback to polling.
3. Wire it into the poller's main loop.
   - Verify: `npx tsc --noEmit`, `npx eslint` on touched files compared with the baseline, test runs with fakes.
4. Append the new test to `test:ci` in `package.json`.
5. Independent review by the `reviewer` agent, given this plan and the changed files. Fix every finding, re-run checks and review. After 3 failed fix cycles, stop and report.
6. `npm run preflight`, exit 0.
7. Real-player check (done by the user): run the poller against the upgraded player and watch a song change land. `npm run poller:*` is on the forbidden list, so the assistant does not run it.

### Risks and rollback

- A WebSocket frame arrives out of order with a poll result. Mitigation: only apply a result with a newer timestamp or sequence, if FPP provides one.
- FPP restarts mid-song.
- 9.x has no endpoint.
- Rollback: a single setting that forces polling only (name decided during planning, documented in `README.md`).

## Part C: Audio streaming spike (Tier 3 research, no feature code)

**Goal:** Learn whether FPP's network audio can reach visitor phones with acceptable delay and CPU, before designing a feature.

**Open question:** is the aim visitor phones, or something else (outdoor speaker, FM transmitter, second room)? The answer changes the design. AES67 or Opus fit the second kind and need no browser work.

### What FPP 10 offers

| Feature | Arrived | Direction | Browser can play it? |
|---|---|---|---|
| AES67 | 10.0 | Output: multicast RTP, L24 48 kHz, found via SAP | No, needs a pro-audio receiver |
| Opus RTP | 10.0 | Output: unicast or multicast | Not verified, probably needs a relay |
| RTSP | 10.1 | Video output with audio, as an `rtsp://` URL | No |
| VBAN | 10.2 | Receive only | Not applicable |

No Icecast, HTTP, MP3, WebRTC or "stream to browser" option was found. The audio engine is PipeWire plus GStreamer, built into FPP 10 (not a separate plugin).

Verified REST endpoints (from docs that predate 10.0): `POST /api/pipewire/audio/groups/apply`, `GET/POST /api/pipewire/video/groups`, `/video/input-sources`, `/video/routing`. Request and response shapes are not documented. The audio design doc names a pre-release branch (`gstreamer-media-experiment`), so master may differ.

### Steps

1. Read FPP's in-app help for Opus RTP, RTSP output and the AES67 SDP endpoints, plus `docs/Plugin_Development.md` and the clock-sync doc.
   - Verify: quoted excerpts with sources, and a list of what stays unverified.
2. Check whether any HTTP, Icecast or WebRTC bridge exists in FPP.
3. Throwaway proof of concept on a non-production machine, not the show VM: FPP stream, then a relay (ffmpeg or GStreamer), then HLS or WebRTC, played in a browser.
   - Verify: measured delay and CPU use on both Pi and VM.
4. Short report with a go/no-go. If go, a full Tier 3 plan covering the relay service, `proxy.ts` CSP changes, rate limits, listener caps, and how it sits beside the drift-sync player (`components/AudioSyncPlayer.tsx`).

### Guardrails

- Step 3 changes FPP audio config and starts a service, so it needs explicit go-ahead. No POSTs to the live player.
- HLS adds roughly 2–10 s of delay, so it could not replace drift-sync. It could only be a "listen live" extra.

## Part D: Optional extras (Tier 2 each, separate commits)

- Admin buttons for SetPlaylistRepeat and Restart FPPD (10.2): `requireAdminWithRateLimit`, a confirm dialog, POST only. They call the live player, so build and unit-test with mocks and test live by hand.
- Show 10.2's invalid-playlist flags in the playlist sync UI.
- Read-only audio outputs status panel from `/api/pipewire/*`. Not worth doing until request and response shapes are known.

## Order

1. Part A steps 1, 2 and 4: they need no FPP 10 sample and are safe on 9.x, so do them before the upgrade.
2. Upgrade FPP and capture a status sample (or approve a read-only GET).
3. Part A steps 3, 5, 6, 7 and 8, using the sample.
4. Part A2 (any time; step 1 before any public release).
5. Part B research, approval of the final plan, then build (step 0 first).
6. Part C once the goal question is answered.
7. Part D if wanted.

Parts A and B are independent and can be approved in either order.
