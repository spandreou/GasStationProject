# Gas Station Project

Demo-ready dashboard για διαχείριση βαρδιών πρατηρίου με weekly/monthly scheduling, πίνακα ανακοινώσεων και σύνοψη ωρών ανά υπάλληλο.

## Τρέχουσα Κατάσταση

Η εφαρμογή είναι σε **demo / experimental mode** για παρουσίαση:

- Admin-only πρόσβαση
- Firebase config μέσω env vars
- Production authorization μέσω `tenantMemberships/{uid}_{tenantId}`
- Καμία email allowlist δεν δίνει admin πρόσβαση
- Χωρίς fallback admin credentials μέσα στον κώδικα
- Πρώτος production-like pilot tenant: `bp-kallis.homelabshare.gr`
- Μελλοντικός SaaS portal στόχος: `gas.homelabshare.gr`

## Repository / Deployment Map

- Σωστό local working folder: `C:\Users\Spyros\OneDrive\Υπολογιστής\projects\GasStation-main`.
- Μην χρησιμοποιείς το παλιό `GasStationProject-main`; ήταν λάθος/άδειο local folder.
- GitHub remote: `https://github.com/spandreou/GasStationProject.git`.
- Live BP Kallis URL: `https://bp-kallis.homelabshare.gr/`.
- Active homelab server path: `/home/spandreou/projects/GasStationProject`.
- Current verified homelab deployment branch: `main`.
- `main` is the verified production source of truth for the BP Kallis homelab pilot.
- Compose project/container: `gasstationproject` / `gasstation-bp-kallis`.
- Host port: `8085` -> container port `8080`.

Πριν από homelab deploy ή troubleshooting, διάβασε πρώτα `HOMELAB.md` και `docs/self-hosting-bp-kallis.md`.

## Tech Stack

- React + Vite
- Zustand
- Firebase Firestore + Firebase Auth
- Tailwind CSS
- dnd-kit

## Milestone: Scheduler Stabilization & Engine Integration

Ολοκληρώθηκε το βασικό stabilization milestone για το scheduling module.

Τι καλύπτει:

- Compact weekly/monthly scheduler UI με stacked monthly weeks.
- Resizable scheduler layout και πιο καθαρή ανάγνωση shift cards.
- Source-of-truth fix για employee scheduling roles.
- Νέος pure TypeScript scheduler engine στο `src/scheduler-engine/`.
- Runtime σύνδεση του νέου engine στο weekly/monthly auto generation μέσω adapter.
- Role logic με `CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B` και προαιρετικά `EXTRA_A`, `EXTRA_B`.
- Fixed days off, absences/gaps, Sunday rotation και validation rules.
- Regression tests για monthly role conflicts και generator correctness.

Βασικοί κανόνες που πλέον ελέγχονται:

- Core employees δεν μπαίνουν ποτέ στην ίδια βάρδια.
- Core employees δεν μπαίνουν ως intermediate.
- Intermediate/FLEX slot καλύπτεται από FLEX/coverage ρόλο.
- Με 3 διαθέσιμους εργαζόμενους βγαίνει 1 πρωί, 1 ενδιάμεσος, 1 απόγευμα.
- Με 4 διαθέσιμους σε full coverage ημέρα βγαίνει 2 πρωί και 2 απόγευμα.
- Fixed day off τηρείται ως hard constraint.
- Κυριακή έχει ακριβώς 1 βάρδια 08:00-20:00.

Validation commands:

```bash
npm run qa:scheduler-engine
npm run qa:scheduler
npm run build
npm run test:e2e:scheduler
npm run qa:saas-foundation
```

Local Playwright e2e specs default to `http://127.0.0.1:5174/` to avoid colliding with unrelated Vite apps on `5173`. Start local Vite with `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort` or override with `E2E_BASE_URL` when needed.

Security checks:

```bash
npm run security:hardening
npm run security:audit
npm run security:cve
npm run security:scan
```

CI also runs npm audit, OWASP CVE Lite, Trivy, and report-only Semgrep through `.github/workflows/security-scan.yml`.

Σημείωση: το UI των παλιών role labels (`Core 1`, `Core 2`, `Intermediate / Coverage`) συνεχίζει να υποστηρίζεται και μεταφράζεται από adapter στον νέο engine.

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

