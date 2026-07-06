# ShiftFlow SaaS Roadmap

## Product Goal

ShiftFlow is the SaaS evolution of the current GasStation Shift Manager project.

The target product is a multi-tenant platform for shift scheduling, employee management, absences, reports, exports, tenant lifecycle management, and future AI-assisted operations.

## Target Domain Model

```text
shiftflow.gr                    -> public portal
shiftflow.gr/admin              -> platform super-admin panel
{tenantSlug}.shiftflow.gr       -> tenant workspace
bp-kallis.shiftflow.gr          -> BP Kallis pilot after migration
```

Use wildcard DNS:

```text
*.shiftflow.gr -> ShiftFlow app / Cloudflare Tunnel / reverse proxy
```

New tenants should be created from application/database state, not by manually creating DNS records.

## Non-Negotiable Principles

- One shared codebase, not one fork per tenant.
- Hostname resolution selects context; it does not authorize access.
- Authorization uses Firebase Auth uid + active tenant membership.
- Every tenant-owned collection must be scoped by `tenantId`.
- Platform admin is separate from tenant admin.
- No secrets, tokens, reset links, service account values, or `.env` values in logs or docs.
- Prefer soft delete and lifecycle states over destructive deletion.

## Phase 0 — Documentation Alignment

Goal: align the repo documentation around ShiftFlow before code changes.

Deliverables:

- update `AGENTS.md`
- update SaaS tenant foundation docs
- update schema docs
- add roadmap and report template
- add domain strategy, multi-tenancy, admin panel, lifecycle, analytics, and billing docs

Stop point: docs-only PR/review.

## Phase 1 — Current State Report

Goal: inspect the current app before changing behavior.

Deliverable:

```text
docs/CURRENT_STATE.md
```

Must include:

- current stack
- routes
- auth flow
- Firestore model
- tenant-aware files already present
- legacy root collections
- deployment assumptions
- risks before multi-tenancy
- suggested next implementation phase

Do not modify business logic in this phase.

## Phase 2 — Tenant Model Contract

Goal: define and verify tenant metadata, membership, settings, lifecycle, and usage models.

Deliverables:

- tenant model contract
- membership model contract
- reserved slug list
- tenant status lifecycle
- default settings model
- migration notes for BP Kallis

## Phase 3 — Tenant-Scoped Data Migration Plan

Goal: plan how legacy root collections move to tenant-scoped paths.

Target paths:

```text
tenants/{tenantId}/employees
tenants/{tenantId}/shifts
tenants/{tenantId}/settings
tenants/{tenantId}/auditLogs
```

Deliverables:

- migration plan
- rollback plan
- read/write compatibility plan
- validation checklist

Do not bulk-migrate production data without explicit approval.

## Phase 4 — Hostname Tenant Resolver

Goal: make the app classify root, admin, tenant, unknown, and local contexts.

Expected behavior:

```text
shiftflow.gr -> public portal
shiftflow.gr/admin -> platform admin
bp-kallis.shiftflow.gr -> tenant bp-kallis
unknown.shiftflow.gr -> workspace not found
localhost -> local development context
```

## Phase 5 — Public Portal And Registration Design

Goal: design the customer registration flow.

Must include:

- landing
- login
- register
- forgot/reset password
- subdomain availability check
- tenant creation flow
- safe error states

## Phase 6 — Automated Tenant Provisioning

Goal: create a tenant without manual per-tenant DNS.

Must validate:

- slug format
- reserved slugs
- duplicates
- owner user
- tenant document
- membership document
- default settings
- lifecycle status

## Phase 7 — Tenant Gate And Membership Enforcement

Goal: ensure tenant data renders only after access is verified.

Requirements:

- active Firebase user
- active membership for `uid + tenantId`
- correct tenant status
- safe denial messages
- no data render before verification

## Phase 8 — Platform Admin Foundation

Goal: protect and expand `shiftflow.gr/admin`.

Must include:

- platform admin check
- tenant list
- tenant details
- suspend/reactivate
- soft delete/restore
- audit logs
- usage overview foundation

## Phase 9 — Usage Analytics

Goal: measure real tenant usage.

Track events such as:

- login
- employee created
- shift created
- schedule generated
- export generated
- tenant created
- tenant suspended

Aggregate daily usage per tenant.

## Phase 10 — Security Hardening

Goal: prove tenant isolation and admin protection.

Must test:

- tenant A cannot read tenant B
- non-platform admin cannot access `/admin`
- suspended/deleted tenant cannot access app
- public snapshots do not leak private data
- reset links/tokens/secrets are not logged

## Phase 11 — Billing Foundation

Goal: prepare plan/subscription data without full payment automation.

Initial plans:

- STARTER
- PRO
- BUSINESS
- MANUAL

Do not implement payment provider integration until the core SaaS model is stable.

## Phase 12 — BP Kallis Migration

Goal: move the current pilot into the ShiftFlow domain model.

Target:

```text
bp-kallis.shiftflow.gr
```

Must preserve existing data and behavior.

## MVP Definition

The first serious MVP should have:

- ShiftFlow public portal
- wildcard tenant domains
- tenant registration/provisioning
- tenant resolver
- tenant gate
- tenant-scoped operational data
- platform admin panel
- suspend/reactivate/soft delete
- basic usage analytics
- audit logs
- backup/deploy checklist

Defer:

- custom domains
- AI scheduling
- full billing automation
- mobile app
- myDATA/ERGANI integrations
- enterprise multi-branch logic
