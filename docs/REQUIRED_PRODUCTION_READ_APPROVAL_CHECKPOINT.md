# ShiftOryx — Required Production Read Approval Checkpoint

Date: 1 August 2026

Branch: `shiftoryx-production-read-checkpoint`

Base SHA: `7d5cd071fd885170e3ec6fd40e50679d8836ec01`

Status: `PRODUCTION_READ_APPROVAL_CHECKPOINT_VALIDATED_EXECUTION_LOCKED`

---

## 1. Executive Summary

This document establishes the repository-side policy contract, technical requirements, and human review checkpoint required before any production read of ShiftOryx `tenantMemberships` or related Firestore collections may be authorized or executed.

Phase 2A established the read-only inventory classification logic, data model contracts, and local Firebase Emulator rehearsal capabilities. The Trivy baseline security remediation was merged via PR #19.

This checkpoint defines the strict boundary between repository design/rehearsal tooling and production execution. **No production read, write, or deployment has been performed.**

---

## 2. Confirmed Business Policy

The confirmed ShiftOryx pilot business model and role architecture is defined as follows:

1. **Store Ownership Representation**: Each existing pilot store operates with exactly one legacy authenticated `ADMIN` membership record.
2. **Owner Identity**: That legacy `ADMIN` record represents the real-world business owner of that store.
3. **No Authenticated Managers**: Authenticated `MANAGER` tenant memberships are **not used** in the pilot or MVP. The expected production `MANAGER` record count is **exactly zero**.
4. **Target Role**: The target MVP authenticated tenant role is `OWNER`.
5. **Source of Truth**: `tenantMemberships` (`tenantMemberships/{uid}_{tenantId}`) is the single canonical authorization source of truth.
6. **Compatibility Mirror**: `users/{uid}.memberships` serves strictly as a secondary compatibility mirror.
7. **Platform Admin Isolation**: Platform-admin status (`platformAdmins/{uid}`) remains strictly separate from tenant operational ownership and does not grant tenant operational access.

---

## 3. Mandatory Role Policy Contract

Every inventory execution and checkpoint validation must enforce the following explicit role policy contract:

```text
EXPECTED_LEGACY_ROLE=ADMIN
EXPECTED_MANAGER_COUNT=0
TARGET_ROLE=OWNER
AUTO_MIGRATION_ALLOWED=false
```

---

## 4. Safety Interpretation & Structural Validation

Despite the business policy that legacy `ADMIN` represents the store owner, **no automatic classification or automatic role migration is permitted**.

1. **Structural & Record-Level Validation**: Every `ADMIN` record must pass all structural constraints (canonical ID matching `uid_tenantId`, valid timestamps, valid active status, existing user reference, existing tenant reference, zero platform-admin overlap, zero competing active ownership claims).
2. **Review Candidates by Default**: Because the production reader contains no approval manifest, all valid legacy `ADMIN` records **must remain classified as `MANUAL_REVIEW_REQUIRED`** until an external, human-reviewed approval manifest is created.
3. **Explicit Verdict Separation**: A structurally valid active legacy `ADMIN` whose only reason is `legacy-admin-owner-semantics-not-approved` produces `EXPECTED_POLICY_MANUAL_REVIEW`. That expected policy state does not fail the read-only checkpoint by itself. Every structural or security anomaly produces `STRUCTURAL_OR_SECURITY_MANUAL_REVIEW` and a non-zero CLI exit.
4. **Unexpected `MANAGER` Records**: Any discovered `MANAGER` membership is an unexpected production anomaly (`EXPECTED_MANAGER_COUNT=0`) and therefore produces the structural/security verdict and a non-zero exit.
5. **Conflict & Anomaly Handling**: Missing or invalid timestamp provenance/order, missing user or tenant references, malformed/absent/mismatched user mirrors, unknown roles, malformed documents, duplicate or competing claims, inactive status (`INACTIVE`, `SUSPENDED`, `EXPIRED`, `REVOKED`), and platform-admin overlap all force structural/security review.

---

## 5. Production Read Preconditions & Security Controls

Before any command is executed against a production Firestore instance, the following strict technical and organizational controls must be satisfied:

