# C1 — Purge Database Files from Public Git History — Specification

Feature name: `c1_db_history_purge`
Source finding: `full_code_review.md` → C1
Decision (owner, 2026-10-16): **full purge** (rewrite all history + force-push + GitHub Support). Owner has SSH access to the production show machine.

> CLAUDE.md forbids Claude from running git commands that stage, commit, push, stash or rewrite.
> Claude's part: this spec, the `.gitignore` change, verification commands. **Every git write below is run by the owner.**

## 1. Current state (verified)

Repository `joeally06/FPP-Control-Center` is **public**, **0 forks**, 17 pull requests (all Dependabot; 6 open: #1, #2, #5, #6, #16, #17).
Remote refs: 9 branches, 12 tags (20 `ls-remote --tags` lines incl. peeled), 23 `refs/pull/*`.

Database files ever committed (from `git rev-list --all --objects`):

| Path | Versions in history | Size | First added | Still tracked |
|---|---|---|---|---|
| `votes.db` | 5 | 16–45 KB | `d8324ab` 2025-10-28 | no (removed `0d815dd`) |
| `votes.db-wal` | 14 | 4.1 MB each | 2025-11-01 | no (removed `0d815dd`) |
| `votes.db-shm` | 10 | 32 KB | 2025-11-01 | no (removed `0d815dd`) |
| `votes.db.backup-before-migration-011` | 1 | 516 KB | `f18b996` 2025-11-09 | **yes** |
| `backups/2025-10-31_01-39-23/votes.db-wal`, `votes.db-shm` | 1 each | 4.1 MB / 32 KB | `e7114ac` 2025-10-31 | **yes** |

Every one of these is reachable from **all** refs: `master`, `before_hardening`, `feature/fpp-command-security`, 6 Dependabot branches, and tags `v1.0.0-rc.1` … `v1.6.0`.
The 516 KB backup contains `santa_letters` (3 rows: child name, parent email, IP, letter), `jukebox_queue` (requester name/IP), `sessions` 138, `visitors`, `page_views`. Whether rows are real could not be checked by Claude (blocked by the session's PII safeguard) — owner checks in step A1. The WAL files can hold rows the main files do not.

**Secrets:** a history-wide pattern scan matched secret-shaped `KEY=value` strings in 14 files (`README.md`, `INSTALLATION.md`, `docs/INSTALLATION.md`, `SANTA_*.md`, `DEVICE_MONITORING.md`, `MEDIA-LIBRARY-IMPLEMENTATION.md`, `deploy-production.sh`, `scripts/setup-wizard.js`, `setup.sh`, `setup.ps1`, `setup.sh.backup-20251127_063432`). Likely placeholders; Claude could not inspect the values (blocked as credential exposure). Owner checks in step A2.

`.gitignore` today: `votes.db`, `*.db-wal`, `*.db-shm`, `backups/` are ignored; **`votes.db.backup-before-migration-011` is not** (`*.db.backup` does not match a `-011` suffix). Pre-existing, out of scope: `!backups/.gitkeep` cannot take effect under `backups/` (no `.gitkeep` exists anyway).

## 2. Problem

Real or test visitor data (children's names, parent emails, IPs) is downloadable by anyone from the public history, in many versions, from every branch and tag. Deleting the files in a new commit does not remove them from history.

## 3. Research (sources)

1. GitHub Docs — *Removing sensitive data from a repository*: rotate secrets first; git-filter-repo **≥ 2.47** with `--sensitive-data-removal`; **normal clone** (not mirror); `git-filter-repo --sensitive-data-removal --invert-paths --path PATH` with full paths; verify; count PRs via `grep -c '^refs/pull/.*/head$' .git/filter-repo/changed-refs`; `git push --force --mirror origin` (only `refs/pull/*` may fail); then contact GitHub Support with owner/repo, number of affected PRs, "First Changed Commit(s)", LFS info; Support only proceeds if all non-PR refs are clean and no forks reference the data; merge/close open PRs first; hashes and signatures change; collaborators must re-clone or clean.
   https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
2. git-filter-repo manual — `--invert-paths` selects everything *except* the given paths; `--path` takes exact files or directories; `--sensitive-data-removal` fetches all refs and warns that un-pushed local changes may be discarded; `--force` skips the fresh-clone check and is irreversible — not used here; by default the `origin` remote is removed; other clones: easiest is delete + re-clone, otherwise delete all tags, `git fetch --prune --tags`, rebase, `git reflog expire --expire=now --all`, `git gc --prune=now`.
   https://github.com/newren/git-filter-repo/blob/main/Documentation/git-filter-repo.txt
3. git-filter-repo INSTALL — Windows: `pipx install git-filter-repo` (or pip), or manual script; beware the Windows Store python stub; `python3 git-filter-repo` form if PATH is awkward.
   https://github.com/newren/git-filter-repo/blob/main/INSTALL.md
4. PyPI index (`py -m pip index versions git-filter-repo`, run 2026-10-16) — latest **2.47.0** (meets GitHub's minimum).
5. GitHub repo pages (fetched 2026-10-16) — public, 0 forks, 17 PRs (6 open).
6. `.gitignore` semantics — verified with `git check-ignore --no-index -v` against each path (results in §6).

No new project dependency. `git-filter-repo` is a one-off tool installed on the owner's machine, not added to `package.json`.

## 4. Solution

1. **Repo change (Claude, Phase 2):** `.gitignore` line `*.db.backup` → `*.db.backup*` so the `-before-migration-NNN` style backups are ignored. One line; nothing else in `.gitignore` changes.
2. **Untrack commit (owner):** `git rm --cached` the three still-tracked DB files + the `.gitignore` change, committed and pushed **before** the rewrite. This matters: when clones are later reset onto the rewritten history, git deletes files that were tracked in the old `HEAD` but are missing from the new one. Untracking first keeps the on-disk copies on this machine and the Pi.
3. **History rewrite (owner):** in a fresh normal clone, `git filter-repo --sensitive-data-removal --invert-paths` with the five paths, verify, force-push all refs.
4. **GitHub Support (owner):** purge PR refs + cached views.
5. **Re-sync the two existing clones (owner):** this dev machine and the production Pi.

Kept out of scope (tracked separately in `full_code_review.md`): other junk files (L4), runtime-written tracked files (H4), the `backups/.gitkeep` rule.

## 5. Runbook (owner)

Run in order. **Steps A–B are safe to stop at any point. B6 is the point of no return.**

### A. Preparation — dev machine (PowerShell, `C:\FPP-Control-Center`)

**A1. Check whether the data is real** (needed for the Support ticket wording and whether anyone should be told). In your own terminal:
```powershell
node -e "const D=require('better-sqlite3');const db=new D('votes.db.backup-before-migration-011',{readonly:true});console.table(db.prepare('select id,child_name,parent_email,created_at from santa_letters').all());console.table(db.prepare('select requester_name,requester_ip,created_at from jukebox_queue').all())"
```

**A2. Check for real secrets in history** (Git Bash, from the repo):
```bash
git rev-list --all | xargs -n 50 git grep -I -h -o -E "GOCSPX-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY|(SMTP_PASS|GOOGLE_CLIENT_SECRET|NEXTAUTH_SECRET|SPOTIFY_CLIENT_SECRET|INTERNAL_API_KEY)=[A-Za-z0-9+/=_-]{12,}" | sort -u
```
If any value is a real credential (not `your-…`/`example`/placeholder): **rotate it first** (Google Cloud console OAuth secret, SMTP password, Spotify secret, regenerate `NEXTAUTH_SECRET` / `INTERNAL_API_KEY`), then tell Claude so `--replace-text` can be added to B3. Rotation is what actually neutralises a leaked secret.

**A3. Commit the untrack change and push.** Only the C1 change goes in this commit; uncommitted work (trivia feature, CSRF fix, CLAUDE.md) **stays uncommitted** — the rewrite runs in a separate clone and step D keeps the working tree as it is. (State on 2026-10-16: the three `git rm --cached` deletions and `.gitignore` were already staged; local `master` was 1 commit ahead of GitHub — `4bdd99b` v1.8.0 — which the owner approved pushing with this commit.)
**Do not commit `full_code_review.md` or the `c1_*` docs to this public repo yet** — they list unfixed, exploitable issues and point at where the data lives. Keep them local (or move them out of the repo) until the fixes ship. They are untracked, so they don't affect `git status` cleanliness checks beyond showing as `??`.
```powershell
git diff --cached --name-only   # must list exactly: .gitignore + the 3 DB files (stage them with git rm --cached / git add .gitignore if not)
git commit                      # paste the Phase 7 message; unstaged trivia/CSRF changes are not included
git push origin master          # also pushes 4bdd99b (v1.8.0)
git log --oneline origin/master..HEAD   # must print nothing
git diff --cached --name-only           # must print nothing (nothing left staged)
git stash list                          # should be empty; anything here is lost by the later gc
New-Item -ItemType Directory -Force C:\Temp | Out-Null
git rev-parse HEAD^{tree} | Out-File -Encoding ascii C:\Temp\fpp-tree-before.txt   # used in step D
```

**A4. Close the 6 open Dependabot PRs** (#1, #2, #5, #6, #16, #17) on GitHub and delete their branches (Dependabot will open fresh ones on the new history). GitHub asks for open PRs to be closed or merged before a rewrite.

**A5. Snapshot the remote refs** for later comparison:
```powershell
New-Item -ItemType Directory -Force C:\Temp | Out-Null
git ls-remote origin | Out-File -Encoding utf8 C:\Temp\fpp-refs-before.txt
```

### B. Rewrite — fresh clone in a temp folder (PowerShell)

**B1. Install the tool** (one-off, not part of the project):
```powershell
py -m pip install --user git-filter-repo==2.47.0
git filter-repo --version      # if "not a git command": add the Python user Scripts folder to PATH, or use: py -m git_filter_repo --version
```

**B2. Fresh normal clone** (not `--mirror`):
```powershell
git clone https://github.com/joeally06/FPP-Control-Center.git C:\Temp\fpp-purge
cd C:\Temp\fpp-purge
```

**B3. Rewrite:**
```powershell
git filter-repo --sensitive-data-removal --invert-paths `
  --path votes.db --path votes.db-shm --path votes.db-wal `
  --path votes.db.backup-before-migration-011 `
  --path backups/2025-10-31_01-39-23/
```
Keep the full output — it prints the **First Changed Commit(s)** Support needs. Do **not** add `--force`; if it refuses because the clone isn't fresh, delete `C:\Temp\fpp-purge` and repeat B2.

**B4. Verify — all three must print nothing / 0:**
```powershell
git log --all --oneline -- votes.db votes.db-shm votes.db-wal votes.db.backup-before-migration-011 backups/
git rev-list --all --objects | Select-String -Pattern 'votes\.db|backups/2025-10-31'
git for-each-ref --format='%(refname)' | Select-String -NotMatch '^refs/(heads|tags|pull)/'
```
Then check the ref list matches the snapshot (minus the Dependabot branches you deleted):
```powershell
git for-each-ref --format='%(refname)' refs/heads refs/tags
Get-Content C:\Temp\fpp-refs-before.txt | Select-String 'refs/(heads|tags)/' | Select-String -NotMatch '\^\{\}'
(Select-String -Path .git\filter-repo\changed-refs -Pattern '^refs/pull/.*/head$').Count   # affected PRs, expect <= 17
```
If any branch or tag from the snapshot is missing locally, **stop** — `--mirror` would delete it on GitHub.

If the third command lists `refs/replace/*` or `refs/remotes/*`, delete them before pushing — `--mirror` would push them, and replace refs point at the *old* commits (which contain the data):
```powershell
git for-each-ref --format='%(refname)' refs/replace refs/remotes | ForEach-Object { git update-ref -d $_ }
```
Then re-run all of B4.

**B5. Remote:** `git remote -v`. If `origin` is gone, `git remote add origin https://github.com/joeally06/FPP-Control-Center.git`.

**B6. Force-push all branches and tags — irreversible:**
```powershell
git push --force --mirror origin
```
Only `refs/pull/*` rejections are expected. Any other rejection usually means branch protection on `master`: disable it temporarily, re-run, re-enable.

### C. GitHub Support

Open a ticket at https://support.github.com → "Remove sensitive data". Include: `joeally06/FPP-Control-Center`; number of affected PRs (B4); the First Changed Commit(s) from B3's output; "no LFS objects"; "no forks"; that the data is a SQLite database with personal data (or test data, per A1). Ask them to dereference/delete the affected PR refs, run server-side GC, and drop cached views.

### D. Re-sync this dev machine (PowerShell, `C:\FPP-Control-Center`)

This keeps your uncommitted work (trivia, CSRF, CLAUDE.md) exactly as it is. It works because the rewrite only removed files that are no longer in the latest commit, so the rewritten `master` has the **same tree** as your local `master` — only the commit hashes differ. `git reset --soft` moves the branch pointer and leaves the index and working tree alone.

**Do not use `git reset --hard` here** — it would discard the uncommitted changes.
```powershell
git tag -l | ForEach-Object { git tag -d $_ }
git fetch origin --prune --tags --force

# Safety check: both must print the same hash (the one saved in A3). If they differ, STOP and ask.
Get-Content C:\Temp\fpp-tree-before.txt
git rev-parse origin/master^{tree}

git reset --soft origin/master
git status        # should list the same modified/deleted/untracked files as before the rewrite, nothing staged
git reflog expire --expire=now --all
git gc --prune=now
git log --all --oneline -- votes.db votes.db.backup-before-migration-011 backups/   # must print nothing
```
If `git status` shows anything staged after the soft reset, run `git reset` (no flags) to unstage — it does not touch the working tree.
On-disk `votes.db`, `.env.local`, `node_modules`, and the old backup files stay (they are untracked + ignored). Delete `votes.db.backup-before-migration-011` and `backups\2025-10-31_01-39-23\` from disk only if you don't want them. Remove `C:\Temp\fpp-purge` and `C:\Temp\fpp-refs-before.txt` when done.

### E. Re-sync the production show machine (SSH, bash) — before anyone clicks "Update"

Until this is done the in-app updater's `git pull` will fail (unrelated histories) and roll back.
```bash
cd /path/to/FPP-Control-Center
git ls-files votes.db                      # MUST print nothing (live DB is untracked) — if it prints, stop and ask
git status --porcelain; git stash list     # note anything listed; stashes are lost after the gc below

# 1. back up the live DB and everything the app writes at runtime
B=~/fpp-resync-backup-$(date +%Y%m%d_%H%M%S); mkdir -p "$B"
sqlite3 votes.db ".backup '$B/votes.db'" 2>/dev/null || cp votes.db* "$B"/
cp -a .env.local data public/uploads "$B"/
[ -f votes.db.backup-before-migration-011 ] && cp votes.db.backup-before-migration-011 "$B"/

# 2. move onto the rewritten history
git tag -l | xargs -r git tag -d
git fetch origin --prune --tags --force
git reset --hard origin/master

# 3. put runtime files back (reset restored the repo's copies)
cp -a "$B"/data/. data/
cp -a "$B"/uploads/. public/uploads/

# 4. same steps the updater runs
npm install --include=dev && npm run build && node scripts/migrate-database.js && pm2 restart ecosystem.config.js

# 5. drop old objects
git reflog expire --expire=now --all && git gc --prune=now
```
Note: step 4 deploys whatever is on `master` at that moment, exactly as the in-app updater would — with the A3 plan that is v1.8.0 (`4bdd99b`) + the C1 commit; the trivia feature and CSRF fix are not on `master`, so they are not deployed. Step 3 leaves `data/` and `public/uploads/` modified — that is finding H4 (next update will stash them); fixing H4 is a separate batch.

### F. If A1 showed real people

Consider whether the affected parents should be told; Claude can't give legal advice on notification duties.

## 6. Validation (Phases 3/5/6)

- `git check-ignore --no-index -v` for: `votes.db`, `votes.db-wal`, `votes.db-shm`, `votes.db.backup-before-migration-011`, `backups/2025-10-31_01-39-23/votes.db-wal` → all ignored; `scripts/backup.js`, `lib/database.ts`, `migrations/018_trivia.sql` → **not** ignored.
- `git diff -- .gitignore` → exactly one line changed.
- Standard Phase 6 gate from CLAUDE.md (`npx tsc --noEmit`, each `scripts/test-*.ts`, `npm run build`) — expected unaffected; run because CLAUDE.md requires it.
- Post-rewrite verification is B4/D (owner-run), recorded by the owner.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `--mirror` deletes GitHub branches/tags missing from the purge clone | A5 snapshot + B4 comparison; stop if anything is missing |
| Un-pushed local work lost | A3 requires `origin/master..HEAD` empty and nothing staged; rewrite happens in a separate clone; D uses a tree-hash check + `git reset --soft`, so uncommitted trivia/CSRF/CLAUDE.md changes are untouched |
| Reset deletes on-disk DB files that were tracked | Untrack commit (A3) first; Pi checks `git ls-files votes.db` and backs up before reset |
| Production updater breaks after rewrite | E done right after B6, before any in-app update |
| Operator's audio mappings / uploads overwritten on the Pi | E backs up and restores `data/` and `public/uploads/` |
| Data stays in PR refs and cached views | GitHub Support (C) |
| A real secret was committed | A2 check; rotate before rewriting |
| Commit hashes change (release links, CHANGELOG hash references, `/api/version` build hash) | Accepted; tags keep their names, GitHub Releases follow the tag names |
| CI runs on the force-push | Harmless (it is already failing — H5) |
