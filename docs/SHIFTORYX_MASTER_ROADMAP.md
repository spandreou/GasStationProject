# ShiftOryx — Master Product, Technical Architecture & Codex Execution Roadmap

Revision date: 17 July 2026

Status: **MASTER SOURCE OF TRUTH — APPROVED PRODUCT DIRECTION**

Google Doc source: `https://docs.google.com/document/d/187_L7GROL-WqmA01sP-8MfeQa8CxJBCYNQXGI2oxibM/edit?tab=t.0`

Google Doc revision aligned locally: `ALtnJHx6C1oPugkCxLqGW_WvCmO0K6k9mMLNGxEyRduc6LY99jESglXrAKQ_wS2s2mK_Zqc34mDFgimND5YVh9dsZNPiJhQ7iDYrOFDPWEY`

Previous name: GasStation Shift Manager / GasStationProject

Current live pilot: `https://bp-kallis.homelabshare.gr/`

Future primary pilot domain: `https://bp-kallis.shiftoryx.gr/`

Root domain: `https://shiftoryx.gr`

Tenant pattern: `https://{tenantSlug}.shiftoryx.gr`

Current domain status: `PURCHASED_NOT_CONFIGURED`. Ownership is confirmed, but DNS, Cloudflare zone, wildcard routing, Firebase Authorized Domains, auth broker origins and production cutover are not configured or approved.

## 0. Σκοπός Και Κανόνες Χρήσης

Το έγγραφο αυτό είναι ο βασικός οδηγός για τον άνθρωπο και το Codex. Υπερισχύει παλιότερων roadmap, reports και σημειώσεων όταν υπάρχει διαφωνία. Το υπάρχον production pilot πρέπει να προστατεύεται σε κάθε φάση.

Κανόνες εκτέλεσης:

- Μία φάση κάθε φορά.
- Πριν από αλλαγές: git status, branch, backup και current-state inspection.
- Καμία αλλαγή production χωρίς explicit approval.
- Κάθε φάση παραδίδει report με αρχεία, tests, security review, ρίσκα και rollback.
- Δεν ξεκινά επόμενη φάση πριν εγκριθεί η προηγούμενη από άνθρωπο.
- Legacy identifiers παραμένουν όταν απαιτούνται για compatibility.
- Κανένα secret, token, private key ή credential σε repo, logs ή frontend env.

## 1. Product Identity

Όνομα: ShiftOryx.

Το ShiftOryx είναι multi-tenant SaaS για δημιουργία, διαχείριση και δημοσίευση προγραμμάτων βαρδιών. Αρχικός κλάδος είναι τα πρατήρια καυσίμων, με δυνατότητα επέκτασης σε άλλες επιχειρήσεις με βάρδιες.

Κύρια URLs:

- `shiftoryx.gr`
- `shiftoryx.gr/login`
- `shiftoryx.gr/register`
- `shiftoryx.gr/admin`
- `{tenantSlug}.shiftoryx.gr`

Το `bp-kallis.homelabshare.gr` παραμένει ενεργό μέχρι να επαληθευτεί πλήρως το `bp-kallis.shiftoryx.gr`.

## 2. Actors Και Access Model

### 2.1 ShiftOryx Admin

Ο ShiftOryx Admin είναι ο ιδιοκτήτης της πλατφόρμας και συνδέεται στο `shiftoryx.gr/admin`.

Δυνατότητες:

- προβολή owners, tenants, subscriptions και trials,
- δημιουργία, αντιγραφή-once και revoke registration tokens,
- αλλαγή trial/subscription dates και plan,
- suspend/reactivate/soft-delete/restore tenant,
- αλλαγή slug/subdomain,
- usage, traffic, schedules, exports και audit statistics,
- owner account support και blocking,
- configuration και branding support,
- πλήρης business-level επισκόπηση.

