# ShiftOryx Phase 6 — Production Rollout Reconciliation & Execution Report

**Document Version:** 1.0.0  
**Date:** 2026-09-05  
**Baseline Git Baseline:** `14aac4bd9508487f22b314b21611b56a3a52f3f8`  
**Production Main SHA:** `25be00cec0ecf715ddd97cf162868a299f100472` (via PR #45 merge)  
**Firebase Project:** `gasstationproject-9dd89`  
**Production Vercel Project:** `gas-station-project` (`prj_P2YThL4OQctOIUkyX9h7OagA4B4t`)  

---

## 1. Executive Summary

Phase 6 executed the dual-domain production cutover for the ShiftOryx SaaS platform, transitioning the primary customer-facing entry point to `https://shiftoryx.gr` and multi-tenant workspaces to `https://*.shiftoryx.gr`, while preserving full backward-compatible operational health on the legacy `homelabshare.gr` domain family.

All core infrastructure gates, DNS delegations, Cloud Functions, and security invariants have been reconciled and verified.

---

## 2. Infrastructure & Rollout History

### 2.1 Public DNS & Nameserver Delegation
- **Registrar:** Papaki (`.gr` registry).
- **Authoritative Nameservers:** Delegated directly to Vercel:
  - `ns1.vercel-dns.com`
  - `ns2.vercel-dns.com`
- **DNS Records & Routing:**
  - `shiftoryx.gr` -> Vercel Production (`216.198.79.1` / `64.29.17.1`)
  - `www.shiftoryx.gr` -> 308 Permanent Redirect to `https://shiftoryx.gr/`
  - `*.shiftoryx.gr` -> Multi-tenant wildcard routing to Vercel Production
- **Mail Records Preservation:** Existing MX, SPF, DKIM, and DMARC records were audited and preserved.
- **DNSSEC State:** Registrar DNSSEC signed status validated.

### 2.2 Firebase Authentication Configuration
- In Firebase Project `gasstationproject-9dd89`, the Authorized Domains list was inspected and updated to include:
  - `shiftoryx.gr`
  - `www.shiftoryx.gr`
  All existing authorized domains (`localhost`, `gasstationproject-9dd89.firebaseapp.com`, `gas.homelabshare.gr`, `bp-kallis.homelabshare.gr`) were strictly preserved.
- Wildcard subdomains (`*.shiftoryx.gr`) are not needed in Authorized Domains because tenant authentication uses custom tokens (`signInWithCustomToken`) via the Auth Broker.

### 2.3 Cloud Functions Deployment
The two Auth Broker functions were deployed with dual-domain-family awareness:
- `createAuthTicket`: Restricts CORS to `shiftoryx.gr`, `www.shiftoryx.gr`, and `gas.homelabshare.gr`. Rejects anonymous callers, lookalike domains, and cross-family redirects.
- `exchangeAuthTicket`: Verifies tenant caller origin against primary (`shiftoryx.gr`) and legacy (`homelabshare.gr`) families. Consumes one-time auth tickets within a 60-second TTL transaction and returns custom auth tokens.

---

## 3. The Gate G Discovery & Controlled Remediation

### 3.1 Defect Discovery
During Phase 6 preflight auditing, a critical data invariant violation was discovered in Firestore document `tenants/bp-kallis`:
- **Document state:** `tenants/bp-kallis.domain = "bp-kallis.homelabshare.gr"`
- **Approved burn-in requirement:** `tenants/bp-kallis.domain == null`

### 3.2 Root Cause Analysis
In `functions/src/authBrokerCore.js`, `resolveValidatedTenantOrigin` evaluates tenant origins as follows:
```javascript
const rawDomain = toCleanString(tenant.domain).toLowerCase();
if (rawDomain) {
  const domainInfo = resolveDomainFamilyForHostname({
    hostname: rawDomain,
    domainFamilies: [targetFamily],
  });
  if (!domainInfo || domainInfo.family.id !== targetFamily.id) {
    return null; // FAILS CLOSED
  }
  return `https://${rawDomain}`;
}
return `https://${effectiveSlug}.${targetFamily.baseDomain}`;
```
Because `bp-kallis.homelabshare.gr` belongs to the `legacy` family, when a user logged in on `https://shiftoryx.gr` (`primary` family), the function found an explicit domain belonging to the wrong family and returned `null`. This broke the primary Auth Broker flow for the pilot tenant.

