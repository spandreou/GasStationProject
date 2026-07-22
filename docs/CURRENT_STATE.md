# ShiftOryx Current State

Status date: 21 July 2026

Evidence baseline: `ba07ffa83cac5ba08209a6b1c35e79be987e0690`

Audit branch: `shiftoryx-phase-1-current-state-audit`

Phase verdict: `PHASE_1_READY_FOR_REVIEW`

This file is the concise implementation snapshot produced by the read-only Phase 1 audit. The detailed evidence, risks, test results and unknowns are in `docs/PHASE_1_CURRENT_STATE_AUDIT.md`. Documentation claims about live systems are not treated as implementation proof.

## Classification Summary

The detailed audit contains 39 classified areas:

| Classification | Count |
| --- | ---: |
| `IMPLEMENTED` | 7 |
| `PARTIAL` | 14 |
| `MISSING` | 10 |
| `LEGACY` | 1 |
| `RISKY` | 6 |
| `UNKNOWN_REQUIRES_AUDIT` | 1 |
| **Total** | **39** |

## Current Product And Deployment Boundary

- Product name: ShiftOryx.
- Current documented pilot: `https://bp-kallis.homelabshare.gr/`.
- Target root and tenant domains: `https://shiftoryx.gr` and `https://{tenantSlug}.shiftoryx.gr`.
- Domain state: `PURCHASED_NOT_CONFIGURED`; DNS, wildcard routing, Firebase Authorized Domains, broker origins and cutover were not verified or changed.
- Current deployment identifiers such as `GasStationProject`, `GasStation-main`, `gasstationproject` and `gasstation-bp-kallis` remain compatibility/operations identifiers.
- Repository evidence supports one shared React/Vite frontend and one Docker/Nginx service, not a codebase per tenant.
- No production, Firebase console, DNS, Cloudflare, homelab host or live tenant record was accessed during Phase 1.

## Implemented Capabilities

- React 19/Vite 8 frontend builds successfully and is served as an Nginx SPA in the checked-in container configuration.
- Firebase Auth login, logout, forgot-password and reset-password foundations exist.
- Tenant-scoped repository paths and matching membership authorization exist; hostname selects context but membership authorizes private access.
- Firestore and Storage rules default-deny unrecognized paths; private tenant data requires an active matching `OWNER`, `ADMIN` or `MANAGER` membership.
- Sanitized public schedules, months, employees and announcements exist as dedicated anonymously readable collections.
- A deterministic TypeScript scheduler engine implements rotations, fixed days off, absences/replacements, Sunday coverage, warnings, validation and manual-override preservation.
- Owner-only PDF/Excel/Word/WhatsApp exports and a feature-flagged private monthly PDF archive exist.
- A short-lived Firebase auth-ticket broker foundation exists with hashed tickets, exact-origin checks, transactional one-time consumption and custom-token exchange.
- `platformAdmins/{uid}` is separate from tenant ownership, and client writes to platform-admin and membership records are denied.

## Partial Or Risky Capabilities

- Target root routing is incomplete: `/register`, `/stores` and `/admin` are missing; placeholder routes use legacy names.
- Unknown tenant hosts do not render the target safe unknown-tenant page.
- Enabling `VITE_ENABLE_TENANT_GATE=true` would gate anonymous tenant `/` and `/app` routes and redirect public employees to login. The defect is dormant while the flag remains false.
- Dockerfile/Compose do not pass `VITE_ENABLE_TENANT_GATE` or `VITE_ENABLE_AUTH_BROKER`, so their documented container rollout cannot be enabled through the current build contract.
- New provisioning writes `OWNER`, but runtime/rules still accept legacy `ADMIN`/`MANAGER`; the legacy BP Kallis seed defaults to `ADMIN`.
- Tenant lifecycle status is not part of the Firestore/Storage membership authorization predicate.
- Owners can write `subscription/current` client-side; subscription entitlements and server enforcement do not exist.
- Public schedule/month rules validate `shifts` only as a list, not the nested public shift schema.
- Public employee documents reuse the private random employee document ID. This is a low-severity correlation identifier; it does not grant private reads.
- Audit logs and public snapshots are produced by the authorized client, not a server-enforced write layer.
- Zustand cleanup removes core private collections and listeners but leaves some scheduler/UI state and has a narrow stale auth-callback race.
- Firebase Analytics initializes when Firebase is configured and the browser supports it, without a separate consent/feature gate. Live configuration is unknown.
- The untracked `firestore-debug.log` is not ignored by Git or Docker; it was not read or changed.
- Root dependency audit currently fails with one critical and one moderate advisory. The critical package is not present by recognizable markers in the built frontend bundle, but it remains a lockfile/CI finding.

## Missing Target Capabilities

- Registration tokens and automated atomic tenant/trial provisioning.
- Slug reservations, reserved-host enforcement and slug aliases.
- Root registration, store selector and ShiftOryx Admin lifecycle panel.
- Server-side subscription/feature/planning-horizon enforcement and `usage/daily`.
- `platformAuditLogs` and server-enforced privileged audit events.
- `publicStatusEntries`, explicit `publicNote`/`privateNote` separation and owner preview.
- Business-category templates, template registry/versioning, tenant branding tokens/assets and safe assignment/migration flows.
- Paid customization request/quote workflow.
- Wildcard ShiftOryx domain/Cloudflare/Firebase Authorized Domains configuration.
- Sanitized health/version endpoints, HomeOps/Uptime/alert integration, backup automation and tested per-tenant restore.

