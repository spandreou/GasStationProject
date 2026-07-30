# ShiftOryx Phase 2A Checkpoint

Date: 2026-07-28
Branch: `shiftoryx-phase-2a-owner-role-inventory`
Base SHA: `7964e69bc469cf4c9405679d957095c0452baa3c`
Backup: `C:\Users\thugs\.codex\tmp\shiftoryx-phase-2a-20260728-123039`

## Status

```text
PHASE_2A_READY_FOR_REVIEW
PHASE_2A_REQUIRES_POLICY_DECISION
PHASE_2B_NOT_STARTED
```

Phase 2A repository inventory, deterministic classification, no-write
inventory tool, Phase 2B design and synthetic emulator rehearsal are complete.

No production read or write was performed. No membership, Rules, Functions,
runtime authorization, UI, Docker/Nginx, Cloudflare/DNS or GitHub Actions
change was made.

## Files

Modified:

```text
package.json
```

Added:

```text
scripts/inventory-tenant-memberships.mjs
scripts/test-owner-role-inventory-emulator.mjs
docs/PHASE_2A_OWNER_ROLE_INVENTORY.md
docs/PHASE_2A_OWNER_ROLE_MIGRATION_DESIGN.md
docs/codex-handoffs/PHASE_2A_CHECKPOINT.md
```

Not modified:

```text
package-lock.json
firestore.rules
storage.rules
firebase.json
firebase-test.json
functions/**
src/**
Dockerfile
docker-compose.yml
nginx.conf
.github/**
```

The backup contains `package.json`, the only pre-existing Phase 2A file that
was modified. All other Phase 2A files were new.

## Inventory Conclusions

- Current readers and Firestore/Storage Rules accept active `OWNER`, `ADMIN`
  and `MANAGER`.
- New provisioning creates only active `OWNER`.
- The legacy BP tenant seed defaults to `ADMIN`, accepts an unvalidated role
  argument and is production-capable.
- Client membership writes are denied and no membership-management UI or
  membership-writing Function exists.
- The canonical authorization source is
  `tenantMemberships/{uid}_{tenantId}`.
- `users/{uid}.memberships[tenantId]` is a non-authoritative compatibility
  mirror written by provisioning/seed scripts.
- `platformAdmins/{uid}` is separate. Platform status does not imply tenant
  ownership.
- The existing global-to-tenant migration does not migrate roles, can target
  production and is not suitable for Phase 2B.

Complete evidence:

- `docs/PHASE_2A_OWNER_ROLE_INVENTORY.md`
- `docs/PHASE_2A_OWNER_ROLE_MIGRATION_DESIGN.md`

## Inventory Tool Safety

The tool:

- defaults to an offline synthetic fixture;
- requires `--read-only`;
- permits only offline fixture or allowlisted local emulator input;
- has no production connector or production fallback;
- accepts no credential argument;
- prints aggregate output only;
- contains no Firestore membership write operation;
- rejects missing emulator host, non-loopback host and every unapproved project;
- rejects caller-supplied Firestore clients;
- requires the checked host to match `FIRESTORE_EMULATOR_HOST`;
- constructs its own Admin SDK client only after those checks.

Static review found no `.set`, `.update`, `.add`, `.delete`, batch-write or
transaction-write call in the inventory tool.

The test script is the only new file that seeds synthetic emulator data. Its
writes occur only after hard emulator/project guards.

## Emulator Result

Existing tooling:

```text
Global Firebase CLI: available, version 15.11.0
Local node_modules\.bin\firebase.cmd: absent
New installation: none
```

Command:

```text
npm run test:owner-role-inventory:emulator
```

The launcher invokes the existing global CLI directly, without `npx --yes`.
It starts Firebase from a system-temporary working directory so the CLI's
generated `firestore-debug.log` is outside the repository. The temporary
directory is removed after execution.

Synthetic state:

```text
All documents: 55
Membership documents: 20
NO_MIGRATION_REQUIRED: 1
SAFE_CANDIDATE: 0
MANUAL_REVIEW_REQUIRED: 7
INVALID_OR_MALFORMED: 6
REVOKED_OR_INACTIVE: 2
CONFLICT_OR_DUPLICATE: 4
Platform admin without membership: 1
Platform admin with explicit membership: 1
```

Proof:

```text
Repeated inventory: identical
Membership before/after snapshot: identical
Complete Firestore before/after snapshot: identical
Malformed repair: none
Inactive reactivation: none
Planning writes: 0
Production access: none
Raw identifier output: none
```

## Validation Result

Runtime:

```text
node --version: v20.20.2
```

Passed:

```text
npm run build
npm run qa:scheduler-engine
npm run qa:scheduler
npm run qa:repositories
npm run qa:public-readonly
npm run qa:tenant-authorization
npm run qa:saas-foundation
npm run qa:auth-broker
npm run qa:export-security
npm run security:hardening
npm run security:integrity
npm run lint --prefix functions
npm run test:owner-role-inventory:offline
npm run test:owner-role-inventory:emulator
node --check scripts/inventory-tenant-memberships.mjs
node --check scripts/test-owner-role-inventory-emulator.mjs
git diff --check
```

Build retains the pre-existing Vite large-chunk warning.

Focused security review:

```text
Codex Security diff scan: 6/6 scoped files reviewed
Reportable security findings: 0
Developer-only safety defect: injected Firestore client was not endpoint-bound
Remediation: injected clients rejected; checked host bound to emulator environment
Original synthetic PoC after remediation: rejected before Firestore access
```

Root audit:

```text
npm run security:audit: PASS at --audit-level=high
1 low advisory: transitive dompurify
1 moderate advisory: transitive protobufjs
High/critical advisory count: 0
```

No audit fix, dependency update or lockfile mutation was performed.

## Required Policy Decisions

1. Which `ADMIN` records have record-level evidence that they represented the
   business owner?
2. Which `MANAGER` records, if any, have such evidence? Default recommendation:
   no automatic promotion.
3. Can one tenant legitimately have multiple OWNERs?
4. How should a platform administrator who explicitly owns a tenant be
   approved and recorded?
5. Must the user-profile membership mirror be updated atomically, and what
   mirror discrepancies force manual review?
6. What is the approved production read credential mechanism, exact field
   projection, external sensitive-output path and retention procedure?
7. Will Phase 2B include an immutable `platformAuditLogs` collection and its
   separately reviewed Rules/schema?

## Safe Resume Instructions

1. Stay on `shiftoryx-phase-2a-owner-role-inventory`.
2. Confirm the tracked diff contains only the six files above.
3. Do not open or copy `firestore-debug.log`; only the explicitly requested
   scoped `git status` check is permitted.
4. Do not use existing package scripts that invoke `npx --yes`.
5. Re-run the two new Phase 2A tests if reviewing code:

   ```text
   npm run test:owner-role-inventory:offline
   npm run test:owner-role-inventory:emulator
   ```

6. Review the inventory and migration design.
7. Stop. Do not create a production connector, manifest or writer without a
   new explicit Phase 2B authorization.

No files are staged, committed or pushed, and no PR has been opened by this
task.
