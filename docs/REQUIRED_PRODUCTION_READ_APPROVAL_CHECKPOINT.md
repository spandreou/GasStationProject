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
3. **Unexpected `MANAGER` Records**: Any discovered `MANAGER` membership is an unexpected production anomaly (`EXPECTED_MANAGER_COUNT=0`). It must be flagged for manual review and excluded from automated migration paths.
4. **Conflict & Anomaly Handling**: Any duplicate pair, competing tenant claim, malformed document, inactive status (`INACTIVE`, `SUSPENDED`, `EXPIRED`, `REVOKED`), or platform-admin overlap remains strictly classified for manual review or as an invalid/conflict state.

---

## 5. Production Read Preconditions & Security Controls

Before any command is executed against a production Firestore instance, the following strict technical and organizational controls must be satisfied:

1. **Explicit Human Approval**: A separate human review and explicit written authorization must approve the specific production read run.
2. **Allowlisted Project Only**: The target project ID must be explicitly specified and validated against a pre-approved project allowlist.
3. **Non-CLI Credentials**: Credentials must be supplied via environment-bound Application Default Credentials (ADC) or managed service identity. **Zero secret, key, token, or service account credential values may be passed as command-line arguments.**
4. **Minimal Field Projection**:
   - `tenantMemberships`: Document ID, `uid`, `tenantId`, `role`, `status`, `createdAt`, `updatedAt`.
   - `users`, `tenants`, `platformAdmins`: Existence-only checks by document ID.
   - `users/{uid}.memberships[tenantId]`: Read solely for mirror consistency verification.
5. **Aggregate-Only Console Output**: CLI output must print sanitized aggregate counts and diagnostic summaries only. **Zero raw UIDs, tenant IDs, email addresses, or private data may be printed to standard output or logs.**
6. **External Manifest Storage**: Any detailed record-level inventory output required for human review must be written to an explicitly specified path outside the repository worktree, with restrictive filesystem permissions (`0600`) and a documented retention/deletion deadline.

---

## 6. Verification & Policy Enforcement Tooling

Repository tooling enforces this checkpoint via:

- `scripts/inventory-tenant-memberships.mjs` (`inventoryFirestoreProductionReadOnly`, `--source production`)
- `scripts/validate-production-read-checkpoint.mjs`
- `npm run qa:production-read-checkpoint`

The guarded production read-only entry point (`--source production`) enforces:
- Explicit environment authorization (`ALLOW_PRODUCTION_READ_ONLY_INVENTORY=true`).
- Allowlisted project ID check (`APPROVED_PRODUCTION_PROJECT_IDS`: `gasstationproject`, `gasstationproject-prod`, `shiftoryx-prod`).
- Rejection of execution when `FIRESTORE_EMULATOR_HOST` is set.
- Rejection of `--manifest-output` paths inside the repository worktree.
- Mandatory `--read-only` flag acknowledgement.
- ADC authentication (zero credentials passed via command-line arguments).
- Minimal field projections (`.select('uid', 'tenantId', 'role', 'status', 'createdAt', 'updatedAt')`).
- Aggregate-only console output (zero raw UIDs, tenant IDs, or private data printed).

The validator verifies that:
- Role policy constants (`EXPECTED_LEGACY_ROLE=ADMIN`, `EXPECTED_MANAGER_COUNT=0`, `TARGET_ROLE=OWNER`, `AUTO_MIGRATION_ALLOWED=false`) are present and intact.
- Legacy `ADMIN` records default to `MANUAL_REVIEW_REQUIRED` without explicit external approval.
- Production execution is blocked and rejected by default whenever safeguards are absent.
- Offline fixture and emulator rehearsals enforce zero state mutation and identical before/after snapshots.

---

## 7. Status Checklist

- [x] Checkpoint defined and documented
- [x] Confirmed business policy incorporated
- [x] Role policy contract enforced
- [x] Safety interpretation constraints specified
- [x] Production read technical controls specified
- [x] Guarded production read-only inventory tool implemented (`inventoryFirestoreProductionReadOnly` / `--source production`)
- [x] Repository validation script implemented (`scripts/validate-production-read-checkpoint.mjs`)
- [ ] Separate human approval for production read execution (PENDING)
- [ ] Phase 2B production migration (LOCKED / UNSTARTED)
