# ShiftOryx — Phase 3: Registration Token Backend

**Status:** CLOSED  
**Version:** 1.3.0 (Production Deployed)  
**Phase Target:** Phase 3 Registration Token Backend  
**Security Boundary:** Server-Side Cloud Functions & Firestore Rules  
**Production Deployment:** COMPLETE (Deployed to gasstationproject-9dd89 on 2026-08-28)  
**Deploy Source SHA:** `410f0aaf380062d699e86a2b19b2e0cd2036f42e`  
**Active Firestore Ruleset:** `projects/gasstationproject-9dd89/rulesets/51bf31c1-87a3-47f8-964a-aea3c7e41bf0`  
**Active Cloud Functions (7):** `cleanupAuthTickets`, `createAuthTicket`, `exchangeAuthTicket`, `generateRegistrationToken`, `listRegistrationTokens`, `revokeRegistrationToken`, `validateRegistrationToken` (Node.js 22, Gen 2, us-central1)

---

## 1. Executive Summary

Phase 3 implements the secure backend infrastructure for ShiftOryx Registration Tokens. Registration tokens provide a cryptographically secure, platform-administrative mechanism to invite prospective tenant owners and provision initial business workspaces without exposing open self-registration endpoints.

The implementation strictly satisfies all Phase 3 architectural, cryptographic, authorization, and isolation mandates:
1. **High-Entropy Token Cryptography:** 256 bits of cryptographic entropy per token (`crypto.randomBytes(32)`), prefixed with `stx_` and encoded using URL-safe Base64.
2. **Identifier Separation (Opaque Management ID vs. Secret Lookup Hash):**
   - **Management Identifier (`tokenId`):** Opaque, non-secret random identifier formatted as `rtok_` + 32 hex chars (`crypto.randomBytes(16)`). Used exclusively in administrative APIs, UI listings, and audit trails.
   - **Secret Lookup Hash (`tokenHash`):** SHA-256 digest of the raw token. Stored strictly in an internal server-only collection (`registrationTokenLookups/{tokenHash}`). `tokenHash` is **never** exposed to clients, admin listings, public validators, or audit logs.
3. **Zero Plaintext Token Persistence:** Raw tokens are returned exactly once to the generating platform administrator upon creation. No raw token is ever stored in Firestore.
4. **Immutable Authenticated Actor Integrity:**
   - Administrative actor identity (`adminUid`, `actorUid`, `createdBy`, `revokedBy`) is strictly derived from `request.auth.uid`.
   - Caller-supplied request payloads cannot supply or override actor identities; unexpected fields are strictly rejected.
5. **Strict Management Cursor Pagination:**
   - Pagination cursor `startAfterCursor` must strictly match the management identifier format (`^rtok_[a-f0-9]{32}$`).
   - Nonexistent cursor tokens return deterministic `invalid-argument` errors to prevent silent pagination restarts.
6. **Canonical Single-Source Expiry & Fail-Closed Status:**
   - Authoritative expiry state is stored solely in `expiresAt` (Firestore Timestamp).
   - No secondary numeric fallback field (`expiresAtMs`) is stored or relied upon to bypass malformed canonical expiry.
   - Missing, null, or malformed `expiresAt` timestamps strictly fail closed as `INVALID` (never `ACTIVE`).
7. **Minimal Public Validation & Generic Rejection:**
   - Successful validation returns exclusively `{ valid: true, expiresAt, businessCategoryHint }`.
   - Administrative fields (`label`, `tokenId`, `tokenHash`, `createdBy`, `revokedBy`, `consumedBy`) are strictly omitted.
   - Any invalid, malformed, expired, revoked, or consumed token returns a generic `{ valid: false }`.
8. **Safe Global Bounded Rate Limiting:**
   - Server-controlled, bounded global rolling window limiter (60 requests per minute).
   - Stored in a single stable Firestore document (`rateLimits/registration_token_public_validation`) with transactional resets.
   - Zero document proliferation. No automatic Firestore TTL policy dependency claimed.
   - *Residual Availability Risk:* An attacker can temporarily exhaust the global validation budget (availability limitation), but cannot spoof client identities or bypass token validation security.
9. **Restricted Transactional Consumption Primitive & Actor Bounds:**
   - Implemented `consumeRegistrationToken` for Phase 4 automated tenant provisioning.
   - Requires valid `consumedBy` actor identifier (string, 1 to 128 characters, no ASCII control characters).
   - Arbitrary caller payloads and metadata objects are strictly prohibited.
