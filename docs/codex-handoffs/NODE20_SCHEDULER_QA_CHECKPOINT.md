# Node 20 Scheduler QA Checkpoint

## Review state

`NODE20_SCHEDULER_QA_READY_FOR_REVIEW`

- Date: 2026-07-26
- Branch: `shiftoryx-node20-scheduler-qa`
- Base: `175a1805ac59bf6bda6b5140c80027f5aeed213d`
- Backup: `C:\Users\thugs\.codex\tmp\shiftoryx-node20-scheduler-qa-20260726-075414`
- Work remains unstaged and uncommitted.

## Focused change

`npm run qa:scheduler` now invokes
`scripts/run-validate-scheduler-rules.mjs`. The runner uses the repository's
installed `esbuild` to bundle the validator for Node 20 into a unique OS
temporary directory, imports it, propagates failures, and removes the directory
in `finally`. The original final `npm run build` remains in the package script.

The validator's two source-inspection reads are anchored to fixed paths under
the validated repository-root `process.cwd()`. Assertions still inspect the
real checked-in sources, not generated content.

## Verified results

- Baseline Node 20.20.2 failure reproduced: `ERR_UNKNOWN_FILE_EXTENSION` for
  `src/scheduler-engine/index.ts`, exit 1, before assertions ran.
- Node 20.20.2 `npm run qa:scheduler`: PASS twice, including build.
- Installed Node 24.14.1 `npm run qa:scheduler`: PASS through the same runner.
- Unique temp paths, success cleanup, simulated build/import failure cleanup,
  error propagation, and non-silent failure behavior: PASS.
- Full Node 20 QA/security regression matrix: PASS.
- Root audit: PASS at the configured high threshold; 1 low and 1 moderate
  advisory remain outside scope.
- No generated repository artifact remains.
- No dependencies or lockfiles changed.
- No scheduler business logic, runtime integration, infrastructure, Actions,
  production, or secrets changed.
- `firestore-debug.log` remains untouched and untracked.
- Phase 2A and Phase 2B were not started.

## Reviewer focus

Review only:

```text
package.json
scripts/validate-scheduler-rules.mjs
scripts/run-validate-scheduler-rules.mjs
docs/NODE20_SCHEDULER_QA_REPORT.md
docs/codex-handoffs/NODE20_SCHEDULER_QA_CHECKPOINT.md
```

No stage, commit, push, or pull request has been performed.
