# ShiftOryx Firebase Schema

This document separates the current production schema from the approved target model. It is documentation only and does not authorize a migration or rules deployment.

## Core Principles

- One shared application serves multiple tenants.
- Tenant operational data lives under `tenants/{tenantId}`.
- Hostname resolution selects context; membership grants owner access.
- Public users read only dedicated sanitized tenant collections.
- New MVP tenant memberships use role `OWNER` only.
- Legacy role and collection identifiers may remain temporarily for compatibility until their approved migration phase.

## Platform Collections

### `users/{uid}`

Safe account/profile metadata. Do not store passwords, tokens or private keys.

### `tenants/{tenantId}`

Tenant identity and lifecycle metadata, including slug/domain and status.

### `tenantMemberships/{uid}_{tenantId}`

Target MVP fields:

```text
uid
tenantId
role: OWNER
status: ACTIVE | REVOKED
createdAt
updatedAt
```

Current compatibility note: existing code/rules may still recognize `ADMIN` and `MANAGER` until roadmap Phase 2 inventories and migrates legacy memberships. New provisioning must not create them.

### `platformAdmins/{uid}`

ShiftOryx Admin authorization. Compatibility role is `SUPER_ADMIN`; status must be `ACTIVE`. Client writes are denied.

### `authTickets/{ticketHash}`

Short-lived cross-subdomain auth broker records. Client read/write is denied. Ticket consumption is server-side, single-use and replay protected.

### `monthly_schedule_exports/{tenantId}_{YYYY-MM}`

Private monthly PDF archive metadata, scoped by `tenantId`. It must not contain public/signed URLs, blobs or file contents.

## Tenant Private Data

```text
tenants/{tenantId}/employees
tenants/{tenantId}/shifts
tenants/{tenantId}/shiftTemplates
tenants/{tenantId}/absences
tenants/{tenantId}/settings
tenants/{tenantId}/announcements
tenants/{tenantId}/attendanceHistory
tenants/{tenantId}/weekLocks
tenants/{tenantId}/weekHistory
tenants/{tenantId}/weekTemplates
tenants/{tenantId}/auditLogs
tenants/{tenantId}/subscription/current
tenants/{tenantId}/usage/daily
```

The current runtime uses tenant-scoped operational collections. Legacy global scheduler collections are denied and must not become runtime fallbacks.

### Employee Fields

Private employee records may contain:

- `fullName`
- display/business role
- scheduler role/classification
- color
- fixed days off and scheduling rules
- `afm`, phone, email and hire date where operationally required
- `isActive`, `createdAt`, `updatedAt`

Private/contact fields never belong in public snapshots.

### Shift Fields

Typical fields:

- `employeeId`
- `date` (`YYYY-MM-DD`)
- `startTime`, `endTime` (`HH:mm`)
- `label`, `shiftType`
- `isManualOverride`
- internal notes and generation metadata where required
- `createdAt`, `updatedAt`

Scheduler role values are business data, not authentication roles.

## Tenant Public Data

Current collections:

```text
tenants/{tenantId}/publicSchedules/{weekStart}
tenants/{tenantId}/publicMonths/{YYYY-MM}
tenants/{tenantId}/publicEmployees/{employeeId}
tenants/{tenantId}/publicAnnouncements/{announcementId}
```

Current production behavior publishes work schedule fields and sanitized display data only. It does not expose absence entries or private notes.

Approved Phase 10 target:

- optional sanitized status values `Άδεια`, `Ρεπό`, `Δεν εργάζεται`,
- explicit `publicNote`,
- owner preview before publish,
- no generic `notes` auto-publication,
- no absence reason, medical data, attachment, `privateNote`, contact details, UID, memberships, audit data or raw record payload.

Potential target representation may use `publicStatusEntries` or validated status fields inside existing public snapshots. The final shape must be decided and tested in Phase 10 before rules/runtime changes.

## Future Platform Collections

These belong to later roadmap phases and are not automatically implemented by this schema document:

```text
registrationTokens/{tokenHash}
slugReservations/{slug}
slugAliases/{oldSlug}
platformAuditLogs/{eventId}
customizationRequests/{requestId}
```

Requirements include server-side writes, transactions for one-time/unique operations, safe metadata listing, rate limiting, audit and deny-by-default client rules.

## Firebase Storage

Current private monthly archives:

```text
tenants/{tenantId}/monthly_schedule_pdfs/{YYYY-MM}/program_month_{YYYY-MM}.pdf
```

Future safe customization attachments require a separately reviewed path, MIME/size validation, malware-aware handling where appropriate and no public bucket access.

## Index Guidance

Indexes must follow actual tenant-scoped queries. Common query dimensions include:

- shifts by `date`,
- shifts by `employeeId` and `date`,
- memberships by `uid`, `status` and role,
- tenants by slug/domain/status,
- subscriptions by status/expiry,
- audit/usage by tenant and timestamp.

Do not add speculative indexes without confirming the real query and emulator/runtime need.
