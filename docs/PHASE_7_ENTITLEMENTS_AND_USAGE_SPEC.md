# ShiftOryx Phase 7 — Subscriptions, Entitlements & Daily Usage Architecture Specification

**Status:** `FOUNDATION_IMPLEMENTED_PENDING_BILLING_INTEGRATION`  
**Milestone:** Phase 7 — Multi-Tenant Subscriptions & Server-Enforced Entitlements  
**Baseline Git Commit:** `25be00cec0ecf715ddd97cf162868a299f100472`  
**Branch:** `antigravity/phase7-entitlements-foundation`  

---

## 1. Executive Summary

Phase 7 designs and implements the server-trusted subscription, entitlement, and daily usage accounting architecture for ShiftOryx. In multi-tenant SaaS, access control and plan limits cannot rely on client-side feature flags or unvalidated client Firestore writes. This specification establishes:

1. **A pure, fail-safe Entitlement Resolver** (`functions/src/entitlements/entitlementResolver.js`).
2. **A server-authoritative Data Model** for tenant subscriptions and idempotent daily usage counters.
3. **A comprehensive Threat Model** securing subscriptions against tenant privilege escalation and counter tampering.
4. **Proposed Firestore Security Rules** enforcing zero-write client access on subscription and usage documents.

---

## 2. Entitlement Threat Model

### 2.1 Trust Boundaries
- **Client (Browser):** Untrusted. Can inspect local storage, inspect bundle code, and spoof state. Client-side feature flags (`isFeatureEntitled`) are for UX gating (hiding buttons, displaying upgrade prompts) only.
- **Tenant OWNER:** Semi-trusted. Has administrative permissions within their own tenant workspace (`tenants/{tenantId}`), but MUST NOT have write permissions to their own subscription, plan limits, or usage meters.
- **Platform Admin:** Trusted for platform governance, but platform admin status does **not** automatically grant a paid subscription or bypass usage limits without explicit assignment.
- **Server (Cloud Functions / Admin SDK):** Fully trusted. Authoritative source of subscription state, payment webhook reconciliation, and transactional usage increments.

### 2.2 Security Invariants
1. **Zero Client Writes on Subscriptions:** Tenants cannot create, update, or delete `tenants/{tenantId}/subscription/{subId}`.
2. **Zero Client Writes on Daily Usage:** Tenants cannot manipulate or overwrite usage counters in `usage/daily/{tenantId}:{date}`.
3. **Fail-Closed on Unknowns:** Missing subscription, expired dates, unrecognized plans, or inactive/suspended tenants immediately resolve to `valid: false` with zero entitlements.
4. **Timezone Determinism:** Daily usage meters are normalized to tenant-configured local timezone (defaulting to `Europe/Athens` / `UTC+2/UTC+3`) rather than client device clock.

---

## 3. Authoritative Data Model

### 3.1 Tenant Subscription Model
Path: `tenants/{tenantId}/subscription/current` (or dedicated collection `subscriptions/{tenantId}`)

```typescript
interface TenantSubscription {
  tenantId: string;                     // Bound tenant ID
  planId: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' | 'PILOT_FREE';
  status: 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';
  billingCycle: 'MONTHLY' | 'ANNUAL';
  effectiveAtMs: number;               // Timestamp when access begins
  expiresAtMs: number | null;          // Timestamp when access expires (null if auto-renewing)
  cancelAtPeriodEnd: boolean;
  externalCustomerId?: string;         // e.g. Stripe Customer ID (server only)
  externalSubscriptionId?: string;     // e.g. Stripe Subscription ID (server only)
  limitOverrides?: {                   // Custom negotiated limits
    maxEmployees?: number;
    maxWorkspaces?: number;
    maxMonthlyPdfExports?: number;
    enableAdvancedSolver?: boolean;
    enableMultiWindow?: boolean;
    enableAuditLogs?: boolean;
  };
  version: number;                     // Optimistic concurrency counter
  updatedAt: string;                   // ISO 8601 server timestamp
  updatedBy: string;                   // 'system' | 'stripe-webhook' | platformAdminUid
}
```

### 3.2 Daily Usage Counter Model
Path: `usageDaily/{tenantId_YYYYMMDD}`

```typescript
interface DailyUsageRecord {
  id: string;                          // Format: `${tenantId}_${yyyy-mm-dd}`
  tenantId: string;
  date: string;                        // ISO date string: YYYY-MM-DD
  timezone: string;                    // e.g. "Europe/Athens"
  metrics: {
    scheduleGenerationRuns: number;    // Count of AI/solver generation runs
    pdfExportCount: number;            // Count of published PDF exports
    activeSmsNotifications?: number;   // Count of external notifications
  };
  idempotencyKeys: string[];           // Last N processed transaction keys to prevent duplicate increments
  updatedAt: string;                   // ISO 8601 timestamp
}
```

---

## 4. Idempotent Usage Accounting Design

To prevent contention, race conditions, and duplicate usage charges during schedule generation or exports:
1. Every usage event generates a deterministic client request UUID: `requestId`.
2. Cloud Functions execute a Firestore `runTransaction`:
   - Reads `usageDaily/{tenantId_date}`.
   - If `requestId` exists in `idempotencyKeys`, the write is a no-op (idempotent return).
   - If not present, increments the metric and appends `requestId` to `idempotencyKeys` (capped at 100 entries).
3. If the metric exceeds the daily or monthly entitlement limit, the Cloud Function rejects the operation before performing expensive backend work.

---

## 5. Proposed Firestore Security Rules Changes

```text
// Server-only subscription documents (readable by Tenant Admin, zero client writes)
match /tenants/{tenantId}/subscription/{subId} {
  allow read: if isTenantAdmin(tenantId);
  allow write: if false; // Only Cloud Functions / Admin SDK
}

// Server-only daily usage accounting (readable by Tenant Admin, zero client writes)
match /usageDaily/{usageId} {
  allow read: if isSignedIn() && (
    isPlatformAdmin() ||
    (resource.data.tenantId is string && isTenantAdmin(resource.data.tenantId))
  );
  allow write: if false; // Only Cloud Functions / Admin SDK
}
```

---

## 6. Implementation Status & Next Steps

- **Completed:** Pure entitlement resolver foundation (`functions/src/entitlements/entitlementResolver.js`) with 10 passing unit tests covering all edge cases.
- **Pending (Phase 7 Roadmapped):** Stripe Webhook endpoint, payment reconciliation Cloud Functions, and UI billing management screens.
