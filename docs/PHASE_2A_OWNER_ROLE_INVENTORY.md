# ShiftOryx Phase 2A OWNER Role Inventory

Date: 2026-07-28
Branch: `shiftoryx-phase-2a-owner-role-inventory`
Base SHA: `7964e69bc469cf4c9405679d957095c0452baa3c`
External backup: `C:\Users\thugs\.codex\tmp\shiftoryx-phase-2a-20260728-123039`

## 1. Scope And Production Boundary

This document records the Phase 2A repository inventory, deterministic
membership classification model and emulator-only rehearsal. It does not
authorize Phase 2B.

- No live production inventory was executed.
- No production Firestore read was executed.
- No production Firestore write was executed.
- No membership was created, updated, deleted, renamed, repaired or
  reactivated outside the Firebase Emulator.
- No Firestore or Storage Rules were changed or deployed.
- No Firebase Function was changed or deployed.
- No runtime authorization, UI gating or tenant-access behavior was changed.
- The existing untracked `firestore-debug.log` was excluded from every content
  search and was not opened, read, copied, edited, deleted or staged.

The backup contains the only existing file selected for modification:

```text
package.json
```

All other Phase 2A files are new.

## 2. Source-Of-Truth Findings

The current documentation agrees on these boundaries:

- new MVP tenant-membership writes create `OWNER` only;
- `ADMIN` and `MANAGER` are temporary compatibility values;
- Phase 2A is production-read-only and stops for review;
- any production normalization is a separately approved Phase 2B;
- hostname resolution selects tenant context but does not authorize access;
- `platformAdmins/{uid}` is separate from tenant operational ownership;
- platform-admin status alone does not grant tenant-private access.

Historical Phase 1 and remediation evidence was used as input and was not
rewritten.

## 3. Repository Coverage

The inventory used repository-native search for:

```text
tenantMemberships
OWNER
ADMIN
MANAGER
SUPER_ADMIN
membership
memberRole
tenantRole
platformAdmins
ACTIVE
REVOKED
```

Inspected surfaces:

- root authorization and schema documentation;
- `firestore.rules`, `storage.rules`, `firestore-test.rules`,
  `firebase.json` and `firebase-test.json`;
- `src/services`, `src/repositories`, `src/utils`, the auth components and the
  relevant scheduler-store authorization transition;
- `functions/src`;
- provisioning, bootstrap, seed, migration, validation and emulator scripts;
- membership-aware test fixtures;
- `package.json` scripts;
- Phase 0/1, roadmap, tenant authorization, SaaS, auth broker, platform-admin,
  provisioning, self-hosting and security documentation;
- dependency, PostCSS and Node 20 remediation checkpoints to preserve the
  validated baseline.

Explicit exclusions:

- `node_modules`, `dist`, `build`, `coverage` and `.git`;
- generated logs, including every `*.log`;
- `package-lock.json` content was not changed;
- `.env`, credentials and service-account files.

Generic uses of the words `admin`, `manager`, `role` or `ACTIVE` that refer to
UI labels, scheduler employee roles, absence status, Three.js loading
managers, package managers or CSS active states are not tenant-membership
authorization paths.

## 4. Complete Runtime And Rules Inventory

Legend:

- `Y`: the path performs/checks the item.
- `N`: it does not.
- `Indirect`: the caller delegates the check to another inventoried path.
- `Flagged`: code is present but use depends on a disabled-by-default feature
  flag.

