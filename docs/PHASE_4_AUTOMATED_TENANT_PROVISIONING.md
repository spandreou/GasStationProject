# ShiftOryx — Phase 4: Automated Tenant Provisioning

**Status:** PREPRODUCTION_CONTRACT_HARDENED  
**Version:** 1.4.0 (Master Roadmap Alignment & Pre-Merge Hardening)  
**Phase Target:** Phase 4 Automated Tenant Provisioning  
**Security Boundary:** Server-Side Cloud Functions (`functions/src/provisioningService.js`) & Atomic Firestore Transactions  
**Production Deployment:** NOT PERFORMED (Emulator-validated only)  
**Base Source SHA:** `497a57cf1e5ffc1e5fb313d66678ef2fb77d7f02`  
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
- **Existing & Malformed Membership Policy:**
  ```text
  PHASE4_EXISTING_MEMBERSHIP_POLICY = FAIL_CLOSED_IF_ANY_CANONICAL_MEMBERSHIP_EXISTS
  MALFORMED_MEMBERSHIP_STATE = FAIL_CLOSED_MANUAL_REVIEW_REQUIRED
  ```
  - `tenantMemberships` is the canonical source of truth.
  - Dual Detection: Pre-condition inspection checks both the `uid` field query (`where('uid', '==', callerUid)`) AND the canonical document ID range prefix (`[${callerUid}_, ${callerUid}_\uf8ff]`) to catch malformed legacy records with missing/wrong internal `uid` fields.
  - Strict Compatibility Mirror: `users/{uid}.memberships` must be absent or a plain empty map `{}`. Any non-empty map or malformed primitive/array/null value causes immediate fail-closed rejection (`failed-precondition`).
  - Multi-store / multi-tenant ownership lifecycle is deferred to Phase 8.
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

### 2.4 Slug Contract & Reservation Architecture (`slugReservations/{slug}`)
```text
SLUG_MIN_LENGTH = 3
SLUG_MAX_LENGTH = 40
SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
```
- Slugs must be between 3 and 40 characters, lowercase alphanumeric and hyphens, without leading/trailing hyphens.
- Reserved platform slugs (`admin`, `gas`, `shiftoryx`, `portal`, `api`, `auth`, `status`, `stores`, etc.) and prohibited prefixes/suffixes (`gas-*`, `*-gas`, `shiftoryx-*`, `*-shiftoryx`) are rejected.
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
- Pre-condition check reads both `tenants/{slug}` and `slugReservations/{slug}`; if either exists, provisioning aborts with `already-exists` (reason: `tenant-slug-taken`) without corrupting state or consuming tokens.

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
```text
CANONICAL_STORE_COLLECTION = NONE_IN_PHASE4
INITIAL_STORE_REQUIRED = NO
```
- Phase 4 initializes the tenant-level scheduler configuration subcollection at `tenants/{tenantId}/settings/scheduler`.
- This is a tenant-level scheduler configuration document and NOT a dedicated store entity.
- Dedicated multi-store collections, store selectors, and multi-location management belong to Phase 8.

### 2.8 Safe Structured Error Reasons Contract
```typescript
export const PROVISIONING_ERROR_REASONS = {
  PLATFORM_ADMIN_OVERLAP: 'platform-admin-overlap',
  EXISTING_MEMBERSHIP: 'existing-membership',
  TENANT_SLUG_TAKEN: 'tenant-slug-taken',
  REGISTRATION_TOKEN_EXPIRED: 'registration-token-expired',
  REGISTRATION_TOKEN_REVOKED: 'registration-token-revoked',
  REGISTRATION_TOKEN_CONSUMED: 'registration-token-consumed',
  REGISTRATION_TOKEN_INVALID: 'registration-token-invalid',
  PROVISIONING_INTERNAL: 'provisioning-internal',
  INVALID_ARGUMENT: 'invalid-argument',
  UNAUTHENTICATED: 'unauthenticated',
};
```
- Callable responses deliver clean machine-readable `reason` tokens inside `error.details`.
- Public error messages are strictly bounded to fixed safe strings (e.g. `'Το αίτημα δεν είναι έγκυρο.'` and `'Το registration token δεν είναι έγκυρο.'`), never echoing `err.message` or reflecting client input.
- Zero exposure of internal Firestore collection paths, token hashes, or stack traces.

### 2.9 Subscription Trial Duration (7 Days)
```text
TRIAL_DOCUMENT_CREATED_SERVER_SIDE = YES
TRIAL_DURATION_DAYS = 7
TRIAL_ENTITLEMENT_ENFORCEMENT = NOT_YET_IMPLEMENTED_PHASE7
```
- `tenants/{tenantId}/subscription/current` is initialized with plan `TRIAL`, status `TRIALING`, and `trialEndsAt = now + 7 days`.
- Server-side entitlement enforcement and locking Firestore rules for subscriptions belong to Phase 7.
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
    - Validate slug format (3-40 chars, regex, no reserved/gas/shiftoryx names)
    - Validate display name (1-100 chars, no control chars)
    - Validate business category (FUEL_STATION, CAFE, RESTAURANT, HAIR_SALON, RETAIL, OTHER)
    - Reject all unknown/forbidden fields (role, status, uid overrides, email)
                │
                ▼
