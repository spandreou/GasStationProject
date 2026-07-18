# ShiftOryx

## Product And Instruction Priority

Το product ονομάζεται `ShiftOryx`. Τα παλιά ονόματα `GasStation Shift Manager`, `GasStationProject` και `GasStation-main` παραμένουν μόνο όπου χρειάζονται ως repository, checkout, Firebase ή deployment identifiers.

Master product direction:

- Google Doc: `ShiftOryx - Master Product, Technical Architecture & Codex Execution Roadmap`
- URL: `https://docs.google.com/document/d/187_L7GROL-WqmA01sP-8MfeQa8CxJBCYNQXGI2oxibM/edit?tab=t.0`
- Revision aligned locally: 17 July 2026
- Canonical local copy: `docs/SHIFTORYX_MASTER_ROADMAP.md`. Read it before planning or implementation.

Instruction order:

1. Το master Google Doc υπερισχύει παλιότερων roadmap/reports όταν υπάρχει διαφωνία.
2. Το παρόν `AGENTS.md` και το `docs/project-brain.md` είναι τα local instruction entry points.
3. Τα ειδικά scheduler, security, Firebase και deployment runbooks υπερισχύουν μόνο μέσα στο δικό τους scope.
4. Το `docs/CURRENT_STATE.md` περιγράφει τι υπάρχει σήμερα. Το `docs/ROADMAP_ALIGNMENT_REPORT.md` καταγράφει target direction και γνωστές αποκλίσεις.

## Phase Execution Contract

- Μία roadmap phase κάθε φορά.
- Πριν από αλλαγές: `git status`, branch/base, current-state inspection και backup για αρχεία/configuration που θα τροποποιηθούν.
- Καμία production αλλαγή χωρίς explicit approval.
- Μην ξεκινάς επόμενη phase πριν εγκριθεί η προηγούμενη από άνθρωπο.
- Κάθε phase κλείνει με goal, branch/base, files changed, behavior, migrations, exact tests, dependency/security review, deployment status, risks, rollback και recommended next phase.
- Legacy identifiers παραμένουν όταν απαιτούνται για compatibility. Μην κάνεις cosmetic rename σε Firebase project ids, repository paths, Docker names, collections ή live domains.
- Κανένα secret, token, private key, credential, full reset URL ή private payload σε repo, logs, reports ή frontend env.

## Repository And Current Deployment

- Correct local Windows workspace: `C:\Users\Spyros\OneDrive\Υπολογιστής\projects\GasStation-main`.
- Do not use `GasStationProject-main`; it was the wrong/empty local folder.
- GitHub remote: `https://github.com/spandreou/GasStationProject.git`.
- Active homelab checkout: `/home/spandreou/projects/GasStationProject`.
- Production source branch: `main`.
- Current pilot URL: `https://bp-kallis.homelabshare.gr/`.
- Current homelab compose/container: `gasstationproject` / `gasstation-bp-kallis`.
- Host port: `8085` mapped to container port `8080`.
- Read `HOMELAB.md` and `docs/self-hosting-bp-kallis.md` before deployment work.

Target product domains are not current deployment facts:

- Root: `https://shiftoryx.gr`
- Domain status: `PURCHASED_NOT_CONFIGURED`; DNS, Cloudflare, Firebase authorized domains and production cutover are not approved.
- Root routes: `/login`, `/register`, `/admin`, `/stores`
- Tenant pattern: `https://{tenantSlug}.shiftoryx.gr`
- Future BP Kallis primary domain: `https://bp-kallis.shiftoryx.gr/`

Keep `bp-kallis.homelabshare.gr` active until the ShiftOryx domain, wildcard routing, Firebase authorized domains, auth broker and rollback path have been verified in their approved phases.

## Actors And Roles

