# ShiftOryx — Phase 4: Automated Tenant Provisioning

**Status:** IMPLEMENTATION_READY_FOR_HUMAN_REVIEW  
**Version:** 1.0.0  
**Phase Target:** Phase 4 Automated Tenant Provisioning  
**Security Boundary:** Server-Side Cloud Functions (`functions/src/provisioningService.js`) & Atomic Firestore Transactions  
**Production Deployment:** NOT PERFORMED (Emulator-validated only)  
**Base Source SHA:** `b48206f0e3689498761f59eb0faa32f8bce9f438`  
**Expected Functions Exports (8):** `cleanupAuthTickets`, `createAuthTicket`, `exchangeAuthTicket`, `generateRegistrationToken`, `listRegistrationTokens`, `provisionTenantFromRegistrationToken`, `revokeRegistrationToken`, `validateRegistrationToken`

---

## 1. Executive Summary

Phase 4 establishes the automated, atomic, and secure backend foundation that converts an authenticated user claiming an active ShiftOryx Registration Token into a fully initialized tenant workspace with an explicit `OWNER` membership relationship.

This eliminates all manual database seeding and ad-hoc infrastructure intervention for onboarding new business tenants while preserving all platform security, tenant isolation, and administrative invariants.

---

## 2. Core Architectural Decisions & Invariants

### 2.1 Auth Lifecycle Model
```text
PHASE4_AUTH_MODEL = AUTHENTICATED_USER_CLAIMS_VALID_REGISTRATION_TOKEN
```
- **Trust Boundary:** The user signs up and authenticates directly through standard Firebase Auth client SDKs before invoking provisioning.
- **Server Password Handling:** Zero passwords or raw authentication credentials ever pass through custom Cloud Functions or logs.
- **Actor Integrity:** The provisioning service derives the prospective tenant owner's identity strictly from `request.auth.uid`. Request payload fields attempting to specify `ownerUid`, `adminUid`, `actorUid`, or `createdBy` are rejected.
- **Atomicity Confined to Firestore:** Because user authentication is established prior to calling provisioning, the entire tenant creation, membership assignment, scheduler initialization, trial subscription creation, token consumption, and audit logging execute within **one single ACID Firestore transaction**.

### 2.2 Role & Membership Architecture
- **Canonical Role:** `OWNER` is the exclusive authenticated role created for tenant memberships in Phase 4.
- **Legacy Roles:** No `ADMIN` or `MANAGER` memberships are ever created.
- **Platform Admin Decoupling:** Active Platform Administrators (`platformAdmins/{uid}.status === 'ACTIVE'`) are strictly forbidden from provisioning or owning tenants (`ACTIVE_PLATFORM_ADMIN_PROVISIONING = DENIED`).
- **Sources of Truth:**
  - Primary source of truth: `tenantMemberships/{uid}_{tenantId}` (`role: 'OWNER'`, `status: 'ACTIVE'`).
  - Synchronized compatibility mirror: `users/{uid}.memberships[tenantId]` (`role: 'OWNER'`, `status: 'ACTIVE'`).

---

## 3. Provisioning Pipeline & Transaction Boundary

The entire state mutation occurs within a single atomic Firestore transaction (`db.runTransaction`):

```text
[Authenticated Caller: request.auth.uid]
                │
                ▼
[1. Strict Input Validation (provisioningCore.js)]
    - Validate token syntax (stx_...)
    - Validate slug format (3-64 chars, regex, no reserved/gas/shiftoryx names)
    - Validate display name (1-100 chars, no control chars)
    - Validate business category (FUEL_STATION, CAFE, RESTAURANT, HAIR_SALON, RETAIL, OTHER)
    - Reject all unknown/forbidden fields (role, status, uid overrides)
                │
                ▼
[2. Atomic Firestore Transaction Boundary]
    ├─► Read platformAdmins/{uid} ──────────► [If ACTIVE: ABORT with permission-denied]
    ├─► Read tenants/{slug} ────────────────► [If EXISTS: ABORT with already-exists]
    ├─► Read users/{uid} ───────────────────► [If slug in memberships: ABORT with already-exists]
    ├─► Read tenantMemberships/{uid}_{slug} ─► [If EXISTS: ABORT with already-exists]
    │
    ├─► Consume Registration Token (Phase 3 consumeRegistrationToken)
    │     ├─► Hash raw token -> read registrationTokenLookups/{hash}
    │     ├─► Read registrationTokens/{tokenId}
    │     ├─► Verify effectiveStatus == 'ACTIVE' & canonical expiresAt
    │     ├─► Update registrationTokens/{tokenId} -> status: 'CONSUMED'
    │     └─► Write platformAuditLogs/{id} -> action: 'REGISTRATION_TOKEN_CONSUMED'
    │
    ├─► Write tenants/{slug}
    │     └─► slug, domain, displayName, status: 'ACTIVE', businessCategory,
    │         templateId, templateVersion, brandingOverrides: {}, customizationMode: 'STANDARD'
    │
    ├─► Write tenantMemberships/{uid}_{slug}
    │     └─► uid, tenantId, role: 'OWNER', status: 'ACTIVE', email
    │
    ├─► Write/Update users/{uid}
    │     └─► memberships: { [slug]: { role: 'OWNER', status: 'ACTIVE' } }
    │
    ├─► Write tenants/{slug}/settings/scheduler
    │     └─► generatorRules: default rules, specialDaysByDate: {}
    │
    ├─► Write tenants/{slug}/subscription/current
    │     └─► plan: 'TRIAL', status: 'TRIALING', trialEndsAt: now + 14 days
    │
    └─► Write platformAuditLogs/{auditId}
          └─► action: 'TENANT_PROVISIONED', tenantId: slug, tokenId, actorUid: uid
```

