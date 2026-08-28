# ShiftOryx — Phase 3: Registration Token Backend

**Status:** IMPLEMENTATION_READY_FOR_HUMAN_REVIEW  
**Version:** 1.0.0  
**Phase Target:** Phase 3 Registration Token Backend  
**Security Boundary:** Server-Side Cloud Functions & Firestore Rules  
**Production Deployment:** STOPPED (Pre-deployment emulator verification stage)

---

## 1. Executive Summary

Phase 3 implements the secure backend infrastructure for ShiftOryx Registration Tokens. Registration tokens provide a cryptographically secure, administrative mechanism to invite new tenant owners and provision initial business workspaces without exposing open self-registration endpoints.

The implementation strictly satisfies all Phase 3 architectural, cryptographic, authorization, and isolation mandates:
1. **High-Entropy Token Cryptography:** 256 bits of cryptographic entropy per token, prefixed with `stx_` and encoded using URL-safe Base64.
2. **Zero Plaintext Token Persistence:** Raw tokens are returned exactly once to the generating platform administrator upon creation. Only the one-way SHA-256 hash digest is stored in Firestore.
3. **Platform Admin Exclusivity:** Token generation, listing, and revocation are restricted exclusively to authenticated platform administrators with `status: ACTIVE` in `platformAdmins/{uid}`. Tenant `OWNER`s and unauthenticated users cannot manage tokens.
4. **Generic Validation Responses:** Public validation returns `{ valid: false }` for all invalid, malformed, expired, revoked, or already consumed tokens to prevent timing attacks and metadata leakage.
5. **Atomic Transactional Consumption Primitive:** Implemented a transactional consumption helper `consumeRegistrationToken` ready for Phase 4 automated tenant provisioning, preventing race conditions and double-consumption.
6. **Bounded Rate Limiting:** Built-in fixed-window rate limiter on public validation using deterministic IP hashing to prevent brute-force attacks without unbounded document growth.
7. **Complete Server-Only Firestore Rules:** Collections `registrationTokens`, `platformAuditLogs`, and `rateLimits` are completely blocked from direct client read/write access (`allow read, write: if false;`).

---

## 2. Token Architecture and Lifecycle

### 2.1 Token Format and Storage
- **Prefix:** `stx_`
- **Entropy:** 32 bytes (`crypto.randomBytes(32)`) encoded as Base64URL (43 characters).
- **Full Token Length:** 47 characters matching `/^stx_[a-zA-Z0-9_-]{43,64}$/`.
- **Firestore Document ID:** 64-character SHA-256 hexadecimal digest (`registrationTokens/{tokenHash}`).

### 2.2 Token State Transitions
```
                [Platform Admin Generation]
                            │
                            ▼
                        ┌────────┐
                        │ ACTIVE │
                        └───┬────┘
           ┌────────────────┼────────────────┐
           │ (Expiration)   │ (Revocation)   │ (Atomic Consumption)
           ▼                ▼                ▼
      ┌─────────┐      ┌─────────┐      ┌──────────┐
      │ EXPIRED │      │ REVOKED │      │ CONSUMED │
      └─────────┘      └─────────┘      └──────────┘
```

- **ACTIVE:** Token is valid, within its TTL (`expiresAt > now`), not revoked, and not consumed.
- **EXPIRED:** Token timestamp exceeded `expiresAt`. Derived dynamically at validation and consumption time.
- **REVOKED:** Explicitly revoked by a platform administrator via `revokeRegistrationToken`.
- **CONSUMED:** Atomically consumed during tenant provisioning in a Firestore transaction.

---

## 3. Security and Access Control Matrix

| Actor | Generate Token | List Tokens | Revoke Token | Validate Token | Direct Firestore Read/Write |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Anonymous / Public** | ❌ Denied (401) | ❌ Denied (401) | ❌ Denied (401) | ✅ Allowed (Rate-limited, generic response) | ❌ Denied (403 Rules) |
| **Tenant OWNER** | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403) | ✅ Allowed (Rate-limited, generic response) | ❌ Denied (403 Rules) |
| **Inactive Platform Admin** | ❌ Denied (403) | ❌ Denied (403) | ❌ Denied (403) | ✅ Allowed (Rate-limited, generic response) | ❌ Denied (403 Rules) |
| **Active Platform Admin** | ✅ Allowed (200) | ✅ Allowed (200, safe metadata) | ✅ Allowed (200, idempotent) | ✅ Allowed (200) | ❌ Denied (403 Rules, Cloud Functions only) |