1. **Exact Production Project Confirmation Lock**: The code contains `CONFIRMED_PRODUCTION_PROJECT_ID = ''`. Until a human developer explicitly sets and commits a confirmed project ID constant, all execution attempts fail closed immediately before Firebase Admin SDK initialization with `EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION`.
2. **CLI Acknowledgement Boundary**: Argument parsing only parses supported options. The execution boundary separately requires `--read-only`; `--help` exits before environment inspection or SDK initialization; and every unknown argument is rejected.
3. **Environment-Only Configuration**: The production CLI (`scripts/inventory-tenant-memberships-production-readonly.mjs`) accepts **only** `--read-only` and `--help`. All configuration parameters must be supplied via environment variables:
   - `SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID`
   - `SHIFTORYX_PRODUCTION_READ_APPROVED=YES_READ_ONLY_INVENTORY`
   - `SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER`
   - `SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR` (must be absolute, outside repo worktree, non-symlink)
   - `SHIFTORYX_PRODUCTION_INVENTORY_RETENTION_HOURS`
   - `SHIFTORYX_PRODUCTION_INVENTORY_MAX_MEMBERSHIPS`
4. **Strict Local Input Validation**: Retention is a strict decimal integer from 1 through 720 hours (default 168). Maximum memberships is a strict decimal integer from 1 through 1000 (default 100); raising the hard-coded 1000 limit requires future code review. Values such as `24hours`, `10.5`, `1e3`, and ` 24x` are rejected. The reviewer value is trimmed to a non-sensitive operational label of at most 64 characters and rejects control characters, newlines, path separators, and email addresses.
5. **Canonical External Output Boundary**: The output directory must already exist, be a directory, resolve outside the canonical repository root, and contain no detectable symlink, junction, or redirected ancestor. The canonical path is checked again immediately before exclusive file creation. Nonexistent paths, non-directories, repository-contained paths, redirects, and collisions fail closed; the full path is never printed.
6. **SDK Initialization Boundary**: Every local configuration check, project lock check, environment validation, output directory check, and emulator check passes **before** `firebase-admin` is imported or initialized.
7. **Non-CLI Credentials**: Credentials must be supplied via environment-bound Application Default Credentials (ADC). Zero credential paths or keys may be accepted via CLI.
8. **Minimal Field Projection & Bounded Reads** (validated against installed `firebase-admin` 13.10.0 / `@google-cloud/firestore` 7.11.6 support for `getAll(...refs, { fieldMask })`):
   - `tenantMemberships`: Document ID, `uid`, `tenantId`, `role`, `status`, `createdAt`, `updatedAt` (`.select(...)` query limit = `maxMemberships + 1`).
   - `users`: Exact unique referenced document IDs only, chunked at no more than 25 references per sequential operation, with field mask `['memberships']`. Only existence and the compatibility mirror are consumed.
   - `tenants`: Exact unique referenced document IDs only, with empty field mask `[]` for existence-only reads.
   - `platformAdmins`: Exact unique referenced user IDs only, with empty field mask `[]` for existence-only reads.
   - No complete user, tenant, or platform-admin document and no collection-wide reference scan is requested. The behavioral concurrency spy measures a maximum of one active reference-read operation.
9. **Unambiguous Missing-Reference Counts**: `missingUserReferenceCount` and `missingTenantReferenceCount` count unique missing referenced IDs, not membership rows. One user with two valid tenant memberships therefore counts as zero missing users; one absent user referenced by two rows counts as one missing user reference.
10. **Aggregate-Only Console Output**: CLI output prints sanitized aggregate JSON counts and diagnostic verdicts only. Zero raw UIDs, tenant IDs, email addresses, private data, or full output paths are printed to stdout or logs. Unknown SDK/runtime failures emit only `PRODUCTION_READ_RUNTIME_FAILURE`; raw Firebase, ADC, filesystem, and credential-path messages are not relayed.
11. **Protected External Audit Output**: Detailed record-level inventory output is written to the canonical external directory using a randomly generated correlation ID (`shiftoryx-inventory-<correlationId>.json`), exclusive file creation (`O_EXCL`), restrictive permissions (`0o600`), and a calculated retention deadline. Both console and audit evidence use `productionReadPerformed`; synthetic runs record `false`, and a completed membership query records `true`. Writes always remain zero.
12. **Snapshot Preconditions**: Each protected record snapshot is deterministically ordered and contains the canonical membership document ID/path, UID, tenant ID, role, status, serialized `createdAt`, `updatedAt`, Firestore `DocumentSnapshot.updateTime`, classification and reasons, mirror state, and platform-admin overlap state. Record-level values remain external and are never printed.
13. **Static No-Write Guarantee**: The production script contains zero executable Firestore write method calls (`set`, `update`, `delete`, `add`, `batch`, `runTransaction`, etc.) and zero write CLI flags (`--write`, `--apply`, `--execute`).

