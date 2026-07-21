# ShiftOryx Phase 1 Current-State Audit

Audit date: 21 July 2026
Branch: `shiftoryx-phase-1-current-state-audit`
Baseline: `ba07ffa83cac5ba08209a6b1c35e79be987e0690`
Verdict: `PHASE_1_READY_FOR_REVIEW`

## 1. Executive Summary

ShiftOryx has a functioning tenant-aware scheduling pilot, not a finished multi-tenant SaaS product. The repository contains a shared React/Vite frontend, tenant-scoped Firestore repositories, membership-based authorization, sanitized public snapshots, a deterministic scheduler, exports, a private PDF archive foundation and a short-lived auth broker. The target registration, wildcard-domain, subscription, lifecycle, business-template, customization, monitoring and backup architecture is mostly absent or only documented.

The audit found one critical dependency advisory, no demonstrated high-severity application finding, several medium rollout/enforcement gaps and lower-severity hygiene issues. The most important application finding is dormant: enabling `VITE_ENABLE_TENANT_GATE` would redirect anonymous employees away from the tenant public schedule because the public-route bypass is applied only outside tenant mode. The most important privacy defense-in-depth finding is that public schedule rules accept any nested array entries; the current sanitizer is narrow, but rules do not independently enforce that shape.

Cross-tenant private access is meaningfully protected by identity plus an active matching membership in application code and Firestore/Storage rules. Platform-admin status is separate from BP Kallis ownership. New tenant provisioning creates `OWNER`, while readers/rules and a legacy seed still accept/create `ADMIN` or `MANAGER`; live role inventory is unknown and is the correct Phase 2 scope.

The business-category/template architecture in the Phase 1 brief is not implemented and is not yet represented in the master roadmap. It is recorded as `ROADMAP_DELTA_PENDING_SYNC`. The current UI is one hard-coded legacy presentation; no unsafe tenant HTML/JavaScript/CSS execution facility was found.

No runtime fixes, dependency updates, lockfile changes, Firebase/Cloudflare/DNS actions, deployment, commit or push were performed.

## 2. Scope

The audit covered repository evidence at the baseline commit and local dependency installation:

- canonical product, architecture, security, deployment and runbook documentation;
- all frontend entry points, routing, auth pages, route guards and tenant resolution;
- repositories, Firebase services, paths, schema and Zustand state orchestration;
- Firestore and Storage rules;
- all Cloud Functions and privileged scripts;
- scheduler engine, adapter, persistence flow and QA;
- public sanitization, identifiers, exports and private archive;
- template/branding readiness;
- Docker, Compose, Nginx, Vercel and GitHub workflow configuration;
- monitoring, backup and HomeOps references;
- tests, dependency graphs, registry advisories, install scripts and native binaries;
- tracked secret indicators with values suppressed.

Out of scope by instruction:

- production, Firebase console, Cloudflare, DNS, homelab SSH and live URL access;
- reading or changing `firestore-debug.log` or local `.env` files;
- changing rules, Functions, dependencies, tests, runtime code or deployment configuration;
- Phase 2 implementation or any later roadmap phase.

## 3. Methodology

Passes A through P were completed in order. Documentation was used for target direction and operational claims; only source, rules, tests and version-controlled configuration were treated as implementation evidence. Every major area was classified as `IMPLEMENTED`, `PARTIAL`, `MISSING`, `LEGACY`, `RISKY` or `UNKNOWN_REQUIRES_AUDIT`.

Severity means demonstrated or reasonably reachable impact:

- `CRITICAL`/`HIGH` only for serious evidence-backed impact;
- `MEDIUM` for material enforcement, privacy or rollout gaps;
- `LOW` for constrained exposure or defense-in-depth weaknesses;
- `INFORMATIONAL` for missing future features or non-security drift.

Safe validation used existing commands only. Commands that could install tools through `npx --yes`, deploy, read live data or use an unknown local Firebase configuration were not run. Playwright used a local Vite process with Firebase variables explicitly blank.

The persistent checkpoint was updated after every pass at `docs/codex-handoffs/PHASE_1_CHECKPOINT.md`.

## 4. Git And Repository State

Safety-gate results at audit start:

```text
branch: shiftoryx-phase-1-current-state-audit
HEAD: ba07ffa83cac5ba08209a6b1c35e79be987e0690
origin/main: ba07ffa83cac5ba08209a6b1c35e79be987e0690
merge-base HEAD origin/main: ba07ffa83cac5ba08209a6b1c35e79be987e0690
relationship: HEAD == origin/main == merge-base
remote: https://github.com/spandreou/GasStationProject.git
starting worktree: only ?? firestore-debug.log
```

The expected merged Phase 0 commit `ba07ffa` was present. The branch was not `main`. A pre-edit backup of `docs/CURRENT_STATE.md` was created outside the repository at:

```text
C:\Users\thugs\.codex\tmp\shiftoryx-phase1-audit-20260721\CURRENT_STATE.md
```

The existing `firestore-debug.log` was never read, edited, deleted, staged or copied into documentation.

## 5. Stack Inventory

| Item | Repository evidence | Current state |
| --- | --- | --- |
| Frontend | `package.json:35-57` | React/ReactDOM declared `^19.1.0`; installed `19.2.4`; Vite declared `^8.0.16`; installed `8.0.16` |
| Firebase web SDK | `package.json:39`; lockfile | declared `^11.7.0`; installed/locked `11.10.0` |
| State | `package.json:47`; `src/hooks/useSchedulerStore.js` | Zustand declared `^5.0.4`; installed `5.0.11`; one large store |
| Styling | `package.json:55`; `tailwind.config.js` | Tailwind 3.x, PostCSS, Autoprefixer; no forced major migration |
| Drag/drop | `package.json:35-36` | dnd-kit core/utilities |
| Visual runtime | `package.json:42-46`; `src/components/background/Hyperspeed.jsx` | lucide-react, Three.js, postprocessing |
| Exports | `package.json:37-41`; `src/utils/exportService.js` | `@e965/xlsx`, `docx`, `html2canvas`, `jspdf`, embedded Roboto font |
| TypeScript | `src/scheduler-engine/*.ts` | scheduler engine only; most critical runtime remains JS/JSX; no `tsconfig` |
| Tests | `package.json:9-21`; `tests/*.spec.js` | Node validators/stress tests, Firebase emulator scripts, Playwright; no Vitest/Jest |
| Package manager | both `package-lock.json` files | npm, lockfile version 3 |
| Node | `Dockerfile:1`; `functions/package.json` | Docker build Node 22; Functions declares Node 20 |
| Functions | `functions/package.json` | `firebase-admin ^13.6.0`, `firebase-functions ^6.6.0`, v2 APIs, JS/ESM |
| Runtime | `Dockerfile:35-45`; `nginx.conf` | Nginx 1.27 Alpine, port 8080, root healthcheck |
| Firebase config | `firebase.json` | Firestore/Storage rules, Functions source and local emulators; `.firebaserc` absent |

Available build/QA/security commands are defined at `package.json:7-32`. The root lock contains 289 dependency entries by npm audit metadata; Functions contains 253. Install scripts exist in `@firebase/util`, `core-js`, `esbuild`, `fsevents` and `protobufjs`. Optional native packages include platform builds for esbuild, Rolldown and Lightning CSS plus fsevents.

## 6. Classification Summary And Evidence Table

