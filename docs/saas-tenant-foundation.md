# ShiftOryx SaaS Tenant Foundation

This document separates the current tenant-aware pilot from the approved ShiftOryx SaaS target. It does not authorize runtime, Firebase, DNS or deployment changes.

## Current And Target Domains

| Purpose | Current/legacy | Approved target |
| --- | --- | --- |
| BP Kallis pilot | `bp-kallis.homelabshare.gr` | `bp-kallis.shiftoryx.gr` |
| Central portal foundation | `gas.homelabshare.gr` | `shiftoryx.gr` |
| Tenant pattern | `{tenant}.homelabshare.gr` | `{tenantSlug}.shiftoryx.gr` |

The current pilot remains active until wildcard routing, Firebase authorized domains, auth handoff, monitoring and rollback are verified. The target uses one shared frontend and one wildcard domain; do not create one deployment/container/codebase per tenant.

## Tenant Resolution And Authorization

Hostname resolution produces tenant context only. It never grants access.

Private access requires:

1. authenticated Firebase user,
2. matching `tenantMemberships/{uid}_{tenantId}` document,
3. `ACTIVE` status,
4. valid role.

Target MVP creates only `OWNER`. Existing `ADMIN` and `MANAGER` values are compatibility roles until Phase 2 inventory and migration. Unknown roles deny access. Email allowlists and custom claims do not grant tenant access.

Platform administration is separate through `platformAdmins/{uid}`. A ShiftOryx Admin does not automatically receive tenant operational access.

Employees/public viewers have no account or membership in the MVP. They use anonymous sanitized tenant data.

## Current Tenant Data

Private operational data is tenant-scoped:

```text
tenants/{tenantId}/employees
tenants/{tenantId}/shifts
tenants/{tenantId}/shiftTemplates
tenants/{tenantId}/absences
tenants/{tenantId}/settings
tenants/{tenantId}/announcements
tenants/{tenantId}/weekHistory
tenants/{tenantId}/weekLocks
tenants/{tenantId}/weekTemplates
tenants/{tenantId}/auditLogs
```

Legacy root scheduler collections are locked and must not be runtime fallbacks.

Current public collections:

```text
tenants/{tenantId}/publicSchedules/{weekStart}
tenants/{tenantId}/publicMonths/{YYYY-MM}
tenants/{tenantId}/publicEmployees/{employeeId}
tenants/{tenantId}/publicAnnouncements/{announcementId}
```

The current public runtime exposes work schedule and display-safe data only. It does not use a root `published_schedules` fallback.

Phase 10 may add sanitized status labels and `publicNote` after explicit field separation, owner preview, rules review and leakage tests. Absence reasons, medical data, generic/private notes, attachments, contact fields, UIDs, memberships, audit data and archive metadata stay private.

## Multi-Store Target

An OWNER may hold multiple ACTIVE OWNER memberships. The root portal should show a store selector with business name, domain, plan, trial/subscription state, employee count and last activity. Entering a tenant requires a short-lived auth broker/server-side bridge; hostname alone is not authorization.

## Registration Token Target

Future registration uses one-time tokens formatted `XXX-XXX-XXX` for display. Requirements:

- cryptographically secure generation and no ambiguous characters,
- store token hash only,
- show full token once,
- statuses `ACTIVE`, `USED`, `EXPIRED`, `REVOKED`,
- atomic single-use consumption, expiry and revocation,
- rate limiting and generic errors,
- no raw token logging.

Successful registration will create the user, business/tenant, unique slug reservation, OWNER membership and safe defaults in trusted server-side operations.

## Trial And Entitlements Target

Proposed trial: 7 days, one store, up to 10 employees, one-week planning horizon, basic features and one PDF. Proposed paid horizons are two, six and twelve months for monthly, quarterly and semiannual plans.

All limits require server-side checks for tenant status, subscription state, ownership, planning horizon and feature entitlement. Pricing requires accounting/tax approval before publication. A proposed seven-day grace period is read-only; data-retention/deletion needs an explicit policy and audited job.

## Slugs And Aliases

Target slugs are lowercase `a-z`, `0-9` and hyphen, 3-40 characters, checked against reserved names and claimed atomically. Unknown hosts render a safe page. Rename is a future audited operation with a temporary alias/redirect window and loop-safe `returnTo` validation.

## Customization Requests

Future OWNER requests use a structured authenticated form. Any attachments require size/MIME checks, private Storage and safe processing. No custom JS/HTML, external scripts or unsafe embeds.

## Hosting Direction

The homelab is the pilot/development environment. Paid public beta requires a controlled EU VPS migration after current-state audit, `shiftoryx.gr` setup, backup restore testing, staging smoke, monitoring and rollback. Suggested minimum: 4 vCPU, 8 GB RAM, 80-160 GB NVMe, Ubuntu 24.04, snapshots and hardened Docker deployment.

Current product recommendation: evaluate OVH VPS-2 first and Contabo as a budget alternative. Price, VAT, EU datacenter availability and provider terms are time-sensitive and must be verified immediately before any purchase.

Do not buy or migrate infrastructure during documentation alignment.

## HomeOps Boundary

Future Phase 14 integration is read-only and aggregate-only: uptime, HTTP/service health, host/container health, backup/version status, Cloudflare/Firebase health and tenant counts. It must never expose credentials, tokens, auth tickets, private employee data, absence reasons, private notes or raw tenant records.

## Safe Phase Boundaries

- Phase 0: documentation only.
- Phase 1: evidence-backed current-state audit.
- Phase 2: role normalization.
- Later phases implement tokens, provisioning, portal, wildcard domains, entitlements, multi-store, admin lifecycle, public statuses, aliases, customization, VPS, HomeOps and billing in that order.

Each phase stops for approval. No production change occurs without explicit authorization, exact validation and rollback.
