# ShiftOryx - Πλήρης Αναφορά Τρέχουσας Κατάστασης

Ημερομηνία αναφοράς: 17 Ιουλίου 2026

Repository: `spandreou/GasStationProject`

Production branch: `main`

Source snapshot: `main@865f2b2`

Live pilot: `https://bp-kallis.homelabshare.gr/`

Pilot tenant: `bp-kallis`

Master product direction: `ShiftOryx - Master Product, Technical Architecture & Codex Execution Roadmap` ([Google Doc](https://docs.google.com/document/d/187_L7GROL-WqmA01sP-8MfeQa8CxJBCYNQXGI2oxibM/edit?tab=t.0)). This report describes current implementation; the master document controls future phases when older wording conflicts.

## 1. Executive Summary

Το ShiftOryx είναι multi-tenant SaaS κατεύθυνση για προγράμματα βαρδιών, με πρώτο κλάδο τα πρατήρια καυσίμων. Το σημερινό BP Kallis pilot καλύπτει τη δημιουργία, επεξεργασία, αποθήκευση, δημόσια προβολή και εξαγωγή εβδομαδιαίων και μηνιαίων προγραμμάτων.

Η εφαρμογή έχει δύο βασικές εμπειρίες:

- Δημόσια read-only προβολή για εργαζόμενους και επισκέπτες.
- Διαχειριστικό περιβάλλον για τον ιδιοκτήτη ή εξουσιοδοτημένο tenant admin.

Το BP Kallis λειτουργεί ως ο πρώτος production-like pilot tenant. Η εφαρμογή είναι self-hosted σε Docker στο homelab, σερβίρεται από Nginx και είναι διαθέσιμη μέσω Cloudflare στο `bp-kallis.homelabshare.gr`.

Παράλληλα έχει δημιουργηθεί η τεχνική βάση για multi-tenant SaaS:

- tenant-scoped Firestore δεδομένα,
- UID-based tenant memberships,
- tenant provisioning εργαλεία,
- central authentication portal UI,
- Firebase-native auth broker με Cloud Functions,
- platform super-admin foundation,
- strict δημόσια και ιδιωτικά data boundaries.

Το κεντρικό SaaS portal, το billing/subscription σύστημα και το production enforcement του cross-subdomain auth broker δεν θεωρούνται ακόμη πλήρως ενεργοποιημένο τελικό προϊόν. Υπάρχουν ως ελεγχόμενη foundation πίσω από feature flags και runbooks.

## 2. Τρέχουσα Κατάσταση Με Μία Ματιά

| Περιοχή | Κατάσταση | Σημείωση |
| --- | --- | --- |
| BP Kallis live pilot | Ενεργό | Το public URL επέστρεψε HTTP `200` στις 17/07/2026 |
| Weekly scheduler | Υλοποιημένο | Manual και automatic scheduling |
| Monthly scheduler | Υλοποιημένο | Stacked εβδομάδες και month generation |
| Δημόσια read-only προβολή | Υλοποιημένη | Μόνο sanitized tenant snapshots |
| Admin login | Υλοποιημένο | Firebase Auth και ενεργό tenant membership |
| Tenant isolation | Υλοποιημένο | Core runtime data κάτω από `tenants/{tenantId}` |
| Absences / leave management | Υλοποιημένο | Admin-only λεπτομέρειες |
| Στατιστικά ωρών | Υλοποιημένα | Εβδομάδα και μήνας, διαθέσιμα και public χωρίς private absence breakdown |
| PDF / Excel / Word / WhatsApp | Υλοποιημένα | Admin-only export actions |
| Ιστορικό εβδομάδων | Υλοποιημένο | Snapshots και επαναφόρτωση |
| Μηνιαίο PDF archive | Υλοποιημένο | Private Storage archive, feature-flag controlled |
| Export audit logging | Υλοποιημένο | Silent, tenant-aware audit metadata |
| Central portal UI | Foundation έτοιμη | Routes και tenant selection υπάρχουν |
| Firebase auth broker | Foundation έτοιμη | Cloud Functions και replay protection υπάρχουν, default flag off |
| TenantGate enforcement | Foundation έτοιμη | Default flag off στο repository |
| Tenant provisioning CLI | Υλοποιημένο | Dry-run και emulator-first workflow |
| Platform super-admin | Foundation έτοιμη | Data model, rules και bootstrap tooling, χωρίς πλήρες UI console |
| Billing / subscriptions | Δεν έχει ολοκληρωθεί | Υπάρχει μόνο data/repository foundation |
| Employee-specific login | Δεν υπάρχει | Ο εργαζόμενος χρησιμοποιεί τη δημόσια read-only προβολή |

## 3. Τι Βλέπει Ο Δημόσιος Χρήστης

Ο δημόσιος χρήστης δεν χρειάζεται Firebase login για να δει το δημοσιευμένο πρόγραμμα του tenant.

Μπορεί να δει:

- το εβδομαδιαίο πρόγραμμα,
- το μηνιαίο πρόγραμμα σε stacked εβδομαδιαία blocks,
- ονοματεπώνυμο εργαζομένου,
- ημερομηνία,
- βάρδια και ώρες έναρξης/λήξης,
- sanitized λίστα εργαζομένων για τις ανάγκες εμφάνισης,
- δημόσιες ανακοινώσεις,
- ώρες εργασίας ανά εργαζόμενο για εβδομάδα ή μήνα.

Δεν μπορεί να δει:

- τηλέφωνο, email, ΑΦΜ ή στοιχεία πρόσληψης,
- Firebase UID ή tenant membership,
- private notes ή admin metadata,
- άδειες, ασθένειες, λόγους απουσίας ή private absence records,
- audit logs,
- ιστορικό διαχειριστή,
- monthly PDF archive και Storage metadata,
- edit/delete/add/generate/save/clear/export controls.

Η δημόσια προβολή διαβάζει μόνο sanitized collections:

```text
tenants/{tenantId}/publicSchedules/{weekStart}
tenants/{tenantId}/publicMonths/{YYYY-MM}
tenants/{tenantId}/publicEmployees/{employeeId}
tenants/{tenantId}/publicAnnouncements/{announcementId}
```

Τα public schedule snapshots αφαιρούν leave, sick, absence, rest και off entries. Οι private συλλογές δεν χρησιμοποιούνται ως public fallback.

## 4. Τι Μπορεί Να Κάνει Ο Διαχειριστής

Ο tenant admin έχει πρόσβαση σε ολόκληρο το operational περιβάλλον:

- δημιουργία, επεξεργασία και διαγραφή εργαζομένων,
- επεξεργασία προφίλ και scheduling role,
- fixed days off και κανόνες ανά εργαζόμενο,
- drag and drop βαρδιών,
- manual δημιουργία και επεξεργασία βάρδιας,
- shift templates,
- εβδομαδιαία και μηνιαία αυτόματη δημιουργία,
- αποθήκευση και φόρτωση εβδομαδιαίων snapshots,
- καθαρισμός ημέρας, εβδομάδας ή μήνα με confirmation,
- καταχώρηση άδειας, ασθένειας και άλλης απουσίας,
- ειδικές ημέρες, αργίες και προσαρμοσμένα ωράρια,
- κανόνες generator,
- ανακοινώσεις,
- στατιστικά εβδομάδας και μήνα,
- PDF, Excel, Word και WhatsApp exports,
- δημιουργία και λήψη private monthly PDF archives,
- πρόσβαση στο ιστορικό προγραμμάτων.

Οι ενέργειες που χρειάζονται χρόνο χρησιμοποιούν loading/pending feedback, success/error toasts και ασφαλή retry messages. Τα destructive actions διατηρούν confirmation dialog.

## 5. Scheduler Engine Και Επιχειρησιακοί Κανόνες

Ο scheduler engine βρίσκεται στο `src/scheduler-engine/` και είναι pure TypeScript source of truth. Το React/Zustand layer τον καλεί μέσω adapter, ώστε η business logic να παραμένει ανεξάρτητη από το UI.

### 5.1 Ρόλοι

Το engine υποστηρίζει:

- δύο core εργαζομένους,
- intermediate/coverage εργαζομένους,
- aliases παλαιότερων role labels,
- fallback role resolution όταν δεν έχουν οριστεί explicit roles.

Οι core εργαζόμενοι εναλλάσσονται ανά εβδομάδα μεταξύ πρωινής και απογευματινής πλευράς.

### 5.2 Κανόνες Κάλυψης

Οι βασικοί κανόνες που ελέγχονται είναι:

- Δευτέρα και Παρασκευή με τέσσερις διαθέσιμους: δύο πρωί και δύο απόγευμα.
- Τρίτη, Τετάρτη και Πέμπτη με τρεις διαθέσιμους: πρωί, intermediate και απόγευμα.
- Κυριακή: μία βάρδια `08:00-20:00`.
- Αποφυγή συνεχόμενων Κυριακών όταν αυτό είναι εφικτό.
- Αποφυγή overlap για τον ίδιο εργαζόμενο.
- Fixed day off ως hard constraint.
- Manual leave/sick/rest entries ως unavailable.
- Διατήρηση manual overrides κατά την αυτόματη δημιουργία.
- Deterministic output για τα ίδια inputs.

Αν οι διαθέσιμοι εργαζόμενοι ή οι περιορισμοί δεν επιτρέπουν πλήρη κάλυψη, το σύστημα εμφανίζει warning αντί να παρουσιάζει ένα ψεύτικα έγκυρο πρόγραμμα.

### 5.3 Weekly Και Monthly Modes

Το UI υποστηρίζει:

- week navigation,
- επιλογή εβδομάδας από ημερομηνία,
- month/year selectors,
- stacked weekly blocks για τον μήνα,
- εμφάνιση των ημερών του επόμενου μήνα όταν ανήκουν στην τελευταία εβδομάδα και υπάρχει public ή admin schedule data,
- responsive day cards με scroll-based mobile/tablet εμπειρία,
- active-day glow σε μικρές οθόνες.

## 6. Employees, Absences Και Special Days

### 6.1 Employees

Για κάθε εργαζόμενο μπορούν να αποθηκευτούν operational και private στοιχεία, όπως:

- ονοματεπώνυμο,
- display role και scheduling role,
- χρώμα κάρτας,
- fixed day off,
- rotation/fairness settings,
- στοιχεία επικοινωνίας και πρόσληψης για admin χρήση.

Τα private employee fields παραμένουν στην tenant admin collection. Το public mirror περιέχει μόνο display-safe πεδία.

### 6.2 Absences

Το absence module υποστηρίζει:

- άδεια,
- ασθένεια,
- άλλους τύπους απουσίας,
- ημερομηνίες έναρξης/λήξης,
- cancel/delete/update flows,
- εφαρμογή των απουσιών στον generator και στα admin exports.

Οι λεπτομέρειες απουσιών είναι admin-only. Δεν εμφανίζονται στη δημόσια προβολή ούτε στα public snapshots.

### 6.3 Special Days

Ο admin μπορεί να ορίσει:

- αργία,
- ειδική ημέρα,
- custom label,
- προσαρμοσμένη ώρα έναρξης/λήξης λειτουργίας.

## 7. Ιστορικό Και Μηνιαίο PDF Archive

Το παλιό `Ιστορικό Παρουσιών` δεν αποδίδεται στο τρέχον dashboard. Το legacy component/data model έχει διατηρηθεί μη καταστροφικά για συμβατότητα.

Το ενεργό admin panel είναι το `Ιστορικό Προγραμμάτων` και ανοίγει από προεπιλογή στη λειτουργία `Μήνας`.

Υποστηρίζει:

- εβδομαδιαία snapshots,
- προβολή των αποθηκευμένων shifts ενός snapshot,
- μηνιαία PDF entries,
- manual δημιουργία ή επανάληψη archive για επιλεγμένο μήνα,
- λήψη υπάρχοντος archived PDF.

Όταν είναι ενεργό το monthly archive feature, η επιτυχής μηνιαία δημιουργία μπορεί να παράγει PDF Blob και να το αποθηκεύει ιδιωτικά στο Firebase Storage:

```text
tenants/{tenantId}/monthly_schedule_pdfs/{YYYY-MM}/program_month_{YYYY-MM}.pdf
```

Το Firestore metadata αποθηκεύεται στη συλλογή:

```text
monthly_schedule_exports/{tenantId}_{YYYY-MM}
```

Το Storage archive είναι admin-only. Δεν δημιουργούνται public ή signed URLs και το audit δεν αποθηκεύει Storage URLs, blobs, base64 ή file contents.

Repository default:

```text
VITE_ENABLE_MONTHLY_PDF_ARCHIVE=false
```

Η live ενεργοποίηση επιτρέπεται μόνο αφού έχουν περάσει rules deployment, private access checks και admin generate/download QA.

## 8. Exports Και Audit

Ο admin μπορεί να εξάγει:

- PDF εβδομάδας,
- PDF μήνα,
- Excel,
- Word,
- WhatsApp-ready text.

Τα exports χρησιμοποιούν κοινό authorization/audit boundary. Τα audit records κρατούν μόνο ασφαλές metadata, όπως:

- tenant id,
- export type,
- week/month context,
- record count ή shift count,
- status,
- safe action label.

Δεν πρέπει να καταγράφονται:

- passwords ή tokens,
- auth tickets,
- reset URLs ή `oobCode`,
- signed/public download URLs,
- Storage paths στο audit,
- blobs, base64 ή file contents,
- Firebase config ή service-account secrets.

Τα tenant audit logs είναι append-only από client πλευρά: επιτρέπεται create σε authorized admin, αλλά όχι update/delete.

## 9. Authentication Και Authorization

### 9.1 Pilot Admin Login

Το Firebase Auth επιβεβαιώνει την ταυτότητα. Δεν αρκεί όμως ένα επιτυχημένο login για admin πρόσβαση.

Απαιτείται ενεργό membership:

```text
tenantMemberships/{uid}_{tenantId}
```

με:

```json
{
  "uid": "firebase-auth-uid",
  "tenantId": "bp-kallis",
  "status": "ACTIVE",
  "role": "OWNER"
}
```

Η εφαρμογή απορρίπτει:

- anonymous admin access,
- authenticated χρήστη χωρίς membership,
- membership άλλου tenant,
- inactive/suspended/expired/revoked membership,
- άγνωστο role.

Δεν χρησιμοποιείται email allowlist για authorization.

Το target MVP δημιουργεί μόνο `OWNER`. Υπάρχοντα `ADMIN`/`MANAGER` παραμένουν προσωρινή compatibility μέχρι την εγκεκριμένη Phase 2 και δεν αποτελούν το μελλοντικό product role model.

### 9.2 Central Portal Foundation

Υπάρχουν routes και components για:

- `/` στο central domain,
- `/login`,
- `/forgot-password`,
- `/reset-password`,
- `/select-tenant`,
- `/request-token`,
- `/admin-console`.

Η central login λογική μπορεί να χειριστεί:

- μηδέν memberships: safe no-access message,
- ένα membership: tenant destination,
- δύο ή περισσότερα memberships: tenant selector.

Τα `/request-token` και `/admin-console` είναι σήμερα informational placeholders, όχι πλήρως ενεργές business λειτουργίες.

### 9.3 Firebase Auth Broker

Η backend foundation χρησιμοποιεί Firebase Auth, Firestore και Cloud Functions:

- `createAuthTicket`,
- `exchangeAuthTicket`,
- `cleanupAuthTickets`.

Βασικές προστασίες:

- ticket TTL 60 δευτερολέπτων,
- cryptographically random ticket,
- single-use consumption μέσα σε transaction,
- replay protection,
- tenant membership revalidation κατά το exchange,
- exact origin allowlists,
- hostname-to-tenant validation,
- safe `returnTo` validation,
- custom token μόνο μετά από επιτυχή ticket consumption,
- client deny για `authTickets/{ticketId}`.

Repository defaults:

```text
VITE_ENABLE_AUTH_BROKER=false
VITE_ENABLE_TENANT_GATE=false
```

Άρα η foundation υπάρχει, αλλά το repository δεν ενεργοποιεί από μόνο του central-only tenant login enforcement.

## 10. Multi-Tenant SaaS Foundation

Η εφαρμογή έχει μετακινηθεί από global scheduler collections σε tenant-scoped runtime paths.

Κύριες private collections:

```text
tenants/{tenantId}/employees
tenants/{tenantId}/shifts
tenants/{tenantId}/shiftTemplates
tenants/{tenantId}/absences
tenants/{tenantId}/settings
tenants/{tenantId}/announcements
tenants/{tenantId}/attendanceHistory
tenants/{tenantId}/weekLocks
tenants/{tenantId}/weekHistory
tenants/{tenantId}/weekTemplates
tenants/{tenantId}/auditLogs
```

Platform-level collections:

```text
users/{uid}
tenants/{tenantId}
tenantMemberships/{uid}_{tenantId}
platformAdmins/{uid}
authTickets/{ticketId}
monthly_schedule_exports/{tenantId}_{YYYY-MM}
```

### 10.1 Legacy Lockdown

Οι παλιές global scheduler collections είναι κλειδωμένες με deny rules. Σε αυτές περιλαμβάνονται root employees, shifts, templates, absences, attendance history, week locks/history/templates, settings, announcements, audit logs και `published_schedules`.

Το runtime χρησιμοποιεί tenant-scoped repositories και services. Δεν πρέπει να προστεθεί ξανά global fallback.

Υπάρχει ακόμη το παλιό root compatibility rule `employee_absences_private`, το οποίο είναι admin-only και δεν χρησιμοποιείται από το τρέχον runtime. Πριν από τελικό legacy cleanup πρέπει να ελεγχθεί σε emulator/live-read audit και μετά να κλειδωθεί ή να αφαιρεθεί σε ξεχωριστή, μη καταστροφική φάση.

### 10.2 Tenant Provisioning

Υπάρχει ασφαλές provisioning CLI με:

- strict tenant slug validation,
- reserved-name protection,
- dry-run ως default,
- emulator write/verify modes,
- creation tenant metadata, initial membership και default configuration,
- απαγόρευση ανεξέλεγκτου production write στο τρέχον phase.

Η ολοκλήρωση νέου tenant απαιτεί επίσης manual infrastructure βήματα για DNS/tunnel, Firebase authorized domain, auth broker origins και monitoring.

### 10.3 Platform Super-Admin

Υπάρχει ανεξάρτητο platform-level role:

```text
platformAdmins/{uid}
role = SUPER_ADMIN
status = ACTIVE
```

Το platform admin status δεν παρακάμπτει tenant isolation. Για πρόσβαση σε operational tenant data απαιτείται ξεχωριστό ενεργό tenant membership.

Σήμερα υπάρχει rules/tooling/runbook foundation, όχι ολοκληρωμένο production super-admin dashboard.

## 11. Firestore Και Storage Security Model

### 11.1 Public Boundary

Unauthenticated read επιτρέπεται μόνο στις sanitized tenant public collections:

- `publicSchedules`,
- `publicMonths`,
- `publicEmployees`,
- `publicAnnouncements`.

### 11.2 Admin Boundary

Raw tenant data απαιτεί active membership και έγκυρο admin role για τον ίδιο tenant. Membership writes και platform-admin writes απαγορεύονται από client rules.

### 11.3 Archive Boundary

Το Firebase Storage path του monthly archive επιτρέπει read/write μόνο σε ενεργό tenant admin του αντίστοιχου tenant. Όλα τα υπόλοιπα Storage paths αρνούνται πρόσβαση.

### 11.4 Web Hardening

Το Nginx και το public edge εφαρμόζουν ή επιστρέφουν:

- `X-Content-Type-Options: nosniff`,
- `X-Frame-Options: DENY`,
- restrictive `Permissions-Policy`,
- `Referrer-Policy`,
- HSTS στο public edge,
- CSP σε report-only mode,
- disabled Nginx server tokens,
- SPA fallback και immutable caching για versioned assets.

## 12. Frontend Και UX

Η εφαρμογή χρησιμοποιεί μόνιμο dark UI. Η επιλογή light/dark έχει αφαιρεθεί.

Κύρια UX στοιχεία:

- Hyperspeed animated background,
- αρχικό reveal delay περίπου 1.4 δευτερολέπτων,
- reduced-motion, low-memory και save-data fallback σε static background,
- responsive wide desktop layout,
- resizable employee sidebar στο desktop,
- tablet/mobile stacked layout,
- touch-friendly controls,
- scroll-based day navigation σε μικρές οθόνες,
- active day glow,
- portals για dialogs ώστε να μην κρύβονται από transformed wrappers,
- loading, warning, success και retry feedback,
- dynamic-import recovery για stale cached chunks.

## 13. Repository Και Τεχνική Αρχιτεκτονική

### 13.1 Stack

- React 19
- Vite 8
- Zustand
- Firebase Auth, Firestore, Storage και Cloud Functions
- Tailwind CSS
- dnd-kit
- jsPDF
- `@e965/xlsx`
- `docx`
- Three.js / postprocessing για το background
- Playwright για E2E tests

### 13.2 Layers

```text
React UI
  -> Zustand store / actions
  -> Repository interfaces
  -> Firebase service adapters
  -> Firestore / Auth / Storage / Functions

Scheduler UI
  -> schedulerEngineAdapter
  -> pure TypeScript scheduler engine
```

Το repository layer μειώνει το direct coupling των components με το Firebase και επιτρέπει μελλοντική αλλαγή backend χωρίς συνολικό UI rewrite.

### 13.3 Μέγεθος Snapshot

Κατά τη σύνταξη της αναφοράς εντοπίστηκαν:

- 108 αρχεία κάτω από `src/`,
- 30 QA/test/script αρχεία κάτω από `tests/` και `scripts/`,
- 14 υπάρχοντα αρχεία τεκμηρίωσης κάτω από `docs/` πριν από την παρούσα αναφορά.

## 14. Deployment Architecture

```text
Browser
  -> Cloudflare / Cloudflare Tunnel
  -> bp-kallis.homelabshare.gr
  -> homelab host port 8085
  -> gasstation-bp-kallis container
  -> Nginx port 8080
  -> static Vite SPA
  -> Firebase Auth / Firestore / Storage / Functions
```

Deployment στοιχεία:

```text
Local repo: C:\Users\Spyros\OneDrive\Υπολογιστής\projects\GasStation-main
Server checkout: /home/spandreou/projects/GasStationProject
Branch: main
Compose project: gasstationproject
Frontend container: gasstation-bp-kallis
Host mapping: 8085 -> 8080
```

Το GitHub push δεν κάνει αυτόματο homelab deploy. Απαιτείται controlled pull του `main`, Docker rebuild και local/public health verification.

Το Docker image χτίζεται σε δύο stages:

1. Node 22 Alpine για `npm ci` και Vite build.
2. Nginx 1.27 Alpine για static serving και container healthcheck.

## 15. QA Και Validation Κατά Τη Σύνταξη

Στις 17/07/2026 εκτελέστηκαν:

| Έλεγχος | Αποτέλεσμα |
| --- | --- |
| `npm run build` | PASS |
| `npm run qa:scheduler` | PASS |
| `npm run qa:scheduler-engine` | PASS |
| `npm run qa:repositories` | PASS |
| `npm run qa:saas-foundation` | PASS |
| `npm run qa:auth-broker` | PASS |
| `npm run qa:tenant-authorization` | PASS |
| `npm run qa:public-readonly` | PASS |
| `npm run qa:export-security` | PASS |
| Security hardening validator | PASS |
| Firestore integrity validator | PASS |
| Root `npm audit --audit-level=high` | FAIL, 1 critical transitive advisory |
| Functions `npm audit --audit-level=high` | PASS threshold, 8 moderate advisories reported |
| Public URL HEAD request | PASS, HTTP `200` |

Δεν εκτελέστηκαν σε αυτή την αναφορά destructive live scheduler actions, emulator suites ή πλήρες Playwright browser suite.

### 15.1 Build Warnings

Το production build ολοκληρώνεται, αλλά υπάρχουν μεγάλα chunks:

- `visualFx`,
- embedded Roboto base64 font,
- export libraries,
- κύριο application bundle.

Αυτό δεν μπλοκάρει τη λειτουργία, αλλά είναι performance debt για μελλοντικό code splitting και asset optimization.

### 15.2 Supply-Chain Findings

Το root audit εντόπισε critical advisory στο transitive dependency chain:

```text
firebase
  -> @firebase/database
  -> faye-websocket
  -> websocket-driver 0.7.4
```

Το `npm audit` αναφέρει διαθέσιμο fix μέσω κανονικού dependency update. Η αλλαγή δεν εφαρμόστηκε κατά τη σύνταξη αυτού του report, επειδή απαιτεί ξεχωριστό compatibility/build/browser QA.

Το Functions package αναφέρει οκτώ moderate advisories στο `uuid` dependency chain μέσω Google/Firebase Admin packages. Η πλήρης αυτόματη διόρθωση προτείνει breaking αλλαγή του `firebase-admin`, επομένως δεν πρέπει να εφαρμοστεί με `npm audit fix --force` χωρίς ελεγχόμενο upgrade branch και emulator validation.

## 16. Γνωστά Όρια Και Τεχνικό Χρέος

### Υψηλή προτεραιότητα

1. Αποκατάσταση του critical `websocket-driver` advisory με κανονικό package-manager update και πλήρες regression QA.
2. Επανέλεγχος των Functions moderate advisories σε ελεγχόμενο Firebase Admin upgrade.

### Μεσαία προτεραιότητα

1. Μείωση μεγάλων frontend chunks και αποσύνδεση του embedded base64 font από το αρχικό bundle.
2. Πλήρες Playwright matrix για desktop, tablet και mobile μετά από σημαντικές UI αλλαγές.
3. Browser/emulator end-to-end validation πριν ενεργοποιηθούν τα auth broker και TenantGate flags.
4. Επανέλεγχος του `TenantGate` ώστε η μελλοντική ενεργοποίησή του να μην κλείσει την anonymous public read-only προβολή του tenant.
5. Καθαρή production διαδικασία provisioning δεύτερου tenant, μαζί με monitoring και rollback.

### Product scope που δεν έχει ολοκληρωθεί

1. Production root portal rollout στο `shiftoryx.gr`, μετά από συμβατή αξιοποίηση/μετανάστευση της υπάρχουσας foundation του `gas.homelabshare.gr`.
2. Subscription/billing lifecycle.
3. Token/activation request business flow.
4. Πλήρες super-admin UI.
5. Public status labels και `publicNote` με owner preview (Phase 10). Employee accounts δεν ανήκουν στο MVP.
6. App Check enforcement.

### Repository housekeeping

Κατά τη σύνταξη υπήρχε untracked generated αρχείο `firestore-debug.log`. Δεν τροποποιήθηκε και δεν πρέπει να γίνει commit χωρίς ρητή ανάγκη.

## 17. Εγκεκριμένη Σειρά Επόμενων Βημάτων

Το master roadmap απαιτεί μία phase κάθε φορά. Μετά την έγκριση του Phase 0 documentation alignment ακολουθεί μόνο Phase 1 read-only current-state audit. Έπειτα: OWNER-only role normalization, registration tokens, automated provisioning, root portal/store selector, wildcard ShiftOryx domains, entitlements, multi-store lifecycle, ShiftOryx admin panel, public statuses/notes, aliases, customization, VPS, HomeOps και billing.

Το dependency advisory παραμένει σημαντικό risk item, αλλά η αντιμετώπισή του γίνεται ως ξεχωριστό ελεγχόμενο maintenance task χωρίς `audit fix --force`, όχι ως άδεια παράκαμψης της roadmap phase gate.

## 18. Βασικά Αρχεία Αναφοράς

- `README.md`: γενική είσοδος στο project.
- `HOMELAB.md`: server και deployment map.
- `docs/self-hosting-bp-kallis.md`: homelab deployment runbook.
- `docs/scheduler-rules.md`: business rules του scheduler.
- `docs/scheduler-ui-export-rules.md`: UI και export contracts.
- `docs/scheduler-qa-checklist.md`: scheduler QA checklist.
- `docs/SECURITY_GUIDELINES.md`: security guardrails.
- `docs/tenant-authorization-model.md`: UID-based tenant authorization.
- `docs/saas-tenant-foundation.md`: SaaS και tenant architecture.
- `docs/central-auth-portal-migration.md`: central portal migration plan.
- `docs/auth-broker-runbook.md`: Firebase auth broker rollout/rollback.
- `docs/monthly-pdf-archive-runbook.md`: private monthly archive runbook.
- `docs/tenant-provisioning-runbook.md`: controlled tenant onboarding.
- `docs/platform-admin-runbook.md`: platform super-admin model.

## 19. Τελική Αξιολόγηση

Το ShiftOryx είναι ήδη λειτουργικό ως single-pilot, tenant-aware σύστημα διαχείρισης βαρδιών για το BP Kallis. Οι βασικές operational ροές, το public schedule, τα owner εργαλεία, τα exports, το private PDF archive και η tenant isolation είναι υλοποιημένα.

Η αρχιτεκτονική έχει προχωρήσει ουσιαστικά προς SaaS, αλλά το επόμενο production expansion πρέπει να παραμείνει ελεγχόμενο. Το σύστημα είναι κατάλληλο για συνέχιση του BP Kallis pilot και για sandbox multi-tenant validation. Δεν πρέπει ακόμη να θεωρηθεί ολοκληρωμένο commercial multi-tenant SaaS με billing, central login enforcement και πλήρες platform administration.

Η επόμενη εγκεκριμένη phase είναι το read-only current-state audit. Η αποκατάσταση dependency advisories παραμένει ξεχωριστή ελεγχόμενη εργασία με πλήρες regression QA και χωρίς βιαστικό force upgrade.
