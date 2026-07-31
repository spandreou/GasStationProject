# ShiftOryx — Required Production Read Approval Checkpoint

Date: 31 July 2026

Branch: `shiftoryx-production-read-checkpoint`

Base SHA: `7d5cd071fd885170e3ec6fd40e50679d8836ec01`

Status: `PRODUCTION_READ_APPROVAL_CHECKPOINT_ESTABLISHED`

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
3. **Unexpected `MANAGER` Records**: Any discovered `MANAGER` membership is an unexpected production anomaly (`EXPECTED_MANAGER_COUNT=0`). It produces verdict `UNEXPECTED_MANAGER_DATA_REQUIRES_REVIEW`, flags the execution for manual review, and sets a non-zero exit code.
4. **Conflict & Anomaly Handling**: Any duplicate pair, competing tenant claim, malformed document, inactive status (`INACTIVE`, `SUSPENDED`, `EXPIRED`, `REVOKED`), or platform-admin overlap remains strictly classified for manual review or as an invalid/conflict state.

---

## 5. Production Read Preconditions & Security Controls

Before any command is executed against a production Firestore instance, the following strict technical and organizational controls must be satisfied:

1. **Exact Production Project Confirmation Lock**: The code contains `CONFIRMED_PRODUCTION_PROJECT_ID = ''`. Until a human developer explicitly sets and commits a confirmed project ID constant, all execution attempts fail closed immediately before Firebase Admin SDK initialization with `EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION`.
2. **Environment-Only Configuration**: The production CLI (`scripts/inventory-tenant-memberships-production-readonly.mjs`) accepts **only** `--read-only` and `--help`. All configuration parameters must be supplied via environment variables:
   - `SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID`
   - `SHIFTORYX_PRODUCTION_READ_APPROVED=YES_READ_ONLY_INVENTORY`
   - `SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER`
   - `SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR` (must be absolute, outside repo worktree, non-symlink)
   - `SHIFTORYX_PRODUCTION_INVENTORY_RETENTION_HOURS`
   - `SHIFTORYX_PRODUCTION_INVENTORY_MAX_MEMBERSHIPS`
3. **SDK Initialization Boundary**: Every local configuration check, project lock check, environment validation, output directory check, and emulator check passes **before** `firebase-admin` is imported or initialized.
4. **Non-CLI Credentials**: Credentials must be supplied via environment-bound Application Default Credentials (ADC). Zero credential paths or keys may be accepted via CLI.
5. **Minimal Field Projection & Bounded Reads**:
   - `tenantMemberships`: Document ID, `uid`, `tenantId`, `role`, `status`, `createdAt`, `updatedAt` (`.select(...)` query limit = `maxMemberships + 1`).
   - `users`, `tenants`, `platformAdmins`: Bounded, chunked reference lookups (chunk size 10) for only unique UIDs/tenantIDs found in membership records. No collection-wide scans.
   - `users/{uid}.memberships[tenantId]`: Read solely for mirror consistency verification.
6. **Aggregate-Only Console Output**: CLI output prints sanitized aggregate JSON counts and diagnostic verdicts only. Zero raw UIDs, tenant IDs, email addresses, or private data are printed to stdout or logs.
7. **Protected External Audit Output**: Detailed record-level inventory output is written to an externally configured directory (`SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR`) using a randomly generated correlation ID (`shiftoryx-inventory-<correlationId>.json`), exclusive file creation (`O_EXCL`), restrictive permissions (`0o600`), and a calculated retention deadline.
8. **Static No-Write Guarantee**: The production script contains zero executable Firestore write method calls (`set`, `update`, `delete`, `add`, `batch`, `runTransaction`, etc.) and zero write CLI flags (`--write`, `--apply`, `--execute`).

---

## 6. Verification & Policy Enforcement Tooling

Repository tooling enforces this checkpoint via:

- `scripts/inventory-tenant-memberships.mjs` (Phase 2A offline fixture & local emulator tool)
- `scripts/inventory-tenant-memberships-production-readonly.mjs` (Isolated production read-only tool)
- `scripts/test-production-read-inventory-guards.mjs` (33-case guard test suite)
- `scripts/validate-production-read-checkpoint.mjs` (Policy contract & rejection validator)
- `npm run qa:production-read-checkpoint`
- `npm run test:production-read-inventory:guards`

The validator verifies that:
- Role policy constants (`EXPECTED_LEGACY_ROLE=ADMIN`, `EXPECTED_MANAGER_COUNT=0`, `TARGET_ROLE=OWNER`, `AUTO_MIGRATION_ALLOWED=false`) are present and intact.
- Legacy `ADMIN` records default to `MANUAL_REVIEW_REQUIRED` without explicit external approval.
- Exact project confirmation lock and environment authorization guards block execution by default.
- Static source analysis confirms zero write capability in the production entry point.
- Offline fixture and emulator rehearsals enforce zero state mutation and identical before/after snapshots.

---

## 7. Status Checklist

- [x] Checkpoint defined and documented
- [x] Confirmed business policy incorporated
- [x] Role policy contract enforced
- [x] Safety interpretation constraints specified
- [x] Production read technical controls specified
- [x] Isolated production read-only inventory tool implemented (`scripts/inventory-tenant-memberships-production-readonly.mjs`)
- [x] Exact production project confirmation lock implemented (`CONFIRMED_PRODUCTION_PROJECT_ID`)
- [x] Dedicated 33-case guard test suite implemented (`scripts/test-production-read-inventory-guards.mjs`)
- [x] Repository validation script updated (`scripts/validate-production-read-checkpoint.mjs`)
- [ ] Separate human approval for production read execution (PENDING)
- [ ] Phase 2B production migration (LOCKED / UNSTARTED)
