# ShiftOryx Current State

Status date: 04 September 2026

Evidence baseline: `8ee1985d2cec350b1cafa980e99f1dc46b32577a`

Audit branch: `antigravity/phase6-domain-cutover-preflight`

Phase verdict: `PHASE_5_AND_SCHEDULER_V2_CLOSED_VERIFIED_PHASE_6_PREFLIGHT_ACTIVE`

This file is the concise implementation snapshot of the active repository state. Documentation claims about live systems are strictly backed by verifiable code and configuration evidence.

## Phase Status Summary

| Phase | Title | Status |
| :--- | :--- | :--- |
| **Phase 0** | Documentation Alignment | `CLOSED_VERIFIED` |
| **Phase 1** | Current-State Audit | `CLOSED_VERIFIED` |
| **Phase 2A** | Read-Only Role Inventory & Migration Design | `CLOSED_VERIFIED` |
| **Phase 2B** | Controlled OWNER Migration | `CLOSED_VERIFIED` |
| **Phase 3** | Registration Token Backend | `CLOSED_VERIFIED` |
| **Phase 4** | Automated Tenant Provisioning | `CLOSED_VERIFIED` |
| **Phase 5** | Root Portal & Store Selector | `CLOSED_VERIFIED` |
| **Scheduler V2** | Tenant-Configurable Scheduler Contract V2 (PR #44) | `CLOSED_VERIFIED` |
| **Phase 6** | Wildcard ShiftOryx Domains & Cutover | `CURRENT_PREFLIGHT_ACTIVE` |
| **Phase 14** | HomeOps Read-Only Integration | `CANCELLED` |

## Current Product And Deployment Boundary

- Product name: ShiftOryx.
- Current documented pilot: `https://bp-kallis.homelabshare.gr/`.
- Target root and tenant domains: `https://shiftoryx.gr` and `https://{tenantSlug}.shiftoryx.gr`.
- Domain state: `PURCHASED_NOT_CONFIGURED`; ownership confirmed; preflight discovery complete; production cutover pending explicit human approval.
- Current deployment identifiers such as `GasStationProject`, `GasStation-main`, `gasstationproject` and `gasstation-bp-kallis` remain compatibility/operations identifiers.
- Repository evidence supports one shared React/Vite frontend and one Docker/Nginx service, not a codebase per tenant.

## Implemented Capabilities

- React 19/Vite 8 frontend builds successfully and is served as an Nginx SPA in the checked-in container configuration and Vercel Production.
- Firebase Auth login, logout, forgot-password and reset-password foundations exist.
- Tenant-scoped repository paths and matching membership authorization exist; hostname selects context but membership authorizes private access.
- Firestore and Storage rules default-deny unrecognized paths; private tenant data requires an active matching `OWNER` membership and rejects active platform admins (`!isActivePlatformAdmin()`).
- Sanitized public schedules, months, employees and announcements exist as dedicated anonymously readable collections.
- `employee_absences_private` is permanently fail-closed (`allow read, write: if false;`).
- A deterministic TypeScript scheduler engine implements rotations, fixed days off, absences/replacements, Sunday coverage, warnings, validation, 4 mandatory base slots (`CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B`), max 6 active autoscheduler employees, PDF completeness failsafes, and manual-override preservation.
- Tenant-configurable Scheduler Contract V2 (PR #44, approved head `c1844ca66bbcf5261e2433481facf036e7aeccdf`, squash merge commit `8ee1985d2cec350b1cafa980e99f1dc46b32577a`) is fully implemented, tested across 2,118 test assertions, merged to `main`, and deployed/verified on Vercel Production: tenant-configurable shift templates and operating windows, min/max headcount constraints, target headcount soft objective, min/target days off, explicit `shiftTemplateId`/`demandSlotId` traceability, manual-override preservation, unified zero-write validation-persistence gate (`validateAndPersistScheduleCandidate`), and strict backwards compatibility with legacy fixed 4-slot scheduling.
- Owner-only PDF/Excel/Word/WhatsApp exports and a feature-flagged private monthly PDF archive exist.
- A short-lived Firebase auth-ticket broker foundation exists on Node.js 22 (Gen 2) with hashed tickets, exact-origin checks, transactional one-time consumption and custom-token exchange for `OWNER` only.
- `platformAdmins/{uid}` is strictly decoupled from tenant ownership: active platform admins have 0 tenant memberships and cannot access tenant private data.
- Production data remediation complete: BP Kallis pilot OWNER established (`IlyYsuAS3mYZ5CK8lYtp5NhIJBU2`), zero overlap with platform admin, zero legacy `ADMIN`/`MANAGER` memberships.
- Phase 3 Registration Token Backend is fully implemented, verified, and deployed to production (`gasstationproject-9dd89`): high-entropy 256-bit tokens, opaque management IDs (`rtok_...`), secret SHA-256 lookup hash (`registrationTokenLookups`), zero plaintext token persistence, platform-admin-only management (`generateRegistrationToken`, `listRegistrationTokens`, `revokeRegistrationToken`), public rate-limited validation (`validateRegistrationToken`), atomic consumption primitive for tenant provisioning, fail-closed canonical expiry, and strict client deny-all Firestore rules (active ruleset: `51bf31c1-87a3-47f8-964a-aea3c7e41bf0`).
- Phase 4 Automated Tenant Provisioning Backend is fully implemented, verified, and deployed to production (`gasstationproject-9dd89`): `provisionTenantFromRegistrationToken` is active (Node.js 22 Gen2 callable in `us-central1`, total active production Cloud Functions: 8), with atomic single-transaction execution across `slugReservations`, `tenants`, `tenantMemberships` (`role: 'OWNER'`, zero PII email), `users/{uid}` mirror, scheduler settings, 7-day trial subscription (`trialEndsAt`), token consumption (`status: 'CONSUMED'`), and `platformAuditLogs`. Strict 3–40 char slug contract, platform admin / existing membership fail-closed checks, safe `OTHER` category fallback, `domain: null` pending Phase 6 cutover.
- Phase 5 Root Portal, Auth & Store Selector is fully implemented, verified, merged, and production-deployed: `/register` (5-step progressive registration flow, transient memory tokens, zero password/PII leaks, direct `createUserAccount`), `/stores` & `/select-tenant` (store directory, multi-store switcher, zero-membership onboarding), `/login` (identity routing with pure `determinePostLoginDestination`), open redirect prevention via `resolveAuthorizedReturnTo` membership verification, 8 Functions discovery within 658ms (< 3000ms threshold).

## Target Collection Snapshot

| Group | Implemented/partial | Missing |
| --- | --- | --- |
| Platform | `users`, `tenants`, `tenantMemberships`, `platformAdmins`, `authTickets`, `registrationTokens`, `registrationTokenLookups`, `slugReservations`, `platformAuditLogs`, `rateLimits` | `slugAliases`, `customizationRequests` |
| Tenant private | `employees`, `shifts`, `shiftTemplates`, `absences`, `settings`, `announcements`, `weekHistory`, `auditLogs`, `subscription/current` | `usage/daily` |
| Tenant public | `publicSchedules`, `publicMonths`, `publicEmployees`, `publicAnnouncements` | `publicStatusEntries` |

## Missing Target Capabilities (Future Phases)

- Phase 6: Wildcard ShiftOryx domain / Cloudflare / Firebase Authorized Domains production cutover (Preflight in progress).
- Phase 7: Server-side subscription/feature/planning-horizon enforcement and `usage/daily`.
- Phase 8: Multi-store lifecycle and paid additional store provisioning.
- Phase 9: ShiftOryx Admin lifecycle web console and versioned template catalog runtime.
- Phase 10: `publicStatusEntries`, explicit `publicNote`/`privateNote` separation and owner preview.
- Phase 11: Slug aliases and vanity store routing.
- Phase 12: Paid customization request/quote workflow.
- Phase 13: VPS production migration.
- Phase 14: CANCELLED (HomeOps integration).
- Phase 15: Commercial billing provider & Stripe integration.

## Next Approved Scope

Phase 5 and Scheduler Contract V2 (PR #44) are complete, merged, and verified on Vercel Production.
Phase 6 (Production Domain Cutover) is the active phase in **Preflight / Readiness Mode** (PR #42).
Phase 6A dual-domain compatibility implementation exists in PR #43 (Draft, unmerged, not production baseline).
No production DNS, Vercel domain, Firebase Authorized Domains, or Firestore mutations are authorized until explicit human approval.