Τεχνικά μπορεί προσωρινά να παραμείνει role `SUPER_ADMIN` για compatibility, αλλά στο UI εμφανίζεται ως ShiftOryx Admin. Η πρόσβαση ελέγχεται από `platformAdmins/{uid}` με `ACTIVE` status. Δεν επιτρέπονται client writes σε `platformAdmins`.

### 2.2 Owner

Ο `OWNER` είναι ο μόνος authenticated tenant role. Δεν δημιουργούνται `ADMIN`, `MANAGER`, `VIEWER` ή authenticated `EMPLOYEE` roles στο MVP.

Ο owner μπορεί να έχει ένα ή περισσότερα καταστήματα και να:

- διαχειρίζεται εργαζομένους,
- ορίζει scheduling roles,
- κάνει auto-generation και manual editing,
- διαχειρίζεται άδειες, ρεπό, απουσίες και ανακοινώσεις,
- δημοσιεύει public schedule,
- βλέπει ώρες, analytics, ιστορικό και exports,
- βλέπει subscription status,
- επιλέγει και διαχειρίζεται τα stores του.

### 2.3 Employees / Public Viewers

Οι εργαζόμενοι δεν έχουν account, password, Firebase UID ή tenant membership. Μπαίνουν στο tenant URL χωρίς login και βλέπουν sanitized public δεδομένα.

## 3. Scheduler Business Model

Οι υπάρχοντες scheduler roles παραμένουν, όπως `CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B`, `INTERMEDIATE`, `CUSTOM`, `EXTRA_A` και `EXTRA_B` ή τα legacy aliases τους. Είναι business classifications και όχι auth roles.

Το auto-generation πρέπει να διατηρεί:

- fixed days off,
- absences και unavailability,
- weekly core rotation,
- Sunday rules,
- coverage constraints,
- deterministic output,
- manual overrides,
- warnings όταν δεν είναι δυνατή πλήρης κάλυψη.

Ο owner μπορεί πάντα να κάνει manual αλλαγές. Οι παραβιάσεις κανόνων εμφανίζονται ως warnings και δεν κρύβονται.

## 4. Public Tenant Experience

Το public view λειτουργεί χωρίς login και μπορεί να εμφανίζει:

- εβδομαδιαίο πρόγραμμα,
- μηνιαίο πρόγραμμα,
- ώρες εργασίας ανά εργαζόμενο,
- ανακοινώσεις,
- Άδεια,
- Ρεπό,
- Δεν εργάζεται,
- public σημειώσεις.

Παραδείγματα:

- Μαρία — Άδεια
- Γιώργος — Ρεπό
- Νίκος — Δεν εργάζεται

Δεν εμφανίζονται λόγοι ασθένειας/άδειας, ιατρικά δεδομένα, δικαιολογητικά, private notes, στοιχεία επικοινωνίας, ΑΦΜ, UID, memberships, audit data ή raw Firestore records.

Απαιτείται διαχωρισμός:

- `publicNote`: εμφανίζεται δημόσια,
- `privateNote`: εμφανίζεται μόνο στον owner.

Το υπάρχον γενικό `notes` field δεν δημοσιεύεται αυτόματα.

## 5. Registration Tokens

Το register επιτρέπεται μόνο με έγκυρο token που δημιουργεί ο ShiftOryx Admin.

Μορφή: `XXX-XXX-XXX`, π.χ. `K7X-M4P-92Q`.

Token statuses:

- `ACTIVE`
- `USED`
- `EXPIRED`
- `REVOKED`

Security requirements:

- cryptographically secure generator,
- αποφυγή ambiguous χαρακτήρων,
- αποθήκευση μόνο hash,
- πλήρης εμφάνιση μόνο μία φορά,
- one-time atomic consumption,
- expiration,
- revoke,
- rate limiting,
- generic errors,
- κανένα token σε logs.

Registration flow:

```text
shiftoryx.gr/register
→ token validation
→ account creation
→ business name
→ slug selection
→ availability check
→ atomic slug reservation
→ user profile
→ tenant
→ OWNER membership
→ default settings
→ trial 7 ημερών
→ redirect στο tenant workspace
```

