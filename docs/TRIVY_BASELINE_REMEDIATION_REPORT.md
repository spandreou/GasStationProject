# ShiftOryx Trivy Baseline Remediation Report

Date: 29 July 2026

Branch: `shiftoryx-trivy-baseline-remediation`

Base SHA: `2a4c158d29145c9308112cd42fcf6109b419b2a4`

Final verdicts:

- `TRIVY_BASELINE_REMEDIATION_READY_FOR_PUBLICATION_REVIEW`
- `TRIVY_LOCAL_RESCAN_BLOCKED_BY_MISSING_EXISTING_TOOL`

This task investigated and applied the smallest safe remediation for the two
pre-existing HIGH findings that block the repository Security Scan:

1. `fast-xml-parser@5.9.3`, advisory `GHSA-8r6m-32jq-jx6q`, in
   `functions/package-lock.json`.
2. Trivy Dockerfile misconfiguration `DS-0002`, because the final image did
   not declare a non-root `USER`.

No Trivy finding was ignored, suppressed, downgraded or excluded. The Security
Scan workflow was not changed.

## Scope And Safety Boundary

The task did not perform a production read, production write, deployment,
Firebase change, Cloudflare change or DNS change. Phase 2B was not started.

The Phase 2A branch and draft pull request remained out of scope:

```text
branch: shiftoryx-phase-2a-owner-role-inventory
commit: 783a4d5cb15868c093db147d6203bf92ea511115
pull request: #18
state: OPEN
draft: true
```

The Phase 2A safety stash remains present and was not applied or dropped:

```text
stash@{0}: On shiftoryx-phase-2a-owner-role-inventory: phase2a-before-main-fast-forward
```

The untracked `firestore-debug.log` was not opened, read, edited, copied,
deleted, moved, staged or stashed. Earlier build-context inclusion cannot be
proven from durable evidence. The file was not opened or read. The final
repository configuration now explicitly excludes it from future Docker build
contexts.

## Branch Creation Note

The expected `git pull --ff-only origin main` could not run because the local
`main` had diverged:

```text
local main:  fc25c965b0357a2c9a8e82891c243b584bcf35ce
origin/main: 2a4c158d29145c9308112cd42fcf6109b419b2a4
local-only commits:  1
remote-only commits: 2
```

The local `main` was preserved without reset, rebase or merge. The remediation
branch was created directly from the required remote base:

```text
git switch -c shiftoryx-trivy-baseline-remediation --no-track origin/main
```

The resulting branch base and current `HEAD` are both the required
`2a4c158d29145c9308112cd42fcf6109b419b2a4`.

## External Backup

Backup directory:

```text
C:\Users\thugs\.codex\tmp\shiftoryx-trivy-remediation-20260729-101946
```

It contains exactly four files:

| File | SHA-256 |
| --- | --- |
| `Dockerfile` | `83CB6B940F1FD093C2E3BAEEC26EB2355DDDB37ED2AB6385B110FA04BCA1DAF6` |
| `functions/package.json` | `8053F71DD0EBFD314065BCAA61D5475B05D50CB7F5631DEB203EB20E89C597D2` |
| `functions/package-lock.json` | `B23AB6A1096073EFB9CB80186A5245F5CBA4943B919E3B00C0C187A54F554ACA` |
| `nginx.conf` | `328A3CD8C20D8AEC28E272A692DD9D886F92725F56BC72B6F73B9DF9B5917A02` |

No dependency directory, environment file, credential, service account or
debug log was included.

## Toolchain

```text
Node: v20.20.2
npm:  10.8.2
Docker client/server: 29.6.2
Nginx runtime: 1.27.5
```

Docker Desktop was already installed but its local engine was stopped. The
existing installation was started for runtime validation. No tool was
installed or upgraded.

## Finding Triage

The repository security policy treats HIGH and CRITICAL findings as blocking
and prefers the smallest safe patch or same-major resolution.

The dependency finding was triaged as `needs_review` with medium confidence:
the vulnerable version was definitely locked and shipped in the Functions
tree, but a reachable attacker-controlled XML parsing path was not established
from the Functions source. Policy and CI still require removal of the
vulnerable resolution.