The canonical roadmap was synchronized on 22 July 2026 with the future category/template fields `businessCategory`, `templateId`, `templateVersion`, `brandingOverrides` and `customizationMode`, plus Phase 4/8/9/12 ownership. The documented safety boundary rejects arbitrary or unrestricted CSS, custom JavaScript, custom HTML, external scripts, executable themes and unsafe embeds, while preserving one shared application. These category-template and customization capabilities remain unimplemented runtime targets. Record: `ROADMAP_DELTA_SYNCED_2026-07-22`.

## Target Collection Snapshot

| Group | Implemented/partial | Missing |
| --- | --- | --- |
| Platform | `users` (partial), `tenants`, `tenantMemberships`, `platformAdmins` (partial), `authTickets` | `registrationTokens`, `slugReservations`, `slugAliases`, `platformAuditLogs`, `customizationRequests` |
| Tenant private | `employees`, `shifts`, `shiftTemplates`, `absences`, `settings`, `announcements`, `weekHistory`, `auditLogs`, `subscription/current` (partial) | `usage/daily` |
| Tenant public | `publicSchedules`, `publicMonths`, `publicEmployees`, `publicAnnouncements` | `publicStatusEntries` |

Compatibility collections such as `attendanceHistory`, `weekLocks`, `weekTemplates` and tenant `tokenRequests` also exist. `tokenRequests` is not the target privileged registration-token model.

## Security Findings By Severity

- `CRITICAL`: `websocket-driver@0.7.4` dependency advisory through `firebase -> @firebase/database -> faye-websocket`; patched `0.7.5` exists. Runtime reachability was not demonstrated and recognizable markers were absent from the production bundle.
- `HIGH`: none demonstrated by repository evidence.
- `MEDIUM`: dormant tenant-gate public access break; unvalidated nested public shift payloads; client-writable subscription status; tenant lifecycle not enforced in membership predicates; Docker missing broker/gate build flags; unignored Firestore debug log; conditional legacy platform-admin access to legacy private absences.
- `LOW/INFORMATIONAL`: public/private employee ID correlation, client-authored audit limitations, residual Zustand state/auth race, missing App Check/rate limits, unpinned Semgrep container, legacy seed default role, build chunk-size warnings and missing future features.

## Validation Snapshot

Passed:

- `npm run build`
- `npm run qa:scheduler-engine`
- `npm run qa:scheduler`
- `npm run qa:repositories`
- `npm run qa:public-readonly`
- `npm run qa:tenant-authorization`
- `npm run qa:saas-foundation`
- `npm run qa:auth-broker`
- `npm run qa:export-security`
- `npm run security:hardening`
- `npm run security:integrity`
- `npm run lint --prefix functions`

Other results:

- Playwright: 6 passed, 1 failed. The absence UI test timed out waiting for hard-coded June 2026 calendar dates.
- `npm run security:audit`: failed with one critical and one moderate root dependency advisory.
- Functions `npm audit --json`: nine moderate and one low advisory; aggregate remediation proposes a semver-major `firebase-admin` update.
- Firebase emulator suites: `SKIPPED_WITH_REASON` because local `firebase-tools` is absent and the scripts use `npx --yes`, which could install software.
- `security:cve`/combined `security:scan`: `SKIPPED_WITH_REASON` because CVE Lite is fetched through `npx --yes`.
- Live/Docker/deployment validation: `SKIPPED_WITH_REASON` by Phase 1's no-production/no-deployment boundary.

## Unknowns Requiring Controlled Verification

- Live membership role/status inventory and presence of legacy root data.
- Deployed Firestore/Storage rules and Functions versions.
- Current Firebase Authorized Domains, App Check, Analytics and quotas.
- Cloudflare DNS/Tunnel/WAF/origin exposure and the actual pilot container/image version.
- Production backups, retention, encryption, monitoring and restore success.
- Live tenant/subscription/archive records and whether any debug artifact contains sensitive data.

## Next Approved Scope

Phase 0 and Phase 1 are complete. After this documentation synchronization is reviewed and merged, the next engineering task is a separately scoped dependency-remediation and security-gate task. Phase 2A follows only after separate human approval, and the Phase 2B production migration remains separately approved.

### Phase 2A — read-only inventory, migration design and emulator validation

1. Back up and inventory live membership roles and legacy data without printing personal records.
2. Define migration eligibility and an explicit rollback map.
3. Rehearse the proposed membership, rules and compatibility changes in Firebase emulators.
4. Stop for human approval. Phase 2A does not authorize a production membership change.

### Phase 2B — controlled OWNER migration

Only after separate explicit approval, migrate compatible `ADMIN`/`MANAGER` memberships to `OWNER`, update the approved enforcement surfaces, validate cross-tenant denial and platform-admin separation, and stop for human review before Phase 3.

Dependency remediation and the identified security hardening items require separately reviewed, scope-appropriate changes; this audit did not implement them.

## Phase 1 Change Boundary And Rollback

Only these documentation files are part of Phase 1:

- `docs/CURRENT_STATE.md`
- `docs/PHASE_1_CURRENT_STATE_AUDIT.md`
- `docs/codex-handoffs/PHASE_1_CHECKPOINT.md`

No dependencies, lockfiles, Firebase resources, Cloudflare/DNS settings, Docker/Nginx configuration, GitHub Actions or production systems were changed. Rollback is documentation-only: restore these three files from Git or the pre-audit backup at `C:\Users\thugs\.codex\tmp\shiftoryx-phase1-audit-20260721`. Do not touch the pre-existing untracked `firestore-debug.log`.