---

## 4. Collision & Race Protection

1. **Deterministic Slug & Membership Collision Detection:**
   - Pre-condition reads within the transaction guarantee that neither an existing tenant document nor an existing membership document can be overwritten or attached to by an unauthorized actor.
2. **One-Token-One-Consumption Guarantee:**
   - Under high concurrency (e.g. 10 simultaneous requests attempting to provision tenants using the same registration token), Firestore's transaction conflict detection guarantees that exactly **one** transaction succeeds and all 9 others fail cleanly without creating orphaned documents.

---

## 5. Security & Access Control Matrix

| Endpoint / Document | Anonymous / Public | Regular Authenticated User | Active Platform Admin | Direct Client Firestore SDK |
| :--- | :--- | :--- | :--- | :--- |
| `provisionTenantFromRegistrationToken` | ❌ Denied (401) | ✅ Allowed (Requires valid token) | ❌ Denied (403 Overlap protection) | N/A (Callable Cloud Function) |
| `tenants/{tenantId}` | ❌ Denied (403) | ❌ Denied (Read allowed only for OWNER of tenant) | ❌ Denied (Direct writes blocked by Rules) | ❌ Denied (403 Rules) |
| `tenantMemberships/{uid}_{tenantId}` | ❌ Denied (403) | ❌ Denied (Read allowed only for self active membership) | ❌ Denied (Direct writes blocked by Rules) | ❌ Denied (403 Rules) |
| `registrationTokens/*` | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403 Rules) | ❌ Denied (403 Rules) |
| `registrationTokenLookups/*` | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403 Rules) | ❌ Denied (403 Rules) |
| `platformAuditLogs/*` | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403 Rules) | ❌ Denied (403 Rules) |

---

## 6. Verification & Test Evidence

### 6.1 Unit & Core Tests (`npm run qa:tenant-provisioning`)
- Strict slug syntax and length checking (`3-64` chars).
- Reserved slugs blocked (`admin`, `gas`, `shiftoryx`, `portal`, `api`, `auth`, `status`, `stores`, etc.).
- Prohibited slug prefixes and suffixes blocked (`gas-*`, `*-gas`, `shiftoryx-*`, `*-shiftoryx`).
- Display name bounds and control character rejection.
- Strict allowlist input validation rejecting all forged actor, role, or status properties.

### 6.2 Emulator Integration Suite (`npm run test:tenant-provisioning:emulator`)
- **Test 1: Happy Path Provisioning:** Verified complete creation of tenant, `OWNER` membership, user mirror, scheduler settings, trial subscription, token consumption (`status: 'CONSUMED'`), and audit log.
- **Test 2: Fail-Closed Token Failures:** Verified that malformed, nonexistent, expired, revoked, and already-consumed tokens abort transactions with zero residual/partial Firestore state.
- **Test 3: Platform Admin Overlap Protection:** Verified that an active platform administrator is rejected from provisioning or acquiring tenant ownership.
- **Test 4: Input Tampering & Collisions:** Verified rejection of forged roles (`ADMIN`, `MANAGER`), forged `ownerUid`, reserved slugs, and duplicate tenant slug collisions.
- **Test 5: 10-Way Concurrency Race Test:** 10 simultaneous parallel provisioning requests using the same token yielded exactly 1 success and 9 failures, producing exactly 1 tenant and 1 consumed token.
- **Test 6: Direct Client Rules Enforcement:** Confirmed direct client writes to `tenants`, `tenantMemberships`, and `platformAuditLogs` are denied (HTTP 403).

### 6.3 Full Local Regression Suite
All repository QA suites passed without errors:
- `npm run build` (Vite production bundle OK)
- `npm run qa:scheduler` & `npm run qa:scheduler-engine`
- `npm run qa:repositories`
- `npm run qa:public-readonly`
- `npm run qa:tenant-authorization`
- `npm run qa:auth-broker`
- `npm run qa:export-security`
- `npm run qa:saas-foundation`
- `npm run qa:registration-tokens`
- `npm run qa:tenant-provisioning`
- `node scripts/validate-functions-discovery.mjs` (8 exports, 1069ms)

---

## 7. Residual Risks & Next Steps

1. **Production Deployment:** Phase 4 backend is implemented and validated in the emulator suite. No production deployment has been executed.
2. **Upcoming Phase 5:** Phase 5 will implement the root portal user interface (`/register`, `/login`, `/stores`) that connects the browser client to the `provisionTenantFromRegistrationToken` backend callable.