10. **Complete Server-Only Firestore Rules:** Collections `registrationTokens`, `registrationTokenLookups`, `platformAuditLogs`, and `rateLimits` are completely blocked from direct client read/write access (`allow read, write: if false;`).

---

## 2. Token Architecture and Lifecycle

### 2.1 Identifier Separation & Storage Model

```
[Raw Token (Client-Held Secret)]
  │  stx_<43 chars base64url> (256-bit entropy)
  │
  ├─► SHA-256 ──► [registrationTokenLookups/{tokenHash}] (Server-Only Link)
  │                 └─► { tokenId: "rtok_...", createdAt, expiresAt }
  │
  └─► [registrationTokens/{tokenId}] (Management Document)
        ├─► tokenId: "rtok_<32 hex chars>" (Opaque Management Identifier)
        ├─► status: "ACTIVE" | "REVOKED" | "CONSUMED"
        ├─► createdAt, expiresAt, revokedAt, consumedAt
        ├─► createdBy, revokedBy, consumedBy
        └─► label, businessCategoryHint
```

### 2.2 Token State Transitions
```
                [Platform Admin Generation]
                            │
                            ▼
                        ┌────────┐
                        │ ACTIVE │
                        └───┬────┘
           ┌────────────────┼────────────────┐
           │ (Expiration /  │ (Revocation)   │ (Atomic Consumption)
           │  Malformed)    │                │
           ▼                ▼                ▼
      ┌─────────┐      ┌─────────┐      ┌──────────┐
      │ EXPIRED │      │ REVOKED │      │ CONSUMED │
      │ INVALID │      └─────────┘      └──────────┘
      └─────────┘
```

- **ACTIVE:** Token is valid, has canonical `expiresAt > serverNow`, not revoked, and not consumed.
- **EXPIRED / INVALID:** Timestamp exceeded or `expiresAt` is missing/malformed. Evaluated fail-closed at runtime.
- **REVOKED:** Explicitly revoked by a platform administrator using the opaque `tokenId` via `revokeRegistrationToken`.
- **CONSUMED:** Atomically consumed during tenant provisioning in a Firestore transaction.

---

## 3. Security and Access Control Matrix

| Actor | Generate Token | List Tokens | Revoke Token | Validate Token | Direct Firestore Read/Write |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Anonymous / Public** | ❌ Denied (401) | ❌ Denied (401) | ❌ Denied (401) | ✅ Allowed (Rate-limited, generic response) | ❌ Denied (403 Rules) |
| **Tenant OWNER** | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403) | ✅ Allowed (Rate-limited, generic response) | ❌ Denied (403 Rules) |
| **Inactive Platform Admin** | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403) | ✅ Allowed (Rate-limited, generic response) | ❌ Denied (403 Rules) |
| **Active Platform Admin** | ✅ Allowed (200, trusted actor) | ✅ Allowed (200, safe metadata) | ✅ Allowed (200, opaque `tokenId`) | ✅ Allowed (200) | ❌ Denied (403 Rules, Cloud Functions only) |

---

## 4. Cloud Functions Specification

### `generateRegistrationToken` (Callable)
- **Auth:** Active Platform Admin (`platformAdmins/{uid}` where `status == 'ACTIVE'`).
- **Input Parameters:**
  - `expiresInHours` (optional number, 1 to 720, default 168 / 7 days).
  - `label` (optional string, max 100 characters).
  - `businessCategoryHint` (optional enum: `FUEL_STATION`, `CAFE`, `RESTAURANT`, `HAIR_SALON`, `RETAIL`, `OTHER`).
  - *Strict Validation:* Unexpected request fields (including `adminUid`, `actorUid`, `createdBy`, `tokenId`, `tokenHash`) are strictly rejected.
- **Output:** `{ success: true, tokenId: string, token: string, expiresAt: number }`.
- **Security Guarantee:** `tokenHash` is never returned. `tokenId` is the opaque `rtok_...` identifier.

### `listRegistrationTokens` (Callable)
- **Auth:** Active Platform Admin.
- **Input Parameters:**
  - `limit` (optional number, 1 to 100, default 25).
  - `startAfterCursor` (optional string, must match `/^rtok_[a-f0-9]{32}$/`).
- **Output:** `{ success: true, tokens: Array<SafeTokenMetadata>, nextCursor: string|null }`.
- **Security Guarantee:** `tokenHash`, lookup hashes, and raw tokens are excluded.

