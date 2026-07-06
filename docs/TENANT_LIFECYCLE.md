# Tenant Lifecycle

## Purpose

Tenant lifecycle controls when a workspace can be used, blocked, restored, or archived.

Tenant lifecycle is stored on:

```text
tenants/{tenantId}.status
```

## Statuses

```text
TRIAL
ACTIVE
PAST_DUE
SUSPENDED
EXPIRED
DELETED
```

## Status Meaning

### TRIAL

Tenant has temporary access during onboarding.

### ACTIVE

Tenant has normal access.

### PAST_DUE

Payment or subscription problem exists, but access may continue during a grace period.

### SUSPENDED

Tenant exists but access is blocked.

### EXPIRED

Trial or subscription has expired.

### DELETED

Tenant is soft deleted. Data remains for restore/export until a later retention policy exists.

## Access Rules

Initial recommendation:

```text
TRIAL -> allow
ACTIVE -> allow
PAST_DUE -> allow with warning or limited grace period
SUSPENDED -> block
EXPIRED -> block or billing-only access
DELETED -> block
```

Tenant data should not render before tenant status and membership are verified.

## Soft Delete

Soft delete updates metadata:

```text
status = "DELETED"
deletedAt = timestamp
```

Do not immediately remove operational data.

## Restore

Restore should be explicit and audited.

Example:

```text
DELETED -> SUSPENDED or ACTIVE
```

Choose `SUSPENDED` when billing or ownership must be reviewed before access returns.

## Retention Policy

Full retention and final removal behavior is not MVP.

Before implementation, define:

- grace period
- final export
- confirmation flow
- audit log entry
- legal/data retention requirements
- rollback limitations

## Scheduled Checks

Future scheduled jobs should check:

- trials ending soon
- expired trials
- past due subscriptions
- inactive tenants
- unusual usage
- old soft-deleted tenants eligible for retention review

## Audit Events

Write audit logs for:

- tenant_created
- tenant_trial_started
- tenant_activated
- tenant_past_due
- tenant_suspended
- tenant_reactivated
- tenant_expired
- tenant_soft_deleted
- tenant_restored
