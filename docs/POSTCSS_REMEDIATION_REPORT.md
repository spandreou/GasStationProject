# ShiftOryx Focused PostCSS Remediation Report

Date: 26 July 2026

Branch: `shiftoryx-postcss-security-remediation`

Base SHA: `c14fad184d13030702386e629ba90d91af166928`

Final verdict: `POSTCSS_REMEDIATION_READY_FOR_REVIEW`

This task investigated and remediated only the root PostCSS high advisory
`GHSA-r28c-9q8g-f849`. It did not address DOMPurify, protobufjs or Firebase
Functions advisories and did not start Phase 2A or Phase 2B.

## Scope And Security Boundary

The affected package was the root direct development dependency
`postcss@8.5.15`.

Security invariant:

> Every dependency path used by the ShiftOryx CSS build must resolve PostCSS
> to `8.5.18` or later, where untrusted previous-source-map annotations are
> constrained to the CSS file's own directory.

Behavior that had to remain intact:

- Vite production builds,
- Tailwind and Autoprefixer CSS processing,
- the existing PostCSS 8 API used indirectly by those build tools,
- all configured repository, tenant, authorization, export and security QA,
- Functions syntax validation.

No application source directly imports or invokes PostCSS. The repository
uses it through `postcss.config.js`, with Tailwind CSS and Autoprefixer, during
the build. No ShiftOryx path that accepts attacker-controlled CSS for PostCSS
processing was found. Demonstrated application exploitability therefore
remains `NOT_CONFIRMED`; the vulnerable dependency resolution and audit gate
were nevertheless present and required remediation.

The following remained unchanged:

- runtime and test source,
- Firebase data, Rules, Functions code and configuration,
- Functions package manifests and lockfile,
- Cloudflare and DNS,
- Docker and Nginx,
- GitHub Actions,
- production and secrets,
- Phase 2A and Phase 2B.

The unrelated untracked `firestore-debug.log` was not opened, read, edited,
copied, deleted or staged.

## External Backup

Pre-change package files were copied to:

```text
C:\Users\thugs\.codex\tmp\shiftoryx-postcss-remediation-20260726-000648
```

The backup contains only:

```text
package.json
package-lock.json
```

It does not contain `node_modules` or `firestore-debug.log`.

## Toolchain

Normal repository environment:

```text
node v20.20.2
npm 10.8.2
```

The already available Codex workspace Node `v24.14.0` was used only for the
known scheduler comparison. No Node runtime, scanner, package manager or other
tool was installed or modified.

## Finding Revalidation

### Advisory

| Field | Value |
| --- | --- |
| Advisory | `GHSA-r28c-9q8g-f849` |
| Severity | High |
| Package | `postcss` |
| Affected versions | `<=8.5.17` |
| Patched version | `8.5.18` |
| Weakness | Path traversal while auto-loading a previous source map |

The vulnerable behavior allowed an untrusted `sourceMappingURL` annotation to
resolve a `.map` path outside the directory of the CSS file. PostCSS `8.5.18`
restricts previous-source-map loading to the `opts.from` directory unless a
caller explicitly opts into `unsafeMap`.

The installed `8.5.18` implementation rejects a relative path equal to `..`,
starting with `..\`, or resolving as an absolute path. The legitimate
same-directory source-map behavior is preserved. The ShiftOryx build passed
with this boundary active.

### Root dependency graph before

One deduplicated `postcss@8.5.15` installation served every path:

```text
root devDependency postcss@^8.5.10
→ postcss@8.5.15

autoprefixer@10.4.27
→ peer postcss@^8.1.0
→ postcss@8.5.15 deduped

tailwindcss@3.4.19
→ postcss@^8.4.47
→ postcss@8.5.15 deduped

tailwindcss@3.4.19
→ postcss-import@15.1.0
→ peer postcss@^8.0.0
→ postcss@8.5.15 deduped

tailwindcss@3.4.19
→ postcss-js@4.1.0
→ peer postcss@^8.4.21
→ postcss@8.5.15 deduped

tailwindcss@3.4.19
→ postcss-load-config@6.0.1
→ peerOptional postcss@>=8.0.9
→ postcss@8.5.15 deduped

tailwindcss@3.4.19
→ postcss-nested@6.2.0
→ peer postcss@^8.2.14
→ postcss@8.5.15 deduped

