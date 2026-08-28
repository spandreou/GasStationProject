# ShiftOryx — Phase 4: Automated Tenant Provisioning

**Status:** IMPLEMENTATION_READY_FOR_HUMAN_REVIEW  
**Version:** 1.2.0 (Final Architecture Alignment)  
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
- **Actor Integrity:** The provisioning service derives the prospective tenant owner's identity strictly from `request.auth.uid`. Request payload fields attempting to specify `ownerUid`, `adminUid`, `actorUid`, `createdBy`, or client-supplied `email` are rejected.
- **Atomicity Confined to Firestore:** Because user authentication is established prior to calling provisioning, the entire tenant creation, slug reservation, membership assignment, scheduler initialization, trial subscription creation, token consumption, and audit logging execute within **one single ACID Firestore transaction** (`AUTH_FIRESTORE_ATOMICITY = AUTH_PREEXISTS_FIRESTORE_PROVISIONING_ATOMIC_ONLY`).

### 2.2 Role & Existing Membership Policy
- **Canonical Role:** `OWNER` is the exclusive authenticated role created for tenant memberships in Phase 4.
- **Legacy Roles:** No `ADMIN` or `MANAGER` memberships are ever created.
- **Existing Membership Policy:**
  ```text
  PHASE4_EXISTING_MEMBERSHIP_POLICY = FAIL_CLOSED_IF_ANY_CANONICAL_MEMBERSHIP_EXISTS
  ```
  - `tenantMemberships` is the canonical source of truth.
  - If the caller already possesses **any** document in `tenantMemberships` (whether `ACTIVE`, `REVOKED`, legacy `ADMIN`, legacy `MANAGER`, or unknown role) or in `users/{uid}.memberships`, provisioning is denied (`failed-precondition`). Multi-store / multi-tenant ownership lifecycle is deferred to Phase 8.
- **Platform Admin Decoupling:** Active Platform Administrators (`platformAdmins/{uid}.status === 'ACTIVE'`) are strictly forbidden from provisioning or owning tenants (`ACTIVE_PLATFORM_ADMIN_PROVISIONING = DENIED`).
- **Sources of Truth:**
  - Primary source of truth: `tenantMemberships/{uid}_{tenantId}` (`role: 'OWNER'`, `status: 'ACTIVE'`).
  - Synchronized compatibility mirror: `users/{uid}.memberships[tenantId]` (`role: 'OWNER'`, `status: 'ACTIVE'`).

### 2.3 Membership PII Minimization
```text
MEMBERSHIP_EMAIL_REMOVED = YES
MEMBERSHIP_EMAIL_PRESENT = NO
```
- Canonical `tenantMemberships/{uid}_{tenantId}` documents contain only authorization-essential fields: `uid`, `tenantId`, `role: 'OWNER'`, `status: 'ACTIVE'`, `createdAt`, `updatedAt`.
- No PII (`email`) is duplicated into membership records.
- User profile in `users/{uid}` stores the normalized email derived securely from `request.auth.token.email` (never from client input).

### 2.4 Slug Reservation Architecture (`slugReservations/{slug}`)
- Slugs are reserved atomically inside the transaction at `slugReservations/{slug}`:
  ```json
  {
    "slug": "tenant-slug",
    "tenantId": "tenant-slug",
    "status": "ACTIVE",
    "reservedBy": "caller-uid",
    "createdAt": "serverTimestamp"
  }
  ```
- Pre-condition check reads both `tenants/{slug}` and `slugReservations/{slug}`; if either exists, provisioning aborts with `already-exists` without corrupting state or consuming tokens.

### 2.5 Domain Metadata Boundary
```text
DOMAIN_METADATA_MODEL = DOMAIN_PENDING_PHASE6_CUTOVER (domain: null)
```
- `shiftoryx.gr` and `*.shiftoryx.gr` are currently `PURCHASED_NOT_CONFIGURED`.
- Phase 4 does NOT hardcode operational `.shiftoryx.gr` domains on tenant documents.
- `tenants/{slug}.domain` is set to `null` to avoid asserting unconfigured production routing prior to Phase 6.