## 6. Automated Tenant Subdomains

Υπάρχει ένα wildcard DNS record: `*.shiftoryx.gr`. Όλα τα tenant domains καταλήγουν στην ίδια εφαρμογή. Δεν δημιουργείται DNS record, container, deployment, codebase ή tunnel route ανά tenant.

Tenant resolution:

```text
hostname
→ normalize lowercase
→ reject reserved/root hosts
→ extract slug
→ validate slug format
→ load slug reservation/tenant
→ verify tenant status
→ load public ή owner experience
```

Slug rules:

- lowercase `a-z`, `0-9` και hyphen,
- χωρίς leading/trailing hyphen,
- 3–40 χαρακτήρες,
- reserved names όπως `www`, `admin`, `api`, `login`, `register`, `app`, `support`, `status`, `mail`, `firebase`,
- atomic uniqueness,
- unknown slug επιστρέφει safe not-found page.

## 7. Multi-Store Owner

Ένας owner μπορεί να έχει πολλά stores/tenants. Μετά το login φορτώνονται όλα τα ACTIVE OWNER memberships και εμφανίζεται store selector.

Κάθε store card εμφανίζει:

- business name,
- primary domain,
- plan,
- trial/subscription status,
- expiry,
- employee count,
- last activity,
- Enter workspace,
- Billing,
- Request change.

Ο selector εμφανίζεται πάντα για σταθερή εμπειρία και μελλοντική προσθήκη store. Το authentication στο root domain και η μετάβαση σε subdomain πρέπει να χρησιμοποιούν τον υφιστάμενο short-lived auth broker ή ισοδύναμο ασφαλές server-side session bridge. Το hostname δεν αποτελεί authorization.

## 8. Trial Και Subscriptions

### 8.1 Trial

- διάρκεια 7 ημέρες,
- απαιτεί registration token,
- 1 store,
- έως 10 employees,
- planning horizon 1 εβδομάδα,
- auto-generation και manual edit,
- public schedule, announcements, leave/rest statuses,
- basic history,
- ένα PDF export,
- χωρίς Excel/Word/monthly archive,
- χωρίς δεύτερο store.

### 8.2 Paid Plans — Προτεινόμενο Αρχικό Pricing

- Monthly: €14,90 ανά πρώτο store, planning horizon 2 μήνες.
- Quarterly: €39,90 ανά πρώτο store, planning horizon 6 μήνες.
- Semiannual: €74,90 ανά πρώτο store, planning horizon 12 μήνες.

Επιπλέον stores του ίδιου owner:

- Monthly: €8,90 ανά store.
- Quarterly: €23,90 ανά store.
- Semiannual: €44,90 ανά store.
- 4+ stores: custom quote.

Όλα τα paid plans έχουν ίδια full features και διαφέρουν σε διάρκεια, έκπτωση και planning horizon. Το pricing είναι product proposal και χρειάζεται λογιστικό/φορολογικό έλεγχο πριν δημοσιευτεί.

### 8.3 Entitlement Enforcement

Τα limits δεν ελέγχονται μόνο στο UI. Κάθε sensitive server action ελέγχει tenant status, active subscription, planning horizon, feature entitlement και ownership.

Subscription statuses:

- `TRIAL`
- `ACTIVE`
- `GRACE_PERIOD`
- `EXPIRED`
- `SUSPENDED`
- `DELETED`

Grace period: προτεινόμενα 7 ημέρες read-only με renewal access. Μετά γίνεται `EXPIRED`. Τα δεδομένα διατηρούνται τουλάχιστον 90 ημέρες και δεν διαγράφονται αυτόματα χωρίς retention job, audit και explicit policy.

## 9. Subdomain Rename

Παράδειγμα: `test-spiros.shiftoryx.gr` → `spiros-fuels.shiftoryx.gr`.

Flow:

