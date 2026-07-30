# ShiftOryx Trivy Baseline Remediation Checkpoint

- Date: 29 July 2026
- Status:
  - `TRIVY_BASELINE_REMEDIATION_READY_FOR_PUBLICATION_REVIEW`
  - `TRIVY_LOCAL_RESCAN_BLOCKED_BY_MISSING_EXISTING_TOOL`
- Branch: `shiftoryx-trivy-baseline-remediation`
- Base/HEAD: `2a4c158d29145c9308112cd42fcf6109b419b2a4`
- Branch creation: direct from `origin/main` because local `main` had diverged;
  local `main` was not reset, rebased or merged
- Backup:
  `C:\Users\thugs\.codex\tmp\shiftoryx-trivy-remediation-20260729-101946`
- Backup contains exactly:
  - `Dockerfile`
  - `functions/package.json`
  - `functions/package-lock.json`
  - `nginx.conf`
- Dependency before:
  `firebase-admin@13.10.0 -> @google-cloud/storage@7.21.0 -> fast-xml-parser@5.9.3`
- Selected dependency option: Option A, lockfile-only same-major transitive
  update
- Repository mutation:
  `npm update fast-xml-parser --package-lock-only --ignore-scripts --no-audit --no-fund --prefix functions`
- Dependency after:
  `firebase-admin@13.10.0 -> @google-cloud/storage@7.21.0 -> fast-xml-parser@5.10.1`
- Parent packages unchanged:
  - `firebase-admin@13.10.0`
  - `firebase-functions@6.6.0`
  - `@google-cloud/storage@7.21.0`
- `functions/package.json`: byte-for-byte unchanged
- Lock changes:
  - `@nodable/entities 2.2.0 -> 3.0.0`
  - `fast-xml-parser 5.9.3 -> 5.10.1`
  - nested `xml-naming` added at `0.3.0`
  - `is-unsafe 1.0.1 -> 2.0.0`
  - `path-expression-matcher 1.6.1 -> 1.6.2`
- Install scripts introduced: none
- Native binaries introduced: none
- Existing JavaScript `fxparser` CLI: retained, not newly introduced
- Target advisory: absent from post-change audit JSON
- Functions audit after: 1 low, 9 moderate, 0 high, 0 critical
- Docker baseline:
  - empty configured user
  - root master UID/GID `0:0`
  - PID under `/run`
  - temp directories under `/var/cache/nginx`
  - healthy and serving expected routes
- `USER nginx` alone: rejected by runtime probe due
  `/var/cache/nginx/client_temp` permission denial
- Selected Docker option: Option A with existing `nginx:1.27-alpine` and
  existing `nginx` user
- Docker implementation:
  - create and narrowly own `/tmp/nginx`
  - guarded PID-path replacement to `/tmp/nginx/nginx.pid`
  - route five Nginx temp paths under `/tmp/nginx`
  - declare `USER nginx`
- Final image user/runtime: `nginx`, UID/GID `101:101`
- Static assets and Nginx site config remain root-owned and read-only
- Candidate build: PASS
- `nginx -t`: PASS
- Startup: PASS
- Health: PASS
- Root/SPA/static/missing-asset checks: 200/200/200/404
- Restart and health recovery: PASS
- Fatal permission errors: none
- Writes under `/usr/share/nginx/html`: none
- Added privilege/capability/bind mount: none
- Real or production build values used: none
- Exact synthetic build values exposed in logs: none
- Local Trivy: unavailable; not installed
- Full Node 20 validation passed:
  - `npm ci`
  - `npm ci --prefix functions`
  - `npm run build`
  - `npm run qa:scheduler-engine`
  - `npm run qa:scheduler`
  - `npm run qa:repositories`
  - `npm run qa:public-readonly`
  - `npm run qa:tenant-authorization`
  - `npm run qa:saas-foundation`
  - `npm run qa:auth-broker`
  - `npm run qa:export-security`
  - `npm run security:hardening`
  - `npm run security:integrity`
  - `npm run lint --prefix functions`
  - `npm run security:audit`
- Implementation files changed:
  - `.dockerignore`
  - `Dockerfile`
  - `functions/package-lock.json`
  - `nginx.conf`
- Documentation files added:
  - `docs/TRIVY_BASELINE_REMEDIATION_REPORT.md`
  - `docs/codex-handoffs/TRIVY_BASELINE_REMEDIATION_CHECKPOINT.md`
- `functions/package.json`: unchanged
- GitHub Actions: unchanged
- Secrets: untouched and unexposed
- Production read/write/deployment: none
- Phase 2A PR #18: still OPEN/DRAFT at
  `783a4d5cb15868c093db147d6203bf92ea511115`
- Phase 2A safety stash: retained and untouched
- `firestore-debug.log`: remains untracked and untouched
- `.dockerignore`: changed security file; exact standalone
  `firestore-debug.log` exclusion added beside `firebase-debug.log`
- Build-context reason: Dockerfile uses `COPY . .` while the unrelated
  untracked protected path exists in the repository worktree
- Build-context probe: PASS with existing local `nginx:1.27-alpine`,
  `--pull=false`, `--no-cache`, `COPY . .`, and path-only
  `test ! -e /context/firestore-debug.log`
- Probe result: protected path absent after `COPY . .`; its content was never
  opened, read or printed; temporary probe image removed and confirmed absent
- Earlier build-context inclusion cannot be proven from durable evidence.
  The file was not opened or read. The final repository configuration now
  explicitly excludes it from future Docker build contexts.
- Staging/commit/push/new PR: none
- Task-only baseline/candidate containers and image tags: removed and verified
  absent
- Phase 2B: not started
- Next safe action: human review; CI publication requires separate approval
- Rollback: restore the four exact files from the backup, reverse only the
  standalone `firestore-debug.log` addition in `.dockerignore` with a reviewed
  one-line patch, run `npm ci --prefix functions`, and remove only these two
  documents if a full rollback is explicitly chosen. Preserve the protected
  untracked `firestore-debug.log` untouched.
