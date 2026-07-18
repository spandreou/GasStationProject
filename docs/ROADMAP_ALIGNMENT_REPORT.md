# ShiftOryx Roadmap Alignment Report

Alignment date: 17 July 2026

Master document: `ShiftOryx - Master Product, Technical Architecture & Codex Execution Roadmap`

Google Doc: `https://docs.google.com/document/d/187_L7GROL-WqmA01sP-8MfeQa8CxJBCYNQXGI2oxibM/edit?tab=t.0`

Local base: `main@865f2b2`

## Scope

Phase 0 documentation alignment only. No source code, dependencies, lockfiles, Firebase rules/data/functions, Storage, DNS, Cloudflare, Docker, environment flags or production deployment were changed.

## Important Contradictions Resolved

| Previous local wording | Master direction | Resolution |
| --- | --- | --- |
| GasStation Shift Manager as product identity | Product name is ShiftOryx | Product docs renamed; legacy technical identifiers retained |
| `gas.homelabshare.gr` as final central portal | Root target is `shiftoryx.gr` | homelabshare documented as current/legacy foundation only |
| Per-tenant homelab subdomains as long-term model | One wildcard `*.shiftoryx.gr` and shared app | Target documented; no DNS/runtime action |
| `OWNER`, `ADMIN`, `MANAGER` as permanent tenant roles | OWNER only for new MVP memberships | Legacy acceptance marked compatibility pending Phase 2 |
| Employee as possible authenticated role | Employees/public viewers have no account in MVP | Public anonymous sanitized model documented |
| Scheduler role names mixed with auth roles | Scheduler roles are business classifications | Explicit separation added |
| Public absences forbidden forever | Phase 10 may expose narrow status labels and `publicNote` | Current runtime remains private; future boundary documented separately |
| Tenant provisioning CLI as final onboarding | Registration token and automated provisioning are future server flows | Existing CLI marked foundation/compatibility |
| Homelab as implied long-term production | EU VPS required before paid public beta | Hosting roadmap documented without purchase/deploy |
| Generic next-step lists | Strict phases 0-15 | Canonical ordered roadmap added |

## Current Versus Target

- Current pilot remains `bp-kallis.homelabshare.gr`; target is `bp-kallis.shiftoryx.gr`.
- Current technical identifiers remain unchanged; branding does not authorize infrastructure renames.
- Current public view continues to omit absence/status entries; Phase 10 owns any sanitized status work.
- Current role compatibility remains until an evidence-backed, reversible Phase 2 migration.
- Auth broker, central portal, provisioning and platform admin foundations are not described as complete commercial flows.
- Trial, pricing, multi-store, entitlements, tokens, aliases, customization, VPS, HomeOps and billing are proposals/targets only.

## Deferred Runtime Work

The following were intentionally not changed:

- role validators and Firestore Rules,
- host/domain resolution and CORS allowlists,
- feature flags,
- registration/provisioning runtime,
- public snapshot schema,
- Firebase functions and Storage,
- Docker/Cloudflare/deployment configuration,
- dependencies and advisories.

## Documentation Deliverables

- Core product identity and phase contract in `AGENTS.md`, `README.md` and `docs/project-brain.md`.
- Current/target Firebase model in `FIREBASE_SCHEMA.md`.
- Current-state skeleton in `docs/CURRENT_STATE.md`.
- OWNER-only target and compatibility in `docs/tenant-authorization-model.md`.
- SaaS target and current pilot boundary in `docs/saas-tenant-foundation.md`.
- Operational runbooks updated only where needed to distinguish current legacy endpoints from the ShiftOryx target.

## Risks And Open Questions For Phase 1

- Documentation may still mention old names correctly in historical or operational contexts; Phase 1 must classify each occurrence before removal.
- The exact live membership roles, feature flags and broker origin configuration require read-only verification.
- Pricing, tax treatment and retention policy require external business/legal review.
- VPS provider pricing and availability are time-sensitive and must be rechecked before purchase.
- Public status schema must be designed with explicit leakage tests in Phase 10.

## Backup And Rollback

Pre-edit documentation backup:

```text
C:\Users\Spyros\.codex\tmp\shiftoryx-docs-backup-20260717-1915
```

Rollback is documentation-only: compare or restore only the intended Markdown files from that backup. Do not touch unrelated user files or generated artifacts.

## Recommended Next Step

Review and approve Phase 0 documentation. Then run Phase 1 as a read-only evidence-backed audit. Do not start Phase 2 or any production rollout before Phase 1 is accepted.
