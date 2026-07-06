# Multi-Tenancy Architecture

## Purpose

This document defines the target ShiftFlow multi-tenant architecture.

ShiftFlow must be one shared SaaS application where each customer has an isolated workspace.

## Core Model

```text
shiftflow.gr                  -> public portal
shiftflow.gr/admin            -> platform admin
{tenantSlug}.shiftflow.gr     -> tenant workspace
```

## Tenant Resolution

The app resolves tenant context from the request hostname.

Example:

```text
bp-kallis.shiftflow.gr -> slug `bp-kallis` -> tenants/bp-kallis
```

Resolution only identifies context. It does not grant access.

## Authorization

Tenant authorization requires:

```text
Firebase Auth uid
+ active tenantMemberships/{uid}_{tenantId}
+ allowed tenant role
+ active tenant status
```

Platform admin authorization requires:

```text
platformAdmins/{uid}.status == ACTIVE
```

Platform admin and tenant admin are separate concepts.

## Target Firestore Paths

```text
users/{uid}
tenants/{tenantId}
tenantMemberships/{uid}_{tenantId}
platformAdmins/{uid}
tenants/{tenantId}/employees
tenants/{tenantId}/shifts
tenants/{tenantId}/settings
tenants/{tenantId}/auditLogs
tenants/{tenantId}/subscription
tenants/{tenantId}/tokenRequests
```

## Tenant Lifecycle

Tenant status should control access:

```text
TRIAL -> ACTIVE -> PAST_DUE -> SUSPENDED -> DELETED
```

`DELETED` should be soft delete first. Permanent delete requires explicit backup/export and approval.

## Data Isolation Rule

Every tenant-owned query must include tenant context.

Wrong:

```js
getAllEmployees()
```

Correct:

```js
getEmployeesByTenant(tenantId)
```

Wrong:

```text
employees/{employeeId}
```

Target:

```text
tenants/{tenantId}/employees/{employeeId}
```

## Public Data Rule

Public/read-only users must never read admin/private collections directly.

Use sanitized mirrors:

```text
tenants/{tenantId}/publicSchedules/{weekStart}
tenants/{tenantId}/publicMonths/{YYYY-MM}
tenants/{tenantId}/publicEmployees/{employeeId}
tenants/{tenantId}/publicAnnouncements/{announcementId}
```

Public mirrors must not include:

- phone
- email
- AFM
- internal notes
- absence details
- membership ids
- audit metadata
- Storage paths
- signed URLs
- reset links
- private archive metadata

## Tenant Gate

Tenant UI should render only after:

1. hostname resolved
2. tenant loaded
3. tenant status checked
4. user auth checked
5. membership verified

No tenant data should render during the loading/verification gap.

## Platform Admin

`shiftflow.gr/admin` should support:

- tenant list
- tenant details
- domain/slug management
- suspend/reactivate
- soft delete/restore
- usage analytics
- billing overview foundation
- audit log review
- system health

Platform admin support actions such as impersonation must be audited.

## Auth Across Subdomains

Firebase client auth persistence is origin-scoped.

A login on:

```text
shiftflow.gr
```

will not automatically create a Firebase client session on:

```text
bp-kallis.shiftflow.gr
```

Do not pass Firebase ID tokens or refresh tokens in query strings.

Use the auth broker/session handoff design before enforcing central-only login across tenant subdomains.

## Migration Strategy

Do not rewrite everything at once.

Safe order:

1. document current state
2. define tenant model
3. introduce tenant resolver
4. add tenant gate behind feature flag
5. prepare tenant-scoped repositories
6. migrate BP Kallis data with rollback
7. enable wildcard tenant domains
8. build automated registration/provisioning
9. expand platform admin panel
10. add analytics and billing foundation