- `ShiftOryx Admin`: platform owner. The compatibility data role may remain `SUPER_ADMIN`, stored in `platformAdmins/{uid}` with `ACTIVE` status. Platform admin does not automatically gain tenant operational access.
- `OWNER`: the only authenticated tenant role for new MVP memberships.
- `ADMIN` and `MANAGER`: current legacy compatibility roles only. Do not create new memberships with these roles. Their inventory/migration belongs to roadmap Phase 2.
- `EMPLOYEE` / public viewer: no account, password, Firebase UID or tenant membership in the MVP. Uses anonymous sanitized tenant view.
- Scheduler roles such as `CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B`, `INTERMEDIATE`, `CUSTOM`, `EXTRA_A` and `EXTRA_B` are business classifications, never authentication roles.

## Product Scope

Current protected pilot capabilities:

- weekly/monthly schedules,
- automatic generation and manual editing,
- fixed days off, absences and manual overrides,
- drag and drop, templates and history,
- public sanitized schedule and announcements,
- hours analytics,
- PDF/Excel/Word/WhatsApp exports,
- private monthly PDF archive,
- Firebase persistence and tenant isolation.

Roadmap capabilities such as registration tokens, automated tenant provisioning, wildcard ShiftOryx domains, multi-store lifecycle, trials/subscriptions, admin lifecycle panel, public status notes, slug aliases, customization requests, VPS migration, HomeOps integration and billing are target phases. Do not describe them as implemented unless `docs/CURRENT_STATE.md` and code/tests prove it.

## Public And Private Data

Current public runtime exposes only sanitized tenant snapshots. It must not expose contact details, AFM, Firebase ids, memberships, audit data, archive metadata, private notes, reasons of absence or raw Firestore records.

Master roadmap Phase 10 allows future sanitized status labels `Άδεια`, `Ρεπό` and `Δεν εργάζεται`, plus an explicit `publicNote`. This is not permission to publish the current generic `notes` field. `privateNote` and absence reasons remain owner-only. Implement this only in Phase 10 with owner preview and leakage tests.

## Stack Direction

- React 19 + Vite 8
- TypeScript for every new or modified critical module
- Zustand with gradual domain slices
- Tailwind CSS 3.x during the SaaS migration
- Firebase Auth, Firestore, Storage and Cloud Functions 2nd gen
- Firebase Emulator Suite
- Docker Compose + Nginx shared frontend
- Cloudflare DNS/Tunnel at the edge

Do not perform a Next.js rewrite or forced Tailwind major upgrade. Do not add dependencies unless clearly necessary and reviewed.

## Scheduler Non-Negotiables

- Keep Greek text UTF-8 safe.
- Preserve manual edit, drag and drop, templates, history, persistence, exports and manual overrides.
- Fixed days off and unavailable states remain constraints.
- Keep weekly core rotation, Sunday rules, coverage rules and deterministic output.
- If rules cannot be satisfied, show a warning instead of a falsely valid schedule.
- Owners may always make manual changes; rule violations remain visible.

Scheduler references:

- `docs/scheduler-rules.md`
- `docs/scheduler-ui-export-rules.md`
- `docs/scheduler-qa-checklist.md`

## Security And Validation

- Hostname selects tenant context; it never grants authorization.
- Tenant private access requires Firebase identity plus an active matching membership.
- New MVP membership writes create `OWNER` only.
- Public users read dedicated sanitized collections only.
- Privileged registration, slug, subscription, lifecycle and admin writes must be server-side, validated, confirmed and audited.
- Firestore Rules remain an enforcement boundary. Client UI hiding is not security.
- Do not edit lockfiles manually or use force audit upgrades.
- Do not change GitHub Actions permissions, `pull_request_target` or OIDC/id-token permissions without explicit approval.

Minimum checks depend on scope:

- `npm run build`
- `npm run qa:scheduler`
- `npm run qa:scheduler-engine`
- `npm run qa:repositories`
- `npm run qa:public-readonly`
- `npm run qa:tenant-authorization`
- `npm run qa:auth-broker`
- `npm run qa:export-security`
- Firebase Emulator tests
- Playwright desktop/mobile flows
- dependency audit review

## Git Hygiene

- Do not commit, push, deploy or alter production unless explicitly requested.
- Preserve user changes and unrelated untracked files.
- Never use destructive reset/checkout operations without explicit approval.
- Keep each phase small enough to review and roll back.