### 2.6 Business Category Precedence & Template Runtime Deferral
```text
BUSINESS_CATEGORY_PRECEDENCE = CLIENT_VALID_CATEGORY_THEN_TOKEN_HINT_THEN_OTHER
TEMPLATE_RUNTIME_ASSIGNMENT = DEFERRED_TO_LATER_APPROVED_TEMPLATE_RUNTIME
```
- Provisioning validates and persists `businessCategory` metadata (`FUEL_STATION`, `CAFE`, `RESTAURANT`, `HAIR_SALON`, `RETAIL`, `OTHER`), defaulting safely to `OTHER`.
- **No Synthetic Template IDs:** Synthetic template assignment (`fuel-station-default`, `generic-default`, etc.) has been eliminated. The tenant document, callable response, and audit log do NOT persist synthetic `templateId` or `templateVersion`.
- Template catalog, versioned template assignments, and branding runtime are formally deferred to Phase 9.

### 2.7 Store Model Clarification
- `CANONICAL_STORE_COLLECTION = NONE_IN_PHASE4`
- `INITIAL_STORE_REQUIRED = NO`
- Scheduler settings (`tenants/{tenantId}/settings/scheduler`) is a tenant-level scheduler configuration subcollection, not a store entity. Dedicated multi-store collections belong to Phase 8.

### 2.8 Known Phase 7 Subscription Entitlement Residual
- `TRIAL_DOCUMENT_CREATED_SERVER_SIDE = YES` (`tenants/{tenantId}/subscription/current` initialized with plan `TRIAL`, status `TRIALING`, 14-day duration).
- `TRIAL_ENTITLEMENT_ENFORCEMENT = NOT_YET_IMPLEMENTED_PHASE7` (Server-side entitlement enforcement and locking Firestore rules for subscriptions belong to Phase 7).
- `CURRENT_OWNER_SUBSCRIPTION_WRITE_RESIDUAL = DOCUMENTED`.

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
    - Reject all unknown/forbidden fields (role, status, uid overrides, email)
                │
                ▼
[2. Atomic Firestore Transaction Boundary (Read Phase)]
    ├─► Read platformAdmins/{uid} ──────────────► [If ACTIVE: ABORT with permission-denied]
    ├─► Read tenantMemberships where uid==uid ──► [If ANY exists: ABORT with failed-precondition]
    ├─► Read users/{uid} ───────────────────────► [If memberships exist: ABORT with failed-precondition]
    ├─► Read tenants/{slug} ────────────────────► [If EXISTS: ABORT with already-exists]
    ├─► Read slugReservations/{slug} ───────────► [If EXISTS: ABORT with already-exists]
    ├─► Consume Registration Token (Phase 3 consumeRegistrationToken)
    │     ├─► Hash raw token -> read registrationTokenLookups/{hash}
    │     ├─► Read registrationTokens/{tokenId}
    │     └─► Verify effectiveStatus == 'ACTIVE' & canonical expiresAt
    │
    ▼ [Write Phase]
    ├─► Write slugReservations/{slug} ──────────► [status: 'ACTIVE', reservedBy: uid]
    ├─► Write tenants/{slug} ───────────────────► [domain: null, status: 'ACTIVE', businessCategory]
    ├─► Write tenantMemberships/{uid}_{slug} ───► [role: 'OWNER', status: 'ACTIVE'] (No email PII)
    ├─► Write/Update users/{uid} ───────────────► [memberships: { [slug]: { role: 'OWNER', status: 'ACTIVE' } }, email: auth.token.email]
    ├─► Write tenants/{slug}/settings/scheduler ─► [generatorRules: default rules, specialDaysByDate: {}]
    ├─► Write tenants/{slug}/subscription/current► [plan: 'TRIAL', status: 'TRIALING', trialEndsAt: now + 14d]
    ├─► Update registrationTokens/{tokenId} ────► [status: 'CONSUMED', consumedBy: uid]
    └─► Write platformAuditLogs/{id} ───────────► [action: 'TENANT_PROVISIONED', tenantId: slug, tokenId, businessCategory]
