# ShiftOryx Project Brain

Αυτό είναι το μόνιμο local project brain του ShiftOryx. Τα παλιά ονόματα `GasStation Shift Manager`, `GasStationProject` και `GasStation-main` παραμένουν μόνο ως compatibility identifiers για repository, checkout, Firebase και deployment.

## Instruction Priority

1. Master source of truth: `ShiftOryx - Master Product, Technical Architecture & Codex Execution Roadmap` ([Google Doc](https://docs.google.com/document/d/187_L7GROL-WqmA01sP-8MfeQa8CxJBCYNQXGI2oxibM/edit?tab=t.0)), roadmap synchronized locally 22 July 2026 without asserting a new Google Doc revision identifier.
2. `AGENTS.md` και το παρόν αρχείο.
3. `docs/CURRENT_STATE.md` για την επιβεβαιωμένη σημερινή κατάσταση.
4. `docs/ROADMAP_ALIGNMENT_REPORT.md` για αποκλίσεις current/target.
5. Τα ειδικά scheduler, security, Firebase και deployment runbooks μέσα στο scope τους.

Όταν παλιό roadmap ή report διαφωνεί με το master document, ισχύει το master. Ένα runbook που περιγράφει σημερινό legacy identifier παραμένει σωστό ως operational fact και δεν μετονομάζεται χωρίς εγκεκριμένη migration phase.

## Product Direction

Το ShiftOryx είναι multi-tenant SaaS για προγράμματα βαρδιών. Ξεκινά από πρατήρια καυσίμων αλλά ο domain model πρέπει να παραμένει επεκτάσιμος.

Current pilot:

- `https://bp-kallis.homelabshare.gr/`
- tenant `bp-kallis`
- homelab Docker deployment από `main`

Approved target:

- root portal `https://shiftoryx.gr`
- tenant pattern `https://{tenantSlug}.shiftoryx.gr`
- future BP Kallis primary domain `https://bp-kallis.shiftoryx.gr/`
- ένα wildcard/shared app, όχι DNS record, container ή codebase ανά tenant

Το current pilot μένει ενεργό μέχρι να επαληθευτούν domain, wildcard routing, Firebase authorized domains, auth handoff και rollback.

## Business Templates And Safe Branding

- Initial business categories are `FUEL_STATION`, `CAFE`, `RESTAURANT`, `HAIR_SALON`, `RETAIL` and `OTHER`; `OTHER` receives an approved safe generic fallback.
- Future tenant/store configuration uses `businessCategory`, `templateId`, `templateVersion`, `brandingOverrides` and `customizationMode` from a shared, centrally managed and versioned template registry.
- Only validated presentation tokens and approved presets are allowed: backgrounds, logos, colors, typography, approved imagery, radius/density, approved layout variants, enabled sections and public-page presentation.
- Arbitrary or unrestricted CSS, custom JavaScript, custom HTML, external scripts, executable themes and unsafe embeds are prohibited.
- The product remains one shared config-driven app. There is no per-tenant source/code fork, frontend deployment, container or DNS record.
- Phase 4 owns provisioning defaults, Phase 8 per-store category/template lifecycle, Phase 9 registry versions/preview/assignment/migrations and Phase 12 the authenticated customization workflow.
- Customization is an internal quote flow with server-owned states: `SUBMITTED` → `REVIEWING` → `QUOTED` → owner `ACCEPTED` → `IN_PROGRESS` → `COMPLETED`, with `REJECTED` valid. No implementation starts before acceptance; `quoteAmount` and `adminNotes` are admin-only.

This is approved roadmap direction, not current runtime behavior.

## Actors And Authorization

- **ShiftOryx Admin**: platform owner. Το technical compatibility role `SUPER_ADMIN` μπορεί να παραμείνει σε `platformAdmins/{uid}`. Δεν δίνει αυτόματα tenant operational access.
- **OWNER**: ο μοναδικός authenticated tenant role για νέα MVP memberships.
- **ADMIN/MANAGER**: legacy runtime compatibility μόνο. Δεν δημιουργούνται σε νέο provisioning. Read-only inventory/design ανήκει στη Phase 2A και οποιαδήποτε controlled production migration στη separately approved Phase 2B.
- **Employee/public viewer**: δεν έχει account, password, Firebase UID ή membership στο MVP. Διαβάζει μόνο sanitized public data.

Οι scheduler roles (`CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B`, `INTERMEDIATE`, `CUSTOM`, `EXTRA_A`, `EXTRA_B` και aliases) είναι business classifications. Δεν είναι auth roles και δεν δίνουν δικαιώματα.

## Scheduler Guarantees

- Fixed day off και absence/unavailability είναι constraints.
- Core rotation, Sunday fairness και coverage rules παραμένουν deterministic.
- Manual overrides προστατεύονται και ο OWNER μπορεί πάντα να διορθώσει πρόγραμμα.
- Παραβίαση κανόνα εμφανίζεται ως warning. Δεν δημιουργείται ψεύτικα σωστό πρόγραμμα.
- Διατηρούνται weekly/monthly generation, manual edit, drag and drop, templates, history, persistence και exports.

References:

- `docs/scheduler-rules.md`
- `docs/scheduler-ui-export-rules.md`
- `docs/scheduler-qa-checklist.md`

## Public And Private Boundary

Σήμερα το public runtime εμφανίζει sanitized work schedules, display-safe employees, announcements και ασφαλή aggregates. Δεν εμφανίζει absences/status entries ή private notes.

Η Phase 10 επιτρέπει μελλοντικά μόνο sanitized labels `Άδεια`, `Ρεπό`, `Δεν εργάζεται` και explicit `publicNote`, με owner preview. Το generic `notes` δεν δημοσιεύεται. `privateNote`, medical/reason details, attachments, contact data, UID, memberships, audit data και raw records μένουν private.

## Technical Direction

- React 19 και Vite 8, χωρίς Next.js rewrite.
- TypeScript σε κάθε νέο ή τροποποιούμενο critical module.
- Zustand με σταδιακά domain slices.
- Tailwind CSS 3.x στη migration περίοδο.
- Firebase Auth, Firestore, Storage, Cloud Functions 2nd gen και Emulator Suite.
- Cloudflare edge, Docker Compose και Nginx shared frontend.
- Functions target Node 22 LTS και pinned lockfile.

Δεν προστίθενται dependencies χωρίς ανάγκη, alternatives, maintenance και install-risk review. Δεν γίνεται manual lockfile edit ή force audit upgrade.

## Approved Phase Order

0. Documentation alignment. (CLOSED)
1. Current-state audit. (CLOSED)
2A. Read-only role inventory, migration design and emulator rehearsal. (CLOSED)
2B. Separately approved controlled OWNER migration. (CLOSED)
3. Registration token backend. (CLOSED)
4. Automated tenant provisioning. (CLOSED)
5. Root portal και store selector. (CLOSED)
6. Wildcard ShiftOryx domains. (CURRENT ACTIVE - PREFLIGHT)
7. Trial/subscription entitlements.
8. Multi-store lifecycle.
9. ShiftOryx admin panel.
10. Public statuses και notes.
11. Subdomain aliases.
12. Customization requests.
13. Production EU VPS.
14. HomeOps read-only integration. (CANCELLED)
15. Billing provider.

Μία phase κάθε φορά. Πριν από αλλαγές: branch/status, current-state inspection και backup. Καμία production αλλαγή χωρίς explicit approval. Κάθε phase κλείνει με tests, security/dependency review, risks και rollback, και σταματά πριν την επόμενη phase.

Phase 0, 1, 2A, 2B, 3, 4, 5 και το cross-cutting Scheduler Contract V2 (PR #44) είναι πλήρως ολοκληρωμένες, merged στο main και verified στο Vercel Production. Η Phase 6 είναι η τρέχουσα ενεργή φάση σε επίπεδο Preflight / Readiness Design (PR #42) και dual-domain compatibility implementation (PR #43, Draft). Καμία αλλαγή production (DNS, Vercel domains, Firebase Authorized Domains, Cloud Functions deploy) δεν εκτελείται χωρίς ρητή έγκριση.

## Product Proposals, Not Current Enforcement

- Trial 7 ημερών: 1 store, έως 10 employees, horizon 1 εβδομάδα, basic features και ένα PDF.
- Monthly EUR 14.90, quarterly EUR 39.90, semiannual EUR 74.90 για πρώτο store, με διαφορετικό planning horizon.
- Additional stores με χαμηλότερο per-store pricing και custom quote από 4+ stores.
- Subscription states: `TRIAL`, `ACTIVE`, `GRACE_PERIOD`, `EXPIRED`, `SUSPENDED`, `DELETED`.

Οι τιμές χρειάζονται λογιστικό/φορολογικό έλεγχο. Entitlements θα επιβάλλονται server-side. Δεν θεωρούνται deployed μέχρι τις αντίστοιχες phases.

## Safety

- Κανένα secret, token, private key, credential, reset code ή private payload σε repo/logs/frontend env.
- Hostname επιλέγει tenant context· δεν εξουσιοδοτεί.
- UI hiding δεν είναι security. Firestore Rules και trusted server operations είναι τα enforcement boundaries.
- Legacy fields δεν αφαιρούνται επειδή κρύβονται στο UI.
- Δεν αλλάζουν Firebase project ids, collections, Docker names, repository paths ή live domains για branding λόγους.
- Δεν γίνεται commit, push, deploy, rules/DNS/tunnel change χωρίς explicit request.

## Required Reporting

Κάθε phase report περιλαμβάνει goal, branch/base, files changed, behavior, migrations, exact tests, dependency/security review, deploy status, risks, rollback και recommended next phase.