The Docker finding was triaged as `confirmed` with high confidence: the shipped
final stage had no configured user, the Nginx master process ran as root, and
the image serves a public HTTP surface.

## Part A - fast-xml-parser

### Dependency Baseline

No direct `fast-xml-parser` dependency exists in `functions/package.json`.

The pre-change installed chain was:

```text
firebase-admin@13.10.0
-> @google-cloud/storage@7.21.0
-> fast-xml-parser@5.9.3
```

`firebase-functions@6.6.0` deduplicated the same
`firebase-admin@13.10.0`.

`@google-cloud/storage@7.21.0` declares `fast-xml-parser` as `^5.3.4`, so the
patched `5.10.1` release satisfies the existing parent range. No parent update
is required.

Functions source inspection found no import or call for
`@google-cloud/storage`, `getStorage` or `bucket`. That is reachability
evidence only; it was not used to retain the vulnerable package.

### Package Metadata Review

Registry metadata for `5.9.3` and `5.10.1` established:

- neither release declares `preinstall`, `install` or `postinstall`,
- both expose the existing JavaScript CLI entry `fxparser`,
- `5.10.1` introduces no new binary entry,
- no native module, native build or `gyp` requirement was introduced,
- no Node engine restriction was added,
- the update remains within major version 5.

The CLI entry is not a native binary and already existed in the vulnerable
release.

### Decision Ladder

#### Selected Option A - targeted lockfile-only transitive update

An isolated copy of the Functions manifests was probed first:

```text
npm update fast-xml-parser --package-lock-only --ignore-scripts --no-audit --no-fund --prefix <probe>
```

The probe preserved `functions/package.json` byte-for-byte, changed only five
package entries, and did not change a parent version.

The exact repository mutation was then produced by npm:

```text
npm update fast-xml-parser --package-lock-only --ignore-scripts --no-audit --no-fund --prefix functions
```

The lockfile was not edited manually.

#### Options not selected

- Option B, a same-major direct parent update, was unnecessary because the
  current `@google-cloud/storage` range accepts `5.10.1`.
- Option C, an override or new direct dependency, was not required and was not
  implemented.
- Option D, a major Firebase or Google Cloud upgrade, was not required and was
  not implemented.

### Exact Dependency Diff

`functions/package.json` remained byte-for-byte identical:

```text
before SHA-256: 8053F71DD0EBFD314065BCAA61D5475B05D50CB7F5631DEB203EB20E89C597D2
after SHA-256:  8053F71DD0EBFD314065BCAA61D5475B05D50CB7F5631DEB203EB20E89C597D2
```

Exactly five lockfile package entries changed:

| Lock entry | Before | After |
| --- | ---: | ---: |
| `node_modules/@nodable/entities` | `2.2.0` | `3.0.0` |
| `node_modules/fast-xml-parser` | `5.9.3` | `5.10.1` |
| `node_modules/fast-xml-parser/node_modules/xml-naming` | absent | `0.3.0` |
| `node_modules/is-unsafe` | `1.0.1` | `2.0.0` |
| `node_modules/path-expression-matcher` | `1.6.1` | `1.6.2` |

The Functions root lock entry and these parent packages were unchanged:

```text
firebase-admin 13.10.0 -> 13.10.0
firebase-functions 6.6.0 -> 6.6.0
@google-cloud/storage 7.21.0 -> 7.21.0
```

The Functions lockfile diff is 32 insertions and 16 deletions. No unrelated
package resolution changed.

### Dependency Validation

```text
npm ci --prefix functions                                      PASS
npm ls firebase-admin @google-cloud/storage fast-xml-parser    PASS
npm run lint --prefix functions                               PASS
npm run qa:auth-broker                                        PASS
npm audit --prefix functions                                  EXPECTED NON-ZERO
```

The installed chain after remediation is:

```text
firebase-admin@13.10.0
-> @google-cloud/storage@7.21.0
-> fast-xml-parser@5.10.1
```

The post-change Functions audit result is:

```text
low=1 moderate=9 high=0 critical=0 total=10
```