```

---

## 4. Security & Access Control Matrix

| Endpoint / Document | Anonymous / Public | Regular Authenticated User | Active Platform Admin | Direct Client Firestore SDK |
| :--- | :--- | :--- | :--- | :--- |
| `provisionTenantFromRegistrationToken` | ❌ Denied (401) | ✅ Allowed (Requires valid token & 0 existing memberships) | ❌ Denied (403 Overlap protection) | N/A (Callable Cloud Function) |
| `slugReservations/{slug}` | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403 Rules) | ❌ Denied (403 Rules) |
| `tenants/{tenantId}` | ❌ Denied (403) | ❌ Denied (Read allowed only for OWNER of tenant) | ❌ Denied (Direct writes blocked by Rules) | ❌ Denied (403 Rules) |
| `tenantMemberships/{uid}_{tenantId}` | ❌ Denied (403) | ❌ Denied (Read allowed only for self active membership) | ❌ Denied (Direct writes blocked by Rules) | ❌ Denied (403 Rules) |
| `registrationTokens/*` | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403 Rules) | ❌ Denied (403 Rules) |
| `registrationTokenLookups/*` | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403 Rules) | ❌ Denied (403 Rules) |
| `platformAuditLogs/*` | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403 Rules) | ❌ Denied (403 Rules) |

---

## 5. Verification & Test Evidence

### 5.1 Unit & Core Tests (`npm run qa:tenant-provisioning`)
- Strict slug syntax and length checking (`3-64` chars).
- Reserved slugs blocked (`admin`, `gas`, `shiftoryx`, `portal`, `api`, `auth`, `status`, `stores`, etc.).
- Prohibited slug prefixes and suffixes blocked (`gas-*`, `*-gas`, `shiftoryx-*`, `*-shiftoryx`).
- Display name bounds and control character rejection.
- Business category allowlist and precedence resolution verification (`CLIENT -> TOKEN_HINT -> OTHER`).
- Strict allowlist input validation rejecting all forbidden fields (`role`, `status`, `uid`, `email`, `templateId`).

### 5.2 Emulator Integration Suite (`npm run test:tenant-provisioning:emulator`)
- **Test 1: Happy Path Across All Categories:** Verified complete creation of tenant, slug reservation, `OWNER` membership, user mirror, scheduler settings, trial subscription, token consumption (`status: 'CONSUMED'`), and audit log for `FUEL_STATION`, `CAFE`, `RESTAURANT`, `HAIR_SALON`, `RETAIL`, and `OTHER`. Explicitly verified `templateId`, `templateVersion`, and membership `email` are absent.
- **Test 2: Real Registration Token Fail-Closed Matrix:** Verified that malformed syntax, nonexistent token, expired token (past `expiresAt`), revoked token, already-consumed token, active token with missing canonical `expiresAt`, and active token with malformed canonical `expiresAt` abort transactions with 0 residual documents.
- **Test 3: Existing Membership Policy Matrix:** Verified fail-closed rejection when caller has active `OWNER`, revoked `OWNER`, legacy `ADMIN`, legacy `MANAGER`, unknown role, or mirror-only membership.
- **Test 4: Slug Reservation & Collision Matrix:** Verified collision rejection for existing tenant without reservation, existing reservation without tenant, and contested slug race between two valid tokens.
- **Test 5: 10-Way Concurrency Race Test:** 10 simultaneous parallel provisioning requests using the same token yielded exactly 1 success and 9 failures, producing exactly 1 tenant, 1 slug reservation, and 1 consumed token.
- **Test 6: Retry Contract Test:** Repeated identical call after successful provisioning returns deterministic error without duplicating state.
- **Test 7: Direct Client Rules Enforcement:** Confirmed direct client reads/writes to `slugReservations`, `tenants`, `tenantMemberships`, and `platformAuditLogs` return HTTP 403.
- **Test 8: Error Redaction Test:** Confirmed error responses return clean sanitized error codes without leaking internal document paths, lookup hashes, or stack traces.

---

## 6. Residual Risks & Next Steps

1. **Production Deployment:** Phase 4 backend is implemented and validated in the emulator suite. No production deployment has been executed.
2. **Upcoming Phase 5:** Phase 5 will implement the root portal user interface (`/register`, `/login`, `/stores`) that connects the browser client to the `provisionTenantFromRegistrationToken` backend callable.
3. **Upcoming Phase 9:** Phase 9 will implement the centrally managed template catalog, versioned template runtime, and preview/migration system.