| Classification | Count |
| --- | ---: |
| `IMPLEMENTED` | 7 |
| `PARTIAL` | 14 |
| `MISSING` | 10 |
| `LEGACY` | 1 |
| `RISKY` | 6 |
| `UNKNOWN_REQUIRES_AUDIT` | 1 |
| **Total** | **39** |

| Area | Classification | Current behavior | Target behavior | Evidence | Gap | Risk | Recommended phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Product identity/docs | `PARTIAL` | ShiftOryx target documented; runtime still carries legacy product text | Consistent ShiftOryx product with compatibility identifiers only where required | `AGENTS.md`; roadmap; `CentralLandingPage.jsx` | Runtime branding and stale roadmap next action | Informational | Phase 4/6 UI work |
| Stack/build | `IMPLEMENTED` | React/Vite build succeeds; shared Nginx artifact | Supported shared frontend | `package.json`; `Dockerfile`; build PASS | Large chunks only | Low | Ongoing |
| TypeScript direction | `PARTIAL` | Scheduler engine is TS; most critical code JS/JSX; no tsconfig | New/modified critical modules in TS | `src/scheduler-engine`; no `tsconfig*` | Gradual migration not established globally | Low | Each owning phase |
| Root routing | `PARTIAL` | Ad-hoc pathname routing; some auth/placeholder routes | `/login`, `/register`, `/stores`, `/admin`, tenant routes | `src/App.jsx` | `/register`, `/stores`, `/admin` missing | Operational | Phases 3-5/9 |
| Hostname resolution | `RISKY` | Any subdomain of configured base becomes a tenant slug; unknown host falls through | Reserved/root rejection and safe unknown page | `tenantHostContext.js:10-41`; `App.jsx` | No reserved/lifecycle-aware resolver or safe unknown page | Medium rollout | Phase 6 |
| TenantGate | `RISKY` | Tenant public `/`/`/app` are gated when flag is enabled | Anonymous public tenant view bypasses owner gate | `TenantGate.jsx:20-70` | Public/owner routing combined incorrectly | Medium | Phase 5/6 |
| Firebase auth/reset | `IMPLEMENTED` | Login/logout, persistence choice, generic reset request, verified reset flow | Secure owner auth | auth pages/services | No registration route | Low | Phase 3 |
| Auth broker | `PARTIAL` | Hashed 60-second, one-time ticket and custom-token exchange | ShiftOryx exact-origin shared auth bridge | `functions/src/index.js:103-258`; `authBrokerCore.js:3` | Legacy origins, no App Check/rate limit, Docker flags missing | Medium rollout | Phase 5/6 |
| Tenant memberships | `PARTIAL` | `{uid}_{tenantId}`, ACTIVE, OWNER/ADMIN/MANAGER readers; provisioning OWNER | OWNER-only writes/readers after migration | `tenantAuthorization.js:1-35`; `provision-tenant.mjs:205-226` | Legacy roles and live values unknown | Medium | Phase 2 |
| Cross-tenant private access | `IMPLEMENTED` | UID + exact tenant membership enforced in services/rules | Same | tenant access service; rules | Emulator not rerun locally | Low residual | Phase 2 validation |
| Platform admin | `PARTIAL` | Separate `platformAdmins/{uid}`; client writes denied | Server-managed audited ShiftOryx Admin | rules/runbook/bootstrap | Rules check ACTIVE but not SUPER_ADMIN role; client tenant lifecycle writes allowed to platform admin | Medium future | Phase 9 |
| `users` | `PARTIAL` | Self read; platform-admin management foundation | Provisioned profile lifecycle | `firestore.rules:579-585` | No registration/provisioning flow | Informational | Phase 3/4 |
| `tenants` | `IMPLEMENTED` | Tenant records/repository and active lookup exist | Tenant lifecycle record | tenant repository/rules | Full lifecycle panel absent | Informational | Phase 4/8/9 |
| `registrationTokens` | `MISSING` | No target collection/function/UI | Privileged single-use registration tokens | repository/rules search | Entire workflow absent | Informational | Phase 3 |
| Slug reservations/aliases | `MISSING` | No collections or transaction | Atomic reservation and audited aliases | repository/rules search | Entire workflow absent | Operational | Phase 4/11 |
| `platformAuditLogs` | `MISSING` | Tenant client audit logs only | Server-authored platform audit trail | schema/rules search | No platform audit collection | Medium future | Phase 9 |
| `customizationRequests` | `MISSING` | No data/UI/function | Authenticated paid quote workflow | repository search | Entire workflow absent | Informational | Phase 12 |
| Tenant private repositories | `IMPLEMENTED` | Core scheduler data tenant-scoped behind repositories/services | Tenant-scoped operations | `src/repositories`; `src/firebase`; path helper | Some manual schema validation only | Low | Ongoing |
| `subscription/current` | `PARTIAL` | Read repository and rules; unused; owner can write status | Server-owned entitlements | subscription repository; rules `691-695` | No enforcement; wrong trust boundary/status vocabulary | Medium | Phase 7 |
| `usage/daily` | `MISSING` | No collection | Server-generated usage/limits | search | Missing | Informational | Phase 7 |
| Public snapshots | `PARTIAL` | Sanitized client-produced collections and anonymous reads | Strict schema, owner preview, server-safe production | `publishedScheduleService.js`; public rules | Nested arrays not rule-validated; IDs correlated | Medium | Phase 10/security hardening |
| Public statuses/notes | `MISSING` | Absences and generic notes remain private | Narrow statuses plus explicit `publicNote`/`privateNote` | sanitizer/search | No fields, preview or leakage tests | Informational | Phase 10 |
| Firestore rules overall | `RISKY` | Default deny and membership scoping; several future trust gaps | OWNER/lifecycle/server boundaries | `firestore.rules` | Public nested maps, client subscription, tenant status omission, legacy private root access | Medium | Phases 2/7/9/10 |
| Storage rules | `IMPLEMENTED` | Exact tenant PDF path, membership, PDF type, <10 MiB, default deny | Private scoped assets/archives | `storage.rules` | No lifecycle/retention | Low | Phase 7/13 |
| Cloud Functions | `PARTIAL` | Three auth-broker functions only | Registration, provisioning, lifecycle, audit, entitlements, notifications | `functions/src/index.js` | Most privileged workflows absent | Operational | Phases 3-12 |
| Zustand isolation | `PARTIAL` | Listener cleanup and core reset; some residual UI/rules state | Domain slices and complete tenant reset | `useSchedulerStore.js` | Residual state and async auth race | Low | Gradual refactor |
| Scheduler | `IMPLEMENTED` | Deterministic constraint engine, warnings, manual overrides | Preserve current scheduler guarantees | `src/scheduler-engine`; adapter; QA | Compatibility role mapping; warnings do not block persistence | Low | Preserve in all phases |
| Exports/archive | `PARTIAL` | Admin-only client exports and private flagged archive | Entitlement-aware, server-audited lifecycle | export/archive services/rules | Client audit, no failed-event/retention/cleanup | Low/Medium future | Phase 7/13 |
| Category templates/branding | `MISSING` | One hard-coded visual preset | Typed/versioned category templates and safe overrides | Tailwind/App/landing searches | No schema/registry/catalog/assets/migrations | Product | Phases 4/8/9 |
| ShiftOryx wildcard domains | `MISSING` | Legacy homelab defaults; target docs only | One wildcard shared deployment | Docker/Compose/resolver/docs | DNS/origins/cutover absent | Operational | Phase 6 |
| Docker/Nginx deployment | `PARTIAL` | Shared container, healthcheck, restart policy, SPA/cache | Versioned hardened shared deployment | Docker/Compose/Nginx | Missing gate/broker args, version metadata, CSP/HSTS at current origin, automated rollback | Medium rollout | Phase 6/13 |
| Monitoring/HomeOps | `MISSING` | No runtime integration | Sanitized health and aggregate-only ingestion | repository search | No endpoints/alerts/metrics publisher | Operational | Phase 14 |
| Backup/restore | `MISSING` | No repository automation or drill evidence | Encrypted scheduled backup and tested tenant restore | repository search/docs | No RPO/RTO/retention/tooling | Operational | Phase 13 |
| Tests/QA | `PARTIAL` | Strong scheduler helpers; many source-string checks; emulator suites exist | Behavior/emulator/E2E coverage for all critical flows | `scripts`; `tests`; workflow | Major future flows and semantic guard cases missing | Medium regression | Each phase |
| Dependencies/supply chain | `RISKY` | Reproducible locks but active advisories and unpinned CI elements | Clean high/critical gate and reviewed supply chain | npm audits; workflow | Critical root advisory; Functions audit; runtime-fetched scanners | Critical dependency | Pre-beta hardening |
| Secret/debug hygiene | `RISKY` | No tracked high-confidence secret; debug log unignored | Secret-safe tracked/build context | redacted scan; ignores | `firestore-debug.log` may enter commit/build context | Medium | Immediate approved hardening |
| Live infrastructure/data | `UNKNOWN_REQUIRES_AUDIT` | No production access in Phase 1 | Controlled evidence of live roles/rules/domains/backups/version | Phase boundary | Cannot prove live state | Unknown | Phase 2 inventory and deployment phases |
| Firebase Analytics/privacy | `RISKY` | Auto-initializes with configured app in supported browser | Explicit approved/consented telemetry policy | `src/firebase/config.js:82-94` | No separate gate/consent; live config unknown | Medium privacy review | Phase 13/14 or approved review |
| Legacy identifiers/root models | `LEGACY` | Legacy names, roles and locked/root compatibility collections remain | Compatibility only until migrated | rules, runbooks, seed, UI text | Drift/confusion; conditional legacy-data exposure | Low/Medium | Phase 2 and owning phases |

