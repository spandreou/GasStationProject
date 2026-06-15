# SaaS Tenant Foundation

This project is moving toward a shared SaaS architecture:

```text
One shared app
Tenant detected by hostname
Access controlled by uid-based tenant memberships
Tenant data isolated by tenantId
```

## Domains

Central portal:

```text
gas.homelabshare.gr
```

Pilot tenant:

```text
bp-kallis.homelabshare.gr
```

Future tenant examples:

```text
bp-manopoulos.homelabshare.gr
eko-example.homelabshare.gr
```

## Host Resolution

`src/utils/tenantHostContext.js` resolves:

- `gas.homelabshare.gr` -> central mode
- `{tenant}.homelabshare.gr` -> tenant mode
- `localhost` / `127.0.0.1` -> local mode with development fallback tenant slug

Hostname resolution is not authorization. It only determines context.

## Membership Model

Recommended Firestore collections:

```text
users/{uid}
tenants/{tenantId}
tenantMemberships/{uid}_{tenantId}
```

Memberships must be resolved by Firebase Auth `uid`, not by hardcoded email.

Tenant membership shape:

```ts
type TenantMembership = {
  id: string;
  uid: string;
  tenantId: string;
  email: string;
  role: "TENANT_ADMIN" | "EMPLOYEE" | "VIEWER";
  status: "ACTIVE" | "DISABLED";
  createdAt: Date;
  updatedAt: Date;
};
```

## Repository Foundation

The current Firebase implementations are:

- `tenantsRepository`
- `tenantMembershipsRepository`
- `tenantSubscriptionRepository`
- `tenantTokenRequestsRepository`
- `tenantAccessService`
- `tenantDataPaths`

They are exported from `src/repositories/index.js` so future code can switch to an API/PostgreSQL implementation without coupling UI components directly to Firestore.

`src/services/tenantAccessService.js` owns the current membership resolution helpers:

- load active memberships by Firebase Auth `uid`
- resolve a central portal destination
- prepare tenant-host membership verification
- build tenant URLs from `tenant.domain` or `{tenant.slug}.homelabshare.gr`

Tenant membership checks use the raw Firebase Auth user uid. Admin-only scheduler permissions still use the Firebase custom claim `admin=true`.

`src/utils/tenantDataPaths.js` defines the target tenant-scoped data paths:

```text
users/{uid}
tenants/{tenantId}
tenantMemberships/{uid}_{tenantId}
tenants/{tenantId}/employees
tenants/{tenantId}/shifts
tenants/{tenantId}/settings
tenants/{tenantId}/subscription
tenants/{tenantId}/tokenRequests
tenants/{tenantId}/auditLogs
```

This is a foundation contract only. The BP Kallis pilot data is not migrated in this phase.

Subscription and token-request repositories are prepared as tenant-scoped adapters:

- `tenantSubscriptionRepository.getTenantSubscription(tenantId)`
- `tenantTokenRequestsRepository.createTenantTokenRequest(tenantId, request)`
- `tenantTokenRequestsRepository.listTenantTokenRequests(tenantId)`

They are not wired into paid billing or production activation flows yet. Token requests store request metadata, not secret token values.

## Central Portal Flow

Target flow after login at `gas.homelabshare.gr`:

```text
read currentUser.uid
load active tenant memberships
0 memberships -> show no-access message
1 membership -> redirect to tenant domain
2+ memberships -> show /select-tenant
```

Safe no-access message:

```text
Δεν υπάρχει ενεργό πρατήριο συνδεδεμένο με αυτόν τον λογαριασμό.
```

`/select-tenant` uses the tenant access service and must not hardcode email-to-domain mappings.

## Access Rules

Target access flow for a tenant subdomain:

```text
resolve hostname -> tenant slug
load tenant
read current Firebase user uid
verify active membership for uid + tenantId
allow or deny app access
```

Safe deny message:

```text
Δεν έχετε πρόσβαση σε αυτό το πρατήριο.
```

Do not reveal whether other tenants exist.

## Firestore Rules Foundation

The SaaS collections are protected in `firestore.rules`:

- `users/{uid}` can be read by the owning uid or admin.
- `tenantMemberships/{uid}_{tenantId}` can be read by the owning uid only when `status == "ACTIVE"`; writes are admin-only.
- `tenants/{tenantId}` can be read by admins or active tenant members.
- `tenants/{tenantId}/employees`, `shifts`, `settings`, `subscription`, and `tokenRequests` can be read by admins or active tenant members.
- Tenant-scoped writes remain admin-only in this phase.
- `tenants/{tenantId}/auditLogs` can be created by admins and cannot be updated or deleted by clients.

These rules prepare tenant isolation without enabling public or email-based access.

## Tenant Public Read-Only Snapshots

BP Kallis public/read-only visitors must not read raw admin collections such as `employees`, `shifts`, `announcements`, `week_history`, `audit_logs`, or `monthly_schedule_exports`.

Public schedule data is mirrored into sanitized tenant subcollections:

- `tenants/{tenantId}/publicSchedules/{weekStart}`
- `tenants/{tenantId}/publicMonths/{YYYY-MM}`
- `tenants/{tenantId}/publicEmployees/{employeeId}`
- `tenants/{tenantId}/publicAnnouncements/{announcementId}`

Admin save/generate/edit actions refresh these documents automatically. The legacy root `published_schedules` collection remains only as a non-destructive fallback for older data; new writes should use the tenant-scoped public paths.

Allowed public fields are intentionally narrow: schedule dates/times and display names, employee display name/role/color/active status, and announcement title/body/date. Do not add phone, email, AFM, private notes, audit metadata, Storage paths, public URLs, signed URLs, monthly PDF archive metadata, or internal admin fields to public snapshots.

The old finalized/published-week UI flow is no longer the source of truth. Owners can edit schedules after old `week_locks` data exists, and public snapshots are refreshed by normal save/generate/clear actions.

## Tenant Gate

`src/components/auth/TenantGate.jsx` wraps tenant views and is controlled by:

```text
VITE_ENABLE_TENANT_GATE=false
```

The flag is intentionally default-off for the BP Kallis pilot until tenant seed data exists in Firestore:

```text
tenants/{tenantId}
tenantMemberships/{uid}_{tenantId}
```

When enabled, the gate:

- resolves the tenant hostname,
- reads the authenticated Firebase user uid,
- checks active membership for `uid + tenantId`,
- shows the safe denied message before tenant data is rendered.

Do not use hostname detection as authorization. The hostname only selects context; membership decides access.

## BP Kallis Seed Command

Before enabling `VITE_ENABLE_TENANT_GATE=true`, seed Firestore with the BP Kallis tenant and at least one active membership:

```bash
npm run tenant:seed-bp-kallis -- --uid <firebase-auth-uid> --dry-run
npm run tenant:seed-bp-kallis -- --uid <firebase-auth-uid> --use-gcloud
```

The script writes:

```text
tenants/bp-kallis
tenantMemberships/{uid}_bp-kallis
users/{uid}
```

It does not authorize by email. Email is optional metadata only when passed explicitly. Do not commit service account files or `.env`.

## Future PostgreSQL Direction

Do not migrate yet. Keep models PostgreSQL-ready:

- `tenants`
- `users`
- `tenant_memberships`
- `subscriptions`
- `activation_tokens`
- `token_requests`
- `employees`
- `shifts`
- `settings`
- `audit_logs`

Avoid Firestore-specific business logic in UI components.
