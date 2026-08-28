# ShiftOryx — Phase 7: Entitlements, Plans & Subscription Enforcement Architecture

**Status:** ARCHITECTURE_AND_SECURITY_DESIGN_READY  
**Version:** 1.0.0  
**Phase Target:** Phase 7 Server-Authoritative Subscription & Entitlements  

---

## 1. Current State vs. Target Threat Model

### 1.1 Current Phase 4 Baseline
In Phase 4 automated tenant provisioning, every new tenant is provisioned with a default trial record:
```json
{
  "plan": "TRIAL",
  "status": "TRIALING",
  "trialEndsAt": "Timestamp(+14 days)",
  "createdAt": "serverTimestamp()",
  "updatedAt": "serverTimestamp()"
}
```
**Current Protection:**
- Firestore Security Rules strictly forbid client `create`, `update`, or `delete` on `tenants/{tenantId}/subscription/{document}`.
- All writes are restricted to server-side Cloud Functions and Firebase Admin SDK.

### 1.2 Identified Risks & Threats
1. **Client-Side Gating Bypass:** Relying solely on client UI flags (e.g. `isFeatureEnabled()`) allows malicious actors to craft direct API/Callable requests or manipulate React state to access premium features (such as PDF archive downloads or extended history).
2. **Trial Tampering:** Without strict server timestamp comparison, a stale client clock could improperly claim active trial status.
3. **Resource Exhaustion:** Unchecked employee counts or unlimited historical schedule generation could exhaust backend resources.

---

## 2. Server-Authoritative Entitlement Architecture

### 2.1 Subscription Schema (`tenants/{tenantId}/subscription/current`)
```typescript
interface TenantSubscription {
  plan: 'TRIAL' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELED';
  trialEndsAt: Timestamp;
  currentPeriodStart: Timestamp;
  currentPeriodEnd: Timestamp;
  cancelAtPeriodEnd: boolean;
  maxEmployees: number; // e.g. TRIAL=10, STARTER=5, PROFESSIONAL=20, ENTERPRISE=100
  allowedFeatures: string[]; // e.g. ['SCHEDULER_AUTO', 'WHATSAPP_EXPORT', 'PDF_ARCHIVE']
  billingCustomerId?: string; // Bounded external provider reference
  updatedAt: Timestamp;
}
```

### 2.2 Entitlement Matrix & Tier Limits
| Tier | Status | Max Employees | Schedule History | Advanced Rotation | Exports Allowed |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TRIAL** | `TRIALING` (14 days) | 10 | 30 days | Yes | PDF, Excel, WhatsApp |
| **STARTER** | `ACTIVE` | 5 | 90 days | Basic | PDF, Excel |
| **PROFESSIONAL** | `ACTIVE` | 20 | 1 year | Yes | PDF, Excel, Word, WhatsApp |
| **ENTERPRISE** | `ACTIVE` | 100+ | Unlimited | Yes | All + Private Archive |

### 2.3 Server Enforcement Points
1. **Schedule Generation & Auto-Scheduling:**
   - Evaluates active employee count against `subscription.maxEmployees`. If employee count exceeds limit, rejects generation with `failed-precondition`.
2. **Private Monthly PDF Archive:**
   - Server-side callable/export verifies `subscription.allowedFeatures.includes('PDF_ARCHIVE')` before generating signed URLs.
3. **Suspended / Expired Tenant Gate:**
   - If `status === 'SUSPENDED'` or (`status === 'TRIALING'` and `trialEndsAt < now`), all mutation callables reject with `permission-denied` ("Η δοκιμαστική περίοδος έχει λήξει."). Public schedule viewing remains read-only.

---

## 3. Security Rules & Non-Negotiables

```text
1. match /tenants/{tenantId}/subscription/{document=**} {
     allow read: if isTenantOwner(tenantId) || isPlatformAdmin();
     allow write: if false; // Server-only Admin SDK writes
   }
2. Client never submits requested plan or extension parameters.
3. Plan upgrades and extensions execute exclusively via authorized Platform Admin callables or verified billing webhook functions.
```