---

## 6. Verification & Policy Enforcement Tooling

Repository tooling enforces this checkpoint via:

- `scripts/inventory-tenant-memberships.mjs` (Phase 2A offline fixture & local emulator tool)
- `scripts/inventory-tenant-memberships-production-readonly.mjs` (Isolated production read-only tool)
- `scripts/test-production-read-inventory-guards.mjs` (45-case behavioral guard test suite)
- `scripts/validate-production-read-checkpoint.mjs` (Policy contract & rejection validator)
- `npm run qa:production-read-checkpoint`
- `npm run test:production-read-inventory:guards`

The committed pre-correction suite was first reproduced and failed during module loading because it imported the nonexistent `testPhase2AOfflineInventory` export. After the harness-only import correction, the incorrectly scoped missing-acknowledgement assertion also failed because `parseProductionCliArgs([])` correctly returned `{ readOnly: false, help: false }`. The corrected suite tests the CLI execution boundary and reports its dynamically counted result. The offline and emulator inventories are executed and reported as separate commands; their package-script existence is not counted as emulator evidence.

The validator and behavioral suite verify that:
- Role policy constants (`EXPECTED_LEGACY_ROLE=ADMIN`, `EXPECTED_MANAGER_COUNT=0`, `TARGET_ROLE=OWNER`, `AUTO_MIGRATION_ALLOWED=false`) are present and intact.
- Legacy `ADMIN` records default to `MANUAL_REVIEW_REQUIRED` without explicit external approval.
- Exact project confirmation lock and environment authorization guards block execution by default.
- Exact document IDs, field masks, bounded sequential reference reads, unique missing-reference counts, structural verdicts, protected JSON evidence, update-time serialization, canonical output paths, strict input parsing, and runtime-error redaction behave as specified.
- Static source analysis confirms zero write capability in the production entry point.
- Offline fixture and emulator rehearsals enforce zero state mutation and identical before/after snapshots.

Validation on Node `v20.20.2` on 1 August 2026 produced 45/45 passing guard cases, a passing policy checkpoint, passing offline and demo-project emulator inventories, and passing build/scheduler/repository/public-readonly/tenant-authorization/SaaS/auth-broker/export/hardening/integrity/Functions-lint checks. Both npm audits returned exit 0 at `--audit-level=high`; they still reported existing lower-severity findings (root: 1 low and 1 moderate; Functions: 1 low and 9 moderate). No dependency or lockfile was changed to suppress those findings.

---

## 7. Status Checklist

- [x] Checkpoint defined and documented
- [x] Confirmed business policy incorporated
- [x] Role policy contract enforced
- [x] Safety interpretation constraints specified
- [x] Production read technical controls specified
- [x] Isolated production read-only inventory tool implemented (`scripts/inventory-tenant-memberships-production-readonly.mjs`)
- [x] Exact production project confirmation lock implemented (`CONFIRMED_PRODUCTION_PROJECT_ID`)
- [x] Dedicated 45-case behavioral guard test suite implemented (`scripts/test-production-read-inventory-guards.mjs`)
- [x] Repository validation script updated (`scripts/validate-production-read-checkpoint.mjs`)
- [ ] Separate human approval for production read execution (PENDING)
- [ ] Phase 2B production migration (LOCKED / UNSTARTED)
