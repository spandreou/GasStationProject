# ShiftOryx Focused Dependency Remediation Report

Date: 25 July 2026

Branch: `shiftoryx-dependency-security-remediation`

Base SHA: `506146c455a105051a5adba619cc94e310b07c92`

Final verdict: `DEPENDENCY_REMEDIATION_READY_FOR_REVIEW`

This task remediated one focused root dependency finding. It did not start Phase 2A or Phase 2B and did not authorize a general dependency refresh.

## Scope And Safety Boundary

The target was the production-transitive chain:

```text
firebase@11.10.0
→ @firebase/database@1.0.20
→ faye-websocket@0.11.4
→ websocket-driver@0.7.4
```

The security invariant was:

> The resolved root dependency graph must not contain `websocket-driver` below the patched `0.7.5` release, while preserving the existing Firebase 11 direct dependency, source APIs and runtime behavior.

The following remained out of scope and unchanged:

- runtime and test source,
- `package.json`,
- Functions package manifests and lockfile,
- Firebase data, Firestore Rules, Storage Rules and Cloud Functions code,
- Cloudflare and DNS,
- Docker and Nginx,
- GitHub Actions,
- production,
- Phase 2A and Phase 2B.

The untracked `firestore-debug.log` was not opened, read, edited, staged, copied or deleted.

## Backup

Pre-change package-file backup:

```text
C:\Users\thugs\.codex\tmp\shiftoryx-dependency-remediation-20260725-231950
```

It contains the root and Functions `package.json` and `package-lock.json` files that existed at the base.

## Toolchain

Default shell toolchain:

```text
node v20.20.2
npm 10.8.2
```

An existing Codex workspace Node `v24.14.0` was used for the QA command that imports TypeScript directly. No Node runtime or other tool was installed by this task.

## Finding Revalidation

### Advisory identity

The vulnerable package carried two GitHub-reviewed advisories:

| Advisory | Severity | Affected | Patched | Description |
| --- | --- | --- | --- | --- |
| [GHSA-xv26-6w52-cph6](https://github.com/advisories/GHSA-xv26-6w52-cph6) / CVE-2026-54466 | Critical | `<0.7.5` | `0.7.5` | message corruption through protocol length-header abuse |
| [GHSA-mp7j-qc5w-4988](https://github.com/advisories/GHSA-mp7j-qc5w-4988) / CVE-2026-54490 | Moderate | `<0.7.5` | `0.7.5` | post-decompression message-size limit bypass |

The upstream [0.7.5 release](https://github.com/faye/websocket-driver-node/releases/tag/0.7.5) adds the two length-limit checks. It is a patch release and preserves the package dependency and public API shape.

### Runtime reachability

Demonstrated ShiftOryx exploitability remains `NOT_CONFIRMED`.

- Source inspection found Firebase App, Auth, Analytics, Firestore, Functions and Storage imports.
- No `firebase/database` application import was found.
- After a successful build, no recognizable `websocket-driver`, `faye-websocket` or `http-parser-js` marker was found in `dist`.
- Marker absence is supporting reachability evidence only; it was not used as a substitute for removing the vulnerable lock resolution.

## Dependency Baseline

Relevant direct dependencies before remediation:

| Package | Manifest range | Locked/installed |
| --- | --- | --- |
| `firebase` | `^11.7.0` | `11.10.0` |
| Functions `firebase-admin` | `^13.6.0` | `13.10.0` |
| Functions `firebase-functions` | `^6.6.0` | `6.6.0` |

Relevant root chain before remediation:

```text
firebase@11.10.0
→ @firebase/database@1.0.20
→ faye-websocket@0.11.4
→ websocket-driver@0.7.4
```

Registry metadata established:

- latest Firebase overall: `12.16.0`,
- latest Firebase 11: `11.10.0`,
- Firebase `11.10.0` pins `@firebase/database` to `1.0.20`,
- `@firebase/database@1.0.20` pins `faye-websocket` to `0.11.4`,
- `faye-websocket@0.11.4` accepts `websocket-driver >=0.5.1`,
- latest and patched `websocket-driver`: `0.7.5`.

No Firebase major upgrade is required.

## Audit Baseline

### Root before

```text
info=0 low=1 moderate=1 high=1 critical=1 total=4
```

| Package | Effective severity | Advisory |
| --- | --- | --- |
| `dompurify` | Low | GHSA-c2j3-45gr-mqc4 |
| `postcss` | High | GHSA-r28c-9q8g-f849 |
| `protobufjs` | Moderate | GHSA-j3f2-48v5-ccww |
| `websocket-driver` | Critical aggregate | GHSA-mp7j-qc5w-4988 and GHSA-xv26-6w52-cph6 |

The Phase 1 report recorded two advisories. The current audit database returned four on 25 July 2026 because additional advisories had been published or updated. This report records the live baseline rather than rewriting historical Phase 1 evidence.

### Functions before

```text
info=0 low=1 moderate=9 high=1 critical=0 total=11
```

The Functions tree included findings through `@google-cloud/firestore`, `@google-cloud/storage`, `body-parser`, `fast-xml-parser`, `firebase-admin`, `gaxios`, `google-gax`, `protobufjs`, `retry-request`, `teeny-request` and `uuid`.

The npm aggregate fix metadata proposes `firebase-admin@12.1.0` with `isSemVerMajor=true`. That is not a safe focused in-range remediation for the current `firebase-admin@13.10.0` tree and was not applied.

## Remediation Decision Ladder

### Option A1 — refresh the existing Firebase range

Probe:

```text
npm install --package-lock-only --ignore-scripts --no-audit --no-fund "firebase@^11.7.0"
```

Result: rejected. In an isolated temp copy it resolved Firebase to `11.7.0` and changed a broad set of Firebase transitive packages. The diff was not minimal or reviewable.

### Option A2 — no-save transitive install

Probe:

```text
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --no-save websocket-driver@0.7.5
```

Result: rejected because npm intentionally produced no lockfile change.

### Option B — same-major Firebase declaration update

Probe:

```text
npm install --package-lock-only --ignore-scripts --no-audit --no-fund firebase@11.10.0
```

Result: rejected. It changed the manifest minimum from `^11.7.0` to `^11.10.0` but left the vulnerable transitive lock entry unchanged.

### Selected Option A — targeted package-manager lock round trip

Isolated probing proved that these two targeted npm commands leave no direct dependency and retain the safe transitive lock resolution:

```text
npm install --package-lock-only --ignore-scripts --no-audit --no-fund websocket-driver@0.7.5
npm uninstall --package-lock-only --ignore-scripts --no-audit --no-fund websocket-driver
```

The same commands were then run in the repository.

Why this is the narrowest safe option:

- final `package.json` is byte-for-byte identical to the backup,
- Firebase remains `11.10.0`,
- no major upgrade or override is used,
- no direct dependency is added or removed,
- only the transitive `websocket-driver` lock entry changes,
- the final lock diff is 3 insertions and 3 deletions,
- no runtime source or API migration is required.

### Options C And D

- Firebase 12 was not required or implemented.
- No npm `overrides` or `resolutions` entry was required or added.

## Package And Lockfile Diff

Changed package:

```text
websocket-driver 0.7.4 → 0.7.5
```

Unchanged relevant packages:

```text
firebase 11.10.0
@firebase/database 1.0.20
faye-websocket 0.11.4
```

The only lock fields changed are:

- `version`,
- `resolved`,
- `integrity`.

The dependency list for `websocket-driver` is unchanged.

`websocket-driver@0.7.5` metadata contains only its normal test script. It introduces no install, preinstall or postinstall script; no `gypfile`; no `bin` or binary metadata; and no optional native dependency. The patch introduces no native binary.

## Clean Install And Dependency Chain

Command:

```text
npm ci
```

Result: `PASS`.

```text
added 233 packages
audited 234 packages
3 vulnerabilities (1 low, 1 moderate, 1 high)
```

Installed chain after remediation:

```text
firebase@11.10.0
→ @firebase/database@1.0.20
→ faye-websocket@0.11.4
→ websocket-driver@0.7.5
```

Functions remained:

```text
firebase-admin@13.10.0
firebase-functions@6.6.0
```

No Functions package file changed, so a separate `npm ci --prefix functions` was not necessary. The existing installed Functions tree was sufficient for audit, `npm ls` and lint validation.

## Audit Results After

### Root after

```text
info=0 low=1 moderate=1 high=1 critical=0 total=3
```

Focused success criteria:

| Criterion | Result |
| --- | --- |
| Root critical advisories are zero | PASS |
| No new critical advisory | PASS |
| No new high advisory | PASS; high remained `1→1` |
| Target `websocket-driver` advisory removed | PASS |

Remaining root advisories:

| Package | Severity | Advisory |
| --- | --- | --- |
| `dompurify` | Low | GHSA-c2j3-45gr-mqc4 |
| `postcss` | High | GHSA-r28c-9q8g-f849 |
| `protobufjs` | Moderate | GHSA-j3f2-48v5-ccww |

### Functions after

```text
info=0 low=1 moderate=9 high=1 critical=0 total=11
```

The Functions result is unchanged. It was documented but not expanded into an automatic Firebase Admin dependency migration.

## Behavioral Validation

| Command | Result | Notes |
| --- | --- | --- |
| `npm run build` | PASS | Vite 8.0.16 production build; existing large-chunk warnings only |
| `npm run qa:scheduler-engine` | PASS | scheduler engine stress QA |
| `npm run qa:scheduler` | PASS after compatible-runtime rerun | default Node 20 first failed on native `.ts` loading before Firebase; existing bundled Node 24.14.0 rerun passed scheduler QA and build |
| `npm run qa:repositories` | PASS | repository boundaries |
| `npm run qa:public-readonly` | PASS | public read-only tenant contract |
| `npm run qa:tenant-authorization` | PASS | tenant authorization |
| `npm run qa:saas-foundation` | PASS | SaaS foundation |
| `npm run qa:auth-broker` | PASS | auth broker |
| `npm run qa:export-security` | PASS | export audit security |
| `npm run security:hardening` | PASS | security hardening checks |
| `npm run security:integrity` | PASS | Firestore integrity checks |
| `npm run lint --prefix functions` | PASS | Functions syntax checks |
| `npm run security:audit` | EXPECTED FAIL | exit 1 from the remaining pre-existing high `postcss` advisory; no critical advisory remains |

The initial `qa:scheduler` failure was:

```text
Node v20.20.2
ERR_UNKNOWN_FILE_EXTENSION for src/scheduler-engine/index.ts
```

It occurred in the scheduler validation loader before any Firebase or WebSocket code. The same repository command passed under the already installed bundled Node `v24.14.0`. No source or dependency workaround was added.

## Security Closure And Preserved Behavior

Security closure:

- `npm audit --json` no longer contains a `websocket-driver` vulnerability entry.
- Root critical count changed `1→0`.
- `npm ls` resolves `websocket-driver@0.7.5`.
- the installed dependency tree was recreated successfully from the modified lockfile.

Preserved behavior:

- direct Firebase version and imports are unchanged,
- all configured build, scheduler, repository, tenant, auth, export, hardening, integrity and Functions lint gates pass,
- no application source was modified,
- no Firebase API migration was required.

## Files Changed

Intended final repository changes:

```text
package-lock.json
docs/DEPENDENCY_REMEDIATION_REPORT.md
docs/codex-handoffs/DEPENDENCY_REMEDIATION_CHECKPOINT.md
```

`package.json`, Functions package files and all other tracked files remain unchanged.

No file was staged, committed, pushed or published as a pull request.

## Remaining Risks

- The root audit still fails at `--audit-level=high` because of GHSA-r28c-9q8g-f849 in `postcss`.
- Root low `dompurify` and moderate `protobufjs` advisories remain.
- The Functions tree retains one high, nine moderate and one low finding; its aggregate remediation requires a separately scoped compatibility decision.
- Demonstrated runtime exploitability of the removed WebSocket advisory was not established. The lock risk and security gate were nevertheless real and are now removed.
- The default system Node 20 cannot execute the scheduler QA script's direct TypeScript import; validation currently needs a compatible newer Node runtime or a separately approved test-runner/toolchain decision.

These risks must be handled in separate, explicitly scoped work. They do not justify broadening this focused lock remediation.

## Rollback

To roll back the dependency resolution before staging:

```powershell
Copy-Item `
  "C:\Users\thugs\.codex\tmp\shiftoryx-dependency-remediation-20260725-231950\package-lock.json" `
  ".\package-lock.json" `
  -Force

npm ci
```

For a complete documentation rollback, also remove only the two new remediation documents after human confirmation. Do not touch `firestore-debug.log`.

## Phase Boundary

Phase 2A and Phase 2B were not started. No role inventory, membership migration, production write or Firebase authorization change was performed.