---

## 4. Cloud Functions Specification

### `generateRegistrationToken` (Callable)
- **Auth:** Active Platform Admin (`platformAdmins/{uid}` where `status == 'ACTIVE'`).
- **Input Parameters:**
  - `expiresInHours` (optional number, 1 to 720, default 168 / 7 days).
  - `label` (optional string, max 100 characters).
  - `businessCategoryHint` (optional enum: `FUEL_STATION`, `CAFE`, `RESTAURANT`, `HAIR_SALON`, `RETAIL`, `OTHER`).
- **Output:** `{ success: true, tokenId: string, token: string, expiresAt: number }` (Raw token returned once).

### `listRegistrationTokens` (Callable)
- **Auth:** Active Platform Admin.
- **Input Parameters:** `{ limit?: number, startAfterCursor?: string }`.
- **Output:** `{ success: true, tokens: Array<SafeTokenMetadata>, nextCursor: string|null }`.
- **Security Guarantee:** `tokenHash` and raw token are stripped from all listed items.

### `revokeRegistrationToken` (Callable)
- **Auth:** Active Platform Admin.
- **Input Parameters:** `{ tokenId: string }`.
- **Output:** `{ success: true, status: 'REVOKED' }`.
- **Idempotency:** Re-revoking an already revoked token succeeds without error.

### `validateRegistrationToken` (Callable)
- **Auth:** Public / Unauthenticated allowed.
- **Rate Limit:** 15 requests per 5-minute window per client IP. Throttled with `resource-exhausted`.
- **Input Parameters:** `{ token: string }`.
- **Output (Valid):** `{ valid: true, label: string|null, businessCategoryHint: string|null, expiresAt: number }`.
- **Output (Invalid / Expired / Revoked / Consumed):** `{ valid: false }`.

---

## 5. Phase 4 Integration Primitive

The consumption helper is exported from `functions/src/registrationTokenService.js`:

```javascript
import { consumeRegistrationToken } from './registrationTokenService.js';

await db.runTransaction(async (transaction) => {
  // 1. Consume token atomically
  const tokenDoc = await consumeRegistrationToken(transaction, {
    db,
    rawToken,
    consumedBy: newOwnerUid,
    metadata: { tenantId: 'new-store-slug' }
  });

  // 2. Provision tenant, store, and owner membership in the same transaction
  // ...
});
```

If the token is invalid, expired, revoked, or already consumed, `consumeRegistrationToken` throws a descriptive `invalid-argument` or `failed-precondition` error, causing the transaction to abort safely.

---

## 6. Verification and Regression Summary

| Suite / Test Target | Command | Result |
| :--- | :--- | :--- |
| **Token Core Cryptography** | `npm run qa:registration-tokens` | ✅ 100% Passed (10 unit test cases) |
| **Functions Discovery Benchmark** | `node scripts/validate-functions-discovery.mjs` | ✅ 100% Passed (518ms, threshold < 3000ms) |
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
| **Registration Token Emulator Integration** | `npm run test:registration-tokens:emulator` | ✅ 100% Passed (8 integration stages, 10-way concurrency) |
| **Security Hardening Scans** | `npm run security:scan` | ✅ 100% Passed (0 high/critical CVEs) |

---

## 7. Roadmap Alignment & Next Phase Handoff

Phase 3 is fully implemented on branch `antigravity/phase3-registration-token-backend` and ready for code review via Draft Pull Request.

**Boundaries & Strict Stopping Point:**
- **No Production Deployment:** Production deployment of Phase 3 Cloud Functions and Firestore Rules requires explicit human approval.
- **Phase 4 Precondition:** Phase 4 (Automated Tenant & Store Provisioning) must not commence until Phase 3 PR is approved and merged into `main`.