## 7. Frontend And Routing

`src/main.jsx` mounts `App`; `src/App.jsx` implements pathname conditionals rather than a router library. Implemented paths are:

- `/login`
- `/forgot-password`
- `/reset-password`
- `/select-tenant`
- `/request-token` placeholder
- `/admin-console` placeholder
- `/app`
- `/` central landing only when hostname mode is `central`; otherwise scheduler dashboard

Target `/register`, `/stores` and `/admin` are absent. The placeholder `/admin-console` text references a custom `SUPERADMIN` claim even though the implemented model uses `platformAdmins/{uid}`; it has no privileged data or actions.

`resolveTenantHostContext` uses `VITE_PUBLIC_APP_BASE_DOMAIN`, `VITE_CENTRAL_PORTAL_DOMAIN` and `VITE_DEFAULT_TENANT_SLUG` (`src/utils/tenantHostContext.js:10-12`). Localhost uses the default tenant, the exact central host becomes `central`, any other subdomain becomes `tenant`, and unrelated hosts become `unknown` (`tenantHostContext.js:14-42`). The unknown mode is not given a safe route; `App` falls through to the dashboard and downstream access handling fails later. Reserved slugs, canonical tenant domains, lifecycle status and aliases are not resolved at the host layer.

Classification: `PARTIAL` routing and `RISKY` host resolution.
Security impact: hostname alone does not grant Firestore access, so this is not an authorization bypass.
Operational impact: unknown/suspended/expired domains do not produce the target deterministic lifecycle pages.
Severity: `MEDIUM` for Phase 6 rollout readiness.

### TenantGate required finding

The public bypass is:

```js
(hostContext.mode !== 'tenant' && isPublicTenantRoute(routePath)) ||
(isAuthBrokerEnabled && Boolean(authTicket))
```

Evidence: `src/components/auth/TenantGate.jsx:20-31,61-70`.

Consequences when `VITE_ENABLE_TENANT_GATE=true`:

- on a tenant hostname, `/` and `/app` do not bypass the gate even though they are anonymous public schedule routes;
- an unauthenticated employee is redirected to central login;
- public viewing and OWNER-private authorization are incorrectly combined;
- `/login`, `/forgot-password` and `/reset-password` are likewise only treated as public when mode is not `tenant`;
- an auth-ticket fragment bypasses while the broker flag is enabled.

The issue is dormant in the checked-in default because `.env.example` sets the gate false and Docker does not pass the flag at all. It becomes active during a gate rollout. It is `MEDIUM`, not `HIGH`, because current public data is not exposed and the present failure mode is loss of intended anonymous access.

## 8. Authentication And Authorization

Firebase Auth supports password sign-in, local/session persistence selection, sign-out, reset-email requests, reset-code verification and password confirmation. Forgot-password output is generic, limiting enumeration. Password and email input lengths are bounded. Reset success removes the `oobCode` URL and returns to login.

Tenant private access follows:

```text
hostname context
  + Firebase authenticated uid
  + tenants/{tenantId}
  + tenantMemberships/{uid}_{tenantId}
  + matching uid/tenantId
  + ACTIVE status
  + accepted tenant role
```

`resolveTenantAdminAuthorization` explicitly checks user, tenant, membership, UID, tenant ID, status and role (`src/services/tenantAuthorization.js:18-35`). `verifyTenantAccessForHost` loads the tenant and membership; hostname is context, not proof.

The auth broker is well-shaped but not production-complete. Core validation rejects non-HTTPS production targets, credentials in URLs, central-domain returns, unknown tenants and path traversal. Tickets are 32 random bytes, stored by SHA-256 hash, expire in 60 seconds, and are consumed transactionally before a custom token is minted. Ticket/client token values are not logged. Missing controls include App Check, rate limiting/abuse budgets and ShiftOryx wildcard exact-origin derivation.

## 9. Tenant Memberships

Target document IDs are implemented: `tenantMemberships/{uid}_{tenantId}`. Fields include `uid`, `tenantId`, `email`, `role`, `status` and timestamps. Client create/update/delete is denied at `firestore.rules:589-603`.

Current role state:

- `scripts/provision-tenant.mjs:205-226` writes `OWNER` only.
- `src/services/tenantAuthorization.js:3`, Firestore rules and Storage rules accept `OWNER`, `ADMIN`, `MANAGER`.
- `scripts/seed-bp-kallis-tenant.mjs:18,37` defaults to `ADMIN` and accepts an unvalidated role argument.
- no new application membership UI exists.

No tenant can be read privately without a matching active membership under current rules. Cross-tenant queries are constrained because tenant records themselves require a membership and private subcollections use the path tenant ID in the membership predicate.

Live membership role/status inventory was not accessed and is `UNKNOWN_REQUIRES_AUDIT`. Phase 2 must inventory before narrowing readers/rules; directly removing legacy roles could lock out the pilot.

## 10. Platform Admin

The compatibility data role is `SUPER_ADMIN`, stored separately in `platformAdmins/{uid}`. Bootstrap tooling validates `SUPER_ADMIN`/`ACTIVE`; tenant ownership never creates that record. Firestore denies client writes to `platformAdmins` and allows an admin to read its own platform-admin record.