`GHSA-8r6m-32jq-jx6q` and `fast-xml-parser` are absent from the audit JSON.
The plain audit remains non-zero only because of unrelated low/moderate
advisories.

## Part B - Docker Non-Root Runtime

### Docker Build-Context Closure

`.dockerignore` is a changed security file. It now contains the exact
standalone exclusion:

```text
firestore-debug.log
```

The explicit exclusion is required because the repository Dockerfile uses
`COPY . .` and the unrelated untracked path exists in the repository worktree.
The path must therefore be excluded from future repository-root Docker build
contexts without using a broad log/debug wildcard that could hide other files
from review.

The local `nginx:1.27-alpine` image was already available. A no-pull,
no-cache temporary Dockerfile performed `COPY . .` and then only ran
`test ! -e /context/firestore-debug.log`. The probe passed: the protected path
was absent after the copy. Its content was never opened or printed, and the
temporary `shiftoryx-dockerignore-probe` image was removed and confirmed
absent.

### Baseline Image And Runtime Authority

The unchanged baseline was built with synthetic Vite values. Earlier
build-context inclusion cannot be proven from durable evidence. The file was
not opened or read. The final repository configuration now explicitly excludes
it from future Docker build contexts.

Resolved final-stage base:

```text
nginx:1.27-alpine
nginx@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10
```

Baseline image configuration:

```text
User:       empty (Docker default root)
Entrypoint: /docker-entrypoint.sh
Command:    nginx -g daemon off;
```

Baseline runtime:

- master process: UID/GID `0:0`,
- worker processes: UID/GID `101:101`,
- PID written to `/run/nginx.pid`,
- temporary directories created under `/var/cache/nginx`:
  `client_temp`, `proxy_temp`, `fastcgi_temp`, `uwsgi_temp`, `scgi_temp`,
- `/etc/nginx/conf.d/default.conf` was inspected by the entrypoint but its
  content hash remained unchanged,
- no runtime write occurred under `/usr/share/nginx/html`,
- health became `healthy`,
- `/` returned 200,
- a generated JavaScript asset returned 200,
- an absent static asset returned 404.

The upstream relevant ownership was:

```text
/run                     root:root 0755
/var/cache/nginx         root:root 0755
/etc/nginx/conf.d        root:root 0755
/usr/share/nginx/html    root:root 0755
/tmp                     root:root 1777
nginx user/group         101:101
```

Forcing the unchanged image to run as `nginx` demonstrated that `USER nginx`
alone is insufficient:

```text
mkdir() "/var/cache/nginx/client_temp" failed (13: Permission denied)
```

### Docker Decision Ladder

#### Selected Option A - existing image with explicit non-root runtime

The existing official image and its existing `nginx` account can run safely
with one narrowly writable area:

```text
/tmp/nginx
```

No different base image, broad permission change, host mount, privileged mode
or added capability is required.

#### Options not selected

- Option B, a replacement unprivileged image, was unnecessary and was not
  implemented.
- Option C, Trivy ignore/workflow suppression, is forbidden and was not
  implemented.

### Exact Dockerfile And Nginx Changes

The final stage now:

1. creates `/tmp/nginx`,
2. changes ownership of only that directory to `nginx:nginx`,
3. replaces the upstream PID path with `/tmp/nginx/nginx.pid`,
4. verifies that exact replacement with `grep`,
5. declares `USER nginx`.

The PID replacement is guarded so a future upstream config shape change fails
the image build instead of silently leaving a root-only PID path.

`nginx.conf` directs only the five runtime temp paths to:

```text
/tmp/nginx/client_temp
/tmp/nginx/proxy_temp
/tmp/nginx/fastcgi_temp
/tmp/nginx/uwsgi_temp
/tmp/nginx/scgi_temp
```

There is no `chmod 777`, no recursive ownership change of a system tree, and
no ownership change to the static assets or Nginx configuration.

Final relevant permissions:

```text
/tmp/nginx                           101:101 0755
/etc/nginx/conf.d                    0:0     0755
/etc/nginx/conf.d/default.conf       0:0     0755
/usr/share/nginx/html                0:0     0755
/usr/share/nginx/html/index.html     0:0     0644
```

