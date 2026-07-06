# Tenant Authorization Model

## Purpose

This document defines how ShiftFlow authorizes tenant access.

Hostname resolution only selects tenant context. It never grants access.

## Required Inputs

Tenant access requires:

```text
Firebase Auth uid
resolved tenantId
active tenantMemberships/{uid}_{tenantId}
allowed role
active tenant status
```

## Membership Path

```text
tenantMemberships/{uid}_{tenantId}
```

Required active membership example:

```json
{
  "uid": "firebase-auth-uid",
  "tenantId": "bp-kallis",
  "role": "OWNER",
  "status": "ACTIVE"
}
```

## Tenant Roles

Initial roles:

```text
OWNER
ADMIN
MANAGER
EMPLOYEE
VIEWER
```

MVP admin scheduling access can remain limited to:

```text
OWNER
ADMIN
MANAGER
```

## Platform Admin Separation

Platform admin access comes from:

```text
platformAdmins/{uid}
```

A platform admin is not automatically a tenant admin for operational data unless a specific support flow grants or verifies that access.

## Deny Cases

Deny access when:

- user is not signed in
- tenant does not exist
- tenant status is blocked
- membership does not exist
- membership is not active
- role is not allowed for the requested action

## Safe Messages

No tenant access:

```text
Δεν έχετε πρόσβαση σε αυτό το workspace.
```

No active workspace:

```text
Δεν υπάρχει ενεργό workspace συνδεδεμένο με αυτόν τον λογαριασμό.
```

Unknown workspace:

```text
Το workspace δεν βρέθηκε.
```

## Query Rule

Every tenant-owned read/write must be scoped by tenant id.

Wrong:

```js
getAllShifts()
```

Correct:

```js
getShiftsByTenant(tenantId)
```

## Public Views

Public/read-only views must use sanitized tenant collections, never raw admin collections.

## Audit

Important authorization-sensitive actions should write audit logs:

- membership created
- membership revoked
- role changed
- tenant suspended
- tenant restored
- platform admin action
- support impersonation when implemented
