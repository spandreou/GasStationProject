# ShiftOryx Phase 2A OWNER Migration Design

Date: 2026-07-28
Status: design only; no production writer exists
Prerequisite for use: separate explicit Phase 2B approval

## 1. Goal And Non-Goals

The future Phase 2B goal is to normalize only explicitly approved legacy tenant
memberships to `OWNER` without broadening access unintentionally, losing
rollback data, confusing platform administration with tenant ownership or
locking out the pilot.

This Phase 2A document does not:

- connect to production;
- implement a production read connector;
- implement a production writer;
- create a write path hidden behind a flag;
- modify any membership;
- change Rules, Functions, validators, UI or tenant access;
- remove `ADMIN` or `MANAGER` compatibility.

## 2. Eligible And Ineligible Classifications

| Classification | Phase 2B treatment |
| --- | --- |
| `SAFE_CANDIDATE` | the only role-change-eligible class; still requires inclusion in the signed/approved migration manifest |
| `NO_MIGRATION_REQUIRED` | skip; verify the active canonical `OWNER` remains unchanged |
| `MANUAL_REVIEW_REQUIRED` | exclude until a named human decision supplies record-level evidence and expected current values |
| `INVALID_OR_MALFORMED` | exclude; repair is a separate approved data-quality task |
| `REVOKED_OR_INACTIVE` | exclude; never reactivate as a migration side effect |
| `CONFLICT_OR_DUPLICATE` | exclude; do not deduplicate, delete or choose an owner automatically |

A record becomes `SAFE_CANDIDATE` only when all of these are true:

1. canonical document key equals `{uid}_{tenantId}`;
2. `uid`, `tenantId`, role and status are valid and internally consistent;
3. current status is exactly `ACTIVE`;
4. current role is a legacy role explicitly covered by the approved decision;
5. matching user and tenant exist;
6. timestamp/provenance is complete and coherent;
7. user-profile membership mirror is absent by approved policy or matches the
   canonical record exactly;
8. there is no duplicate or competing active ownership claim;
9. any platform-admin overlap is explicitly reviewed;
10. business ownership evidence identifies this user as the intended tenant
    OWNER;
11. the approval manifest records exact current role, status and Firestore
    update time.

Technical consistency alone is not business ownership evidence.

## 3. ADMIN Policy Options

### Option A — record-level owner-equivalence approval (recommended)

Keep an `ADMIN` record in manual review until an authorized reviewer confirms
that it represented the tenant owner, not merely an administrator. Approved
records can then become `SAFE_CANDIDATE`.

Advantages:

- least privilege;
- preserves a clear audit trail;
- supports mixed historical meanings;
- avoids a blanket semantic assumption.

### Option B — retain temporary compatibility

Leave unresolved `ADMIN` records unchanged while runtime and Rules continue to
accept them. This avoids lockout but keeps authorization debt and must have a
review deadline.

### Option C — blanket `ADMIN` to `OWNER`

Not recommended. Even if current runtime permissions happen to be equivalent,
the product meaning changes and future OWNER capabilities may be broader.

Recommended decision:

```text
ADMIN -> OWNER only with record-level owner evidence and explicit approval.
Otherwise retain compatibility and keep the record out of Phase 2B.
```

## 4. MANAGER Policy Options

### Option A — no automatic migration (recommended)

Treat every active `MANAGER` as manual review. Require affirmative evidence
that the record was historically the business owner despite its label.

### Option B — retain compatibility temporarily

Leave unresolved records unchanged and accepted during the compatibility
window. This prevents lockout without granting new authority.

### Option C — disable/revoke instead of promote

Use only in a separately approved access-removal task with owner confirmation.
Phase 2B role normalization must not revoke access opportunistically.

### Option D — blanket `MANAGER` to `OWNER`

Rejected as unsafe. A manager-to-owner change is a direct potential privilege
escalation.

Recommended decision:

