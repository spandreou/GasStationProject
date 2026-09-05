# ShiftOryx

Το ShiftOryx είναι multi-tenant SaaS για δημιουργία, διαχείριση και δημοσίευση προγραμμάτων βαρδιών για καταστήματα και επιχειρήσεις με βάρδιες.

Προηγούμενα/compatibility ονόματα: `GasStation Shift Manager`, `GasStationProject`, `GasStation-main`.

## Source Of Truth

Η εγκεκριμένη product direction βρίσκεται στο Google Doc:

`ShiftOryx - Master Product, Technical Architecture & Codex Execution Roadmap`

`https://docs.google.com/document/d/187_L7GROL-WqmA01sP-8MfeQa8CxJBCYNQXGI2oxibM/edit?tab=t.0`

Το master roadmap υπερισχύει παλιότερων roadmap/reports όταν υπάρχει διαφωνία. Η τρέχουσα πραγματική κατάσταση παρακολουθείται στο `docs/CURRENT_STATE.md` και οι αποκλίσεις στο `docs/ROADMAP_ALIGNMENT_REPORT.md`.

## Current Pilot And Target Product

Current verified pilot:

```text
https://bp-kallis.homelabshare.gr/
```

Approved target domains, σε μελλοντική phase:

```text
https://shiftoryx.gr
https://shiftoryx.gr/login
https://shiftoryx.gr/register
https://shiftoryx.gr/admin
https://shiftoryx.gr/stores
https://{tenantSlug}.shiftoryx.gr
```

Το `bp-kallis.homelabshare.gr` παραμένει ενεργό μέχρι να επαληθευτεί πλήρως το `bp-kallis.shiftoryx.gr`. Δεν έχει εγκριθεί μέσα στη documentation phase αλλαγή DNS, tunnel, Firebase authorized domains ή production deployment.

## Future Business Templates And Safe Branding

The roadmap keeps one shared, config-driven multi-tenant application and adds future category-specific visual presets for `FUEL_STATION`, `CAFE`, `RESTAURANT`, `HAIR_SALON`, `RETAIL` and a safe generic `OTHER` fallback. Tenant/store assignments will use `businessCategory`, `templateId`, `templateVersion`, `brandingOverrides` and `customizationMode` from a versioned central catalog.

Branding is limited to validated tokens and approved presets such as background, logo, colors, typography, approved imagery, radius/density, layout variants, enabled sections and public-page presentation. It never permits arbitrary or unrestricted CSS, custom JavaScript, custom HTML, external scripts, executable themes or unsafe embeds, and it never creates a per-tenant source fork, deployment, container or DNS record. Phase 4 owns provisioning defaults, Phase 8 store assignments, Phase 9 catalog/version controls and Phase 12 the authenticated quote-based customization flow; Phase 2A remains read-only and Phase 2B separately approved. These are roadmap capabilities, not current runtime behavior.

## Τι Λειτουργεί Σήμερα

- Weekly και monthly scheduler.
- Pure TypeScript scheduler engine.
- Automatic generation και manual editing.
- Drag and drop, templates και week history.
- Fixed days off, absences, Sunday rotation και manual overrides.
- Public anonymous read-only schedule και announcements.
- Public ώρες ανά εργαζόμενο χωρίς private absence breakdown.
- Admin/owner employee, absence, settings και announcement management.
- PDF, Excel, Word και WhatsApp exports.
- Private monthly PDF archive στο Firebase Storage.
- Tenant-scoped Firestore operational data.
- UID-based tenant membership authorization.
- Central portal/auth broker/platform-admin foundations πίσω από ασφαλή boundaries/flags.

Λεπτομερής snapshot: `docs/project-status-report.md` και `docs/CURRENT_STATE.md`.

## Service Layer Architecture

Η πρόσβαση σε Firebase/Firestore περνά από τα domain services στο `src/firebase/` και τα repository wrappers στο `src/repositories/`. Components και Zustand orchestration δεν πρέπει να δημιουργούν νέα direct Firestore paths όταν υπάρχει service/repository boundary.

