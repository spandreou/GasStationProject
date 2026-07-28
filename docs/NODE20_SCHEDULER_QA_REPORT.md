# Node 20 Scheduler QA TypeScript Loading Report

## Verdict

`NODE20_SCHEDULER_QA_READY_FOR_REVIEW`

## Audit metadata

- Date: 2026-07-26
- Branch: `shiftoryx-node20-scheduler-qa`
- Base: `175a1805ac59bf6bda6b5140c80027f5aeed213d`
- External backup: `C:\Users\thugs\.codex\tmp\shiftoryx-node20-scheduler-qa-20260726-075414`
- Required runtime: Node `20.20.2`, npm `10.8.2`
- Secondary installed runtime: Node `24.14.1`, npm `11.11.0`

## Baseline and root cause

Before the fix, `npm run qa:scheduler` exited with code 1 on Node 20.20.2:

```text
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for
C:\Users\thugs\Desktop\projects\shiftoryx\src\scheduler-engine\index.ts
```

The failure occurred while Node loaded the module graph, before any scheduler
assertion could run and before `Scheduler QA passed` could be printed.

The confirmed import chain was:

```text
scripts/validate-scheduler-rules.mjs
-> src/utils/autoSchedulerService.js
-> src/utils/schedulerEngineAdapter.js
-> src/scheduler-engine/index.ts
```

Node 20 cannot execute that direct TypeScript ESM import. The existing
`scripts/stress-test-scheduler-engine.mjs` already demonstrated a passing,
dependency-free repository pattern: bundle the TypeScript-bearing graph with
the installed `esbuild` and import an ESM bundle from an OS temporary directory.

## Options considered

1. Reuse the installed `esbuild` through a small QA runner: selected because it
   preserves the validator, assertions, source graph, Node 20 target, and build
   step without adding a dependency.
2. Add an existing-esbuild custom Node loader: not needed; it would add
   experimental-loader complexity.
3. Add `tsx`, `ts-node`, Babel, or migrate source files: prohibited and
   unnecessary.

## Implementation

Changed files:

```text
package.json
scripts/validate-scheduler-rules.mjs
scripts/run-validate-scheduler-rules.mjs
docs/NODE20_SCHEDULER_QA_REPORT.md
docs/codex-handoffs/NODE20_SCHEDULER_QA_CHECKPOINT.md
```

The package script changed from:

```text
node scripts/validate-scheduler-rules.mjs && npm run build
```

to:

```text
node scripts/run-validate-scheduler-rules.mjs && npm run build
```

The runner:

- derives the repository root from its own checked-in path;
- requires `process.cwd()` to be that repository root;
- accepts no CLI path and reads no environment path;
- creates a unique `shiftoryx-scheduler-qa-*` directory under `node:os`
  `tmpdir()`;
- bundles the unchanged validator entry graph with the installed `esbuild`;
- uses `bundle: true`, ESM format, Node platform, and target `node20`;
- dynamically imports only its internally selected generated bundle;
- removes the temporary directory recursively in `finally`;
- does not catch or suppress build, import, or assertion failures.

Bundling changes `import.meta.url` to the temporary bundle URL. The validator's
two source-inspection reads therefore now use fixed repository-relative paths:

```text
resolve(process.cwd(), "src/hooks/useSchedulerStore.js")
resolve(process.cwd(), "src/utils/autoSchedulerService.js")
```

The runner's working-directory check makes that root assumption explicit. No
assertion, fixture expectation, scheduler module, or scheduler business rule
was changed.

## Security and cleanup validation

- Success cleanup: passed after each Node 20 run and the Node 24 run.
- Failure cleanup: passed for both a simulated bundle-build failure and a
  simulated generated-bundle import failure, without changing checked-in files.
- Error propagation: both simulated failures retained their expected messages
  and could not be silently reported as passing.
- Unique output: two failure probes received different temporary directories.
- Repository residue: no generated bundle or temporary directory remained under
  the repository.
- Network: the runner imports only local Node built-ins and the already
  installed local `esbuild`; it introduces no network API.
- Inputs and disclosure: no CLI/env path is accepted, and the runner prints no
  environment variables, secrets, or generated source.

## Runtime and regression results

Node 20.20.2:

| Command | Result |
| --- | --- |
| `npm run qa:scheduler` (primary run) | PASS, scheduler assertions and build, exit 0 |
| `npm run qa:scheduler` (repeat run) | PASS, scheduler assertions and build, exit 0 |
| `npm run build` | PASS |
| `npm run qa:scheduler-engine` | PASS |
| `npm run qa:repositories` | PASS |
| `npm run qa:public-readonly` | PASS |
| `npm run qa:tenant-authorization` | PASS |
| `npm run qa:saas-foundation` | PASS |
| `npm run qa:auth-broker` | PASS |
| `npm run qa:export-security` | PASS |
| `npm run security:hardening` | PASS |
| `npm run security:integrity` | PASS |
| `npm run lint --prefix functions` | PASS |
| `npm run security:audit` | PASS at `--audit-level=high`; reports 1 low and 1 moderate advisory |

The already installed secondary runtime was Node 24.14.1 rather than the
task's earlier 24.14.0 observation. Without installing or updating Node,
`npm run qa:scheduler` passed through the same checked-in runner with Node
24.14.1 and npm 11.11.0.

Vite emitted its existing large-chunk advisory during successful builds; it did
not fail validation and is outside this focused QA-tooling correction.

## Dependency, scope, and rollback

- No dependency range changed.
- `package-lock.json`, `functions/package.json`, and
  `functions/package-lock.json` are unchanged.
- Scheduler application sources, engine sources, and the existing stress test
  are unchanged.
- Firebase, Cloudflare, DNS, Docker, Nginx, GitHub Actions, production, and
  secrets were not changed.
- `firestore-debug.log` remains untracked and was not opened, read, modified,
  copied, deleted, staged, or included.
- Phase 2A and Phase 2B were not started.

Remaining risks are limited to the intentional requirement that the QA command
run from the repository root, future validator imports that might not be
bundle-compatible, and the fact that the available Node 24 comparison runtime
is patch version 24.14.1 rather than 24.14.0. The required Node 20.20.2 target
is fully validated.

Rollback: restore `package.json` and
`scripts/validate-scheduler-rules.mjs` from the external backup, remove
`scripts/run-validate-scheduler-rules.mjs` and these two report files, then
verify `git diff --check`, `git status --short`, and that
`package-lock.json` remains unchanged.