- reserve new slug atomically,
- update tenant primary slug,
- create alias for old slug,
- days 1–14: redirect to new domain,
- days 15–30: safe “workspace moved” page,
- day 31: slug becomes reusable,
- preserve audit history,
- prevent redirect loops,
- validate `returnTo` and target tenant.

Με wildcard DNS δεν διαγράφεται DNS record. Οι σωστοί όροι UI είναι Suspend workspace, Deactivate workspace, Soft delete tenant, Restore workspace.

## 10. Customization Request Model

Ο owner δεν αλλάζει αυθαίρετα source code ή custom components. Υπάρχει authenticated request form για αλλαγές branding/UI/menu. Το αίτημα εμφανίζεται στο ShiftOryx admin panel και αποστέλλεται notification email. Ο admin το κοστολογεί και μετά από συμφωνία γίνεται controlled implementation.

Request fields:

- tenant,
- category,
- description,
- desired result,
- attachments μόνο με safe upload validation,
- requested deadline,
- status: `SUBMITTED`, `REVIEWING`, `QUOTED`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `REJECTED`,
- quote amount και notes admin-only.

Δεν επιτρέπονται custom JavaScript, HTML, external scripts ή unsafe embeds.

## 11. Recommended Tech Stack

Απόφαση: δεν γίνεται rewrite. Κρατάμε το υπάρχον stack και το ενισχύουμε στα privileged flows.

Frontend:

- React 19,
- TypeScript για κάθε νέο/τροποποιούμενο critical module,
- Vite 8,
- React Router ή το υπάρχον routing abstraction,
- Zustand με σταδιακό split σε domain slices,
- Tailwind CSS 3.x για stability στο υπάρχον codebase,
- dnd-kit,
- existing scheduler engine,
- existing export libraries μόνο όπου ήδη χρειάζονται.

Δεν γίνεται μαζική migration σε Next.js. Δεν γίνεται forced Tailwind major upgrade μέσα στο SaaS migration. Αυτά δεν προσφέρουν αρκετή αξία ώστε να δικαιολογούν το regression risk.

Backend/platform:

- Firebase Authentication για owner/admin identity,
- Cloud Firestore για tenant-scoped operational data,
- Firebase Storage για private exports και safe assets,
- Firebase Cloud Functions 2nd gen για privileged workflows,
- Firebase Admin SDK μόνο σε trusted server environment,
- Firestore transactions/batches για token consumption, slug reservation, tenant creation και lifecycle changes,
- Firestore Security Rules ως enforcement boundary,
- Firebase Emulator Suite για integration/security tests.

Cloud Functions runtime:

- Node.js 22 LTS ως προτεινόμενο σταθερό runtime για τώρα,
- TypeScript,
- pinned package-manager lockfile,
- no force audit upgrades,
- secrets μέσω Firebase/Google Secret Manager ή runtime secret bindings.

Edge/domain:

- Cloudflare DNS,
- wildcard `*.shiftoryx.gr`,
- Cloudflare Tunnel ή reverse proxy προς ένα shared frontend origin,
- TLS managed at Cloudflare edge,
- rate limiting/WAF για auth, token και admin endpoints,
- exact root-domain rules και dynamic tenant validation από τη βάση.

Hosting/runtime:

- Docker Compose,
- Nginx static SPA serving,
- one shared ShiftOryx frontend container,
- healthcheck,
- restart policy,
- structured deployment version metadata.

Testing:

- existing Node validation scripts,
- Vitest προτείνεται μόνο όταν χρειάζονται νέα component/unit tests και αφού ελεγχθεί αν υπάρχει ήδη test runner,
- Firebase Emulator tests,
- Playwright E2E για public, owner, admin, registration, multi-store και subscription flows,
- npm audit, Trivy, Semgrep/reporting όπως ήδη υπάρχουν.

Observability:

