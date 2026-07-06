# Firebase Schema (Firestore)

This document describes the target Firestore model for the ShiftFlow SaaS migration.

The old single-tenant root collections such as `employees` and `shifts` may still exist for legacy BP Kallis data during migration, but new SaaS work should treat tenant-scoped paths as the target model.

## Core Collections

```text
users/{uid}
tenants/{tenantId}
tenantMemberships/{uid}_{tenantId}
platformAdmins/{uid}
```

## Tenant Document

Path:

```text
tenants/{tenantId}
```

Recommended fields:

- `id` (string): stable tenant id, usually same as slug for early Firebase phase.
- `name` (string): business display name.
- `slug` (string): workspace slug, e.g. `bp-kallis`.
- `domain` (string): full tenant domain, e.g. `bp-kallis.shiftflow.gr`.
- `status` (string): `TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `EXPIRED`, `DELETED`.
- `plan` (string): `STARTER`, `PRO`, `BUSINESS`, or `MANUAL`.
- `ownerUid` (string): Firebase Auth uid of the initial owner.
- `createdAt` (timestamp): creation time.
- `updatedAt` (timestamp): last metadata update.
- `trialEndsAt` (timestamp, optional): trial expiry.
- `subscriptionEndsAt` (timestamp, optional): subscription expiry.
- `deletedAt` (timestamp, optional): soft-delete timestamp.

## Tenant Membership

Path:

```text
tenantMemberships/{uid}_{tenantId}
```

Recommended fields:

- `uid` (string): Firebase Auth uid.
- `tenantId` (string): tenant id.
- `email` (string, optional): safe metadata only; never authorization source.
- `role` (string): `OWNER`, `ADMIN`, `MANAGER`, `EMPLOYEE`, or `VIEWER`.
- `status` (string): `ACTIVE`, `INVITED`, `INACTIVE`, `SUSPENDED`, `EXPIRED`, or `REVOKED`.
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

Authorization must use `uid + tenantId + active membership`, not hostname or email alone.

## Platform Admin

Path:

```text
platformAdmins/{uid}
```

Recommended fields:

- `uid` (string)
- `role` (string): `SUPER_ADMIN`, `SUPPORT_ADMIN`, or `BILLING_ADMIN`.
- `status` (string): `ACTIVE` or `SUSPENDED`.
- `createdAt` (timestamp)
- `updatedAt` (timestamp)
- `createdBy` (string)

A platform admin can manage platform metadata, but should not automatically bypass tenant operational data boundaries unless explicitly implemented and audited.

## Tenant-Scoped Operational Data

Target paths:

```text
tenants/{tenantId}/employees/{employeeId}
tenants/{tenantId}/shifts/{shiftId}
tenants/{tenantId}/settings/main
tenants/{tenantId}/auditLogs/{auditLogId}
tenants/{tenantId}/tokenRequests/{requestId}
tenants/{tenantId}/subscription/current
tenants/{tenantId}/publicSchedules/{weekStart}
tenants/{tenantId}/publicMonths/{yyyyMm}
tenants/{tenantId}/publicEmployees/{employeeId}
tenants/{tenantId}/publicAnnouncements/{announcementId}
```

## Employees

Path:

```text
tenants/{tenantId}/employees/{employeeId}
```

Recommended fields:

- `fullName` (string): employee display name.
- `role` (string): operational role label.
- `scheduleRole` / `roleType` (string): scheduler role source of truth.
- `color` (string): visual color.
- `afm` (string, optional): sensitive field; admin-only.
- `phone` (string, optional): sensitive field; admin-only.
- `email` (string, optional): sensitive field; admin-only.
- `hireDate` (string, optional): employment date.
- `isActive` (boolean)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

Public employee mirrors must not expose phone, email, AFM, notes, membership ids, or audit metadata.

## Shifts

Path:

```text
tenants/{tenantId}/shifts/{shiftId}
```

Recommended fields:

- `employeeId` (string): reference to tenant employee id.
- `date` (string): ISO date `YYYY-MM-DD`.
- `startTime` (string): `HH:mm`.
- `endTime` (string): `HH:mm`.
- `label` (string): display label.
- `shiftType` (string): scheduler/business type.
- `duration` (number, optional)
- `isManualOverride` (boolean, optional)
- `generationRunId` (string, optional): ties generated shifts to generation audit event.
- `notes` (string, optional): admin-only unless explicitly sanitized.
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

## Audit Logs

Path:

```text
tenants/{tenantId}/auditLogs/{auditLogId}
```

Recommended fields:

- `actorUid` (string)
- `actorType` (string): `TENANT_USER`, `PLATFORM_ADMIN`, or `SYSTEM`.
- `action` (string)
- `targetType` (string)
- `targetId` (string)
- `metadata` (object): sanitized metadata only.
- `createdAt` (timestamp)

Never store passwords, tokens, reset URLs, `oobCode`, service account values, signed URLs, `.env` values, private keys, or full file contents in audit logs.

## Suggested Indexes

Initial likely indexes:

- `tenantMemberships`: `uid`, `status`
- `tenantMemberships`: `tenantId`, `status`
- `tenants`: `slug`, `status`
- `tenants/{tenantId}/shifts`: `date`
- `tenants/{tenantId}/shifts`: `employeeId`, `date`
- `tenants/{tenantId}/auditLogs`: `createdAt`

## Migration Rule

Do not bulk-migrate legacy BP Kallis root data until the tenant resolver, tenant gate, Firestore rules, seed data, and rollback path are documented and tested.
