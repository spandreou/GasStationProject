# Platform Admin / Tenant Membership Overlap Remediation Design

Date: 2026-08-09

Status: design and emulator-only acceptance contract; no production writer

Production boundary: no second production read and no production write

## 1. Executive Decision

The authoritative policy is:

```text
ACTIVE platformAdmins/{uid}
-> platform-level authorization only
-> zero tenantMemberships for that UID

tenantMemberships/{separateOwnerUid}_{tenantId}
role=OWNER
status=ACTIVE
-> tenant/store authorization only
```

Platform-admin status never grants or substitutes for tenant authorization. A
Platform Admin + `OWNER`, `ADMIN` or `MANAGER` membership is the forbidden
`PLATFORM_ADMIN_TENANT_MEMBERSHIP_FORBIDDEN` state. An inactive or revoked
membership for an ACTIVE platform-admin UID remains `MANUAL_REVIEW_REQUIRED`;
historical evidence must not be silently deleted.

The completed, single authorized production read reported one active `OWNER`
membership overlapping an ACTIVE platform-admin identity. Aggregate evidence
also reported a consistent user mirror, existing user and tenant references, a
present Firestore update time, one structural/security manual-review item and
zero production writes. Raw identifiers are withheld and are referenced only as:

```text
PLATFORM_ADMIN_UID_REDACTED
AFFECTED_TENANT_ID_REDACTED
CURRENT_MEMBERSHIP_ID_REDACTED
```

This design uses that already-authorized local evidence. It does not authorize
or perform another production read, and it does not authorize or perform a
production write.

## 2. Root-Cause Classification

Classification: `MULTIPLE_LAYERS`.

1. **Data:** the protected aggregate evidence confirms one active
   platform-admin/tenant-`OWNER` overlap.
2. **Policy documentation:** earlier wording allowed an explicit
   platform-admin tenant membership to operate as a normal membership. That
   dual-role interpretation conflicts with the now-authoritative policy and is
   corrected by this documentation set.
3. **Security Rules:** the current Firestore Rules use platform-admin
   authorization for the legacy `employee_absences_private` surface rather than
   requiring tenant membership. This is a distinct tenant-data bypass finding.
   Any Rules correction requires its own reviewed PR, focused emulator tests and
   separately approved deployment. This design does not change or deploy Rules.

The tenant runtime authorization helper otherwise requires an explicit active
tenant membership; platform-admin status is not a substitute there. Data
remediation must not be used to conceal the separate Rules finding.

## 3. Owner Identity Gate

`OWNER_ACCOUNT_IDENTITY_REQUIRES_HUMAN_CONFIRMATION`

Repository and already-authorized local evidence do not contain an explicit,
unambiguous record-level proof for the separate real business-owner account.
Email, display name, UID shape, tenant name, Firebase project ownership,
platform-admin status, developer identity and historical role are not acceptable
evidence.

Before any future production correction, a named human reviewer must provide an
external approval manifest that identifies the separate owner, references the
authoritative business-ownership evidence and records the exact expected current
state. The manifest and raw identity must remain outside the repository and must
not be printed.

## 4. Required Classification Semantics

| Observed state for an ACTIVE platform-admin UID | Required result |
| --- | --- |
| zero tenant memberships | `VALID_PLATFORM_ADMIN` |
| active `OWNER` membership | `PLATFORM_ADMIN_TENANT_MEMBERSHIP_FORBIDDEN` |
| active `ADMIN` membership | `PLATFORM_ADMIN_TENANT_MEMBERSHIP_FORBIDDEN` |
| active `MANAGER` membership | `PLATFORM_ADMIN_TENANT_MEMBERSHIP_FORBIDDEN` |
| inactive or revoked membership | `MANUAL_REVIEW_REQUIRED` |

Unknown or malformed tenant roles remain structural/security anomalies. No
classification may infer that platform-admin status grants tenant access.

## 5. Production Remediation Cases

### Case A - a correct separate OWNER account already exists

Proceed only after the external approval manifest and every precondition in
Section 7 pass. In one fail-closed atomic operation:

1. leave `platformAdmins/PLATFORM_ADMIN_UID_REDACTED` unchanged and ACTIVE;
2. remove the invalid canonical platform-admin tenant membership;
3. remove the matching platform-admin user-profile membership mirror;
4. create the separate owner's canonical `OWNER` / `ACTIVE` membership with
   Firestore server-generated `createdAt` and `updatedAt` timestamps;
5. create or reconcile the separate owner's matching compatibility mirror;
6. preserve the approved before-state snapshot, manifest and immutable audit
   evidence.

No tenant document, platform-admin grant, unrelated user field or unrelated
membership may change.

### Case B - the real OWNER Firebase user does not exist

Block remediation. Do not create an account automatically. A human must complete
the approved owner-onboarding and identity-verification flow, confirm the account
and produce a new exact-state approval manifest before remediation is reconsidered.

### Case C - the real OWNER exists but has a conflicting membership

Block remediation. Do not overwrite, merge, promote, revoke or delete either
claim automatically. A named human must resolve the conflict, document the
business evidence and approve a refreshed snapshot and manifest.

### Case D - no safely proven OWNER candidate exists

Block remediation. Do not infer an owner and do not remove the current membership
in isolation, because that could orphan tenant access. The production correction
remains unauthorized until a separate owner is explicitly proven and ready.

## 6. Hard Delete Versus Revoke

### Option 1 - hard delete the invalid tenant membership (recommended)

Advantages:

- satisfies the literal zero-`tenantMemberships` invariant;
- removes the tenant-authorization source rather than relying only on status
  filtering;
- avoids accidental reactivation;
- keeps the canonical record and user mirror consistent;
- makes the desired OWNER-only state unambiguous.

Risks:

- the Firestore document no longer carries its own historical state;
- rollback requires the protected snapshot and a separately approved
  compensating operation;
- auditability depends on preserving the external manifest, exact before-state
  snapshot and immutable audit record.

### Option 2 - mark the membership `REVOKED`

Advantages:

- retains an in-place history record;
- current ACTIVE-only checks should deny tenant access.

Risks:

- violates the zero-membership invariant because the document still exists;
- remains a manual-review anomaly;
- can be accidentally reactivated;
- complicates mirror semantics and Phase 2B inventory assumptions;
- does not establish the clean separation required by policy.

Recommendation: after explicit human approval, hard-delete the invalid canonical
membership and remove its mirror in the same atomic correction that creates the
proven separate owner's membership and mirror. Preserve auditability through the
protected snapshot, signed approval manifest and immutable remediation event.
Revocation is not a compliant final state. Historical inactive/revoked records
must not be deleted by a generic cleanup; they require individual manual review.

## 7. Exact Preconditions And Fail-Closed Execution Model

A future separately reviewed production correction must bind the approval
manifest to all of these exact values:

- expected approved Firebase project ID;
- expected platform-admin UID;
- expected affected tenant ID;
- expected canonical membership document ID and path;
- expected current role (`OWNER` for the confirmed overlap);
- expected current status (`ACTIVE`);
- expected Firestore membership update time / last-update precondition;
  this token preserves Firestore `seconds` and `nanoseconds` losslessly and must
  never be reduced to a JavaScript `Date` or ISO string;
- expected platform-admin user mirror shape and values;
- exact proof that the affected canonical membership is the platform-admin UID's
  only `tenantMemberships` document and that its user mirror contains only the
  affected tenant entry;
- expected ACTIVE platform-admin document existence and state;
- expected tenant existence and acceptable state;
- expected separate owner UID and authoritative evidence reference;
- expected separate owner user-document existence;
- expected absence of an ACTIVE `platformAdmins/{ownerUid}` record for the
  separate owner candidate;
- expected absence or exact current state of the separate owner's membership and
  mirror;
- expected absence of duplicate or competing active ownership claims;
- expected unused deterministic audit/idempotency key.

The implementation must read all preconditions before writing, compare them to
the signed manifest and use Firestore optimistic-concurrency/last-update
preconditions where supported. Any missing document, stale update time, state
mismatch, absent owner evidence, owner conflict or already-applied state aborts
before writes. There is no blind overwrite and no automatic retry after a
precondition failure. A new attempt requires a fresh human-reviewed snapshot and
manifest.