vite@8.0.16
→ postcss@^8.5.15
→ postcss@8.5.15 deduped
```

The root direct PostCSS declaration and its lock resolution controlled the
single deduplicated version.

## Audit Baseline

Root before:

```text
info=0 low=1 moderate=1 high=1 critical=0 total=3
```

| Package | Severity | Advisory |
| --- | --- | --- |
| `dompurify` | Low | `GHSA-c2j3-45gr-mqc4` |
| `postcss` | High | `GHSA-r28c-9q8g-f849` |
| `protobufjs` | Moderate | `GHSA-j3f2-48v5-ccww` |

The PostCSS audit record reported:

```text
affected range: <=8.5.17
isDirect: true
fixAvailable: true
```

Functions baseline:

```text
info=0 low=1 moderate=9 high=1 critical=0 total=11
```

The Functions tree remained outside this focused task.

## Registry And Compatibility Evidence

Registry metadata on 26 July 2026 showed:

- installed PostCSS before: `8.5.15`,
- minimum patched PostCSS: `8.5.18`,
- latest PostCSS: `8.5.23`,
- root manifest range before: `^8.5.10`,
- `postcss@8.5.15` and `postcss@8.5.18` have identical dependencies,
- both support Node `^10 || ^12 || >=14`.

Both versions depend on:

```text
nanoid ^3.3.12
picocolors ^1.1.1
source-map-js ^1.2.1
```

`postcss@8.5.18` has no install, preinstall, postinstall or prepare lifecycle
script; no `bin`; no `gypfile`; and no native binary metadata.

No direct PostCSS API is used by ShiftOryx source. The upstream `8.5.18`
change narrows automatic previous-map file loading but does not require a
Vite, Tailwind, Autoprefixer or application API migration. The build result
confirmed compatibility with the repository's actual CSS pipeline.

## Remediation Decision Ladder

### Option A1: exact patched version with `--no-save`

Isolated probe:

```text
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --no-save postcss@8.5.18
```

Result: rejected. npm left both package files unchanged, so the vulnerable
`8.5.15` lock resolution remained.

### Option A2: refresh the existing manifest range

Isolated probe:

```text
npm install --package-lock-only --ignore-scripts --no-audit --no-fund "postcss@^8.5.10"
```

Result: rejected. npm resolved the root package down to `8.5.10`, introduced
a second nested PostCSS copy for Vite and changed NanoID. This was vulnerable,
broader than the target and not reviewable.

### Selected Option B: minimum patched same-major direct update

Isolated probe and repository mutation:

```text
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --save-dev postcss@8.5.18
```

Why this was selected:

- Option A did not produce a safe lockfile-only result,
- `8.5.18` is the minimum patched version,
- the direct dependency remains on PostCSS major 8,
- no parent package, sibling dependency or PostCSS transitive dependency
  changes,
- no runtime migration is needed,
- the probe removed the high advisory,
- the final package diff is limited to two related version fields and the
  PostCSS package resolution.

### Options C And D

- No major upgrade was required or implemented.
- No npm `overrides` or `resolutions` entry was required or added.

## Package Diff

Direct declaration:

```text
postcss ^8.5.10 → ^8.5.18
```

Installed/locked package:

```text
postcss 8.5.15 → 8.5.18
```

The package-manager-generated diff changes:

- `package.json`: only the PostCSS devDependency range,
- `package-lock.json` root package entry: only the same range,
- `package-lock.json` `node_modules/postcss`: only `version`, `resolved` and
  `integrity`.

All other manifest properties, lock package entries, PostCSS dependencies and
non-package lock fields are identical to the backup.

Tracked package diff before adding this report:

```text
package-lock.json | 8 ++++----
package.json      | 2 +-
2 files changed, 5 insertions(+), 5 deletions(-)
```

## Clean Install And Dependency Graph After

Command:

```text
npm ci
```

Result: `PASS`.

```text
added 233 packages
audited 234 packages
2 vulnerabilities (1 low, 1 moderate)
```

Every dependency path now resolves the same safe package:

```text
root postcss@^8.5.18
→ postcss@8.5.18