Gaps:

- the common `isPlatformAdmin` rule checks active status but does not also require `role == SUPER_ADMIN` or validate the record's UID field;
- active platform admins may client-write `users` and `tenants`; future lifecycle changes are therefore not yet server-confirmed/audited;
- legacy root `employee_absences_private` is readable/writable by platform admin. If live records exist, that conflicts with the target separation where platform administration does not imply tenant operational access;
- the current `/admin-console` is a placeholder.

BP Kallis `OWNER` membership does not grant platform-admin access. Classification: `PARTIAL`; current separation is real, while privileged lifecycle enforcement is deferred to Phase 9.

## 11. Repositories And Firestore Schema

UI components and the Zustand store use repository exports and Firebase domain services. No direct Firestore SDK calls were found in components. Tenant paths pass through `src/utils/tenantDataPaths.js`, which restricts tenant IDs to lowercase alphanumeric/hyphen values and allowlists tenant collection names.

Writes use `setDoc`, `addDoc`, `updateDoc`, `deleteDoc`, listeners, batches and the auth-ticket transaction. `commitBatchChunks` prevents batch-size overflow but multiple chunks are not globally atomic. Validation is manual plus Firestore rules; no schema-validation library exists.

### Platform collections

| Target collection | State | Evidence/notes |
| --- | --- | --- |
| `users` | `PARTIAL` | rules/profile foundation; no registration lifecycle |
| `tenants` | `IMPLEMENTED` | repository, rules and tenant access lookup |
| `tenantMemberships` | `IMPLEMENTED` with legacy role compatibility | matching ID/path and read boundary |
| `platformAdmins` | `PARTIAL` | record/bootstrap/rules, no admin UI/server lifecycle |
| `authTickets` | `IMPLEMENTED` foundation | Functions-only writes; client deny |
| `registrationTokens` | `MISSING` | no collection, rules, functions or UI |
| `slugReservations` | `MISSING` | no collection/transaction |
| `slugAliases` | `MISSING` | no collection/resolver |
| `platformAuditLogs` | `MISSING` | only tenant client audit logs |
| `customizationRequests` | `MISSING` | no schema/workflow |

### Tenant-private collections

| Target collection | State | Evidence/notes |
| --- | --- | --- |
| `employees` | `IMPLEMENTED` | tenant service/repository/rules |
| `shifts` | `IMPLEMENTED` | tenant service/repository/rules |
| `shiftTemplates` | `IMPLEMENTED` | tenant service/repository/rules |
| `absences` | `IMPLEMENTED` | private only; structured range/scope/replacement |
| `settings` | `IMPLEMENTED` | scheduler settings |
| `announcements` | `IMPLEMENTED` | private source plus sanitized public copy |
| `weekHistory` | `IMPLEMENTED` | snapshots/history |
| `auditLogs` | `IMPLEMENTED` with client trust limitation | create/read by tenant admin; immutable afterward |
| `subscription/current` | `PARTIAL` | read repository and owner-writable rules; unused |
| `usage/daily` | `MISSING` | no implementation |

Additional implemented compatibility collections include `attendanceHistory`, `weekLocks` and `weekTemplates`. Tenant `tokenRequests` is an old non-secret request model, not the privileged `registrationTokens` target.

### Tenant-public collections

| Target collection | State | Evidence/notes |
| --- | --- | --- |
| `publicSchedules` | `IMPLEMENTED` with rule validation gap | client sanitizer and anonymous listener |
| `publicMonths` | `IMPLEMENTED` with rule validation gap | client sanitizer and anonymous listener |
| `publicEmployees` | `IMPLEMENTED` with correlated ID | restricted fields; private doc ID reused |
| `publicAnnouncements` | `IMPLEMENTED` | title/body only |
| `publicStatusEntries` | `MISSING` | Phase 10 target only |

## 12. Firestore And Storage Rules

### Confirmed controls

- global catch-all is default deny;
- anonymous reads are allowed only on tenant `publicEmployees`, `publicSchedules`, `publicMonths` and `publicAnnouncements` (`firestore.rules:617-712`);
- private tenant reads/writes use an active matching membership;
- `tenantMemberships`, `platformAdmins` and `authTickets` deny client writes;
- `registrationTokens` are absent and therefore catch-all denied;
- legacy root scheduler collections are denied, except separately handled legacy private absences for platform admins;
- tenant audit logs deny update/delete;
- Storage defaults deny and restricts archives to exact tenant/year-month/file paths, authenticated matching membership, PDF MIME and less than 10 MiB.

### Gaps

1. Public schedules/months require `shifts is list` but do not validate each nested entry (`firestore.rules:306,321,335,351`). A malicious or regressed authorized client could write extra nested fields to an anonymously readable document. Current sanitizer does not do so, so this is a `MEDIUM` boundary gap, not proof of current leakage.
2. Tenant admins can create/update their own `subscription/{id}` (`firestore.rules:691-695`). Future access/entitlement status cannot trust this field until server ownership is enforced. `MEDIUM` future enforcement impact.
3. Tenant `status` is not checked by the membership predicate. Suspending a tenant document alone does not revoke an active member. `MEDIUM` lifecycle gap.
4. Platform-admin predicate validation and legacy private-absence access are broader than the target. `MEDIUM` if legacy data exists, otherwise conditional.
5. Rules and Storage retain `ADMIN`/`MANAGER` compatibility (`firestore.rules:9`; `storage.rules:6`). This is intentional until Phase 2 inventory.

An owner cannot access another tenant without another active matching membership. Hostname does not influence Firestore rule authorization.

## 13. Firebase Functions

Only three v2 Functions exist:

| Entry point | Authentication/authorization | Input validation | Writes/transaction | Logs/errors/tests |
| --- | --- | --- | --- | --- |
| `createAuthTicket` (`functions/src/index.js:103`) | authenticated; exact central origin; active target tenant and membership | tenant ID, `returnTo`, origin and allowed tenant | hashed `authTickets` document; no transaction needed for create | no raw ticket log; generic callable errors; core + emulator tests |
| `exchangeAuthTicket` (`functions/src/index.js:169`) | callable from exact allowed tenant origin; membership rechecked | 64-hex ticket and stored return host/origin | Firestore transaction consumes once; mints Firebase custom token | replay/expiry/error cases in emulator suite |
| `cleanupAuthTickets` (`functions/src/index.js:242`) | scheduled service execution | cutoffs only | batch deletes used/expired tickets older than retention | no private payload logs |

Implemented privileged capabilities: auth ticket create/exchange, custom token minting, ticket cleanup.

Missing privileged capabilities: registration tokens, atomic tenant/trial provisioning, slug reservation, platform lifecycle/admin changes, server-side subscription enforcement, server-side audit triggers and customization notifications. Platform-admin bootstrap and tenant provisioning are local trusted scripts, not deployed Functions. No HTTP Function, Auth trigger, Firestore trigger, secret binding, App Check enforcement or application rate limiting exists.

Functions use JS/ESM and Node 20, while the target direction is TypeScript and Node 22. Classification: `PARTIAL`.

## 14. State Management

`src/hooks/useSchedulerStore.js` is one Zustand store spanning auth, employees, shifts, templates, absences, announcements, analytics, history, public snapshots and UI state. It has no Zustand persistence middleware and does not persist tenant data to local/session storage.

Positive isolation behavior:

- each listener is unsubscribed before replacement;
- component cleanup stops listeners;
- denial/logout stops private subscriptions and clears core private arrays and admin identity;
- public subscriptions use only sanitized collections;
- selecting another tenant from the central flow performs full-origin navigation, normally reloading memory;
- monthly archive UI is cleared when admin mode ends.

Residual risk:

- generator rules, special-day data, undo payload/message, some selection/week-lock/UI state are not fully reset;
- auth subscription callbacks are asynchronous without a generation/version token, allowing a narrow stale-result race after rapid sign-out/account change;
- `cleanupData` primarily unsubscribes and is not a universal state reset;
- no same-page tenant switch exists today, limiting practical cross-tenant stale-data reachability.

Severity: `LOW`; classification: `PARTIAL`. No private cross-tenant render was demonstrated.

## 15. Scheduler Engine

The scheduler is `IMPLEMENTED` and must be preserved during SaaS migration.

Evidence:

- pure TypeScript modules under `src/scheduler-engine`;
- exact base-role resolution with warnings for missing/duplicate roles;
- deterministic date/week/Sunday selection and stable sorting;
- weekly core-side rotation and flex-side behavior;
- fixed day off, availability, absence scope and replacement modes;
- extras in substitute/seasonal/disabled modes;
- Sunday 08:00-20:00 assignment and consecutive-Sunday warning;
- coverage validation, duplicate shift checks, core/intermediate prohibition and unresolved-gap warnings;
- JS adapter maps application data and preserves `isManualOverride` entries (`schedulerEngineAdapter.js:221-313`);
- store persists generated shifts, records audit metadata, refreshes snapshots and surfaces warnings;
- scheduler stress and integration QA passed.

The engine's technical roles are `CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B`, `EXTRA_A`, `EXTRA_B`. Application business labels `intermediate` and `custom` are mapped to `FLEX_*` and `EXTRA_*`; they are not first-class engine enum values. These scheduling roles are never used as authentication roles.

Generation writes schedules even when warnings/validation violations exist, but those warnings are delivered to the owner UI and the engine result retains `validation.valid`; the system does not silently claim an invalid schedule is valid. Owners remain free to manually override.

## 16. Public And Private Data Boundaries

The current public producer is `src/firebase/publishedScheduleService.js`.

Public schedule/month entries include only:

- employee display name;
- date, start and end time;
- work type, display label and shift type.

The producer filters non-work/rest/leave/sick/absence tokens (`publishedScheduleService.js:36-60`) and omits employee ID, shift ID, notes, absence reason, replacement detail, contact data, UID and audit/archive metadata from each public shift (`:63-74`). Public employees include `tenantId`, `fullName`, role, color and active state (`:127-135`). Public announcements include title/body only.

Private data that remains owner-only includes AFM, phone, email, hire date, generic notes, private shift/absence data, created/updated identities, memberships, audit logs and archives.

`publicNote`, `privateNote` and public status labels are not implemented. The generic `notes` field is not published. Phase 10 must introduce explicit field separation, owner preview, schema/rule validation and leakage tests; it must not reinterpret current notes automatically.

## 17. Public Employee Identifiers

Required provisional finding confirmed.

Producer path:

1. private employees are created with Firestore `addDoc`, yielding random document IDs (`src/firebase/employeeService.js:37-48`);
2. `publishPublicEmployees` copies each `employee.id` to the `publicEmployees` document ID (`publishedScheduleService.js:253-272`);
3. anonymous subscription uses `toDataWithId`, returning the public document ID as `id` (`:177-188`; `firestoreCore.js:117`);
4. public dashboard maps display names to those IDs for client-side analytics (`MainDashboard.jsx:465-491`).

The public employee payload itself does not contain private fields. Firestore rules allow anonymous reads of `tenants/{tenantId}/publicEmployees/{employeeId}` but still require a matching active membership for `tenants/{tenantId}/employees/{employeeId}`. Knowing the ID does not grant a private read.

The ID is normally a random Firestore auto-ID, not a predictable identifier or secret. Demonstrated impact is stable correlation between public and private document namespaces and disclosure of an internal record key. An opaque public ID or public-only stable key is preferable to reduce coupling and future correlation risk.

Classification: `PARTIAL`; severity: `LOW`. It is not `HIGH` because there is no authorization bypass or private field disclosure.

## 18. Exports

Exports are client-generated:

- PDF: jsPDF and embedded Roboto font;
- Excel: `@e965/xlsx`;
- Word: `docx`;
- WhatsApp: plain-text clipboard summary;
- private monthly archive: PDF Blob uploaded through Firebase Storage.

Authorization:

- export controls render in admin branches;
- `createExportAuthorization` requires `isAdmin` plus an authenticated UID (`MainDashboard.jsx:855-865`);
- active/legacy export helpers require the authorization object and an audit callback;
- underlying private data and archive blobs remain protected by Firestore/Storage membership rules.

Data:

- owner PDF intentionally includes employee AFM, name, schedule and work/rest/absence category; it is private output;
- Excel/Word/WhatsApp include names and schedule times;
- generic shift notes and absence reasons are not exported by the active schedule table;
- filenames are derived from validated dates/months, not user-controlled path fragments.

Archive:

- exact path: `tenants/{tenantId}/monthly_schedule_pdfs/{YYYY-MM}/program_month_{YYYY-MM}.pdf` (`monthlyScheduleArchiveService.js:42-51`);
- no `getDownloadURL`, public URL or signed URL exists; download uses authenticated `getBlob` (`:115-124`);
- Firestore metadata path/name must match tenant and month;
- feature flag defaults false.

Gaps:

- export/audit records are created by the client and cannot prove completeness;
- failed exports are not logged, and archive download logs `SUCCESS` before blob retrieval;
- no archive retention, delete, cleanup or restore policy;
- no subscription/feature entitlement enforcement;
- helpers retain a fallback tenant `bp-kallis`, though rules prevent access without membership.

Current severity is `LOW`; future paid/compliance use raises the audit and entitlement gaps to `MEDIUM`. Classification: `PARTIAL`.

## 19. Template And Branding Readiness

Current styling is hard-coded, not tenant-configurable or category-template ready:

- one Tailwind `brand` palette in `tailwind.config.js`;
- static dark/light and glass styles;
- one Hyperspeed/road background;
- legacy GasStation/BP/HomelabShare product text and mail links;
- employee color fields affect shift display but are not tenant branding;
- no logo/background asset record per tenant;
- no CSS-variable token layer or template selector.

No `businessCategory`, UI `templateId`, `templateVersion`, `brandingOverrides` or `customizationMode` exists in tenant schema, rules, repositories or UI. No registry, preview, catalog, assignment, fallback, asset validation or template migration mechanism exists.

The architecture still offers a useful foundation: one shared component tree, one deployment and configuration-driven environment boundaries. It can evolve safely without tenant forks if the future design uses:

- a typed, versioned central template registry;
- category-to-default-template mapping;
- validated, allowlisted design tokens and approved layout variants;
- safe Storage asset types/sizes and server-controlled references;
- deterministic fallback and version migration;
- no executable tenant content.

No `dangerouslySetInnerHTML`, arbitrary tenant HTML/JavaScript, external script/embed or unrestricted CSS injection path was found. Classification: `MISSING` for template architecture, with no current executable-theme vulnerability.

The canonical master roadmap does not yet include this approved template model: `ROADMAP_DELTA_PENDING_SYNC`. This is documentation staleness, not a runtime vulnerability.

## 20. Domain And Tenant Resolution