- Uptime Kuma,
- HomeOps read-only ingestion,
- structured application audit events,
- Cloudflare traffic analytics,
- Firebase usage/error monitoring,
- log redaction,
- error tracking μόνο μετά από privacy review και explicit approval για external telemetry.

## 12. VPS / Production Hosting Strategy

Απόφαση: το homelab παραμένει κατάλληλο για το BP Kallis pilot και development. Πριν ξεκινήσει paid public beta με πραγματικούς πελάτες, προτείνεται production VPS ώστε η υπηρεσία να μην εξαρτάται από οικιακό ρεύμα, ISP, router ή φυσική πρόσβαση.

Προτεινόμενο minimum VPS:

- 4 vCPU,
- 8 GB RAM,
- 80–160 GB NVMe,
- Ubuntu 24.04 LTS,
- public IPv4/IPv6,
- snapshots/backups,
- ευρωπαϊκό datacenter,
- Docker Engine + Compose,
- firewall και automatic security updates.

Provider recommendation:

1. OVHcloud VPS-2 ως προτιμώμενη αρχική production επιλογή λόγω ευρωπαϊκής υποδομής, anti-DDoS και daily backup χαρακτηριστικών στο τρέχον offer. Πριν την αγορά ελέγχεται η τελική ελληνική τιμή/ΦΠΑ και datacenter.
2. Contabo Cloud VPS 20 ή αντίστοιχο ως budget/value επιλογή όταν προτεραιότητα είναι περισσότερη RAM/storage. Χρειάζεται προσεκτικότερη ανεξάρτητη πολιτική backups, monitoring και performance verification.
3. Άλλος ευρωπαϊκός provider επιτρέπεται αν καλύπτει τα ίδια minimums, predictable billing, snapshots και SLA.

Δεν αγοράζουμε VPS πριν:

- ολοκληρωθεί Phase 1 current-state audit,
- επιβεβαιωθεί ο τρόπος deployment,
- αγοραστεί/ρυθμιστεί `shiftoryx.gr`,
- υπάρχει backup/restore test,
- υπάρχει κόστος τουλάχιστον 6–12 μηνών διαθέσιμο.

Production topology:

```text
Browser → Cloudflare → shiftoryx.gr ή *.shiftoryx.gr → VPS Nginx/container → Firebase services
```

Το homelab μπορεί να παραμείνει staging, backup target ή internal environment, όχι μοναδικό production dependency.

## 13. Target Data Model

Platform collections:

- `users/{uid}`
- `tenants/{tenantId}`
- `tenantMemberships/{uid}_{tenantId}`
- `platformAdmins/{uid}`
- `registrationTokens/{tokenHash}`
- `slugReservations/{slug}`
- `slugAliases/{oldSlug}`
- `platformAuditLogs/{eventId}`
- `customizationRequests/{requestId}`

Tenant private data:

- `tenants/{tenantId}/employees`
- `shifts`
- `shiftTemplates`
- `absences`
- `settings`
- `announcements`
- `weekHistory`
- `auditLogs`
- `subscription/current`
- `usage/daily`

Tenant public data:

- `publicSchedules`
- `publicMonths`
- `publicEmployees`
- `publicAnnouncements`
- `publicStatusEntries` ή sanitized status fields.

Membership MVP:

- `uid`,
- `tenantId`,
- `role: OWNER`,
- `status: ACTIVE/REVOKED`,
- `createdAt`,
- `updatedAt`.

## 14. HomeOps Integration

Το HomeOps είναι ξεχωριστό project και λαμβάνει μόνο read-only operational metrics:

- uptime,
- traffic,
- HTTP status,
- container/host CPU, RAM, storage,
- Cloudflare Tunnel,
- Firebase Functions health,
- error rate,
- active tenants count,
- backup status,
- deployment version.

Δεν λαμβάνει tokens, auth tickets, credentials, employee private data, private notes ή reasons of absence.

## 15. Codex Phase Roadmap

### Phase 0 — Documentation Alignment

Goal: όλα τα repo docs να συμφωνούν με το master roadmap.

