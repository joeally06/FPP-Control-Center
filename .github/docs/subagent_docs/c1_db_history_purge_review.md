# C1 — Purge Database Files from Git History — Review (Phase 3)

Spec: `.github/docs/subagent_docs/c1_db_history_purge_spec.md`
Result: **PASS** for the repository change. The history purge itself is owner-run (runbook §5) and is verified by the owner with the B4 / D checks.

## Files changed by Claude

- `.gitignore` — one line: `*.db.backup` → `*.db.backup*` (CRLF line endings preserved; `git diff --stat`: 1 insertion, 1 deletion)
- `.github/docs/subagent_docs/c1_db_history_purge_spec.md` (new)
- `.github/docs/subagent_docs/c1_db_history_purge_review.md` (new, this file)
- `.github/docs/subagent_docs/full_code_review.md` — C1 status line updated

## Validation (verbatim results)

`git check-ignore --no-index -v`:

| Path | Result |
|---|---|
| `votes.db` | ignored (`.gitignore:45 votes.db`) |
| `votes.db-wal` | ignored (`:47 *.db-wal`) |
| `votes.db-shm` | ignored (`:46 *.db-shm`) |
| `votes.db.backup-before-migration-011` | **ignored (`:51 *.db.backup*`)** — previously not ignored |
| `votes.db.backup-before-migration-012` (hypothetical future name) | ignored (`:51`) |
| `backups/2025-10-31_01-39-23/votes.db-wal` | ignored (`:54 backups/`) |
| `scripts/backup.js`, `lib/database.ts`, `migrations/018_trivia.sql` | not ignored ✔ |
| `components/AudioSyncPlayer.tsx.backup` | not ignored (unchanged; it is L4 junk, out of scope) |

Phase 6 gate: `npx tsc --noEmit` exit 0; `test-csrf`, `test-email-retries`, `test-email-retries-auth-fail`, `test-request-status`, `test-time-utils`, `test-migrations`, `test-trivia-logic` exit 0; `test-jukebox-queue-transaction` exit 3 (documented baseline, unrelated); `npm run build` exit 0.

## Review of the runbook

1. **Spec compliance / completeness** — covers every DB path found in `git rev-list --all --objects` (5 paths, 31 blob versions), all refs (branches, tags, PR refs via Support), both existing clones (dev, Pi).
2. **Safety** — no `--force` on filter-repo; rewrite runs in a separate fresh clone so the working copy is untouched until D; refs snapshot (A5) + comparison (B4) guards against `--mirror` deleting refs; checks for stray `refs/replace` / `refs/remotes` before the push; untrack commit precedes the reset so on-disk DB copies survive; dev re-sync (D) uses a tree-hash equality check + `git reset --soft` so the owner's uncommitted trivia/CSRF/CLAUDE.md work is untouched (revised after the owner chose not to commit trivia yet; v1.8.0 `4bdd99b` is pushed with the C1 commit by owner decision); Pi step refuses to continue if the live `votes.db` is tracked, backs up DB + runtime files first.
3. **API currency** — commands match GitHub's current guide (filter-repo ≥ 2.47 `--sensitive-data-removal`, normal clone, `push --force --mirror`, Support for PR refs) and the filter-repo manual.
4. **Consistency with CLAUDE.md** — Claude ran no git write commands; all staging/committing/pushing/rewriting is owner-run.

## Open items / caveats (non-blocking)

- Whether the backup holds real people's data is unknown to Claude (PII safeguard blocked inspection) → A1.
- Whether history contains real secrets is unknown to Claude (credential safeguard blocked inspection) → A2; if real, rotate before B and add `--replace-text`.
- `git filter-repo --version` / `py -m git_filter_repo` fallback is from the install docs, not tested here (tool not installed on this machine).
- Pi commands are bash written for the deploy layout in `scripts/update-daemon.sh`; the install path is a placeholder.
- Pre-existing, out of scope: `!backups/.gitkeep` cannot take effect under `backups/`; runtime-written tracked files (H4) will make the Pi's tree dirty after step E3.

## Score Table

| Category | Score | Grade |
|----------|-------|-------|
| Specification Compliance | 100% | A+ |
| Best Practices | 97% | A+ |
| Functionality | 95% | A |
| Code Quality | 100% | A+ |
| Security | 96% | A |
| Performance | 100% | A+ |
| Consistency | 100% | A+ |
| Build Success | 100% | A+ |

**Overall Grade: A (98%)** — **PASS**