Checked-in defaults remain:

```text
base domain: homelabshare.gr
central domain: gas.homelabshare.gr
default tenant: bp-kallis
```

Target `shiftoryx.gr` and `*.shiftoryx.gr` appear in documentation, not runtime configuration. The resolver could accept another base/central domain through build-time values, but it has no reserved slug list, alias lookup, canonical-domain validation or safe lifecycle response.

Auth broker Functions use exact origin allowlists and legacy base-domain derivation, not wildcard CORS. This is positive, but Phase 6 must derive exact active tenant origins for ShiftOryx and keep the legacy pilot available as rollback.

Firebase Authorized Domains, DNS ownership/configuration, wildcard record and Cloudflare route were not queried. They remain `UNKNOWN_REQUIRES_AUDIT` even though the authoritative product state says `PURCHASED_NOT_CONFIGURED`.

## 21. Docker And Deployment

Version-controlled current model:

```text
Docker build: Node 22 Alpine -> Vite build
Runtime: Nginx 1.27 Alpine
Container port: 8080
Documented homelab host port: 8085
Compose restart: unless-stopped
Healthcheck: HTTP GET of local root every 30 seconds
Deployment: manual pull of main + docker compose up -d --build
```

The repository supports one shared frontend service. It does not require a container per tenant, although the current image/container names retain BP Kallis compatibility.

Gaps:

- Dockerfile/Compose omit `VITE_ENABLE_AUTH_BROKER` and `VITE_ENABLE_TENANT_GATE`; setting them in server `.env` would not embed them in the build;
- image tag is static `gasstation-shift-manager:bp-kallis`, with no commit/version metadata or digest pin;
- base images and GitHub Actions use version tags, not immutable digests/SHAs;
- healthcheck proves only that static root responds, not Firebase/Functions readiness;
- Nginx has X-Content-Type-Options, X-Frame-Options, Referrer-Policy and Permissions-Policy, but no CSP or HSTS. `vercel.json` has CSP/HSTS, but Vercel is not the documented pilot runtime;
- no deployment automation, version endpoint or rollback script; rollback is a manual Git/image rebuild procedure;
- no tracked Cloudflare/Tunnel config.

No Docker production image was built or deployed. Live container/edge/version state is unknown.

## 22. Monitoring And HomeOps

No application monitoring integration is implemented. The repository has no:

- sanitized `/health` or version endpoint;
- readiness/dependency health check;
- Uptime Kuma configuration/API automation;
- Telegram/webhook alerting;
- HomeOps publisher;
- container/Firebase/Cloudflare metrics collector;
- deployment/backup status feed.

The only runtime health signal is the Nginx root Docker healthcheck. Uptime Kuma steps exist in a legacy provisioning runbook but are manual documentation, not configuration evidence.

HomeOps currently receives no ShiftOryx application data. The documented future boundary is appropriate: read-only uptime, aggregate counts, health, version and backup status only. Tokens, credentials, auth tickets, employee records, private notes, absence reasons and raw tenant payloads must never be sent.

Firebase Analytics is automatically initialized whenever Firebase is configured and the browser supports analytics (`src/firebase/config.js:82-94`). No custom `logEvent`, `setUserId` or user-property calls exist. Live measurement configuration, consent and actual collection are unknown; this needs an explicit privacy/config review before paid beta. No legal conclusion is made by this code audit.

## 23. Backup And Restore

Repository evidence contains no scheduled Firestore export, Storage backup, Docker/config backup job or per-tenant restore tool. There is no defined RPO/RTO, retention period, encryption verification, restore validation or recorded disaster-recovery drill.

Git protects source history and some runbooks mention provider snapshots/backup requirements, but that is not evidence that operational data is backed up. Week history and monthly PDF archives are product data/history, not disaster-recovery backups.

Unknowns requiring controlled operational evidence:

- Firebase backup/export configuration and retention;
- Storage/object versioning or backup;
- homelab/VPS snapshots and encryption;
- secret/config backup and access controls;
- tenant-selective restore feasibility;
- date/result of the last restore drill.

Classification: `MISSING` in repository, `UNKNOWN_REQUIRES_AUDIT` operationally. Phase 13 must prove restore, not just backup creation.

## 24. Testing And QA

### Coverage inventory

| Coverage target | Evidence type | Current result/gap |
| --- | --- | --- |
| Scheduler regressions | behavioral Node bundle/stress tests | strong; engine and adapter invariants pass |
| Tenant authorization helper | behavioral unit-style Node test | active/mismatched UID/tenant/status/role covered, including legacy roles |
| Cross-tenant rules | Firebase emulator integration script | meaningful coverage exists; not run because CLI absent |
| Auth-ticket replay/expiry/open redirect | core behavioral tests + emulator integration | core passed; emulator not run locally |
| Public sanitization | static source assertions + seeded Playwright | static passed; public UI Playwright passed |
| Export security | mostly source-string contract assertions | passed; limited actual output/leakage behavior coverage |
| Owner auth UI | seeded Playwright and static assertions | one auth UI spec passed |
| Absences UI/privacy | seeded Playwright | failed due stale hard-coded calendar dates, not backend denial |
| Tenant provisioning/platform admin | emulator integration scripts | exist; not run locally |
| Registration/subscription limits | none | missing implementation and tests |
| Category templates/branding | none | target absent |

Many `validate-*` scripts read source and assert string presence/absence. They are useful architecture contracts but not semantic proof. The SaaS foundation validator demonstrates the limitation: it checks that `PUBLIC_TENANT_ROUTES` and gate code exist, yet does not execute the expression that breaks tenant public routes.

### Exact validation results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run build` | `PASS` | 1,947 modules; chunk-size warnings only |
| `npm run qa:scheduler-engine` | `PASS` | behavioral scheduler stress QA |
| `npm run qa:scheduler` | `PASS` | scheduler rules plus another production build |
| `npm run qa:repositories` | `PASS` | source boundary contract |
| `npm run qa:public-readonly` | `PASS` | sanitizer/rules/UI source contract |
| `npm run qa:tenant-authorization` | `PASS` | behavioral authorization helper |
| `npm run qa:saas-foundation` | `PASS` | mixed helper behavior and source assertions |
| `npm run qa:auth-broker` | `PASS` | core behavior plus source contracts |
| `npm run qa:export-security` | `PASS` | source/rules contracts |
| `npm run security:hardening` | `PASS` | static hardening contracts |
| `npm run security:integrity` | `PASS` | static Firestore integrity contracts |
| `npm run lint --prefix functions` | `PASS` | Node syntax check for both Function modules |
| local Playwright, all specs | `FAIL` (6 pass, 1 fail) | absence spec timed out waiting for fixed `2026-06-10/12` calendar cells; Firebase env blank |
| `npm run security:audit` | `FAIL` | one critical, one moderate root advisory |
| Functions `npm audit --json` | `FAIL` | nine moderate, one low advisory |
| Firebase emulator suites | `SKIPPED_WITH_REASON` | `firebase-tools` absent; scripts would use `npx --yes` |
| `npm run security:cve` / `security:scan` | `SKIPPED_WITH_REASON` | CVE Lite fetched/executed through `npx --yes`; safe components run separately |
| Docker/live smoke | `SKIPPED_WITH_REASON` | prohibited production/deployment boundary |

The generated Playwright `test-results` artifacts were removed after inspection; no tracked runtime file changed.

## 25. Dependencies And Supply Chain

### Root advisories

`npm run security:audit` failed:

| Package | Locked | Severity | Advisory | Patched/current registry version | Reachability |
| --- | ---: | --- | --- | ---: | --- |
| `websocket-driver` | `0.7.4` | `CRITICAL` aggregate | GHSA-mp7j-qc5w-4988; GHSA-xv26-6w52-cph6 | `0.7.5` | transitive production dependency; app does not import Realtime Database; no recognizable driver/Faye markers in built assets |
| `protobufjs` | `7.6.4` | `MODERATE` | GHSA-j3f2-48v5-ccww | registry current `8.7.1` | Firebase-related transitive; exact application reachability not established |

Required websocket path:

```text
gas-station-shift-manager
  -> firebase@11.10.0
  -> @firebase/database@1.0.20
  -> faye-websocket@0.11.4
  -> websocket-driver@0.7.4
```

`faye-websocket@0.11.4` accepts `websocket-driver >=0.5.1`, and patched `0.7.5` exists. This suggests a targeted transitive lock refresh may avoid a breaking direct Firebase upgrade, but that must be proven by an approved package-manager change plus build/QA/audit; no update was attempted. The critical audit gate should block paid beta even though current bundle reachability appears reduced.

- Advisory severity: `CRITICAL`
- Demonstrated ShiftOryx exploitability: `NOT CONFIRMED`
- Paid-beta blocker: `YES`

### Functions advisories

Functions audit reported 9 moderate and 1 low vulnerability entries involving `firebase-admin@13.10.0` transitives, including Firestore/Storage/gax/retry/uuid/protobufjs and `body-parser@1.20.5`. npm's aggregate remediation proposes `firebase-admin@14.2.0`, a semver-major change. It requires Functions compatibility review, emulator tests and controlled deployment; no force upgrade is appropriate.

### Supply-chain posture

- both lockfiles are version 3 and all resolved entries have integrity hashes and standard npm-registry origins;
- root install has native optional binaries for esbuild, Rolldown, Lightning CSS and fsevents;
- install scripts exist in `@firebase/util`, `core-js`, `esbuild`, `fsevents` and `protobufjs`;
- deprecated metadata: root `node-domexception@1.0.0`; Functions `uuid@9.0.1` support warning;
- CI permissions are `contents: read`; no `pull_request_target`, OIDC or `id-token` permission;
- checkout/setup-node/Trivy use version tags rather than commit SHAs;
- Semgrep uses unpinned `semgrep/semgrep`, is report-only and non-blocking;
- `security:cve` runs `npx --yes cve-lite-cli@1`, fetching executable tooling at runtime;
- CI runs root `npm ci` and root audit but no separate Functions install/audit job;
- Dependabot covers root npm and GitHub Actions weekly, not the Functions directory.

No dependency or lockfile changed.

## 26. Secrets Review

The scan operated only on tracked text files and reported path/category, never matched values.

| Path/category | Appears active? | Finding | Recommended remediation |
| --- | --- | --- | --- |
| tracked repository — private-key/service-account/provider-token/JWT patterns | No match | no high-confidence tracked secret found | retain CI secret scanning and review |
| `scripts/test-auth-broker-emulator.mjs`, `scripts/validate-auth-broker.mjs` — credential-bearing URI pattern | No; invalid test fixtures | deliberate negative URL-validation cases | keep as test data |
| password assignment candidate files | No active secret demonstrated | variable/property references and test credentials; values not reported | continue using env/input and redacted logs |
| `.env.example` | No | tracked intentionally; Firebase/admin values blank | keep placeholders blank |
| `firestore-debug.log` — possible debug/private payload | Unknown; file not inspected | pre-existing untracked file is not ignored by Git or Docker | approved future ignore rule; securely review/remove outside Phase 1 if authorized |

`.gitignore` excludes `.env` and `.env.*` but not service-account/private-key filename patterns and not `firestore-debug.log`. `.dockerignore` also misses `firestore-debug.log`, so `COPY . .` may include it in the build stage/context/cache even though the final Nginx stage copies only `dist`. This is `MEDIUM` hygiene risk.

## 27. Documentation Contradictions

1. `docs/SHIFTORYX_MASTER_ROADMAP.md` still ends with a next action to execute Phase 0/documentation alignment, while Phase 0 is already merged and this audit is Phase 1. This is stale documentation, not runtime risk.
2. The approved business-category/template direction in the Phase 1 brief is absent from the master roadmap. Record: `ROADMAP_DELTA_PENDING_SYNC`.
3. Central landing language presents a ready multi-store SaaS platform, while registration, `/stores`, subscriptions and lifecycle are not implemented.
4. `/admin-console` placeholder language refers to a Firebase custom `SUPERADMIN` claim; implemented platform-admin authorization uses `platformAdmins/{uid}`.
5. `.env.example` and auth runbooks expose broker/gate flags, but Dockerfile/Compose do not pass them into the Vite build.
6. `SECURITY.md` says CSP is intentionally not enabled pending compatibility work. `vercel.json` contains CSP/HSTS, but the documented live Nginx target does not. These statements are compatible only when deployment target is made explicit.
7. Deployment reports/runbooks state verified homelab details and dates. Phase 1 did not reconnect, so those are documentation claims, not freshly verified facts.
8. Current docs describe `ADMIN`/`MANAGER` as compatibility only, yet `seed-bp-kallis-tenant.mjs` still defaults new seed writes to `ADMIN`.
9. The roadmap target subscription status model and the current rules' status vocabulary do not match, and current fields are owner-writable.

## 28. Unknowns Requiring Controlled Verification

| Unknown | Why repository evidence is insufficient | Safe future verification |
| --- | --- | --- |
| Live membership roles/statuses | no production records accessed | Phase 2 redacted aggregate inventory with backup |
| Legacy root data presence | locked/conditional paths may or may not contain records | emulator migration rehearsal, then approved count-only live audit |
| Deployed rules/Functions versions | checked-in files do not prove deployed revisions | approved Firebase release/version comparison without payload export |
| Firebase Authorized Domains/App Check/quotas | console-only configuration | Phase 6/7 configuration checklist with screenshots/redaction |
| Firebase Analytics activation/consent | local code cannot prove live measurement ID or policy | privacy-approved config/browser network review |
| DNS/Cloudflare/Tunnel/WAF/origin exposure | no edge access in Phase 1 | Phase 6 controlled zone/tunnel audit |
| Live container/image/commit/health | no homelab SSH/live URL access | approved local/public smoke and image-label check |
| Subscription/archive live state | records not queried | scoped tenant-owner/admin validation in owning phase |
| Backup/retention/encryption/restore | no repo automation or evidence | Phase 13 backup inventory and restore drill |
| Debug-log sensitivity | file explicitly excluded from inspection | authorized local review without printing/copying payloads |

These are not assumed failures. Each remains `UNKNOWN_REQUIRES_AUDIT` until controlled evidence exists.

## 29. Risk Matrix