| Classification | File and function/match | Accepted roles | Status | Tenant ID | UID | Membership create/update | Trust and current state | Phase 2B impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `FIRESTORE_RULE`, `READ_AUTHORIZATION` | `firestore.rules` `isTenantAdminRole`, `isTenantAdmin` | `OWNER`, `ADMIN`, `MANAGER` | exact `ACTIVE` | exact path argument and stored field | authenticated UID and stored field | N/N | client Rules, active | keep during compatibility window; tighten only in a later approved enforcement step |
| `VALIDATION` | `firestore.rules` `validTenantMembership` | `OWNER`, `ADMIN`, `MANAGER` | `ACTIVE`, `INACTIVE`, `SUSPENDED`, `EXPIRED`, `REVOKED` | schema/pattern only | non-empty string only | validator exists, but client writes are denied | active Rules helper | future trusted writer must preserve the current schema |
| `FIRESTORE_RULE` | `firestore.rules` `match /tenantMemberships/{membershipId}` | `OWNER`, `ADMIN`, `MANAGER` | owner self-read requires `ACTIVE`; same-tenant reader delegates to `isTenantAdmin` | Y for same-tenant read | Y for self-read | N/N; create/update/delete denied | client Rules, active | do not narrow until all approved migrations and regression tests pass |
| `FIRESTORE_RULE`, `READ_AUTHORIZATION` | `firestore.rules` `isPlatformAdmin`, `match /platformAdmins/{uid}` | role is not checked by `isPlatformAdmin`; bootstrap uses `SUPER_ADMIN` | exact `ACTIVE` in helper | N | document key uses auth UID; stored UID is not checked | N/N from clients | active platform boundary | no tenant-role migration; preserve separation and address helper gaps only in Phase 9 or another approved task |
| `FIRESTORE_RULE`, `READ_AUTHORIZATION` | `storage.rules` `isTenantAdminRole`, `isTenantAdmin` | `OWNER`, `ADMIN`, `MANAGER` | exact `ACTIVE` | exact path argument and stored field | authenticated UID and stored field | N/N | Storage Rules, active | same compatibility-window rule as Firestore |
| `TEST_OR_FIXTURE` | `firestore-test.rules` catch-all | any | N | N | N | Y/Y from test clients | allow-all test Rules selected only by `firebase-test.json` | never use as production Rules; Phase 2B tests need independent safety guards |
| `VALIDATION`, `READ_AUTHORIZATION` | `src/services/tenantAuthorization.js` `isActiveTenantAdminMembership`, `resolveTenantAdminAuthorization` | `OWNER`, `ADMIN`, `MANAGER` | normalized `ACTIVE` | exact | exact | N/N | client runtime, active | later OWNER-only validator change, after production data approval |
| `READ_AUTHORIZATION` | `src/repositories/firebase/firebaseTenantMembershipsRepository.js` `getMembership` | delegated | delegated | canonical `{uid}_{tenantId}` key | exact key input | N/N | client SDK, active | no write path; later reader behavior follows validator |
| `READ_AUTHORIZATION`, `VALIDATION` | same repository `listActiveMembershipsForUser`, `getActiveAdminMembership`, `hasActiveMembership` | delegated `OWNER`/`ADMIN`/`MANAGER` | query `ACTIVE` plus validator | Y | query or exact key | N/N | client SDK, active | later OWNER-only filtering must be coordinated with Rules/data |
| `READ_AUTHORIZATION` | `src/services/tenantAccessService.js` `listActiveTenantAccessForUser`, `resolveCentralTenantDestination` | indirect | indirect | membership tenant plus tenant lookup | input UID | N/N | client runtime, active central routing | later selector must show only approved active OWNER records |
| `READ_AUTHORIZATION` | same service `verifyTenantAccessForHost`, `resolveAuthorizedReturnTo` | indirect | indirect | host selects context; tenant document and membership must match | input UID | N/N | client runtime, active | hostname must remain context only |
| `UI_GATING` | `src/hooks/useSchedulerStore.js` `initializeData` auth callback | indirect | indirect | host access result | Firebase user UID | N/N | client runtime, active; starts private subscriptions only after access | later role label may change; behavior must remain denied without matching membership |
| `UI_GATING` | `src/components/auth/LoginPage.jsx`, `SelectTenantPage.jsx` | indirect; selector displays stored role | indirect | indirect | Firebase user UID | N/N | active routes | later remove legacy labels only after compatibility closes |
| `UI_GATING` | `src/components/auth/TenantGate.jsx` | indirect | indirect | host context and membership check | Firebase user UID | N/N | client runtime, `VITE_ENABLE_TENANT_GATE=false` by default | dormant public-route risk is outside Phase 2A; do not enable during role migration |
| `UI_GATING`, `DEAD_OR_DORMANT` | `src/App.jsx` `/admin-console` placeholder | text refers to a legacy custom claim, not membership authorization | N | N | N | N/N | no privileged data/actions; placeholder only | no Phase 2B role logic; future Phase 9 cleanup |
| `UI_GATING`, `DOCUMENTATION` | `CentralLandingPage.jsx`, `AdminLoginModal.jsx` | generic active membership text | text only | text only | text only | N/N | active presentation | terminology may be updated separately after enforcement |
| `READ_AUTHORIZATION` | `src/firebase/authBrokerService.js`, `AuthTicketCallback.jsx` | propagates server-returned role but does not validate it | indirect | indirect | custom-token identity | N/N | client broker path, flagged | later role payload must remain consistent with server validation |
| `VALIDATION`, `READ_AUTHORIZATION` | `functions/src/authBrokerCore.js` `AUTH_BROKER_ROLES`, `isActiveBrokerMembership` | `OWNER`, `ADMIN`, `MANAGER` | exact `ACTIVE` | caller checks | caller checks | N/N | trusted Functions helper; broker client path flagged | later OWNER-only server validation is a separate deployment |
| `READ_AUTHORIZATION` | `functions/src/index.js` `getActiveMembershipOrDeny`, `createAuthTicket` | helper accepts all three | `ACTIVE` | exact key and stored field | exact key and stored field | N/N; writes only an auth ticket | trusted Admin SDK code | later compatibility change requires Functions tests/deployment approval |
| `READ_AUTHORIZATION`, `VALIDATION` | same file `exchangeAuthTicket` transaction | all three through helper; membership role must equal ticket role | `ACTIVE` | exact | exact | N/N; transaction updates only auth ticket | trusted Admin SDK code | preserve re-check and role-change denial in later enforcement |
| `VALIDATION` | `src/utils/tenantDataPaths.js` `getTenantMembershipPath` | N/A | N/A | strict lowercase tenant pattern | non-empty UID | N/N | active client utility | deterministic key must remain unchanged |
| `WRITE_CREATION`, `WRITE_UPDATE`, `MIGRATION_OR_SEED` | `scripts/provision-tenant.mjs` | writes `OWNER` only | writes `ACTIVE` | strict normalized tenant and canonical key | required CLI UID | Y/Y in emulator; also mirrors role under `users/{uid}.memberships` | trusted Admin SDK; dry-run default; production write blocked | correct new-write model; future Phase 2B must consider the non-authoritative user mirror |
| `WRITE_CREATION`, `WRITE_UPDATE`, `MIGRATION_OR_SEED` | `scripts/seed-bp-kallis-tenant.mjs` | defaults to `ADMIN`; accepts an unvalidated `--role` | writes `ACTIVE` | validates characters but targets a live REST endpoint when credentials exist | required CLI UID | Y/Y; also writes user membership mirror | trusted, production-capable legacy script; dry-run is not the default | high migration risk; do not run for new onboarding; replace/deprecate only in a separate task |
| `WRITE_CREATION` | `scripts/bootstrap-platform-admin.mjs` | exactly `SUPER_ADMIN` | writes/verifies `ACTIVE` | N | required/validated | no tenant membership; writes `platformAdmins` | trusted Admin SDK; production-capable only with multiple explicit flags | not a tenant migration writer; explicit tenant membership remains required |
| `DEAD_OR_DORMANT`, `MIGRATION_OR_SEED` | `scripts/bootstrap-admin-user.mjs` | none | none | none | creates/updates Firebase Auth identity | no membership write; directs operator to tenant seed | trusted Auth bootstrap, invocation-only | Phase 2B must not confuse Auth identity with tenant ownership |
| `MIGRATION_OR_SEED` | `scripts/migrate-global-to-tenant.mjs` | no role mapping | no membership validation | allowlists one tenant only | no membership UID logic | does not write memberships; can copy operational data to production with `--write` | production-capable REST migration; dry-run default | unsuitable for OWNER normalization and not executed in Phase 2A |
| `READ_AUTHORIZATION` | `scripts/inventory-tenant-memberships.mjs` | classifies `OWNER`, `ADMIN`, `MANAGER` | all current allowed statuses | canonical key, field and tenant-reference checks | field, key and user-reference checks | N/N; read calls only | offline fixture or allowlisted local emulator only | Phase 2A evidence only; no production connector |