[2. Atomic Firestore Transaction Boundary (Read Phase)]
    ├─► Read platformAdmins/{uid} ──────────────► [If ACTIVE: ABORT with permission-denied (platform-admin-overlap)]
    ├─► Read tenantMemberships where uid==uid ──► [If ANY exists: ABORT with failed-precondition (existing-membership)]
    ├─► Read users/{uid} ───────────────────────► [If memberships exist: ABORT with failed-precondition (existing-membership)]
    ├─► Read tenants/{slug} ────────────────────► [If EXISTS: ABORT with already-exists (tenant-slug-taken)]
    ├─► Read slugReservations/{slug} ───────────► [If EXISTS: ABORT with already-exists (tenant-slug-taken)]
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
    ├─► Write tenants/{slug}/subscription/current► [plan: 'TRIAL', status: 'TRIALING', trialEndsAt: now + 7d]
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
- Strict slug syntax and length checking (`3-40` chars). Length 2, 41, 64 rejected. Length 3, 40 accepted.
- Reserved slugs blocked (`admin`, `gas`, `shiftoryx`, `portal`, `api`, `auth`, `status`, `stores`, etc.).
- Prohibited slug prefixes and suffixes blocked (`gas-*`, `*-gas`, `shiftoryx-*`, `*-shiftoryx`).
- Display name bounds and control character rejection.
- Business category allowlist and precedence resolution verification (`CLIENT -> TOKEN_HINT -> OTHER`).
- 7-day trial duration constant verification (`TRIAL_DURATION_DAYS = 7`).
- Structured error reasons vocabulary verification (`PROVISIONING_ERROR_REASONS`).
- `ProvisioningValidationError` class verification on all thrown validation errors.
- Strict allowlist input validation rejecting all forbidden fields (`role`, `status`, `uid`, `email`, `templateId`).

### 5.2 Emulator Integration Suite (`npm run test:tenant-provisioning:emulator`)
- **Test 1: Happy Path Across All Categories (7-Day Trial):** Verified complete creation of tenant, slug reservation, `OWNER` membership, user mirror, scheduler settings, 7-day trial subscription (`trialEndsAt ≈ now + 7d`), token consumption (`status: 'CONSUMED'`), and audit log for `FUEL_STATION`, `CAFE`, `RESTAURANT`, `HAIR_SALON`, `RETAIL`, and `OTHER`.
- **Test 2: Real Registration Token Fail-Closed Matrix & Error Reasons:** Verified malformed syntax (`invalid-argument`, bounded message), nonexistent token (`registration-token-invalid`), expired token (`registration-token-expired`), revoked token (`registration-token-revoked`), already-consumed token (`registration-token-consumed`), active token with missing/malformed `expiresAt` (`registration-token-invalid`).
- **Test 3: Existing Membership & Platform Admin Matrix (Full State Proofs):** Verified fail-closed rejection when caller is Platform Admin (`platform-admin-overlap`), has active `OWNER` (`existing-membership`), revoked `OWNER` (`existing-membership`), legacy `ADMIN`/`MANAGER` (`existing-membership`), unknown role (`existing-membership`), or mirror-only membership (`existing-membership`). Verified for each case that token remains `ACTIVE`, 0 tenants created, 0 slug reservations created, and 0 new memberships created.
- **Test 4: Slug Reservation & Collision Matrix:** Verified collision rejection for existing tenant without reservation (`tenant-slug-taken`), existing reservation without tenant (`tenant-slug-taken`), and contested slug race between two valid tokens (`tenant-slug-taken`). Verified tokens remain `ACTIVE` on non-race collision rejections.
- **Test 4c: Same-Slug Race State Proof:** Verified that 2 parallel requests with different tokens for the same slug yield exactly 1 success and 1 failure (`tenant-slug-taken`), with exactly 1 tenant created, exactly 1 slug reservation created, winner's token `CONSUMED`, loser's token `ACTIVE`, exactly 1 `OWNER` membership for winner, 0 memberships for loser, and exactly 1 audit log entry.
- **Test 4b: 41-Character Slug Rejection in Emulator:** Verified that a 41-character slug is rejected by the callable backend with `invalid-argument`, leaving the token `ACTIVE` and creating 0 residual documents.
- **Test 5: 10-Way Concurrency Race Test:** 10 simultaneous parallel provisioning requests using the same token yielded exactly 1 success and 9 failures (with reason `registration-token-consumed`), producing exactly 1 tenant, 1 slug reservation, and 1 consumed token.
- **Test 6: Retry Contract Test:** Repeated identical call after successful provisioning returns deterministic error (`existing-membership`) without duplicating state.
- **Test 7: Direct Client Rules Enforcement:** Confirmed direct client reads/writes to `slugReservations`, `tenants`, `tenantMemberships`, and `platformAuditLogs` return HTTP 403.
- **Test 8: Error Redaction, Sanitization & Input Reflection Safety Test:** Confirmed error responses return clean sanitized error codes and reasons without leaking internal document paths, lookup hashes, platform admin paths, or stack traces, and specifically verified that long unknown keys, forbidden fields, invalid categories, and raw tokens are NOT reflected into response bodies.

---

## 6. Residual Risks & Next Steps

1. **Production Deployment:** Phase 4 backend is corrected, hardened, and emulator-validated. No production deployment has been executed (`PHASE4_PRODUCTION_RUNTIME = NOT_DEPLOYED`). `provisionTenantFromRegistrationToken` is currently absent from Firebase production until separate human-approved deployment.
2. **Phase 5 Root Portal UI:** Phase 5 will implement the root portal user interface (`/register`, `/login`, `/stores`) that connects the browser client to the `provisionTenantFromRegistrationToken` backend callable (currently in separate Draft PR #38).
3. **Deferred Roadmap Capabilities:**
   - **Phase 6:** Wildcard ShiftOryx domain routing and SSL provisioning.
   - **Phase 7:** Server-side subscription entitlement enforcement, daily usage tracking, and planning horizon restrictions.
   - **Phase 8:** Dedicated multi-store entity data model and store lifecycle management.
   - **Phase 9:** Centrally managed template catalog, versioned template runtime, and preview/migration controls.