### 3.3 Controlled Remediation
On 2026-09-04 at 22:19:14 UTC, a concurrency-guarded write was executed using Firestore updateTime preconditions:
- **Field updated:** `tenants/bp-kallis.domain` updated from `"bp-kallis.homelabshare.gr"` to `null`.
- **Precondition:** `updateTime == 2026-08-30T17:15:23.702758Z`.
- **Readback status:** `domain: { nullValue: null }`, `status: "ACTIVE"`, `slug: "bp-kallis"`.
- **Result:** Immediate compatibility with both `https://bp-kallis.shiftoryx.gr` and `https://bp-kallis.homelabshare.gr`.

---

## 4. Central Portal Hardening & Tenant Isolation (PR #45)

### 4.1 Problem
Previously, `src/App.jsx` rendered the 3D WebGL Hyperspeed animation globally and defaulted unknown paths to `MainDashboard`. This caused `https://shiftoryx.gr` to render BP Kallis tenant dashboards and subscribe to Firestore tenant data.

### 4.2 Architectural Solution
1. **Component Isolation:**
   - Central host (`shiftoryx.gr`, `gas.homelabshare.gr`) renders `CentralPortal` (light theme, neutral branding, zero Hyperspeed canvas, zero tenant data subscriptions).
   - Tenant hosts (`*.shiftoryx.gr`, `*.homelabshare.gr`) render `TenantApp` (dark theme, Hyperspeed background, `TenantGate`, scheduling workspace).
   - Reserved/unknown hosts fail closed with `InvalidHostNotice`.
2. **Platform Branding:**
   - Updated headline: *"Plan shifts, manage teams and operate every workplace from one platform."*
   - Updated branding: *"Powered by ShiftOryx"*.
   - Preserved operational support: `support@homelabshare.gr`.
3. **PR #45 Merge:**
   - Merged into `main` at commit `25be00cec0ecf715ddd97cf162868a299f100472`.
   - Production deployment verified live via Playwright and HTTPS probes.

---

## 5. Current Production Feature Flags & Verification

| Setting | Production Value | Verification Status |
| :--- | :--- | :--- |
| `VITE_ENABLE_AUTH_BROKER` | `false` | VERIFIED |
| `VITE_ENABLE_TENANT_GATE` | `false` | VERIFIED |
| `tenants/bp-kallis.domain` | `null` | VERIFIED (`nullValue: null`) |
| `https://shiftoryx.gr` | HTTP 200 | VERIFIED (Central Portal, Light theme, no canvas) |
| `https://www.shiftoryx.gr` | HTTP 308 | VERIFIED (Redirects to https://shiftoryx.gr/) |
| `https://bp-kallis.shiftoryx.gr` | HTTP 200 | VERIFIED (Tenant workspace active) |
| `https://bp-kallis.homelabshare.gr`| HTTP 200 | VERIFIED (Legacy rollback healthy) |

---

## 6. Next Steps for Tomorrow (Human OWNER E2E)

1. Perform staged activation in Vercel Production Environment Variables:
   `VITE_ENABLE_AUTH_BROKER=true`
2. Run manual human OWNER login at `https://shiftoryx.gr/login`.
3. Confirm ticket generation, redirect to `https://bp-kallis.shiftoryx.gr/#authTicket=...`, token exchange, and fragment cleanup.
4. Set `VITE_ENABLE_TENANT_GATE=true` once verified.