### Candidate Runtime Validation

Candidate image:

```text
shiftoryx-trivy-candidate:20260729
image ID: sha256:571f5747728272989644b52b65068416b610b4b2f46ba4287250a1c775bc5bdd
configured user: nginx
runtime UID/GID: 101:101
```

Validation results:

| Check | Result |
| --- | --- |
| Candidate image build | PASS |
| Final configured user non-root | PASS, `nginx` |
| Master process non-root | PASS, UID/GID `101:101` |
| `nginx -t` as configured user | PASS |
| Entrypoint and container start | PASS |
| Port 8080 listener | PASS |
| Health check | PASS, `healthy` |
| Root route | PASS, HTTP 200 `text/html` |
| SPA fallback route | PASS, HTTP 200 |
| Generated JavaScript asset | PASS, HTTP 200 `application/javascript` |
| Missing static asset | PASS, HTTP 404 |
| Restart | PASS; health returned to `healthy` |
| Fatal permission errors | PASS; none |
| Runtime writes under static assets | PASS; none |
| Added bind/host mount | PASS; none |
| Privileged mode | PASS; false |
| Added capabilities | PASS; none |
| Exact synthetic build values in logs | PASS; absent |
| Firebase environment names in logs | PASS; absent |

The runtime filesystem diff contained only the PID and five temporary
directories under `/tmp/nginx`. It contained no application asset path.

The official entrypoint emits an informational line that the root-owned custom
`default.conf` cannot be modified and Nginx warns that its upstream `user`
directive is ignored when the master is already non-root. Neither is fatal.
There was no `Permission denied` or `[emerg]` entry in the successful candidate
logs.

All Docker builds used explicit synthetic/non-secret Vite values. No real
Firebase or production value was used. BuildKit retained its existing
`SecretsUsedInArgOrEnv` warnings for Vite ARG/ENV names; this task did not add
those declarations.

## Local Trivy

No existing `trivy` command is installed on this computer. Per the task
boundary, Trivy was not installed and no alternate scanner was downloaded.

```text
TRIVY_LOCAL_RESCAN_BLOCKED_BY_MISSING_EXISTING_TOOL
```

The final equivalent HIGH/CRITICAL repository scan must run in GitHub Actions
only after a separately approved publication task.

## Full Regression Validation

All commands ran under the normal Node 20 environment:

| Command | Result | Notes |
| --- | --- | --- |
| `npm ci` | PASS | root: 233 packages; 1 low, 1 moderate |
| `npm ci --prefix functions` | PASS | 253 packages; 1 low, 9 moderate |
| `npm run build` | PASS | Vite 8.0.16; existing large-chunk warning |
| `npm run qa:scheduler-engine` | PASS | stress QA |
| `npm run qa:scheduler` | PASS | scheduler QA and nested build |
| `npm run qa:repositories` | PASS | repository boundaries |
| `npm run qa:public-readonly` | PASS | public read-only checks |
| `npm run qa:tenant-authorization` | PASS | tenant authorization |
| `npm run qa:saas-foundation` | PASS | SaaS foundation |
| `npm run qa:auth-broker` | PASS | auth broker |
| `npm run qa:export-security` | PASS | export audit security |
| `npm run security:hardening` | PASS | hardening checks |
| `npm run security:integrity` | PASS | Firestore integrity checks |
| `npm run lint --prefix functions` | PASS | Functions syntax |
| `npm run security:audit` | PASS | no root HIGH/CRITICAL |

No production Firebase, deployment or migration command was run.

## Remaining Advisories And Risks

Remaining npm advisories are outside this focused HIGH remediation:

- root: one low `dompurify` advisory and one moderate `protobufjs` advisory,
- Functions: one low and nine moderate findings through existing
  `body-parser`, `protobufjs`, `uuid` and Google/Firebase dependency chains,
- Functions audit aggregate remediation proposes a breaking/inappropriate
  Firebase Admin change and was not applied.

Other remaining risks:

- local Trivy closure is blocked until an existing scanner becomes available
  or the branch is separately approved for CI publication,
