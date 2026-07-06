# Analytics And Usage Tracking

## Purpose

ShiftFlow needs usage analytics so the platform owner can understand which tenants are active, which features are used, and which customers may need support.

## Event Tracking

Track important product events such as:

```text
user_logged_in
tenant_created
employee_created
employee_updated
shift_created
shift_updated
schedule_generated
absence_created
report_exported
settings_updated
tenant_suspended
tenant_reactivated
tenant_soft_deleted
```

## Event Shape

Recommended event shape:

```ts
type UsageEvent = {
  id: string;
  tenantId?: string;
  actorUid?: string;
  eventType: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};
```

Event metadata must stay sanitized and should not contain credentials, reset links, private config, file contents, or sensitive personal fields.

## Daily Tenant Aggregates

Recommended aggregate:

```ts
type TenantUsageDaily = {
  tenantId: string;
  date: string;
  activeUsers: number;
  logins: number;
  employeesCreated: number;
  shiftsCreated: number;
  schedulesGenerated: number;
  exportsGenerated: number;
  aiRequests: number;
  storageUsedMb?: number;
};
```

## Admin Dashboard Metrics

Show:

- total tenants
- active tenants
- trial tenants
- suspended tenants
- new tenants today
- new tenants this month
- active users today
- logins today
- shifts created this month
- exports generated this month
- inactive tenants
- high-usage tenants

## Tenant Health Score

Simple initial score:

```text
0-30   low usage
31-70  moderate usage
71-100 active tenant
```

Inputs:

- recent login activity
- employees added
- shifts created
- schedules generated
- exports used
- days since last activity

## Privacy Rules

Analytics should help operate the platform without exposing unnecessary personal data.

Prefer counts, ids, dates, event names, and safe metadata instead of full operational documents.