| ID | Severity | Finding | Demonstrated/current impact | Trigger/exploitability | Recommended action/phase |
| --- | --- | --- | --- | --- | --- |
| R-01 | `CRITICAL` | `websocket-driver@0.7.4` advisory | root audit/CI gate fails | package is production transitive; driver markers absent from built bundle | isolated dependency remediation before paid beta |
| R-02 | `MEDIUM` | tenant public route gated on tenant host | anonymous employees lose intended schedule access | activates with `VITE_ENABLE_TENANT_GATE=true` | Phase 5/6 routing tests and fix |
| R-03 | `MEDIUM` | public nested shifts not rule-validated | authorized client could put extra nested fields in anonymous docs | malicious/regressed OWNER client | Phase 10/rules hardening with emulator leakage tests |
| R-04 | `MEDIUM` | subscription client-writable and unenforced | future plan/status can be self-asserted | relevant when entitlement checks are introduced | Phase 7 server-only enforcement |
| R-05 | `MEDIUM` | tenant lifecycle status omitted from auth predicate | tenant suspension alone does not revoke active member | lifecycle feature activation | Phase 8/9 server/rules lifecycle design |
| R-06 | `MEDIUM` | broker/gate flags missing from Docker build contract | documented secure routing cannot be enabled in container | Phase 5/6 rollout | Phase 5/6 versioned build config |
| R-07 | `MEDIUM` | `firestore-debug.log` unignored | accidental commit/build-context/cache exposure possible | developer stages/builds without exclusion | approved immediate hygiene patch; do not inspect contents |
| R-08 | `MEDIUM` conditional | platform admin legacy absence access | platform role may see tenant-private legacy absence records | only if live legacy records exist | Phase 2 inventory/migration and rule cleanup |
| R-09 | `MEDIUM` review | Firebase Analytics automatic init | telemetry may start without a separate app gate | only when live Firebase analytics is configured/supported | privacy/config review before paid beta |
| R-10 | `LOW` | public employee private-ID reuse | stable namespace correlation | ID alone grants no private access | Phase 10 opaque public ID |
| R-11 | `LOW` | client-authored audit/public snapshot trust | logs may be skipped/fabricated; failures not logged | authorized client can bypass UI | server-side writes/triggers in Phases 7/9/10 |
| R-12 | `LOW` | residual Zustand state/auth race | stale UI/rule state possible in same JS context | rapid auth event or future same-page switch | gradual slices/full reset in owning phase |
| R-13 | `LOW` | no App Check/rate limiting | abuse/cost controls limited | internet-callable broker/write traffic | approved Firebase/edge hardening |
| R-14 | `LOW` | CI supply-chain pinning gaps | scanner/action content can change by tag | CI execution | pin reviewed actions/container/tooling |
| R-15 | `LOW` | absence Playwright date fixture stale | one regression flow currently red | test date no longer in initial calendar view | repair test in owning approved phase |

No application `HIGH` finding was demonstrated. Missing future SaaS features are not assigned vulnerability severity unless their absence creates a current enforcement failure.

## 30. Recommended Phase 2 Scope

Phase 2 should remain narrow: OWNER-only membership normalization. Do not combine it with registration, wildcard domains, subscriptions or templates.

### Goal

Remove `ADMIN`/`MANAGER` as tenant authentication roles only after proving and migrating live compatibility data, while preserving platform-admin separation and pilot access.

### Phase 2A — read-only inventory, migration design and emulator validation

1. Reconfirm branch/base and back up affected membership/rules/configuration.
2. Run an approved, redacted/count-only inventory of live `tenantMemberships` roles/statuses and legacy root data. Do not print emails, UIDs or payloads.
3. Define migration eligibility and an explicit old-to-new rollback map.
4. Rehearse the proposed migration entirely in Firebase emulators.
5. Add/execute behavioral and emulator tests for OWNER allow, legacy-role post-migration denial, revoked/inactive denial, UID mismatch, cross-tenant denial and rollback.
6. Produce the Phase 2A findings and stop for human approval. Phase 2A does not authorize production membership changes.

### Phase 2B — controlled OWNER migration

Phase 2B requires separate explicit approval after Phase 2A review. Its controlled scope is to migrate eligible tenant operational roles to `OWNER`, update the approved membership helpers, Firestore rules, Storage rules, auth broker role checks and trusted provisioning/seed scripts, preserve `platformAdmins/{uid}` as a separate platform boundary, validate rollback and tenant isolation, and stop for human approval. Scheduler classifications must not change, and BP Kallis ownership must not create platform access.

### Preconditions and exclusions

- The critical dependency audit requires an approved remediation track before paid beta, but dependency upgrading should not be hidden inside the role migration.
- Do not start Phase 3 token/registration work in Phase 2.
- Phase 2A is read-only with respect to production data; Phase 2B cannot begin without separate explicit approval and a validated rollback.

## 31. Future Template And Customization Phase Mapping

The target remains one shared application/deployment. No customer-specific repository, component fork, container, DNS record or tunnel is required.

| Phase | Recommended template/customization scope | Required safety properties |
| --- | --- | --- |
| Phase 4 | Add `businessCategory`, default `templateId`, `templateVersion` and `customizationMode` to atomic tenant provisioning | typed allowlists, safe default, server assignment, rollback/migration metadata |
| Phase 8 | Add per-store category/template/approved `brandingOverrides` for multi-store tenants | store ownership checks, deterministic inheritance, no arbitrary CSS/HTML |
| Phase 9 | ShiftOryx Admin template catalog, versions, preview, assignment, deprecation/migration and safe asset management | admin-only writes, audited version changes, MIME/size/dimension controls, fallback template |
| Phase 12 | Authenticated customization request and paid internal quote lifecycle | tenant ownership, attachment controls, server state transitions, admin-only `quoteAmount`/`adminNotes`, owner acceptance before work |

Suggested request states:

```text
SUBMITTED -> REVIEWING -> QUOTED -> ACCEPTED -> IN_PROGRESS -> COMPLETED
                                  \-> REJECTED
```

The owner-facing form does not need a fixed public “extra charge” statement or public price list. Commercial data remains internal. The workflow must record tenant, category, description, desired result, controlled attachments, optional requested deadline, status, quote, admin notes, acceptance and completion timestamps. Only authenticated owners submit/accept; only ShiftOryx Admin manages quotes and internal notes.

Never allow custom JavaScript, HTML, external scripts, unsafe embeds, arbitrary executable themes or unrestricted CSS injection.

## 32. Explicit Changes Not Made

Phase 1 did not:

- modify frontend, scheduler, repositories, Functions, Firestore rules or Storage rules;
- fix TenantGate, identifiers, subscription trust, template architecture or debug ignores;
- add, remove, update or install dependencies;
- modify either lockfile;
- run `npm audit fix`, `npm update` or force upgrades;
- run Firebase emulator commands that would install `firebase-tools`;
- deploy or invoke production Functions;
- read/write production Firestore or Storage data;
- inspect local `.env` or `firestore-debug.log` contents;
- query/change Firebase Authorized Domains;
- query/change DNS, Cloudflare, Tunnel or WAF configuration;
- build/deploy/restart production Docker resources;
- modify Dockerfile, Compose, Nginx, Vercel or GitHub Actions;
- commit, push, merge, change branch, stage files or start Phase 2.

### Phase closure

- Files changed: `docs/CURRENT_STATE.md`, `docs/PHASE_1_CURRENT_STATE_AUDIT.md`, `docs/codex-handoffs/PHASE_1_CHECKPOINT.md`.
- Migrations: none.
- Deployment status: not deployed; production untouched.
- Dependency/security status: active advisories documented; no package changes.
- Rollback: restore only the three documentation files from Git or the pre-audit backup. Do not remove or inspect `firestore-debug.log` as part of rollback.
- Recommended next phase: human review of Phase 1, then separately authorized Phase 2 OWNER-role inventory/migration.

Final verdict: `PHASE_1_READY_FOR_REVIEW`.