- the final `nginx:1.27-alpine` tag is not digest-pinned in the Dockerfile;
  the tested build resolved the digest recorded above,
- earlier build-context inclusion cannot be proven from durable evidence;
  the final repository configuration explicitly excludes the protected path
  from future Docker build contexts,
- existing BuildKit warnings identify the pre-existing Vite Firebase ARG/ENV
  names as potentially secret-bearing,
- the official non-root startup produces benign read-only/user-directive log
  notices described above,
- the local `main` divergence remains deliberately unresolved.

None of these risks justifies broadening this focused task.

## Files Changed

Implementation:

```text
Dockerfile
.dockerignore
functions/package-lock.json
nginx.conf
```

Implementation diff:

```text
4 files changed, 46 insertions(+), 16 deletions(-)
```

Documentation:

```text
docs/TRIVY_BASELINE_REMEDIATION_REPORT.md
docs/codex-handoffs/TRIVY_BASELINE_REMEDIATION_CHECKPOINT.md
```

`functions/package.json` and `.github/workflows/security-scan.yml` are
unchanged. No file was staged, committed, pushed or published.

## Final Workspace And Test Cleanup

The complete final short status is:

```text
 M Dockerfile
 M .dockerignore
 M functions/package-lock.json
 M nginx.conf
?? docs/TRIVY_BASELINE_REMEDIATION_REPORT.md
?? docs/codex-handoffs/TRIVY_BASELINE_REMEDIATION_CHECKPOINT.md
?? firestore-debug.log
```

The complete tracked `git diff --name-status` output is:

```text
M  .dockerignore
M  Dockerfile
M  functions/package-lock.json
M  nginx.conf
```

The complete tracked `git diff --stat` output is:

```text
 .dockerignore               |  1 +
 Dockerfile                  |  7 +++++++
 functions/package-lock.json | 48 ++++++++++++++++++++++++++++++---------------
 nginx.conf                  |  6 ++++++
 4 files changed, 46 insertions(+), 16 deletions(-)
```

The two new documentation files are untracked and therefore appear in
`git status`, not in the tracked `git diff` output. `git diff --check` passed.

The following task-only resources were stopped and removed after runtime
validation:

```text
container: shiftoryx-trivy-baseline-20260729
container: shiftoryx-trivy-candidate-20260729
image:     shiftoryx-trivy-baseline:20260729
image:     shiftoryx-trivy-candidate:20260729
image:     shiftoryx-dockerignore-probe:latest
```

The prior remediation evidence records the two baseline resources as absent;
this task separately confirmed removal of its candidate container/image and
its `shiftoryx-dockerignore-probe` image. The five resources above were not
all re-inspected together in this follow-up task.

## Rollback

Before staging, restore the four backed-up implementation files and reverse
only the exact one-line `.dockerignore` addition:

```powershell
$backup = "C:\Users\thugs\.codex\tmp\shiftoryx-trivy-remediation-20260729-101946"

Copy-Item "$backup\functions\package.json" ".\functions\package.json" -Force
Copy-Item "$backup\functions\package-lock.json" ".\functions\package-lock.json" -Force
Copy-Item "$backup\Dockerfile" ".\Dockerfile" -Force
Copy-Item "$backup\nginx.conf" ".\nginx.conf" -Force

npm ci --prefix functions
```

Reverse the standalone `firestore-debug.log` rule with a reviewed one-line
patch; do not replace `.dockerignore` wholesale or touch the protected file.

For a full task rollback, remove only the two new remediation documents after
human confirmation. Do not touch the Phase 2A stash, branch, PR or
`firestore-debug.log`.

## Security Review

- Dependencies changed: one patched same-major transitive resolution and four
  required companion lock entries; no direct dependency or parent version.
- Risky runtime files changed: `Dockerfile` and `nginx.conf`, limited to
  non-root PID/temp behavior.
- Secrets touched or exposed: no.
- GitHub Actions touched: no.
- Production accessed: no.
- Remaining security risks: documented above and require separate scope.

## Final Boundary

PR #18 remains open, draft and pinned to the original Phase 2A commit. Its
branch and safety stash are unchanged. Phase 2B was not started.