## 5. Membership Creation And Mutation Paths

### Canonical tenant membership

1. `scripts/provision-tenant.mjs`
   - creates `tenantMemberships/{uid}_{tenantId}`;
   - writes `OWNER` and `ACTIVE`;
   - creates/updates the compatibility mirror
     `users/{uid}.memberships[tenantId]`;
   - write mode is emulator-gated.
2. `scripts/seed-bp-kallis-tenant.mjs`
   - creates/replaces the same canonical document through Firestore REST;
   - defaults to `ADMIN`;
   - accepts an unvalidated role argument;
   - writes the user-profile mirror;
   - can target production when credentials are supplied.
3. Emulator test fixtures create synthetic membership documents through Admin
   SDK or Emulator REST. They are not product provisioning paths.

There is no application membership-management UI, client repository write
method, Cloud Function membership writer or client Rules permission for
membership writes.

### Platform administrator

`scripts/bootstrap-platform-admin.mjs` writes `platformAdmins/{uid}` with
`SUPER_ADMIN`/`ACTIVE`. It never creates tenant membership. The Firestore Rules
helper checks active platform status for platform operations, but tenant-private
authorization still uses the canonical tenant membership.

### Non-authoritative user mirror

Both provisioning scripts may store role/status under
`users/{uid}.memberships[tenantId]`. Current runtime authorization does not read
that map. It is compatibility data, not the source of truth. A future approved
production read must inventory mirror presence and disagreement before any
record can become a `SAFE_CANDIDATE`.