### `revokeRegistrationToken` (Callable)
- **Auth:** Active Platform Admin.
- **Input Parameters:** `{ tokenId: string }` (Must match `/^rtok_[a-f0-9]{32}$/`).
- **Output:** `{ success: true, status: 'REVOKED' }`.
- **Idempotency:** Re-revoking an already revoked token succeeds without error. Revoking a `CONSUMED` token fails closed (`failed-precondition`).

### `validateRegistrationToken` (Callable)
- **Auth:** Public / Unauthenticated allowed.
- **Rate Limit:** 60 requests per 1-minute window globally across the endpoint via single stable document `rateLimits/registration_token_public_validation`.
- **Input Parameters:** `{ token: string }`.
- **Output (Valid):** `{ valid: true, expiresAt: number, businessCategoryHint: string|null }`.
- **Output (Invalid / Expired / Revoked / Consumed / Malformed):** `{ valid: false }`.
- **Security Guarantee:** Does not expose `label`, `tokenId`, `tokenHash`, or actor IDs.

---

## 5. Phase 4 Integration Primitive

The consumption helper is exported from `functions/src/registrationTokenService.js`:

```javascript
import { consumeRegistrationToken } from './registrationTokenService.js';

await db.runTransaction(async (transaction) => {
  // 1. Consume token atomically using rawToken and bounded actor identifier
  const result = await consumeRegistrationToken(transaction, {
    db,
    rawToken,
    consumedBy: newOwnerUid, // Validated: 1-128 chars, non-empty, no control chars
  });

  // result contains { tokenId, status: 'CONSUMED', businessCategoryHint }
  // 2. Provision tenant, store, and owner membership in the same transaction
});
```

If the token is invalid, expired, revoked, or already consumed, `consumeRegistrationToken` throws a descriptive error, causing the transaction to abort safely. Exactly 1 concurrent consumption can succeed.

---

## 6. Verification and Regression Summary

| Suite / Test Target | Command | Result |
| :--- | :--- | :--- |
| **Token Core Cryptography** | `npm run qa:registration-tokens` | ✅ 100% Passed (Actor integrity, strict cursor, canonical expiry, actor bounds) |
| **Functions Discovery Benchmark** | `node scripts/validate-functions-discovery.mjs` | ✅ 100% Passed (~650ms, threshold < 3000ms) |
| **Client Production Build** | `npm run build` | ✅ 100% Passed (0 errors) |
| **Scheduler QA** | `npm run qa:scheduler` | ✅ 100% Passed |
| **Scheduler Engine Stress QA** | `npm run qa:scheduler-engine` | ✅ 100% Passed |
| **Repository Boundaries QA** | `npm run qa:repositories` | ✅ 100% Passed |
| **Public Readonly QA** | `npm run qa:public-readonly` | ✅ 100% Passed |
| **Tenant Authorization QA** | `npm run qa:tenant-authorization` | ✅ 100% Passed |
| **Auth Broker QA** | `npm run qa:auth-broker` | ✅ 100% Passed |
| **Export Security QA** | `npm run qa:export-security` | ✅ 100% Passed |
| **SaaS Foundation QA** | `npm run qa:saas-foundation` | ✅ 100% Passed |
| **Auth Broker Emulator Integration** | `npm run test:auth-broker:emulator` | ✅ 100% Passed |
| **Storage Rules Emulator Integration** | `npm run test:storage:emulator` | ✅ 100% Passed |
| **Platform Admin Decoupling Emulator**| `npm run test:platform-admin:emulator` | ✅ 100% Passed |
| **Platform Admin Overlap Emulator** | `npm run test:platform-admin-overlap:emulator` | ✅ 100% Passed |
| **Owner Role Inventory Emulator** | `npm run test:owner-role-inventory:emulator` | ✅ 100% Passed |
| **Data Migration Script Emulator** | `npm run test:migration:emulator` | ✅ 100% Passed |
| **Tenant Provisioning CLI Emulator** | `npm run test:provision-tenant:emulator` | ✅ 100% Passed |
| **Registration Token Emulator Integration** | `npm run test:registration-tokens:emulator` | ✅ 100% Passed (9 stages: actor integrity, strict cursor, fail-closed expiry, 10-way concurrency, rules) |
| **Security Hardening Scans** | `npm run security:hardening && npm run security:integrity` | ✅ 100% Passed (0 high/critical CVEs) |