autoprefixer@10.4.27
tailwindcss@3.4.19
postcss-import@15.1.0
postcss-js@4.1.0
postcss-load-config@6.0.1
postcss-nested@6.2.0
vite@8.0.16
→ postcss@8.5.18 deduped
```

## Audit Results After

Root after:

```text
info=0 low=1 moderate=1 high=0 critical=0 total=2
```

Focused success criteria:

| Criterion | Result |
| --- | --- |
| `GHSA-r28c-9q8g-f849` absent | PASS |
| Root critical advisories zero | PASS |
| Root high advisories zero | PASS |
| No new advisory introduced | PASS |
| DOMPurify/protobufjs left in separate scope | PASS |

Functions after:

```text
info=0 low=1 moderate=9 high=1 critical=0 total=11
```

The Functions result is unchanged.

## Behavioral Validation

| Command | Result | Notes |
| --- | --- | --- |
| `npm run build` | PASS | Vite 8.0.16; 1,947 modules; existing chunk warnings only |
| `npm run qa:scheduler-engine` | PASS | Scheduler engine stress QA |
| `npm run qa:repositories` | PASS | Repository boundaries |
| `npm run qa:public-readonly` | PASS | Public read-only tenant contract |
| `npm run qa:tenant-authorization` | PASS | Tenant authorization |
| `npm run qa:saas-foundation` | PASS | SaaS foundation |
| `npm run qa:auth-broker` | PASS | Auth broker |
| `npm run qa:export-security` | PASS | Export audit security |
| `npm run security:hardening` | PASS | Security hardening |
| `npm run security:integrity` | PASS | Firestore integrity |
| `npm run lint --prefix functions` | PASS | Functions syntax checks |
| `npm run security:audit` | PASS | Exit 0 at `--audit-level=high`; only low/moderate remain |

### Scheduler runtime caveat

The required normal-environment command:

```text
npm run qa:scheduler
```

under Node `v20.20.2` reproduced the known:

```text
ERR_UNKNOWN_FILE_EXTENSION
src/scheduler-engine/index.ts
```

The failure occurs while Node loads TypeScript directly, before PostCSS,
Firebase or application behavior executes. It is unchanged from the previous
dependency task.

For comparison only, the exact same repository command passed scheduler QA
and the nested build under the already available bundled Node `v24.14.0`.
No runtime was installed or modified and no repository workaround was added.

## Security Closure And Preserved Behavior

The original dependency finding no longer reproduces:

- `npm audit --json` has no PostCSS vulnerability entry,
- root high count changed `1 → 0`,
- `npm ls postcss` resolves only `postcss@8.5.18`,
- the installed package contains the upstream previous-map directory-boundary
  check,
- `npm run security:audit` now exits successfully.

Legitimate behavior remains intact:

- Vite, Tailwind and Autoprefixer use the same PostCSS 8 graph,
- the production build succeeds,
- every configured non-scheduler QA and security command passes under the
  normal Node environment,
- the scheduler command passes under the already known compatible Node 24
  runtime,
- no application, test or infrastructure source changed.

## Files Changed

Intended final repository changes:

```text
package.json
package-lock.json
docs/POSTCSS_REMEDIATION_REPORT.md
docs/codex-handoffs/POSTCSS_REMEDIATION_CHECKPOINT.md
```

No file is staged, committed, pushed or published as a pull request by this
task.

## Remaining Advisories And Risks

Root advisories still present:

- DOMPurify low, `GHSA-c2j3-45gr-mqc4`,
- protobufjs moderate, `GHSA-j3f2-48v5-ccww`.

Functions advisories remain:

```text
info=0 low=1 moderate=9 high=1 critical=0 total=11
```

Affected Functions packages include `@google-cloud/firestore`,
`@google-cloud/storage`, `body-parser`, `fast-xml-parser`, `firebase-admin`,
`gaxios`, `google-gax`, `protobufjs`, `retry-request`, `teeny-request` and
`uuid`.

Remaining risks:

- plain `npm audit` remains non-zero because low and moderate advisories
  remain, although the repository high-level security gate now passes,
- the Functions tree retains a high advisory and needs a separately approved
  compatibility/remediation task,
- demonstrated ShiftOryx exploitability for the removed PostCSS issue was not
  confirmed because no untrusted-CSS processing path was found,
- PostCSS now intentionally rejects automatic previous-map paths outside the
  CSS input directory; no ShiftOryx usage depends on that unsafe behavior, and
  the build passed,
- the normal Node 20 scheduler QA loader inconsistency remains separate.

These risks do not justify broadening this branch.

## Rollback

Before staging, restore the two package files from the external backup:

```powershell
Copy-Item `
  "C:\Users\thugs\.codex\tmp\shiftoryx-postcss-remediation-20260726-000648\package.json" `
  ".\package.json" `
  -Force

Copy-Item `
  "C:\Users\thugs\.codex\tmp\shiftoryx-postcss-remediation-20260726-000648\package-lock.json" `
  ".\package-lock.json" `
  -Force

npm ci
```

For a complete documentation rollback, remove only the two new PostCSS
documents after explicit human confirmation. Do not touch
`firestore-debug.log`.

## Phase Boundary

Phase 2A and Phase 2B were not started. No production write, Firebase
authorization change or infrastructure modification was performed.