```text
MANAGER is never automatically SAFE_CANDIDATE.
Promotion requires explicit business-owner proof and record-level approval.
```

## 5. Privilege-Escalation Analysis

Current code often gives `OWNER`, `ADMIN` and `MANAGER` the same tenant-admin
capabilities. That does not prove that their intended business semantics are
equal.

Risks:

- future features may give OWNER billing, store lifecycle, registration,
  additional-store, customization or account-control privileges;
- a legacy manager may be an employee or delegated operator;
- an active platform administrator may be mistaken for a tenant owner;
- multiple active legacy records may produce multiple possible owners;
- stale user-profile mirrors can create conflicting operator expectations;
- converting an inactive record could silently reactivate access if status is
  mishandled;
- removing compatibility before migration could lock out the pilot;
- blanket migration makes later privilege attribution and rollback ambiguous.

Mitigation: explicit record-level evidence, exact preconditions, no inactive
changes, no conflict resolution by code and delayed enforcement tightening.

## 6. Required Production Read Approval Checkpoint

Before Phase 2B implementation, a separate review must approve a production
read-only inventory run using the isolated entry point
`scripts/inventory-tenant-memberships-production-readonly.mjs`, as specified in
`docs/REQUIRED_PRODUCTION_READ_APPROVAL_CHECKPOINT.md`.

The confirmed business policy contract is:

- 1 legacy `ADMIN` per store representing store ownership;
- 0 authenticated `MANAGER` memberships (unexpected anomaly if found);
- target MVP role `OWNER`;
- `tenantMemberships` as authorization source of truth, `users/{uid}.memberships` as compatibility mirror;
- platform-admin status separate from tenant operational ownership.

The mandatory role policy contract is:

```text
EXPECTED_LEGACY_ROLE=ADMIN
EXPECTED_MANAGER_COUNT=0
TARGET_ROLE=OWNER
AUTO_MIGRATION_ALLOWED=false
```

The approval must specify:

- the exact human-confirmed allowlisted project in code (`CONFIRMED_PRODUCTION_PROJECT_ID`);
- environment-bound Application Default Credentials or another approved
  non-CLI credential mechanism;
- no credential, token or service-account value in command arguments;
- exact field projection from `tenantMemberships`: document ID, `uid`,
  `tenantId`, `role`, `status`, `createdAt`, `updatedAt`;
- exact-ID `users` reads projected to only the `memberships` field, used for
  document existence and `users/{uid}.memberships[tenantId]` mirror consistency;
- exact-ID `tenants` and `platformAdmins` reads with an empty field mask for
  existence only;
- reference reads chunked at no more than 25 exact IDs per sequential request,
  only for IDs found in the bounded membership snapshot, with no collection-wide
  reference scan;
- aggregate-only console output;
- an explicitly selected external temporary path for any sensitive review
  manifest;
- restrictive local access, retention deadline and verified deletion;
- the exact command and reviewer names.

The Phase 2A offline/emulator entry point cannot perform that read and still
rejects production targets. The separate production reader remains fail-closed
because `CONFIRMED_PRODUCTION_PROJECT_ID` is empty; this design and its tests do
not authorize filling that lock or executing the command.

The production-read checkpoint uses two explicit outcomes. A structurally valid
active legacy `ADMIN` remains `EXPECTED_POLICY_MANUAL_REVIEW` until record-level
business approval exists. Missing references or timestamp provenance, invalid
timestamp order, inactive/revoked state, malformed/absent/mismatched mirrors,
platform-admin overlap, unexpected `MANAGER`/unknown roles, malformed records,
and duplicate/conflicting claims produce
`STRUCTURAL_OR_SECURITY_MANUAL_REVIEW` and a non-zero exit.

Missing-reference metrics count unique missing user or tenant IDs rather than
membership rows. The protected external evidence uses the truthful
`productionReadPerformed` field and records each membership's canonical path,
projected values, deterministic Firestore document update time, classification,
reasons, mirror state, and platform-admin overlap. These record-level values are
not console output and are not a Phase 2B approval manifest.

