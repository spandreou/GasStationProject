# ShiftOryx — Master Product, Technical Architecture & Codex Execution Roadmap

Revision date: 17 July 2026

Repository roadmap synchronization date: 22 July 2026

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

Το ShiftOryx είναι multi-tenant SaaS για δημιουργία, διαχείριση και δημοσίευση προγραμμάτων βαρδιών για καταστήματα και επιχειρήσεις με βάρδιες.

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

An ACTIVE ShiftOryx Platform Admin is a platform-only identity and is not a
tenant/store owner. Its UID must have zero `tenantMemberships`; an `OWNER`,
`ADMIN` or `MANAGER` membership for that UID is a forbidden dual-role state.
An inactive or revoked membership for that UID remains an anomaly requiring
manual review and must not be silently deleted. Platform-admin status never
substitutes for tenant membership and never grants tenant authorization.

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

Στο τρέχον σύστημα λειτουργούν δύο επίπεδα:
- **Scheduler Contract V2 (Authoritative Product Contract, PR #44)**: Το μοντέλο scheduling είναι tenant-configurable και δεν βασίζεται σε universal όριο 4–6 εργαζομένων ούτε σε υποχρεωτικά SaaS roles τύπου `CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B`. Κάθε tenant ορίζει τα δικά του operating windows, shift templates και demand slots. Το μέγεθος της ομάδας είναι ελεύθερο υπό την προϋπόθεση ότι ικανοποιούνται μαθηματικά οι απαιτήσεις κάλυψης και οι αυστηροί περιορισμοί (όπως το ελάχιστο 11ωρο ανάπαυσης, οι μέρες ανάπαυσης ανά εβδομάδα, τα fixed days off και οι απουσίες).
- **Legacy Compatibility Path**: Οι ιστορικοί scheduler roles (`CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B`, `INTERMEDIATE`, `CUSTOM`, `EXTRA_A`, `EXTRA_B`) και η σταθερή 4-slot τοπολογία παραμένουν πλήρως λειτουργικά για backwards compatibility με υφιστάμενα καταστήματα όπως το BP Kallis. Είναι αποκλειστικά business/scheduling classifications και όχι auth roles.

Το auto-generation (τόσο στο V2 όσο και στο legacy path) διατηρεί απαρέγκλιτα:
- fixed days off,
- absences και unavailability,
- minimum rest protection (11 hours minimum turnaround),
- Sunday coverage rules και διαφάνεια,
- coverage constraints,
- deterministic output μέσω seeded PRNG,
- manual overrides,
- zero-write validation-persistence gate (καμία αποθήκευση άκυρου προγράμματος),
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

## Business Category Templates And Safe Branding

ShiftOryx remains one shared, config-driven multi-tenant application. Category presentation is selected from configuration; it never creates a separate tenant codebase, customer source fork, frontend deployment, container, DNS record or tunnel route.

Initial supported `businessCategory` values:

- `FUEL_STATION`
- `CAFE`
- `RESTAURANT`
- `HAIR_SALON`
- `RETAIL`
- `OTHER`

Fuel stations may use the current BP Kallis-oriented preset, while cafes, restaurants, hair salons and retail stores use approved category-appropriate presets. `OTHER` always resolves to an approved safe generic fallback; it does not unlock unrestricted customization.

Future tenant/store assignment fields:

```text
businessCategory
templateId
templateVersion
brandingOverrides
customizationMode
```

A centrally managed, versioned template catalog will define category compatibility, approved presentation schema, lifecycle status, preview metadata and controlled migration information. A template or validated `brandingOverrides` object may control only:

- background preset,
- logo,
- color tokens,
- typography preset,
- approved images or illustrations,
- radius and density preset,
- approved layout variants,
- enabled sections,
- public-page presentation.

Arbitrary or unrestricted CSS, custom JavaScript, custom HTML, external scripts, executable themes and unsafe embeds are prohibited. Configuration is validated against an approved schema and is data only; it cannot execute code.

Phase ownership is explicit: Phase 4 assigns a default category/template during provisioning, Phase 8 manages category/template per store, Phase 9 owns the central catalog, versions, admin assignment, preview and migration controls, and Phase 12 owns authenticated quote-based special customization. These are roadmap capabilities and are not implemented runtime behavior today.

## 10. Customization Request Model

Ο owner δεν αλλάζει αυθαίρετα source code ή custom components. Χρησιμοποιεί authenticated request form για ειδικές αλλαγές branding/UI/menu. Το public owner form δεν χρειάζεται να διαφημίζει fixed surcharge ή δημόσιο customization price list. Το αίτημα εμφανίζεται στο ShiftOryx admin panel και μπορεί να ενεργοποιεί notification email, ενώ η κοστολόγηση παραμένει εσωτερική και quote-based.

Request fields:

- tenantId,
- storeId όπου εφαρμόζεται,
- category,
- description,
- desiredResult,
- requestedDeadline,
- status,
- quoteAmount,
- ownerAcceptedAt,
- adminNotes,
- createdAt,
- updatedAt.

Server-owned lifecycle:

```text
SUBMITTED
→ REVIEWING
→ QUOTED
→ ACCEPTED
→ IN_PROGRESS
→ COMPLETED
```

`REJECTED` is also valid. Clients cannot set privileged transitions, `quoteAmount` or `adminNotes`. No custom implementation starts until the owner explicitly accepts the quote and the server records that acceptance. Controlled implementation then remains within the shared application and approved template/branding boundary.

Attachments are deferred until a separately reviewed private upload design defines authorization, Storage paths, MIME/type and size validation, safe filenames, malware-aware handling where appropriate, retention and denial of public access.

Δεν επιτρέπονται arbitrary or unrestricted CSS, custom JavaScript, custom HTML, external scripts, executable themes ή unsafe embeds.

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
- `templateCatalog/{templateId}` (future conceptual catalog; exact shape owned by Phase 9)
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

Future template catalog metadata, conceptually:

- stable `templateId`,
- immutable/versioned `templateVersion`,
- supported business categories,
- lifecycle/status metadata,
- validated approved presentation schema,
- preview-safe metadata,
- assignment and migration controls,
- created/updated audit timestamps.

Future tenant/store category and branding assignment:

- `businessCategory`,
- `templateId`,
- `templateVersion`,
- `brandingOverrides`,
- `customizationMode`.

Future customization request lifecycle fields:

- `tenantId`,
- optional `storeId`,
- `category`,
- `description`,
- `desiredResult`,
- `requestedDeadline`,
- server-owned `status`,
- admin-only `quoteAmount` and `adminNotes`,
- `ownerAcceptedAt`,
- `createdAt`,
- `updatedAt`.

These are conceptual target fields. Exact collection shapes and Security Rules are finalized and tested only in their owning phases; this roadmap does not claim the catalog or workflow exists today.

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

### Phase 2A — Read-Only Role Inventory And Migration Design (CLOSED)

Status: **CLOSED**

Achievements:
- Read-only inventory and discovery of production memberships completed.
- Pure syntactic owner validator and deterministic overlap remediation planner implemented and verified.
- Platform Admin decoupling and zero-membership invariant established across emulator test suites.
- Production rehearsal proved 100% clean isolation.

### Phase 2B — Separately Approved Controlled OWNER Migration (CLOSED)

Status: **CLOSED (NO DATA MIGRATION REQUIRED)**

Production Closure Summary:
- **Functions Runtime**: Node.js 22 LTS (Gen 2, Firebase Functions v7, Firebase Admin SDK v14) deployed and verified.
- **Rules Remediation**: PR #31 deployed; `employee_absences_private` permanently fail-closed (`allow read, write: if false;`).
- **Platform Admin / Tenant OWNER Overlap Remediated**: Platform Admin (`UxRxFzjU0Wbf0g98p9phN7yV0JJ3`) has 0 tenant memberships and no mirror.
- **Pilot OWNER Identity Established**: `IlyYsuAS3mYZ5CK8lYtp5NhIJBU2` is confirmed active test pilot `OWNER` for `bp-kallis` (`REAL_BUSINESS_OWNER_PRESENT=NO`, `ACCOUNT_TYPE=TEST_PILOT`, `FUTURE_REAL_OWNER_TRANSFER_REQUIRED=YES`).
- **Production Inventory**: `TOTAL_MEMBERSHIP_COUNT=1`, `OWNER_COUNT=1`, `ADMIN_COUNT=0`, `MANAGER_COUNT=0`, `PLATFORM_ADMIN_OVERLAP_COUNT=0`, `MANUAL_REVIEW_COUNT=0`.
- **Phase 2B Migration Scope**: Evaluated as `EMPTY`. No data migration writer was required or executed.
- **OWNER-Only Enforcement Merged (PR #32)**:
  - Frontend, Firestore Rules, Storage Rules, and Cloud Functions enforce `OWNER` only.
  - Active Platform Admin hard separation enforced (`!isActivePlatformAdmin()`).
- **Production Rollout Completed**:
  - Firestore OWNER-only Rules deployed (`rulesets/7de47fff-549a-42bc-af67-5ab6fd32098d`).
  - Storage OWNER-only Rules deployed (`rulesets/3fdf1c09-6807-4f25-9255-26e677c9a8f8`).
  - Cloud Functions deployed: `createAuthTicket`, `exchangeAuthTicket` (Node 22 Gen 2). `cleanupAuthTickets` preserved intact.
- **Phase 2 Status**: **CLOSED**. Next Phase: **Phase 3** (`PHASE_3_STARTED=NO`).

### Phase 3 — Registration Token Backend (CLOSED)

Status: **CLOSED**

Production Closure Summary:
- Deployed to `gasstationproject-9dd89` on 2026-08-28.
- 256-bit entropy cryptographic tokens (`stx_...`), opaque management IDs (`rtok_...`), SHA-256 lookup hashes in `registrationTokenLookups`, zero plaintext token persistence.
- Cloud Functions: `generateRegistrationToken`, `listRegistrationTokens`, `revokeRegistrationToken`, `validateRegistrationToken`.
- Firestore Rules: `rulesets/51bf31c1-87a3-47f8-964a-aea3c7e41bf0` deny-all direct client access to `registrationTokens`, `registrationTokenLookups`, `platformAuditLogs`, and `rateLimits`.
- Fail-closed canonical `expiresAt` validation and bounded rate limiting.

### Phase 4 — Automated Tenant Provisioning (CLOSED)

Status: **CLOSED**

Production Closure Summary:
- Deployed to `gasstationproject-9dd89` on 2026-08-28.
- Cloud Function: `provisionTenantFromRegistrationToken` (Node.js 22 Gen 2 in `us-central1`).
- Atomic single-transaction provisioning across `slugReservations`, `tenants`, `tenantMemberships` (`role: 'OWNER'`, zero PII email), `users/{uid}` mirror, scheduler settings, 7-day trial subscription (`trialEndsAt`), token consumption (`status: 'CONSUMED'`), and `platformAuditLogs`.
- Strict 3–40 character slug validation, platform admin overlap denial, existing membership fail-closed check, safe `OTHER` category fallback, `domain: null` pending Phase 6 cutover. Total production Cloud Functions: 8.

### Phase 5 — Root Portal And Store Selector (CLOSED)

Status: **CLOSED**

Production Closure Summary:
- Merged to `main` at `c2ad046f3966e6ac81b623e679545afaa6dcdd6d` and verified live on Vercel Production.
- Routes: `/`, `/login`, `/register`, `/stores`, `/select-tenant`, `/admin`.
- Progressive 5-step registration flow, transient memory tokens, zero password/PII leaks, direct `createUserAccount`.
- Central login identity routing via pure `determinePostLoginDestination` with fail-safe platform admin lookup.
- Open redirect prevention via `resolveAuthorizedReturnTo` tenant membership verification.
- Functions discovery guard verified at 658ms (< 3000ms threshold).

### Scheduler Contract V2 (PR #44 — CLOSED)

Status: **CLOSED & PRODUCTION VERIFIED**

Production Closure Summary:
- Approved PR #44 head: `c1844ca66bbcf5261e2433481facf036e7aeccdf`.
- Squash merged to `main`: `8ee1985d2cec350b1cafa980e99f1dc46b32577a` (authoritative baseline).
- Vercel Production state: `READY` (success), verified via HTTP smoke and client-route rendering.
- Tenant-configurable shift templates, operating windows, headcount constraints (`minHeadcount`, `maxHeadcount`, `targetHeadcount`), days off constraints (`minDaysOffPerWeek`, `targetDaysOffPerWeek`), explicit slot identity (`shiftTemplateId`, `demandSlotId`), manual work override preservation during auto-generation, and unified validation-persistence gate (`validateAndPersistScheduleCandidate`).
- 2,118 automated test assertions passing; zero backward compatibility regression for legacy fixed 4-slot scheduling.
- Specification document: `docs/SCHEDULER_CONTRACT_V2.md`.

### Phase 6 — Wildcard ShiftOryx Domains

Status: **CURRENT ACTIVE PHASE (PREFLIGHT / READINESS MODE)**

Domain ownership is confirmed (`shiftoryx.gr` is `PURCHASED`).
Phase 6 Preflight specification (PR #42) aligns DNS, Vercel wildcard domain, Firebase Authorized Domains, Auth Broker, frontend configuration, and rollback safety.
Phase 6A dual-domain compatibility implementation exists in PR #43 (Draft, unmerged, not production baseline).
Live production cutover requires explicit human approval.

Tasks:

- Vercel nameserver delegation (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`),
- root/www records and wildcard record (`*.shiftoryx.gr`) on Vercel,
- Firebase Authorized Domains (`shiftoryx.gr`, `www.shiftoryx.gr`),
- CSP/connect-src/frame rules,
- tenant resolver,
- unknown/suspended/expired states,
- dual-domain BP Kallis rollout (keeping `bp-kallis.homelabshare.gr` active during overlap).

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
- per-store `businessCategory`, `templateId`, `templateVersion`, `brandingOverrides` and `customizationMode` assignment and lifecycle,
- safe `OTHER` fallback when no approved category-specific template applies,
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
- centrally managed versioned template catalog,
- category compatibility, safe preview and admin assignment controls,
- controlled template-version migration with audit and rollback metadata,
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

- authenticated owner form without a required public fixed price list,
- admin inbox and optional notification email,
- server-owned `SUBMITTED`/`REVIEWING`/`QUOTED`/`ACCEPTED`/`IN_PROGRESS`/`COMPLETED` transitions plus `REJECTED`,
- admin-only `quoteAmount` and `adminNotes`,
- explicit owner quote acceptance before any controlled implementation,
- safe private attachments only after a separately reviewed upload design,
- implementation limited to the shared app and approved template/branding controls,
- no automatic code execution or prohibited theme mechanism.

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

### Phase 14 — HomeOps Read-Only Integration (CANCELLED)

Status: **CANCELLED**

HomeOps read-only integration is officially cancelled. Codebase audit confirms zero HomeOps endpoints, telemetry collectors, background daemons, or dependencies exist in the repository.

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

Phase 0, 1, 2A, 2B, 3, 4, and 5 are fully complete, verified, and closed.
Phase 6 (Wildcard ShiftOryx Domains & Production Cutover) is the current active phase in **Preflight / Readiness Mode**.
The comprehensive preflight discovery, DNS analysis, Vercel wildcard domain design, Firebase Auth analysis, and rollback plan have been established.
Production domain cutover requires explicit human approval before any DNS, Vercel domain, or Firebase Authorized Domains configuration is executed.