## Demo Environment Variables

Συμπλήρωσε τα Firebase env vars στο `.env` (ή στο Vercel Project Settings):

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=

VITE_APP_MODE=demo
```

## Admin Auth Model

- Υποστηρίζεται μόνο **admin login**.
- Firebase Auth πιστοποιεί μόνο την ταυτότητα του χρήστη.
- Admin δικαιώματα αποδίδονται μόνο από ACTIVE tenant membership με role `OWNER`, `ADMIN`, ή `MANAGER`.
- Δεν υπάρχει client-side admin password env var ή fallback credential.
- Δεν υπάρχει employee login flow στο τρέχον scope.

## Production Admin Setup

Για production deployment:

1. Δημιούργησε τον admin χρήστη στο Firebase Auth.
2. Δημιούργησε document `tenantMemberships/{uid}_bp-kallis` με `status: "ACTIVE"` και role `OWNER`, `ADMIN`, ή `MANAGER`.

3. Κάνε sign out / sign in ώστε το Firebase Auth state να ανανεωθεί.
4. Κράτα το `VITE_APP_MODE=production`.
5. Μην ορίζεις admin passwords σε Vite env vars. Τα Vite env vars είναι client-visible.

### Safe Tenant Membership Seed Script

Υπάρχει helper script για να δημιουργήσεις tenant και membership χωρίς να μπει κωδικός στο frontend bundle ή στο Git:

```powershell
npm run tenant:seed-bp-kallis -- --uid "<firebase-uid>" --role ADMIN --use-gcloud
```

Εναλλακτικά, μπορείς να δώσεις το service account JSON από `FIREBASE_SERVICE_ACCOUNT_JSON`.

Αν έχεις ήδη ενεργό Google Cloud login με τα σωστά Firebase Auth δικαιώματα, μπορείς να χρησιμοποιήσεις:

```powershell
npm run tenant:seed-bp-kallis -- --uid "<firebase-uid>" --role ADMIN --dry-run
```

Με το `--send-reset` στέλνεται Firebase password reset email στον admin, ώστε ο κωδικός να οριστεί από τον ίδιο τον διαχειριστή και να μη μπει σε logs/chat/repo.

Το script:

- γράφει `tenants/bp-kallis`,
- γράφει `tenantMemberships/{uid}_bp-kallis`,
- γράφει safe `users/{uid}` metadata,
- δεν εκτυπώνει private key ή access token.

Μετά το bootstrap, κάνε sign out / sign in στην εφαρμογή για να ανανεωθεί το Firebase ID token.

Προτεινόμενο test admin email:

```txt
homelabshare@gmail.com
```

Ο κωδικός είναι αυτός που ορίζεται στον Firebase Auth χρήστη ή αυτός που θα αλλάξει μέσω Firebase password reset. Δεν πρέπει να αποθηκεύεται στο repo ή να μοιράζεται σε logs/chat.

## Self-Hosted BP Kallis Pilot

Το πρώτο self-hosted deployment target είναι:

```text
bp-kallis.homelabshare.gr
```

Προστέθηκαν deployment artifacts:

- `Dockerfile`
- `docker-compose.yml`
- `nginx.conf`
- `.env.example`

Βασική εκκίνηση σε server:

```bash
cp .env.example .env
docker compose up -d --build
```

Το Vite build παίρνει τα `VITE_*` values ως build-time env/args. Μην κάνεις commit πραγματικό `.env`.

Αναλυτικά:

- `docs/self-hosting-bp-kallis.md`
- `docs/saas-tenant-foundation.md`
- `docs/saas-security-qa-checklist.md`
- `docs/monthly-pdf-archive-runbook.md`

## SaaS Tenant Foundation

Η κατεύθυνση είναι μία κοινή εφαρμογή, όχι διαφορετικό codebase ανά πρατήριο.

Αρχική στρατηγική:

- `bp-kallis.homelabshare.gr` -> tenant subdomain
- `gas.homelabshare.gr` -> future central portal
- Firebase Auth για identity
- Firestore `tenants` και `tenantMemberships` ως foundation
- UID-based memberships, όχι hardcoded email-to-domain mappings

Foundation files:

- `src/utils/tenantHostContext.js`
- `src/utils/tenantDataPaths.js`
- `src/repositories/firebase/firebaseTenantsRepository.js`
- `src/repositories/firebase/firebaseTenantMembershipsRepository.js`
- `src/repositories/firebase/firebaseTenantSubscriptionRepository.js`
- `src/repositories/firebase/firebaseTenantTokenRequestsRepository.js`

Prepared auth routes:

- `/login`
- `/forgot-password`
- `/reset-password`
- `/select-tenant`

Το `/login` χρησιμοποιεί Firebase Auth και προετοιμάζει το central portal flow:

- 0 memberships -> safe no-access message
- 1 membership -> redirect στο tenant domain
- 2+ memberships -> `/select-tenant`

Τα reset routes χρησιμοποιούν Firebase action codes και δεν κάνουν log κωδικούς ή reset tokens.

## Demo-only Σημεία

- Demo employee/sample ονομασίες
- Presentation-safe κείμενα/labels

## Phase 1 Production Security Hardening

- Καταργήθηκαν client-side admin password checks.
- Καταργήθηκαν fallback demo credentials.
- Τα Firestore reads απαιτούν authenticated user.
- Τα Firestore writes απαιτούν ACTIVE tenant admin membership.
- Προστέθηκαν βασικά Firestore field validations για κρίσιμες συλλογές.
- Προστέθηκαν Vercel security headers.
- Το CSP μένει για επόμενο focused pass επειδή χρειάζεται browser verification με Firebase Auth/Firestore/Analytics.

## Phase 2 Firestore Data Integrity & Audit Logs

- Τα μαζικά Firestore writes για generate/clear/load schedule flows χρησιμοποιούν batch/chunked writes αντί για ανεξάρτητα `Promise.all` writes.
- Κάθε αυτόματη δημιουργία εβδομάδας ή μήνα δημιουργεί `generationRunId` και το αποθηκεύει στα generated shifts.
- Το `generationRunId` συνδέει τις βάρδιες με το αντίστοιχο generation event, ώστε να μπορεί να γίνει μελλοντικό audit ή rollback ανά run.
- Προστέθηκε immutable Firestore collection `audit_logs` για βασικές admin ενέργειες:
  - schedule generation
  - clear day/week/month
  - manual shift create/update/move/delete
  - employee create/update/delete
  - generator/settings changes
  - week finalization και snapshot/template actions
  - announcements
- Τα audit logs γράφονται μόνο από authenticated admins και δεν επιτρέπεται client-side update/delete μέσω Firestore rules.

Περιορισμός: επειδή δεν υπάρχει backend/Cloud Function σε αυτή τη φάση, το audit log γράφεται από trusted admin client code και προστατεύεται από Firestore rules. Για πλήρως server-enforced audit trail χρειάζεται μελλοντικό backend ή Firestore trigger.

## Service Layer Architecture

Η πρόσβαση σε Firebase/Firestore περνάει από dedicated service layer στο `src/firebase/`.

Services:

- `config.js`: Firebase app/Auth/Firestore initialization και env validation.
- `authService.js`: Firebase sign-in/sign-out/reset. Tenant admin authorization γίνεται με UID + tenant membership.
- `firestoreCore.js`: shared Firestore helpers, collection names, batch/chunk helpers και common error handling.
- `employeeService.js`: employee subscribe/create/update/delete.
- `shiftService.js`: shifts, shift templates, batch replacements, date/employee deletes και Sunday lookup.
- `settingsService.js`: scheduler settings subscribe/upsert.
- `announcementService.js`: announcement subscribe/create/delete.
- `weekService.js`: attendance history, week locks, week history και week templates.
- `auditLogService.js`: immutable audit log writes.
- `schedulerService.js`: deprecated compatibility barrel για παλιά imports. Νέος κώδικας να χρησιμοποιεί τα domain services.

Κανόνας συντήρησης: components και Zustand store δεν πρέπει να μιλάνε απευθείας σε Firestore όταν υπάρχει service. Το store λειτουργεί ως state/orchestration layer, ενώ persistence και Firebase communication ανήκουν στα services.
