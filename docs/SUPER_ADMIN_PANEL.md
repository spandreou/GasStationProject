# Super Admin Panel

## Purpose

The ShiftFlow super admin panel is the platform owner interface.

Target route:

```text
https://shiftflow.gr/admin
```

This panel is for platform-level management, not normal tenant scheduling work.

## Access Model

Platform admin access must be granted through:

```text
platformAdmins/{uid}
```

Required fields:

```json
{
  "uid": "firebase-auth-uid",
  "role": "SUPER_ADMIN",
  "status": "ACTIVE"
}
```

Tenant roles such as `OWNER`, `ADMIN`, or `MANAGER` do not automatically grant platform admin access.

## Main Sections

### Dashboard

Show:

- total tenants
- active tenants
- trial tenants
- suspended tenants
- new tenants today
- new tenants this month
- active users today
- total logins
- basic MRR/plan overview when billing metadata exists
- alerts

### Tenants

Tenant table fields:

- business name
- slug
- domain
- owner email
- status
- plan
- created date
- last active date
- users count
- employees count
- shifts this month
- subscription status

Actions:

- view tenant
- suspend
- reactivate
- soft delete
- restore
- rename slug
- change plan
- extend trial
- view audit logs
- view usage

### Domains / Workspaces

Show every workspace domain:

```text
bp-kallis.shiftflow.gr
eko-larisa.shiftflow.gr
```

Because wildcard DNS is used, deleting a workspace usually means updating tenant state, not deleting DNS records.

Actions:

- disable workspace
- rename slug
- reserve slug
- release slug
- soft delete workspace
- restore workspace

### Usage Analytics

Per tenant:

- daily active users
- monthly active users
- login count
- employees count
- shifts created
- schedules generated
- exports generated
- AI requests when available
- storage usage when available
- last active date
- health score

### Billing Overview

Foundation fields:

- plan
- status
- trial end date
- subscription end date
- manual override
- past due flag

Full payment provider integration is not MVP.

### Audit Logs

Show platform and tenant-sensitive actions:

- tenant created
- tenant suspended
- tenant reactivated
- tenant soft deleted
- tenant restored
- slug changed
- plan changed
- platform admin login
- impersonation started/stopped
- billing metadata changed

### System Health

Show:

- app status
- Firebase status assumptions
- Cloudflare/Tunnel status when available
- latest deployment notes
- backup status
- recent errors
- failed jobs

## Impersonation

Impersonation is a future support feature.

If implemented:

- require `SUPER_ADMIN`
- show a visible banner
- write audit logs
- provide exit button
- restrict destructive actions or require confirmation
- never bypass tenant isolation silently

## Tenant Deletion

Default action should be soft delete:

```text
tenants/{tenantId}.status = "DELETED"
tenants/{tenantId}.deletedAt = timestamp
```

Permanent delete must be separate, audited, and delayed until backup/export policy is implemented.

## Security Requirements

- `/admin` must not render for non-platform admins.
- Do not rely on frontend-only checks.
- Client writes to `platformAdmins` must be denied.
- Admin actions must be audited.
- Do not log secrets, tokens, reset links, or private config.
- Do not expose tenant private collections in platform views unless the action is explicit, authorized, and audited.

## MVP Scope

Include first:

- protected admin route
- tenant list
- tenant details
- suspend/reactivate
- soft delete/restore
- basic usage counters
- audit log list

Defer:

- payment provider automation
- custom domains
- AI insights
- full support impersonation
- advanced BI
