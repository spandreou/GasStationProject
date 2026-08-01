# ShiftOryx — Production Read Approval Checkpoint Handoff

- Date: 1 August 2026
- Status: `PRODUCTION_READ_APPROVAL_CHECKPOINT_VALIDATED_EXECUTION_LOCKED`
- Branch: `shiftoryx-production-read-checkpoint`
- Base SHA: `7d5cd071fd885170e3ec6fd40e50679d8836ec01`
- Pre-correction head: `0c8c795c5c0ea631ba6fbd35f181ebe7a10a0156`
- Confirmed Business Policy:
  - 1 legacy `ADMIN` per store representing store ownership
  - 0 authenticated `MANAGER` memberships (unexpected anomaly if found)
  - Target role: `OWNER`
  - `tenantMemberships` as authorization source of truth, `users/{uid}.memberships` as compatibility mirror
  - Platform-admin status separate from tenant operational ownership
- Mandatory Role Policy Contract:
  ```text
  EXPECTED_LEGACY_ROLE=ADMIN
  EXPECTED_MANAGER_COUNT=0
  TARGET_ROLE=OWNER
  AUTO_MIGRATION_ALLOWED=false
  ```
- Tooling Added:
  - `scripts/lib/tenant-membership-inventory-core.mjs` (Shared pure classification library)
  - `scripts/inventory-tenant-memberships-production-readonly.mjs` (Isolated production read-only tool)
  - `scripts/test-production-read-inventory-guards.mjs` (45-case behavioral guard test suite)
  - `scripts/validate-production-read-checkpoint.mjs` (Policy contract & rejection validator)
  - `npm run qa:production-read-checkpoint`
  - `npm run test:production-read-inventory:guards`
  - `npm run inventory:tenant-memberships:production-readonly`
- Corrected Evidence:
  - The committed guard suite was reproduced before editing and failed to load because `testPhase2AOfflineInventory` was imported from a module that did not export it.
  - After that harness-only import was removed, the missing-acknowledgement test reproduced `Missing expected exception` because the parser correctly returned `{ readOnly: false, help: false }`.
  - Parsing remains parse-only. The execution boundary rejects a missing `--read-only`; `--help` performs no environment validation or SDK initialization.
  - User reads request only exact referenced IDs with field mask `['memberships']`; tenant and platform-admin reads request exact referenced IDs with empty field mask `[]`. Reference chunks are at most 25 and execute sequentially (measured maximum active operations: 1).
  - Missing-reference fields count unique absent user/tenant IDs, not membership rows.
  - Expected valid legacy `ADMIN` policy review is separated from structural/security review. The latter includes missing/invalid timestamps, inactive/revoked state, missing references, mirror anomalies, platform-admin overlap, unexpected roles, malformed records, and conflicts, and returns a non-zero exit.
  - Protected evidence uses truthful `productionReadPerformed`, zero writes, deterministic record ordering, and serialized Firestore `DocumentSnapshot.updateTime`.
  - Canonical output validation rejects repository-contained, nonexistent, non-directory, symlink/junction/redirected and colliding paths, then revalidates immediately before `O_EXCL` creation.
  - Strict decimal limits are retention 1-720 hours (default 168) and membership maximum 1-1000 (default 100). Reviewer labels are trimmed, limited to 64 characters, and reject control characters, path separators, and email addresses.
  - Unknown SDK/runtime failures expose only `PRODUCTION_READ_RUNTIME_FAILURE`.
- Verification Status:
  - Node: `v20.20.2`
  - Five required `node --check` commands: PASS
  - `npm ci` and `npm ci --prefix functions`: PASS; dependencies and lockfiles unchanged
  - Repository policy validator: PASS
  - Guard test suite: `45/45 production read-only inventory guard tests passed cleanly.`
  - Offline inventory: PASS
  - Emulator inventory: PASS against `demo-shiftoryx-owner-inventory`; before/after snapshots identical; emulator shutdown clean
  - Build, scheduler engine, scheduler, repositories, public-readonly, tenant authorization, SaaS foundation, auth broker, export security, hardening, integrity, and Functions lint: PASS
  - Root high-threshold audit: exit 0; existing 1 low and 1 moderate advisory remain
  - Functions high-threshold audit: exit 0; existing 1 low and 9 moderate advisories remain
- Boundary Checklist:
  - Production reader execution locked: YES (`EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION`)
  - Production SDK initialized: NO
  - Production connection performed: NO
  - Production read executed: NO
  - Production write executed: NO
  - Phase 2B started: NO
  - Rules or Functions modified: NO
  - Runtime authorization or GitHub Actions modified: NO
  - Deployment performed: NO
  - Secrets touched: NO
  - `firestore-debug.log` touched: NO (remains local and untracked)