Tasks:

- inspect README, AGENTS.md, FIREBASE_SCHEMA.md και docs,
- replace product identity with ShiftOryx where safe,
- document current/legacy domains separately from target domains,
- enforce OWNER-only tenant auth model in documentation,
- distinguish scheduler roles from auth roles,
- add trial, pricing, multi-store, tokens, customization requests, VPS strategy,
- create contradictions report.

Deliverables:

- updated docs,
- `docs/CURRENT_STATE.md` skeleton,
- `docs/ROADMAP_ALIGNMENT_REPORT.md`.

Stop: no runtime changes.

### Phase 1 — Current-State Audit

Goal: αποτύπωση πραγματικού code/runtime πριν implementation.

Inspect:

- routes,
- stores,
- repositories,
- rules,
- Functions,
- feature flags,
- existing memberships,
- platform admin,
- auth broker,
- deployment and tests,
- dependency advisories.

Deliverable: `docs/CURRENT_STATE.md` με implemented/partial/missing/legacy/risky classification.

Stop: no business logic changes.

### Phase 2 — Role And Authorization Normalization

Goal: OWNER-only tenant auth χωρίς break του pilot.

Tasks:

- inventory ADMIN/MANAGER memberships,
- compatibility reader για legacy roles μόνο προσωρινά,
- new writes create OWNER only,
- owner authorization helper,
- platform admin remains separate,
- emulator tests for cross-tenant denial.

Exit criteria:

- owner access works,
- employee public access works,
- unauthorized users denied,
- BP Kallis regression passes.

### Phase 3 — Registration Token Backend

Goal: secure token lifecycle.

Implement in Cloud Functions:

- `generateRegistrationToken` admin-only,
- list safe token metadata,
- `revokeRegistrationToken`,
- validate token with generic response,
- atomic consume during registration,
- rate limiting and audit.

Tests: valid, expired, revoked, reused, concurrent consumption, unauthorized generation.

### Phase 4 — Automated Tenant Provisioning

Goal: register → usable workspace χωρίς manual infrastructure.

Atomic workflow:

- validate token,
- create/verify Firebase user,
- reserve slug,
- create tenant,
- create OWNER membership,
- create defaults,
- create trial subscription,
- consume token,
- audit.

Αποτυχία σε οποιοδήποτε βήμα δεν αφήνει orphan tenant, membership ή reserved slug.

### Phase 5 — Root Portal And Store Selector

Routes:

- `/login`,
- `/register`,
- `/forgot-password`,
- `/reset-password`,
- `/stores`,
- `/admin`.

Owner login loads memberships and shows stores. Tenant redirects use the auth broker. No open redirect.

### Phase 6 — Wildcard ShiftOryx Domains

Only after domain purchase. Domain ownership is now `PURCHASED`, but configuration and cutover remain unapproved.

Tasks:

- Cloudflare zone,
- root/www records,
- wildcard record,
- tunnel/reverse proxy route,
- Firebase authorized domains,
- CSP/connect-src/frame rules,
- tenant resolver,
- unknown/suspended/expired states,
- dual-domain BP Kallis rollout.

Rollback keeps homelabshare URL active.

### Phase 7 — Trial And Subscription Entitlements

Implement one central entitlement service used by UI and Functions.

Checks:

- status,
- expiry,
- planning horizon,
- employee limit,
- exports,
- archive,
- store count,
- grace period.

Server time is source of truth. Client clock cannot extend access.

### Phase 8 — Multi-Store Lifecycle

- add paid store flow,
- store selector,
- per-store subscriptions/entitlements,
- additional-store pricing metadata,
- owner cannot access a store without membership,
- safe store suspension.

### Phase 9 — ShiftOryx Admin Panel

Modules:

- dashboard,
- owners,
- tenants,
- tokens,
- trials/subscriptions,
- customization requests,
- usage/traffic,
- audit logs,
- workspace lifecycle.

Every write is server-side, admin-authorized, confirmed and audited.