Τα generated shifts και τα σχετικά audit events χρησιμοποιούν `generationRunId`, ώστε ένα generation run να συσχετίζεται με τις εγγραφές που δημιούργησε. Τα audit logs είναι tenant-scoped και client-immutable μετά το create, με τον γνωστό περιορισμό ότι πλήρως εγγυημένο audit απαιτεί trusted server-side write path.

## Actors And Access Model

### ShiftOryx Admin

Ο ιδιοκτήτης της πλατφόρμας. Το τεχνικό compatibility role μπορεί να παραμείνει `SUPER_ADMIN` και ελέγχεται από `platformAdmins/{uid}` με `ACTIVE` status. Δεν αποκτά αυτόματα πρόσβαση στα operational δεδομένα κάθε tenant.

### Owner

Ο `OWNER` είναι ο μόνος authenticated tenant role για νέα MVP memberships. Ο owner διαχειρίζεται το κατάστημα, τους εργαζομένους, το πρόγραμμα, τις απουσίες, τα exports και το public schedule.

Current compatibility: το deployed code/rules μπορεί ακόμη να αναγνωρίζει `ADMIN` και `MANAGER` για παλιές memberships. Δεν δημιουργούμε νέες memberships με αυτούς τους ρόλους. Read-only inventory/design ανήκει στη Phase 2A και οποιαδήποτε controlled production migration στη separately approved Phase 2B.

### Employees / Public Viewers

Δεν έχουν account, password, Firebase UID ή tenant membership στο MVP. Μπαίνουν στο tenant URL χωρίς login και βλέπουν sanitized public δεδομένα.

Οι scheduler roles (`CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B`, `INTERMEDIATE`, `CUSTOM`, `EXTRA_A`, `EXTRA_B` και legacy aliases) είναι business classifications και όχι auth roles.

## Public Privacy Contract

Το current public view δείχνει μόνο sanitized schedule/display fields. Δεν δείχνει contact data, AFM, UID, memberships, audit data, private archive metadata, private notes ή reasons of absence.

Το master roadmap προβλέπει για Phase 10 future sanitized statuses:

- `Άδεια`
- `Ρεπό`
- `Δεν εργάζεται`
- explicit `publicNote`

Αυτό δεν είναι ακόμη runtime behavior. Το generic `notes` field δεν δημοσιεύεται αυτόματα. Η Phase 10 απαιτεί `publicNote`/`privateNote` separation, owner preview και leakage tests.

## Scheduler Guarantees

- Core employees δεν μπαίνουν στην ίδια βάρδια όταν δουλεύουν την ίδια ημέρα.
- Core employee δεν ανατίθεται ως intermediate.
- Intermediate/coverage slots χρησιμοποιούν κατάλληλο scheduler role.
- Fixed day off είναι hard constraint.
- Με 3 διαθέσιμους: morning, intermediate, evening.
- Με 4 διαθέσιμους σε full-coverage day: 2 morning, 2 evening.
- Κυριακή: μία βάρδια `08:00-20:00` με fairness και αποφυγή συνεχόμενων Κυριακών όπου είναι εφικτό.
- Manual overrides προστατεύονται.
- Ίδια inputs δίνουν deterministic output.
- Αδύνατη κάλυψη παράγει warning, όχι ψεύτικα σωστό πρόγραμμα.

References:

- `docs/scheduler-rules.md`
- `docs/scheduler-ui-export-rules.md`
- `docs/scheduler-qa-checklist.md`

## Repository And Deployment Map

```text
Local Codex workspaces (use the one present on the current computer):
Desktop PC: C:\Users\Spyros\OneDrive\Υπολογιστής\projects\shiftoryx
Laptop: C:\Users\thugs\Desktop\projects\shiftoryx

Do not use:
GasStationProject-main

GitHub remote:
https://github.com/spandreou/shiftoryx.git

Homelab checkout:
/home/spandreou/projects/GasStationProject

Production branch:
main

Compose/container:
gasstationproject / gasstation-bp-kallis

Port:
8085 -> 8080
```

Τα repository, Firebase project, Docker και server identifiers παραμένουν legacy compatibility names μέχρι να υπάρξει ξεχωριστό, εγκεκριμένο migration. Μην τα αλλάζεις για branding λόγους.

## Stack

