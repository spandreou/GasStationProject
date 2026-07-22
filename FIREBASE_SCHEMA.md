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

Future tenant/store template assignment fields (conceptual only; not present as a verified runtime contract today):

```text
businessCategory
templateId
templateVersion
brandingOverrides
customizationMode
```

Initial `businessCategory` values are `FUEL_STATION`, `CAFE`, `RESTAURANT`, `HAIR_SALON`, `RETAIL` and `OTHER`. A store without a more specific approved match uses the safe generic `OTHER` template. Multi-store records will carry the same validated assignment fields at the store boundary selected in Phase 8.

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

Current compatibility note: existing code/rules may still recognize `ADMIN` and `MANAGER`. Phase 2A is limited to read-only inventory, migration design and emulator rehearsal; a Phase 2B controlled OWNER migration requires separate explicit approval. New provisioning must not create legacy roles.

### `platformAdmins/{uid}`

ShiftOryx Admin authorization. Compatibility role is `SUPER_ADMIN`; status must be `ACTIVE`. Client writes are denied.

### `authTickets/{ticketHash}`

Short-lived cross-subdomain auth broker records. Client read/write is denied. Ticket consumption is server-side, single-use and replay protected.

### `monthly_schedule_exports/{tenantId}_{YYYY-MM}`

Private monthly PDF archive metadata, scoped by `tenantId`. It must not contain public/signed URLs, blobs or file contents.

### Future `templateCatalog/{templateId}`

This is a conceptual, centrally managed Phase 9 catalog and must not be read as a claim that the collection exists today. Its eventual approved schema will describe category compatibility, immutable/versioned template metadata, preview-safe presentation configuration, lifecycle status and migration controls.

Catalog templates and `brandingOverrides` must validate against an approved schema. Allowed values are presentation data such as background/logo presets, color and typography tokens, approved images/illustrations, radius/density presets, approved layout variants, enabled sections and public-page presentation. They must never contain executable code, arbitrary or unrestricted CSS, custom JavaScript, custom HTML, external scripts, executable themes or unsafe embeds. One shared application consumes the configuration; no tenant-specific source fork or deployment is created.

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
templateCatalog/{templateId} (conceptual name; finalized in Phase 9)
customizationRequests/{requestId}
```

Requirements include server-side writes, transactions for one-time/unique operations, safe metadata listing, rate limiting, audit and deny-by-default client rules.

### Future `customizationRequests/{requestId}`

Conceptual Phase 12 fields:

```text
tenantId
storeId (where applicable)
category
description
desiredResult
requestedDeadline
status
quoteAmount
ownerAcceptedAt
adminNotes
createdAt
updatedAt
```

The authenticated request lifecycle is server-owned: `SUBMITTED` → `REVIEWING` → `QUOTED` → `ACCEPTED` → `IN_PROGRESS` → `COMPLETED`, with `REJECTED` also valid. No implementation starts before owner acceptance. Clients cannot set `quoteAmount`, `adminNotes` or privileged status transitions. The public owner form does not need a fixed customization price or surcharge; quoting remains internal. Attachments may be added only after a separately reviewed private Storage design with authorization, MIME/type and size validation, safe filenames, malware-aware handling where appropriate and no public bucket access. The exact collection shape is finalized in Phase 12, not by this document.

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
