# ShiftFlow SaaS Tenant Foundation

This project is moving toward a shared SaaS architecture under the **ShiftFlow** product identity.

```text
One shared app
Tenant detected by hostname
Tenant access controlled by Firebase uid + tenant membership
Tenant data isolated by tenantId
Platform admin separated from tenant admin
```

The existing BP Kallis deployment remains the first production-like pilot tenant during the migration.

## Target Domains

Public / central portal:

```text
shiftflow.gr
www.shiftflow.gr
```

Platform owner admin:

```text
shiftflow.gr/admin
```

Tenant workspaces:

```text
{tenantSlug}.shiftflow.gr
```

Pilot target after migration:

```text
bp-kallis.shiftflow.gr
```

Current live pilot before migration:

```text
bp-kallis.homelabshare.gr
```

## Domain Strategy

The target model uses wildcard DNS:

```text
*.shiftflow.gr -> ShiftFlow app / Cloudflare Tunnel / reverse proxy
```

This means new tenants should not require one DNS record per customer.

The database decides whether a tenant workspace exists:

```text
bp-kallis.shiftflow.gr -> resolve slug `bp-kallis` -> tenants/bp-kallis
unknown.shiftflow.gr -> tenant not found
```

## Host Resolution

The tenant resolver should classify hostnames like this:

```text
shiftflow.gr -> public portal
www.shiftflow.gr -> public portal
shiftflow.gr/admin -> platform admin route
{tenantSlug}.shiftflow.gr -> tenant context
localhost / 127.0.0.1 -> local development context
```

Important rule:

> Hostname resolution is not authorization. It only determines context.

Authorization always depends on authenticated Firebase uid and active tenant membership.

## Reserved Subdomains

The following slugs must not be assigned to customers:

```text
admin
api
www
app
dashboard
status
support
help
docs
mail
smtp
imap
cdn
static
assets
billing
payments
auth
login
register
root
system
superadmin
owner
cloudflare
internal
```

## Slug Rules

Tenant slugs must:

- use lowercase latin letters, numbers, and hyphens only
- start with a letter or number
- end with a letter or number
- avoid consecutive hyphens
- be unique
- not be a reserved word
- be human-readable

Suggested regex:

```text
^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$
```

## Membership Model

Core Firestore collections:

```text
users/{uid}
tenants/{tenantId}
tenantMemberships/{uid}_{tenantId}
platformAdmins/{uid}
```

Tenant membership shape:

```ts
type TenantMembership = {
  id: string;
  uid: string;
  tenantId: string;
  email?: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE" | "VIEWER";
  status: "ACTIVE" | "INVITED" | "INACTIVE" | "SUSPENDED" | "EXPIRED" | "REVOKED";
  createdAt: Date;
  updatedAt: Date;
};
```

Memberships must be resolved by Firebase Auth `uid`, not by hardcoded email.

## Tenant Model

Recommended tenant metadata:

```ts
type Tenant = {
  id: string;
  name: string;
  slug: string;
  domain: string;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "EXPIRED" | "DELETED";
  plan: "STARTER" | "PRO" | "BUSINESS" | "MANUAL";
  ownerUid: string;
  createdAt: Date;
  updatedAt: Date;
  trialEndsAt?: Date;
  subscriptionEndsAt?: Date;
  deletedAt?: Date;
};
```

## Tenant-Scoped Data Paths

Target paths:

```text
tenants/{tenantId}/employees
tenants/{tenantId}/shifts
tenants/{tenantId}/settings
tenants/{tenantId}/subscription
tenants/{tenantId}/tokenRequests
tenants/{tenantId}/auditLogs
tenants/{tenantId}/publicSchedules
tenants/{tenantId}/publicMonths
tenants/{tenantId}/publicEmployees
tenants/{tenantId}/publicAnnouncements
```

The BP Kallis pilot may still have legacy root collections during transition. New SaaS work should prefer tenant-scoped paths.

## Central Portal Flow

Target login flow at `shiftflow.gr/login`:

```text
read current Firebase user uid
load active tenant memberships
0 memberships -> show no-access / onboarding message
1 membership -> redirect to tenant domain
2+ memberships -> show /select-tenant
```

When a user is redirected from a tenant domain, the central login may receive a `returnTo` parameter. The app must validate that the URL belongs to a known tenant workspace and verify active membership before redirecting.

Safe no-access message:

```text
Δεν υπάρχει ενεργό workspace συνδεδεμένο με αυτόν τον λογαριασμό.
```

## Tenant Access Flow

Target access flow for a tenant subdomain:

```text
resolve hostname -> tenant slug
load tenant by slug
check tenant status
read current Firebase user uid
verify active membership for uid + tenantId
allow or deny tenant app access
```

Safe deny message:

```text
Δεν έχετε πρόσβαση σε αυτό το workspace.
```

Do not reveal whether other tenants exist.

## Platform Admin Separation

Platform admin access is separate from tenant membership.

Path:

```text
platformAdmins/{uid}
```

A platform admin can manage tenant metadata, lifecycle, provisioning, usage analytics, and support workflows. Platform admin status should not silently bypass tenant operational data boundaries unless a specific support/impersonation flow exists and writes audit logs.

## Tenant Public Read-Only Snapshots

Public/read-only visitors must not read raw admin collections such as employees, shifts, absences, announcements, week history, audit logs, or monthly exports.

Public schedule data should be mirrored into sanitized tenant subcollections:

```text
tenants/{tenantId}/publicSchedules/{weekStart}
tenants/{tenantId}/publicMonths/{YYYY-MM}
tenants/{tenantId}/publicEmployees/{employeeId}
tenants/{tenantId}/publicAnnouncements/{announcementId}
```

Allowed public fields are intentionally narrow: schedule dates/times and display names, employee display name/role/color/active status, and announcement title/body/date.

Do not add phone, email, AFM, private notes, audit metadata, Storage paths, public URLs, signed URLs, monthly PDF archive metadata, or internal admin fields to public snapshots.

## Tenant Gate

`src/components/auth/TenantGate.jsx` wraps tenant views and is controlled by feature flags during migration.

Safe defaults for the current BP Kallis pilot remain:

```text
VITE_ENABLE_TENANT_GATE=false
VITE_ENABLE_AUTH_BROKER=false
```

Do not enable tenant-domain central-login enforcement in production until the cross-subdomain auth handoff is verified.

## Central Auth Production Blocker

Firebase client auth persistence is origin-scoped. A login session created on:

```text
shiftflow.gr
```

is not automatically available to:

```text
bp-kallis.shiftflow.gr
```

Do not pass Firebase ID tokens, refresh tokens, reset codes, or signed session material in query strings.

Use the dedicated auth broker/session handoff plan before enforcing central-only login across tenant subdomains.

Detailed notes:

```text
docs/central-auth-portal-migration.md
docs/auth-broker-runbook.md
```

## Future PostgreSQL Direction

Do not migrate yet. Keep models PostgreSQL-ready:

- tenants
- users
- tenant_memberships
- platform_admins
- subscriptions
- tenant_usage_daily
- audit_logs
- activation_tokens
- token_requests
- employees
- shifts
- settings

Avoid Firestore-specific business logic in UI components.
