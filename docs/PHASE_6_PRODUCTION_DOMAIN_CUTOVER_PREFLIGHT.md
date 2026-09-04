# ShiftOryx Phase 6 — Production Domain Cutover Preflight & Execution Specification

**Status:** `PREFLIGHT_CORRECTED_DUAL_DOMAIN_COMPATIBILITY_REQUIRED`  
**Target Milestone:** Phase 6 — Wildcard ShiftOryx Domains & Pilot Cutover  
**Baseline Git Commit:** `8ee1985d2cec350b1cafa980e99f1dc46b32577a` (post-PR44 Scheduler Contract V2)  
**Production Firebase Project:** `gasstationproject-9dd89`  
**Production Vercel Project:** `gas-station-project` (`prj_P2YThL4OQctOIUkyX9h7OagA4B4t`)  
**Domain Ownership:** `shiftoryx.gr` (Purchased / Registered)  

---

## 1. Executive Summary & Corrected Goals

Phase 6 designs the production transition from the initial pilot deployment to the primary ShiftOryx multi-tenant domain architecture:

- **Current Root Portal:** Vercel-generated default URL (`gas-station-project.vercel.app`) / legacy `gas.homelabshare.gr`
- **Current Operational Pilot:** `https://bp-kallis.homelabshare.gr/` (Homelab Docker container `gasstation-bp-kallis`)
- **Target Root Portal:** `https://shiftoryx.gr` (Canonical Apex)
- **Target Canonical WWW Redirect:** `https://www.shiftoryx.gr` -> `https://shiftoryx.gr` (301 Permanent Redirect)
- **Target Multi-Tenant Wildcard:** `https://*.shiftoryx.gr` (Shared single frontend SPA on Vercel)
- **Target Pilot Tenant:** `https://bp-kallis.shiftoryx.gr/`

### Key Correction & Dual-Run Reality
Initial preflight assumed configuration-only cutover without code modifications. Deep source audit proves that **current Auth Broker and Frontend Host Context code only support a single singular base domain**. True dual-run coexistence between `*.homelabshare.gr` and `*.shiftoryx.gr` requires **Phase 6A Domain-Family Compatibility code changes** before production cutover can occur.

---

## 2. Infrastructure Discovery & Authoritative Vendor Models