## 7. Phase 2B Approval Manifest

The production writer, when separately implemented, must consume a
human-reviewed manifest stored outside the repository. The manifest must
contain, per approved record:

- canonical membership path;
- expected UID and tenant ID;
- expected role and exact `ACTIVE` status;
- expected Firestore update time;
- expected user/tenant existence;
- expected user-profile mirror state;
- platform-admin overlap decision;
- business-owner evidence reference;
- reviewer and decision timestamp;
- target role `OWNER`;
- migration decision version;
- deterministic idempotency key.

No command-line list of arbitrary record IDs is acceptable.

The manifest must never be committed or printed. Repository documentation may
contain aggregate counts only.

## 8. Idempotency Design

Canonical membership key:

```text
tenantMemberships/{uid}_{tenantId}
```

Proposed per-record idempotency key:

```text
SHA-256(
  canonical membership path
  + expected current role
  + expected ACTIVE status
  + expected Firestore update time
  + target OWNER
  + approved decision version
)
```

The idempotency key is stored in a protected audit event, not used to rename the
membership document.

Repeat behavior:

- if the exact audit event exists and the record is already `OWNER` with the
  verified migrated state, report `ALREADY_APPLIED`;
- if the record is already `OWNER` without the expected audit event, stop for
  manual reconciliation;
- if any expected current value changed, fail the precondition;
- never overwrite a different current role/status merely to make a retry pass.

## 9. Optimistic Preconditions And Transaction Strategy

Recommended implementation:

- one Firestore transaction per approved membership;
- bounded concurrency, initially no more than five transactions;
- no collection-wide blind batch;
- no delete or document rename.

Transaction reads:

1. canonical membership;
2. `users/{uid}`;
3. `tenants/{tenantId}`;
4. `platformAdmins/{uid}` if present in the manifest;
5. proposed platform audit event;
6. user-profile membership mirror when applicable.

Required assertions before any write:

- document exists at the canonical key;
- stored UID and tenant ID exactly match the key and manifest;
- current role equals the approved expected legacy role;
- current status is exactly `ACTIVE`;
- update time matches the approved inventory snapshot;
- user and tenant still exist;
- tenant is not in an unapproved disabled state;
- no duplicate/conflict decision changed;
- platform-admin overlap matches the approved decision;
- mirror state matches the manifest;
- audit idempotency key is unused or represents the exact already-applied
  operation.

Permitted writes in the future approved transaction:

- change only canonical membership `role` to `OWNER`;
- update `updatedAt`;
- update the user-profile mirror only if the approved policy requires it and
  its exact precondition matches;
- create the immutable platform audit event.

No status change, activation, deletion, key change, email update, tenant update
or unrelated profile update is permitted.

## 10. Dry-Run And Planning Behavior

Dry-run must be the default and must:

- use the approved external manifest;
- re-read and validate all optimistic preconditions;
- execute zero writes;
- report aggregate eligible, changed, skipped, conflict and failed counts;
- produce sensitive per-record detail only in the explicitly approved external
  temporary output;
- never print raw UID, tenant ID, email, payload or credential;
- return non-zero if any item no longer matches the approved snapshot.

A separate explicit execution approval must follow a successful dry-run. A
simple `--write` flag on the Phase 2A inventory tool is prohibited.

## 11. Retry And Partial-Failure Handling

- Retry only transient `ABORTED` or `UNAVAILABLE` failures.
- Use bounded exponential backoff with jitter and at most three attempts.
- Do not retry failed preconditions, permission denial, invalid data,
  authentication failure or manifest mismatch.
- Stop scheduling new records after a non-transient failure.
- Preserve per-record success/failure status under idempotency keys.
- Never compensate automatically by guessing the intended state.
- If a subset succeeds, report the exact external manifest subset and stop for
  a human rollback-or-resume decision.