### Phase 10 — Public Statuses And Notes

- migrate `publicNote`/`privateNote`,
- sanitized Άδεια/Ρεπό/Δεν εργάζεται,
- owner preview before publish,
- tests proving no private reason/notes leak.

### Phase 11 — Subdomain Rename And Aliases

- atomic rename,
- 14-day redirect,
- moved page until day 30,
- release day 31,
- collision/loop tests,
- audit and rollback.

### Phase 12 — Customization Request Workflow

- owner form,
- admin inbox,
- safe attachments if required,
- email notification,
- quote/status lifecycle,
- no automatic code execution.

### Phase 13 — VPS Production Migration

- choose provider/plan,
- harden Ubuntu,
- non-root deploy user,
- SSH keys only,
- firewall,
- Docker deployment,
- Cloudflare route,
- backup and restore drill,
- staging smoke,
- controlled cutover,
- rollback to homelab.

### Phase 14 — HomeOps Read-Only Integration

- sanitized health endpoint,
- signed/internal access,
- traffic and system metrics,
- no business/private payloads.

### Phase 15 — Billing Provider

Future phase after manual subscriptions are stable.

- select EU-compatible provider,
- checkout,
- webhooks with signature verification,
- idempotency,
- invoices/renewals,
- failed payment lifecycle,
- no trust in client payment state.

## 16. Required Validation Per Phase

Minimum checks depending on scope:

- `npm run build`,
- scheduler engine validation,
- repository boundaries,
- public-readonly QA,
- tenant authorization QA,
- auth broker QA,
- export security,
- Firebase Emulator tests,
- Playwright desktop/mobile flows,
- npm audit review,
- Trivy/Semgrep where configured.

Production changes additionally require:

- backup,
- maintenance mode when necessary,
- local health,
- public health,
- logs,
- owner smoke,
- public smoke,
- rollback verification.

## 17. Codex Phase Report Contract

At the end of every phase Codex must report:

- phase goal,
- current branch and base,
- files changed,
- behavior added/removed,
- migrations,
- tests and exact outcomes,
- dependencies changed and why,
- secrets touched or not touched,
- Firebase rules/Functions touched,
- GitHub Actions touched,
- deployment touched,
- security findings,
- remaining risks,
- rollback procedure,
- recommended next phase.

## 18. Security & Supply-Chain Requirements

Before implementing any change:

1. Do not add dependencies unless clearly necessary.
2. Explain why, alternatives, existing-code option, maintenance status, scripts/native binaries.
3. Prefer existing dependencies.
4. Never edit lockfiles manually; use package manager.
5. Do not change GitHub Actions permissions unless required.
6. No `pull_request_target` without explicit approval.
7. No OIDC/id-token permission without explicit approval.
8. Never expose secrets/tokens/keys/database URLs.
9. Never print secrets in logs.
10. No external telemetry/data transmission without explicit request.
11. Upload/auth/admin/database/command changes require security checks.
12. Validate inputs, handle errors safely, avoid dynamic execution.
13. Provide security review after implementation.
14. Stop and propose safer alternative if a request conflicts.

## 19. Definition Of MVP Ready

The MVP is ready only when:

- admin can securely generate/revoke tokens,
- owner registers with token,
- tenant and trial are created atomically,
- wildcard subdomain resolves automatically,
- owner can have multiple stores,
- store selector works,
- employees use public view without login,
- scheduler and manual edit remain stable,
- public statuses/notes are sanitized,
- subscription limits are enforced server-side,
- admin panel controls tenant lifecycle,
- cross-tenant access is denied,
- BP Kallis remains operational,
- backups and rollback are tested,
- production runs on an approved VPS before paid beta.

## 20. Next Action

The next Codex action is Phase 0 only: align repository documentation with this master roadmap. Codex must not start runtime implementation, DNS changes, Firebase rules deployment, dependency upgrades or production deployment until the documentation phase is reviewed and approved.