This task deliberately adds no production CLI, writer, migration engine or
generic administrative write utility.

## 8. Rollback And Forward-Fix Strategy

The atomic correction is its first rollback boundary: a failed precondition or
transaction commits no partial change. Before an approved write, preserve the
exact protected before-state, document update times, mirror values, approval
manifest and deterministic audit key.

After a successful commit, prefer a forward fix that keeps the platform admin at
zero tenant memberships and repairs only the separately proven owner state under
new exact preconditions. A normal rollback must not silently recreate the
forbidden platform-admin membership.

There is no exceptional rollback path that restores tenant membership to an
ACTIVE platform-admin UID or removes the separately proven owner in its favor.
If a recovery cannot preserve both the zero-membership invariant and a valid
separate owner, it fails closed for manual recovery. The recovery uses a fresh
human-reviewed snapshot, new optimistic preconditions and a new immutable audit
event; it never recreates the known overlap and does not authorize Phase 2B.

## 9. Emulator-Only Rehearsal Contract

The rehearsal must be locked to a Firebase demo project and
`FIRESTORE_EMULATOR_HOST`. Its inner process must be launched through the
hermetic wrapper, reject ambient ADC sources and initialize Firebase Admin only
with an ephemeral synthetic credential generated in memory. It must use
synthetic identifiers only, including:

```text
synthetic-platform-admin
synthetic-business-owner
synthetic-store
```

Starting state:

- ACTIVE synthetic platform-admin document;
- synthetic platform-admin `OWNER` / `ACTIVE` tenant membership and matching
  user mirror;
- separate synthetic business-owner user;
- valid synthetic tenant and unrelated sentinel/public/private/employee data.

The rehearsal applies the Case A correction to emulator data only. Acceptance
requires proof that:

- the platform-admin document is unchanged and ACTIVE;
- the platform-admin has zero tenant memberships across every tenant and an
  empty tenant-membership mirror;
- the business owner has the canonical `OWNER` / `ACTIVE` membership and matching
  mirror;
- the new canonical owner membership has Firestore server-generated `createdAt`
  and `updatedAt` timestamps;
- the tenant and all unrelated sentinel/public/private/employee data are
  unchanged;
- the exact before/after diff contains only the intended membership/mirror
  documents;
- platform-admin + `OWNER`, `ADMIN` and `MANAGER` states are each flagged as
  forbidden, while inactive/revoked overlap requires manual review;
- platform-admin status alone cannot substitute for tenant membership;
- the correct owner retains tenant access and cross-tenant access is denied;
- stale update time, missing owner, conflicting owner, a competing active
  membership and an ACTIVE platform-admin owner candidate each abort without any
  mutation;
- any additional platform-admin canonical membership or mirror entry, including
  inactive/revoked history for another tenant, aborts without mutation;
- repeating the already-applied correction fails safely without mutation;
- no employee authentication is introduced and public/private boundaries do not
  change.

Rehearsal completion and exact test results are reported only after the dedicated
emulator suite runs. This document itself does not claim that execution occurred.

## 10. Security And Delivery Boundaries

- Production connections in this documentation change: none.
- Production reads in this documentation change: none; the completed one-shot
  aggregate evidence is reused.
- Production writes: none.
- ADC use: forbidden for the emulator rehearsal.
- Rules, Functions, runtime authorization, dependencies, lockfiles, GitHub
  Actions and deployments: unchanged by this documentation design.
- The legacy Firestore Rules bypass remains a separately reviewed security
  correction and deployment decision.
- Phase 2B remains blocked and is not started by this design.

```text
PLATFORM_ADMIN_OVERLAP_CONFIRMED
DUAL_ROLE_POLICY_FORBIDDEN
REMEDIATION_DESIGN_COMPLETE
PRODUCTION_REMEDIATION_NOT_EXECUTED
PRODUCTION_WRITE_NOT_PERFORMED
SECOND_PRODUCTION_READ_NOT_PERFORMED
PHASE_2B_BLOCKED
PHASE_2B_NOT_STARTED
```