## 12. Audit Design

Recommended immutable event:

```text
platformAuditLogs/{idempotencyKey}
```

Minimum fields:

- event type `TENANT_MEMBERSHIP_ROLE_NORMALIZED`;
- idempotency key;
- hashed/pseudonymous membership reference for aggregate review;
- protected canonical reference available only in the external rollback map;
- previous role and target role;
- unchanged status;
- previous and resulting update times;
- decision version;
- approving reviewer reference;
- executing operator identity;
- execution timestamp;
- dry-run correlation ID;
- result `APPLIED`, `ALREADY_APPLIED` or `FAILED_PRECONDITION`.

The target collection is not currently implemented. Its schema, Rules,
retention and server-only write boundary must be reviewed with the Phase 2B
writer. If that review is not approved, Phase 2B must not proceed with an
unaudited substitute.

No raw email, token, credential or membership payload belongs in the audit
event.

## 13. Rollback Design

Before execution, write an encrypted or otherwise access-controlled rollback
manifest outside the repository containing:

- full preimage of the canonical membership;
- preimage of the user-profile mirror if applicable;
- original Firestore update times;
- idempotency key and audit-event reference;
- approved item list and aggregate checksum.

Rollback requires separate approval and a dedicated transaction that asserts:

- the Phase 2B audit event exists;
- current role is `OWNER`;
- current status remains `ACTIVE`;
- current update time equals the Phase 2B result;
- no later legitimate change occurred.

Then restore only the approved preimage fields and create a corresponding
immutable rollback audit event. Never delete or rename the membership. If a
post-migration change occurred, stop for manual reconciliation.

## 14. Post-Migration Verification

For every applied record:

- re-read canonical path and exact fields;
- verify role `OWNER`, unchanged status/UID/tenant ID and expected update time;
- verify user-profile mirror policy;
- verify user and tenant still exist;
- verify matching audit event;
- verify aggregate before/after counts reconcile with the manifest;
- verify no invalid, inactive or conflict record changed.

System regression:

- OWNER login and private tenant access;
- anonymous sanitized public access;
- wrong-tenant denial;
- missing/inactive/unknown-role denial;
- platform admin without explicit membership denied tenant-private access;
- explicit platform-admin tenant membership treated only as that membership;
- auth broker ticket creation/exchange and role-change re-check;
- BP Kallis pilot behavior;
- build, Node 20 scheduler QA, repository, public-readonly, SaaS, auth broker,
  export and security baselines;
- emulator snapshot and idempotent repeat rehearsal.

## 15. Compatibility Window And Enforcement Tightening

During Phase 2B data migration:

- Firestore Rules continue accepting `OWNER`, `ADMIN`, `MANAGER`;
- Storage Rules continue accepting all three;
- client authorization helper continues accepting all three;
- Functions auth broker continues accepting all three;
- tests continue covering legacy denial/compatibility behavior.

Only after:

1. approved production inventory is complete;
2. every eligible record is migrated and verified;
3. unresolved records have an explicit compatibility decision;
4. rollback evidence is preserved;
5. pilot and cross-tenant regression tests pass;

may a separate task change validators, Rules, Functions and fixtures to
OWNER-only. That later task requires Rules/Functions deployment approval and a
maintenance/rollback plan. Phase 2B data migration alone does not authorize it.

## 16. Production Migration Approval Checkpoint

Phase 2B must not start until reviewers approve:

- ADMIN policy;
- MANAGER policy;
- multi-owner policy;
- platform-admin overlap policy;
- user-profile mirror policy;
- production read inventory and sensitive-output handling;
- exact eligible manifest;
- writer source diff and independent security review;
- dry-run output;
- audit collection/schema/Rules;
- rollback manifest and operator;
- maintenance window and post-migration tests.

Current decision:

```text
PHASE_2B_NOT_AUTHORIZED
PHASE_2A_REQUIRES_POLICY_DECISION
```