- React 19 + Vite 8
- TypeScript scheduler engine
- Zustand
- Tailwind CSS 3.x
- Firebase Auth, Firestore, Storage και Cloud Functions
- dnd-kit
- jsPDF, `@e965/xlsx`, `docx`
- Playwright
- Docker Compose + Nginx

Approved direction: TypeScript για κάθε νέο ή τροποποιούμενο critical module, χωρίς Next.js rewrite και χωρίς forced Tailwind major upgrade.

## Local Development

```bash
npm install
cp .env.example .env
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Τα πραγματικά Firebase/server values μένουν μόνο σε local/server environment files. Μην κάνεις commit `.env`.

Repository-safe defaults:

```text
VITE_ENABLE_AUTH_BROKER=false
VITE_ENABLE_TENANT_GATE=false
VITE_ENABLE_MONTHLY_PDF_ARCHIVE=false
```

## Validation

```bash
npm run build
npm run qa:scheduler
npm run qa:scheduler-engine
npm run qa:repositories
npm run qa:public-readonly
npm run qa:tenant-authorization
npm run qa:auth-broker
npm run qa:export-security
npm run security:scan
```

Emulator και Playwright tests εκτελούνται ανάλογα με το scope. Το local E2E base URL είναι `http://127.0.0.1:5174/` ώστε να αποφεύγεται collision με άλλες Vite εφαρμογές.

## Approved Roadmap Order

0. Documentation alignment.
1. Current-state audit.
2A. Read-only role inventory, migration design and emulator rehearsal.
2B. Separately approved controlled OWNER migration.
3. Registration token backend.
4. Automated tenant provisioning.
5. Root portal and store selector.
6. Wildcard ShiftOryx domains.
7. Trial/subscription entitlements.
8. Multi-store lifecycle.
9. ShiftOryx admin panel.
10. Public statuses and notes.
11. Subdomain rename and aliases.
12. Customization request workflow.
13. VPS production migration.
14. HomeOps read-only integration.
15. Billing provider.

Μία phase κάθε φορά. Καμία production αλλαγή χωρίς explicit approval και rollback plan.

## Trial And Pricing Direction

Product proposal, όχι deployed enforcement:

- Trial: 7 ημέρες, 1 store, έως 10 employees, planning horizon 1 εβδομάδα.
- Monthly: EUR 14.90 για πρώτο store, horizon 2 μήνες.
- Quarterly: EUR 39.90 για πρώτο store, horizon 6 μήνες.
- Semiannual: EUR 74.90 για πρώτο store, horizon 12 μήνες.
- Additional stores: προτεινόμενο μειωμένο per-store pricing.

Το pricing χρειάζεται λογιστικό/φορολογικό έλεγχο πριν δημοσιευτεί. Subscription limits πρέπει μελλοντικά να επιβάλλονται server-side και όχι μόνο στο UI.

## Hosting Direction

Το homelab παραμένει pilot/development environment. Πριν από paid public beta απαιτείται εγκεκριμένο ευρωπαϊκό VPS, hardened Ubuntu, Docker deployment, backups/restore drill, monitoring, staging smoke, controlled cutover και rollback προς το homelab.

Δεν αγοράζεται ή αλλάζει VPS/DNS μέσα σε documentation work.

## Key Documentation

- `AGENTS.md`
- `docs/project-brain.md`
- `docs/CURRENT_STATE.md`
- `docs/ROADMAP_ALIGNMENT_REPORT.md`
- `FIREBASE_SCHEMA.md`
- `HOMELAB.md`
- `docs/self-hosting-bp-kallis.md`
- `docs/saas-tenant-foundation.md`
- `docs/tenant-authorization-model.md`
- `docs/central-auth-portal-migration.md`
- `docs/auth-broker-runbook.md`
- `docs/tenant-provisioning-runbook.md`
- `docs/platform-admin-runbook.md`
- `docs/monthly-pdf-archive-runbook.md`
- `SECURITY.md`

## Safety

- No secrets, tokens, passwords, private keys or service-account content in source, docs or logs.
- No client-only trust for privileged operations.
- No new dependencies without need/alternatives/maintenance/install-risk review.
- No manual lockfile edits or force audit upgrades.
- No GitHub Actions permission changes without explicit approval.
- No production deploy, Firebase rules change, DNS/tunnel change or runtime feature implementation during documentation alignment.
