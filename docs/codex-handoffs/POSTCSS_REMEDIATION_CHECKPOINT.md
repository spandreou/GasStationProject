# ShiftOryx PostCSS Remediation Checkpoint

- Status: `POSTCSS_REMEDIATION_READY_FOR_REVIEW`
- Date: 26 July 2026
- Branch: `shiftoryx-postcss-security-remediation`
- Base SHA: `c14fad184d13030702386e629ba90d91af166928`
- Backup: `C:\Users\thugs\.codex\tmp\shiftoryx-postcss-remediation-20260726-000648`
- Target: PostCSS high advisory `GHSA-r28c-9q8g-f849`
- Affected range: `<=8.5.17`
- Minimum patched version: `8.5.18`
- Baseline direct range/resolution: `postcss ^8.5.10 → 8.5.15`
- Selected remediation: targeted same-major direct update to
  `postcss ^8.5.18 → 8.5.18`
- Repository mutation command:
  `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --save-dev postcss@8.5.18`
- Option A no-save probe: no package change; rejected
- Option A existing-range probe: downgraded root PostCSS to `8.5.10`,
  introduced a nested Vite PostCSS and changed NanoID; rejected
- Package diff:
  - `package.json`: only PostCSS `^8.5.10 → ^8.5.18`
  - `package-lock.json` root entry: same range change
  - `node_modules/postcss`: only `version`, `resolved`, `integrity`
- No other package, lock entry, direct dependency or PostCSS dependency changed
- No install lifecycle script or native binary metadata introduced
- Root audit before: `info=0 low=1 moderate=1 high=1 critical=0 total=3`
- Root audit after: `info=0 low=1 moderate=1 high=0 critical=0 total=2`
- Target PostCSS advisory: removed
- Functions audit unchanged:
  `info=0 low=1 moderate=9 high=1 critical=0 total=11`
- Clean install: `npm ci` passed; 233 packages, 234 audited
- Installed graph: one deduplicated `postcss@8.5.18` for root, Autoprefixer,
  Tailwind, its PostCSS plugins and Vite
- Validation passed:
  - `npm run build`
  - `npm run qa:scheduler-engine`
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
- Scheduler caveat:
  - Node `v20.20.2` reproduced the known `ERR_UNKNOWN_FILE_EXTENSION` for
    `src/scheduler-engine/index.ts`
  - the same command passed under the already available bundled Node
    `v24.14.0`
  - no runtime, tool, dependency or repository workaround was installed
- Runtime exploitability: `NOT_CONFIRMED`; no ShiftOryx untrusted-CSS PostCSS
  processing path was found
- Remaining root advisories: DOMPurify low and protobufjs moderate
- Remaining Functions advisories: one low, nine moderate, one high
- Runtime/test source, Functions package files, Firebase, Cloudflare/DNS,
  Docker/Nginx, GitHub Actions, production and secrets were not changed
- `firestore-debug.log` remains unrelated, untracked and uninspected
- Nothing has been staged, committed, pushed or opened as a PR
- Phase 2A and Phase 2B were not started
- Next safe action: human review of the four-file diff; do not publish until
  explicitly requested
- Rollback: restore root `package.json` and `package-lock.json` from the backup,
  run `npm ci`, and remove the two new documents only if a complete rollback is
  explicitly selected
