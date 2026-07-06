# ShiftFlow SaaS

## Project

This repository is evolving from **GasStation Shift Manager** into **ShiftFlow**, a multi-tenant SaaS platform for employee shift scheduling, absence management, roster generation, exports, and future operational intelligence.

The current BP Kallis deployment is the first production-like pilot tenant. Treat it as a tenant inside the future platform, not as a separate product identity.

## Repository And Deployment Context

- Local working folder for Codex on Windows: `C:\Users\Spyros\OneDrive\Υπολογιστής\projects\GasStation-main`.
- Do not use `GasStationProject-main`; it was the wrong/empty local folder.
- GitHub remote is currently `https://github.com/spandreou/GasStationProject.git`.
- Active homelab checkout is `/home/spandreou/projects/GasStationProject`.
- Active homelab deployment branch was verified on 2026-06-27 as `main`.
- Current public pilot URL: `https://bp-kallis.homelabshare.gr/`.
- Target platform domain: `https://shiftflow.gr`.
- Target tenant URL pattern: `https://{tenantSlug}.shiftflow.gr`.
- Homelab compose project: `gasstationproject`.
- Frontend container: `gasstation-bp-kallis`.
- Host port: `8085` mapped to container port `8080`.
- See `HOMELAB.md` and `docs/self-hosting-bp-kallis.md` before searching for deployment details.

## Stack

- React + Vite
- Tailwind CSS
- Zustand
- Firebase Auth / Firestore
- dnd-kit
- jsPDF / @e965/xlsx / docx exports

## Main Product Direction

ShiftFlow should become a shared SaaS platform:

- `shiftflow.gr` = public portal, login, registration, pricing, and super-admin entry.
- `shiftflow.gr/admin` = platform owner / super-admin panel.
- `{tenantSlug}.shiftflow.gr` = tenant workspace.
- Wildcard DNS should allow new tenant workspaces without manual DNS records.
- Tenant access must be authorized through Firebase UID + tenant membership, never through hostname alone.

Core areas:

- Weekly/monthly scheduling
- Automatic schedule generation
- Fixed days off
- Leave/sick/manual overrides
- Tenant onboarding and lifecycle management
- Platform admin analytics and tenant management
- PDF/Excel/Word exports

## Working Mode

Work phase by phase.
Never start the next phase without explicit user approval.
Prefer small, reviewable changes.
Avoid unrelated refactors.
For roadmap work, read `docs/SHIFTFLOW_SAAS_ROADMAP.md` first.

## Reports

At the end of every phase, create or update a phase report.

Each report must include:

- Phase name
- Goal
- Summary of work completed
- Files changed
- Database/data model changes
- Tests/checks run
- Manual verification steps
- Risks or open questions
- Recommended next phase
- Explicit stop point

Use `docs/PHASE_REPORT_TEMPLATE.md` when available.

## General Rules

- Keep all Greek text UTF-8 safe.
- Do not introduce mojibake or broken Greek text.
- Do not remove data fields from objects just because they are not displayed in the UI.
- If something should not be visible, make it presentation-only.
- Do not break:
  - manual edit
  - drag and drop
  - templates
  - history
  - Firebase persistence
  - exports
  - locked week behavior
  - tenant membership checks
  - public sanitized views
- Prefer small, clean changes instead of a large uncontrolled rewrite.
- If a scheduling rule cannot be satisfied, show a clear warning instead of generating a fake-correct schedule.

## SaaS Safety Rules

- Hostname resolution is context selection, not authorization.
- Every tenant-owned read/write must be scoped by `tenantId` once multi-tenancy is active.
- Do not hardcode email-to-domain mappings.
- Do not grant platform-admin or tenant-admin access from frontend-only state.
- Do not expose raw tenant data in public/read-only views.
- Do not log passwords, Firebase tokens, reset URLs, `oobCode` values, service account values, tunnel tokens, signed URLs, or `.env` values.
- Unknown, suspended, expired, or deleted tenants must fail safely.
- Prefer soft delete for tenants before any permanent deletion.

## Scheduler References

- Business rules: `docs/scheduler-rules.md`
- UI/export rules: `docs/scheduler-ui-export-rules.md`
- QA checklist: `docs/scheduler-qa-checklist.md`

## SaaS And Security References

- Project brain: `docs/project-brain.md`
- Security guidelines: `docs/SECURITY_GUIDELINES.md`
- SaaS roadmap: `docs/SHIFTFLOW_SAAS_ROADMAP.md`
- Multi-tenancy architecture: `docs/MULTI_TENANCY_ARCHITECTURE.md`
- Domain strategy: `docs/DOMAIN_AND_DNS_STRATEGY.md`
- Tenant authorization: `docs/tenant-authorization-model.md`
- Firebase rules model: `docs/firebase-security-rules.md`
- Central auth migration: `docs/central-auth-portal-migration.md`
- Auth broker runbook: `docs/auth-broker-runbook.md`
- Platform admin runbook: `docs/platform-admin-runbook.md`

## Validation Expectations

For scheduler changes, run:

```bash
npm run qa:scheduler
npm run build
```

When scheduler engine or generator logic changes, also run:

```bash
npm run qa:scheduler-engine
```

For SaaS, tenant isolation, auth, Firebase rules, platform admin, or export-security changes, run the relevant checks available in the repo, such as:

```bash
npm run qa:tenant-authorization
npm run qa:public-readonly
npm run qa:repositories
npm run qa:export-security
npm run qa:saas-foundation
npm run security:scan
npm run build
```

For docs-only changes, no runtime checks are required unless code, rules, package files, deployment config, or scripts are changed.

## Git Hygiene

- Do not commit, push, or open PRs from a local checkout without explicit request.
- Do not delete untracked user files.
- Do not reset or revert changes that were not made by the current task.
- Keep docs-only phases docs-only unless the user explicitly asks for implementation.

## Done Means

A phase is done only when:

- The requested functionality is implemented or documented.
- The project still has a clear next step.
- The report is written.
- The next phase is proposed but not started.