## 6. Existing Accepted Values

| Surface | Roles | Statuses |
| --- | --- | --- |
| Client authorization helper | `OWNER`, `ADMIN`, `MANAGER` | `ACTIVE` allows; `INACTIVE`, `SUSPENDED`, `EXPIRED`, `REVOKED` deny |
| Auth broker helper | `OWNER`, `ADMIN`, `MANAGER` | exact `ACTIVE` allows |
| Firestore membership validator | `OWNER`, `ADMIN`, `MANAGER` | `ACTIVE`, `INACTIVE`, `SUSPENDED`, `EXPIRED`, `REVOKED` |
| Firestore/Storage access predicate | `OWNER`, `ADMIN`, `MANAGER` | exact `ACTIVE` |
| New provisioning | `OWNER` | `ACTIVE` |
| Legacy BP seed | defaults `ADMIN`; argument is not allowlisted | `ACTIVE` |
| Platform admin bootstrap | `SUPER_ADMIN` | `ACTIVE` |

Unknown roles deny runtime access. A platform role is not a tenant role.

## 7. Test And Fixture Inventory

| Classification | File | Encoded behavior and gap |
| --- | --- | --- |
| `TEST_OR_FIXTURE` | `scripts/validate-tenant-authorization.mjs` | explicitly proves `OWNER`, `ADMIN`, `MANAGER` active access and inactive/unknown/wrong-UID/wrong-tenant denial |
| `TEST_OR_FIXTURE` | `scripts/validate-security-hardening.mjs` | asserts three-role Rules compatibility and denied client membership writes |
| `TEST_OR_FIXTURE` | `scripts/validate-firestore-integrity.mjs` | asserts active self-read, same-tenant boundary, inactive statuses and server-mediated membership writes |
| `TEST_OR_FIXTURE` | `scripts/validate-saas-foundation.mjs` | asserts canonical membership path and membership-based routing; recognizes the legacy seed |
| `TEST_OR_FIXTURE` | `scripts/validate-auth-broker.mjs` | validates broker contract and required emulator membership denial cases |
| `TEST_OR_FIXTURE` | `scripts/test-auth-broker-emulator.mjs` | seeds active/inactive/invalid memberships, an `OWNER`, a `MANAGER` deletion target and cross-tenant fixtures; client membership writes are denied |
| `TEST_OR_FIXTURE` | `scripts/test-platform-admin-emulator.mjs` | seeds `ADMIN` tenant memberships and separate `SUPER_ADMIN` records; proves platform status alone does not grant tenant-private access |
| `TEST_OR_FIXTURE` | `scripts/test-provision-tenant-emulator.mjs` | verifies emulator-only creation/existence and blocked non-emulator write; it does not directly assert the resulting role value |
| `TEST_OR_FIXTURE` | `scripts/test-migration-emulator.mjs` | seeds one synthetic `OWNER` for a global-to-tenant data migration; it is not a role migration |
| `TEST_OR_FIXTURE` | `scripts/test-owner-role-inventory-emulator.mjs` | Phase 2A classifier, fail-closed CLI, redaction, platform separation and complete before/after state proof |

Scheduler Playwright fixtures use local `isAdmin` UI state and do not model a
Firestore tenant-membership role. They are not evidence for an `ADMIN` to
`OWNER` mapping.

## 8. Documentation Inventory

Authoritative current-state/product sources:

- `README.md`
- `FIREBASE_SCHEMA.md`
- `SECURITY.md`
- `docs/SHIFTORYX_MASTER_ROADMAP.md`
- `docs/CURRENT_STATE.md`
- `docs/PHASE_1_CURRENT_STATE_AUDIT.md`
- `docs/tenant-authorization-model.md`
- `docs/saas-tenant-foundation.md`
- `docs/project-brain.md`
- `docs/codex-handoffs/PHASE_1_CHECKPOINT.md`
- `docs/saas-security-qa-checklist.md`

Operational/compatibility references:

- `docs/auth-broker-runbook.md`
- `docs/central-auth-portal-migration.md`
- `docs/platform-admin-runbook.md`
- `docs/tenant-provisioning-runbook.md`
- `docs/self-hosting-bp-kallis.md`
- `docs/SHIFTORYX_DOMAIN_ACTIVATION_PLAN.md`
- `docs/ROADMAP_ALIGNMENT_REPORT.md`
- `docs/project-status-report.md`

Historical and remediation reports were retained as evidence. They are not
runtime role policy and were not rewritten.

## 9. Existing Migration And Emulator Foundation

No existing OWNER-role migration or role-classification rehearsal existed.

`scripts/migrate-global-to-tenant.mjs` and
`scripts/test-migration-emulator.mjs` cover operational collection copying:

- mappings are global scheduler collections to tenant-scoped collections;
- there is no `ADMIN` or `MANAGER` mapping;
- membership status, UID/tenant ownership and platform separation are not part
  of that migration;
- repeated writes skip existing targets unless `--overwrite`; this is
  partially idempotent but not an OWNER migration guarantee;
- the migration script can connect to production and write when credentials and
  `--write` are provided;
- the test uses Admin SDK for fixture setup and REST in the child migration;
- its package command requires `firebase-tools` through `npx --yes`;
- it was inspected but not executed because Phase 2A forbids `npx --yes` and it
  does not meet the new role-migration safety contract.

`firebase-test.json` selects port `8088` and the allow-all
`firestore-test.rules`. It is a test-only foundation and must never be confused
with production Rules.

Environment result:

- an existing global Firebase CLI was available (`15.11.0`);
- `node_modules\.bin\firebase.cmd` was absent;
- no Firebase tooling was installed or updated.

The new Phase 2A launcher calls the existing CLI without `npx`, uses the fixed
demo project `demo-shiftoryx-owner-inventory`, and starts Firebase from an
external system-temporary working directory. Firebase CLI therefore writes its
generated `firestore-debug.log` outside the checkout, and the temporary
directory is removed after the run.

## 10. Deterministic Classification Model

Precedence is deliberate and fail-closed:

1. missing/invalid UID, tenant, role or status:
   `INVALID_OR_MALFORMED`;
2. duplicate UID/tenant pair or multiple active ownership claims for one
   tenant: `CONFLICT_OR_DUPLICATE`;
3. canonical-key mismatch or invalid timestamp:
   `INVALID_OR_MALFORMED`;
4. inactive/revoked status: `REVOKED_OR_INACTIVE`;
5. missing references, missing provenance, timestamp-order concern or explicit
   platform-admin overlap: `MANUAL_REVIEW_REQUIRED`;
6. canonical active `OWNER`: `NO_MIGRATION_REQUIRED`;
7. active legacy role with explicit record-level owner-approval evidence and
   no other risk: `SAFE_CANDIDATE`;
8. every other active legacy `ADMIN`/`MANAGER`:
   `MANUAL_REVIEW_REQUIRED`.

Evaluated fields:

- document ID;
- `uid`;
- `tenantId`;
- `role`;
- `status`;
- `createdAt`;
- `updatedAt`;
- existence of `users/{uid}`;
- existence of `tenants/{tenantId}`;
- platform-admin overlap;
- duplicate UID/tenant pairs;
- multiple active owner-capable claims for one tenant.

The Phase 2A CLI intentionally has no mechanism to supply approval evidence.
Its emulator inventory therefore cannot elevate a legacy record from manual
review to safe by command-line input. The pure classifier demonstrates that
`SAFE_CANDIDATE` requires separately supplied, record-level evidence.

## 11. Inventory Tool Safety Model

`scripts/inventory-tenant-memberships.mjs`:

- defaults to built-in offline synthetic fixture mode;
- requires the explicit `--read-only` acknowledgement;
- supports only `offline-fixture` and local `emulator` sources;
- has no production source or production fallback;
- requires `FIRESTORE_EMULATOR_HOST`;
- accepts only a local loopback emulator host;
- accepts only the fixed approved demo project;
- rejects the production project and every unapproved project;
- rejects caller-supplied Firestore clients;
- requires the checked host to exactly match `FIRESTORE_EMULATOR_HOST`;
- constructs its Firestore Admin client internally only after those checks;
- accepts no credentials, token, service-account path or arbitrary output path
  through CLI arguments;