### 2.1 Public DNS & Authoritative Vercel Nameservers
- **Current State:** `shiftoryx.gr` is registered in the `.gr` registry (EETT / FORTH-ICS) and sits on registrar default parking nameservers. Zero DNS records are configured.
- **Authoritative DNS Model for Wildcards:**
  - Official Vercel documentation indicates that apex wildcard routing (`*.shiftoryx.gr`) with automated TLS certificate management is best supported when the domain's **Authoritative Nameservers are delegated directly to Vercel**:
    - `ns1.vercel-dns.com`
    - `ns2.vercel-dns.com`
  - This eliminates third-party DNS proxy complexities and enables automated DNS-01 ACME challenge validation for wildcards.
  - Wildcard TLS certificate issuance and renewal are managed by Vercel after required DNS ownership validation. Specific certificate authority / issuer (e.g. Let's Encrypt, Google Trust Services, or other provider) is **not guaranteed** as a fixed invariant and is marked: `REQUIRES_EXECUTION_TIME_VALIDATION`.
  - Cloudflare is **not required** for the ShiftOryx Vercel production frontend.
- **No Hardcoded DNS Values:**
  - Generic IP addresses (e.g. `76.76.21.21`) or CNAMEs (`cname.vercel-dns.com`) are vendor examples only (`EXAMPLE_ONLY`).
  - During live cutover execution, exact DNS records must be obtained directly from active Vercel domain inspection: `REQUIRES_EXECUTION_TIME_VALIDATION`.
- **CAA Directives:**
  - The domain `shiftoryx.gr` currently has 0 CAA records. Absence of CAA permits standard issuance. `CAA_CHANGE_REQUIRED=NO`.

### 2.2 Firebase Authentication Reality
- **Client Auth Domain:** `gasstationproject-9dd89.firebaseapp.com`
- **Authorized Domains API Boundaries:**
  - `signInWithEmailAndPassword`: Direct REST call to Identity Toolkit. Does **not** enforce Authorized Domains.
  - `createUserWithEmailAndPassword`: Direct REST call to Identity Toolkit. Does **not** enforce Authorized Domains.
  - `signInWithCustomToken`: Direct REST call to Identity Toolkit. Does **not** enforce Authorized Domains.
  - `OAuth Popups / Redirects` & `Email Action Links` (Password Reset / Verification `continueUrl` / ActionCodeSettings): **Strictly enforce Authorized Domains**.
- **Scope Clarification & Email Domain Distinction:**
  - Adding `shiftoryx.gr` and `www.shiftoryx.gr` to Firebase Authorized Domains authorizes redirect/continue URLs in browser flows.
  - **Crucial Boundary**: Authorized Domains does **not** automatically configure custom sender email domains or branded action handler URLs. Custom authentication email sender domains (`noreply@shiftoryx.gr`) and custom email action link domains require separate Firebase project email template configuration, DNS SPF/DKIM verification, and/or Firebase Hosting custom-domain action handler routing: `REQUIRES_EXECUTION_TIME_VALIDATION`.
- **Tenant Subdomain Authorization:**
  - In ShiftOryx, tenant logins use Auth Broker custom tokens (`signInWithCustomToken`). Tenant subdomains do not require manual per-tenant Firebase Authorized Domains entries.
  - Wildcard domain inheritance in Firebase Authorized Domains is marked: `REQUIRES_CONTROLLED_PRODUCTION_VALIDATION`.

### 2.3 Auth Broker Dual-Run Limitation (Code Evidence)
- `functions/src/authBrokerCore.js` uses a singular `baseDomain` parameter (default: `'homelabshare.gr'`).
- Audit proof: When `baseDomain='shiftoryx.gr'`, `resolveTenantIdFromHostname('bp-kallis.homelabshare.gr')` returns `""`, and `validateBrokerReturnTo` rejects with `reason: 'unknown-tenant-host'`.
- Conversely, when `baseDomain='homelabshare.gr'`, `bp-kallis.shiftoryx.gr` is rejected.
- **Verdict:** True dual-run compatibility requires bounded domain-family resolution in Cloud Functions (`functions/src/authBrokerCore.js`).

### 2.4 Tenant Metadata Overlap Invariant (`tenant.domain`)
- In `functions/src/index.js`, `getTenantOriginFromTenant` prefers `tenant.domain` over derived `slug + baseDomain`.
- If `tenants/bp-kallis.domain` is mutated to `"bp-kallis.shiftoryx.gr"`, any legacy broker request to `bp-kallis.homelabshare.gr` fails exact-origin comparison (`tenant-origin-mismatch`).
- **Invariant:** `tenants/bp-kallis.domain` MUST remain `null` during the 7–14 day burn-in period so origins derive dynamically from the caller's active domain family.

### 2.5 Frontend Deployment Topology & Host Context
- Legacy pilot (`bp-kallis.homelabshare.gr`) runs as a dedicated Docker container on homelab (port 8085) with `VITE_PUBLIC_APP_BASE_DOMAIN=homelabshare.gr`.
- New production frontend on Vercel serves `shiftoryx.gr` and `*.shiftoryx.gr`.
- In order for the shared frontend codebase to safely handle both domain families and prevent unexpected routing failures, `src/utils/tenantHostContext.js` and `src/services/tenantAccessService.js` must be updated with domain-family awareness and reserved subdomain protection.

---

## 3. Minimal Deployment Blast Radius

When Phase 6 is authorized for execution:
- **Cloud Functions Deploy Target:** ONLY the 2 Auth Broker functions (`createAuthTicket`, `exchangeAuthTicket`) and scheduled `cleanupAuthTickets` require redeployment with domain-family environment variables.
- **Unrelated Functions:** `generateRegistrationToken`, `listRegistrationTokens`, `revokeRegistrationToken`, `validateRegistrationToken`, and `provisionTenantFromRegistrationToken` do not use broker domain config and should **not** be redeployed.
- **Minimal Deploy Set:** `createAuthTicket, exchangeAuthTicket`.

---

## 4. Rollback Architecture & Abort Strategy

### 4.1 Fast Application-Level Rollback (Zero DNS Lag)
- The legacy pilot `bp-kallis.homelabshare.gr` on homelab is completely independent of Vercel and the new domain's DNS.
- If issues occur on `shiftoryx.gr` during cutover:
  1. Revert Vercel environment variables or disable custom domains in Vercel.
  2. Restore Cloud Functions broker environment if needed.
  3. Legacy pilot on `bp-kallis.homelabshare.gr` remains 100% untouched and operational.
- **Slow Nameserver Reversal is NOT the Primary Rollback:** Do not revert registrar nameservers unless a catastrophic registrar failure occurs. The new domain is purely additive.

### 4.2 Objective Abort Triggers
1. DNS resolution failure for $> 5$ minutes on `shiftoryx.gr`.
2. TLS certificate generation failure on `*.shiftoryx.gr`.
3. Auth broker ticket creation/exchange failure rate $> 0\%$.
4. Active Owner `IlyYsuAS3mYZ5CK8lYtp5NhIJBU2` denied access to `tenants/bp-kallis`.
5. Scheduler data corruption or runtime crashes.
6. Legacy pilot (`bp-kallis.homelabshare.gr`) degradation.

---

## 5. Corrected Phase 6 Execution Blueprint

```
[Phase 6A: Dual-Domain Compatibility PR] ──► Merged to main
                                                    │
[Stage 1: Registrar NS Delegation] ────────► Set NS to ns1.vercel-dns.com, ns2.vercel-dns.com
                                                    │
[Stage 2: Vercel Domain Attach & Cert] ────► Add shiftoryx.gr, www, *.shiftoryx.gr; verify TLS
                                                    │
[Stage 3: Firebase Authorized Domains] ────► Add shiftoryx.gr, www.shiftoryx.gr
                                                    │
[Stage 4: Target Deploy Broker Functions] ─► Deploy createAuthTicket, exchangeAuthTicket with domain families
                                                    │
[Stage 5: Dual-Run Verification] ──────────► Validate shiftoryx.gr, bp-kallis.shiftoryx.gr & homelab
                                                    │
[Stage 6: 7-14 Day Burn-In] ───────────────► tenant.domain = null; both domain families active
```

---

## 6. Preflight Readiness Verdict & Next Action

- **PR #42 Preflight Status:** `CORRECTED_AND_VERIFIED`
- **Production Cutover Readiness:** `NO` (Awaiting Phase 6A compatibility implementation and separate human approval)
- **Next Action:** Implement Phase 6A Dual-Domain Compatibility in a separate branch/Draft PR (`antigravity/phase6-dual-domain-compatibility`).

**FINAL PREFLIGHT VERDICT:**  
`FINAL_VERDICT = SHIFTORYX_PHASE6_PREFLIGHT_CORRECTED_READY_FOR_DUAL_DOMAIN_IMPLEMENTATION`