- reads only six membership fields from the emulator;
- checks user, tenant and platform-admin document existence without printing
  their IDs;
- prints aggregate counts, sanitized reason counts and a no-write plan summary;
- never prints membership payloads, emails, UIDs or tenant IDs;
- contains no Firestore `set`, `update`, `add`, `delete`, batch-write or
  transaction-write call.

Static review found no forbidden write-call expression in the inventory tool.
The only Firestore operation methods used there are reads.

A production read-only connector is intentionally not implemented. It requires
a separate approval defining:

- exact production project allowlist;
- Application Default Credentials or another approved environment-bound
  mechanism, never a credential CLI argument;
- exact queried collections and field projections;
- canonical-user-mirror comparison;
- aggregate-only console output;
- any sensitive detail file's explicit external temporary path, access
  controls, retention and deletion procedure.

## 12. Synthetic Emulator Rehearsal

Required cases were all present:

- valid `OWNER` / `ACTIVE`;
- legacy `ADMIN` / `ACTIVE`;
- legacy `MANAGER` / `ACTIVE`;
- `OWNER` / `REVOKED`;
- `ADMIN` / `REVOKED`;
- unknown role;
- missing role;
- missing tenant ID;
- missing UID;
- document-ID/field mismatch;
- duplicate UID/tenant;
- conflicting active role records;
- missing tenant;
- missing user;
- platform admin without tenant membership;
- platform admin with explicit tenant membership;
- missing timestamp provenance;
- invalid status.

The emulator contained 55 synthetic documents, including 20 memberships.

| Classification | Count |
| --- | ---: |
| `NO_MIGRATION_REQUIRED` | 1 |
| `SAFE_CANDIDATE` | 0 |
| `MANUAL_REVIEW_REQUIRED` | 7 |
| `INVALID_OR_MALFORMED` | 6 |
| `REVOKED_OR_INACTIVE` | 2 |
| `CONFLICT_OR_DUPLICATE` | 4 |

Additional aggregate findings:

- platform admins without tenant membership: 1;
- platform admins with explicit tenant membership: 1;
- write operations reported by the inventory/planning output: 0.

Proofs:

- repeated inventory returned the same result;
- the classifier did not mutate its input;
- malformed records remained malformed;
- revoked records received no proposed role;
- platform-admin status did not create an implied tenant membership;
- the Phase 2B planning summary executed zero writes;
- the CLI output contained no fixture UID, tenant ID or email;
- an injected Firestore-client regression was rejected before any collection
  read;
- a checked host that does not match `FIRESTORE_EMULATOR_HOST` was rejected
  before Admin SDK initialization;
- all 20 membership documents were identical before and after;
- all 55 emulator documents were identical before and after.

Result:

```text
PHASE_2A_OWNER_ROLE_EMULATOR_REHEARSAL_PASSED
BEFORE_AFTER_MEMBERSHIP_SNAPSHOT_IDENTICAL
BEFORE_AFTER_COMPLETE_SNAPSHOT_IDENTICAL
```

## 13. Unresolved Questions And Risks

1. Which live `ADMIN` records, if any, represent the legal/business owner?
2. Did `MANAGER` ever mean a subordinate operator? If yes, promotion would be a
   privilege escalation and must not happen.
3. Does every canonical record have matching user-profile mirror data?
4. Can one tenant legitimately have more than one OWNER? Current Phase 2A
   classification treats multiple active owner-capable claims conservatively.
5. Are there missing users, tenants, timestamps or noncanonical membership
   keys in production? This remains unknown because no live read occurred.
6. Does any platform administrator intentionally also own a tenant? That must
   be explicit and separately evidenced.
7. The legacy seed remains production-capable and defaults to `ADMIN`.
8. Existing Rules and runtime readers must continue accepting legacy roles
   until approved migration and regression evidence prove they can be narrowed.
9. The allow-all test Rules make emulator command isolation and project guards
   essential.

## 14. Phase 2A Verdict

```text
PHASE_2A_READY_FOR_REVIEW
PHASE_2A_REQUIRES_POLICY_DECISION
```

Phase 2B has not started. No production inventory or migration has occurred.
