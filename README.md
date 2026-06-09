# Gas Station Project

Demo-ready dashboard για διαχείριση βαρδιών πρατηρίου με weekly/monthly scheduling, πίνακα ανακοινώσεων και σύνοψη ωρών ανά υπάλληλο.

## Τρέχουσα Κατάσταση

Η εφαρμογή είναι σε **demo / experimental mode** για παρουσίαση:

- Admin-only πρόσβαση
- Firebase config μέσω env vars
- Production authorization μέσω Firebase custom claim `admin=true`
- Demo admin email allowlist μόνο όταν `VITE_APP_MODE=demo`
- Χωρίς fallback admin credentials μέσα στον κώδικα

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
```

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
VITE_ADMIN_EMAIL=
```

## Admin Auth Model

- Υποστηρίζεται μόνο **admin login**.
- Σε production, admin δικαιώματα αποδίδονται μόνο από Firebase custom claim `admin=true`.
- Σε demo mode, το `VITE_ADMIN_EMAIL` λειτουργεί ως πρόσθετο email allowlist για παρουσίαση.
- Δεν υπάρχει client-side admin password env var ή fallback credential.
- Δεν υπάρχει employee login flow στο τρέχον scope.

## Production Admin Setup

Για production deployment:

1. Δημιούργησε τον admin χρήστη στο Firebase Auth.
2. Από ασφαλές admin περιβάλλον, απόδωσε custom claim:

```js
await admin.auth().setCustomUserClaims(uid, { admin: true });
```

3. Κάνε sign out / sign in ώστε το ID token να ανανεωθεί.
4. Κράτα το `VITE_APP_MODE=production`.
5. Μην ορίζεις admin passwords σε Vite env vars. Τα Vite env vars είναι client-visible.

## Demo-only Σημεία

- Demo admin email allowlist μέσω `VITE_ADMIN_EMAIL`
- Demo employee/sample ονομασίες
- Presentation-safe κείμενα/labels

## Phase 1 Production Security Hardening

- Καταργήθηκαν client-side admin password checks.
- Καταργήθηκαν fallback demo credentials.
- Τα Firestore reads απαιτούν authenticated user.
- Τα Firestore writes απαιτούν custom claim `admin=true`.
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
- `authService.js`: admin sign-in/sign-out/reset και Firebase custom claim checks.
- `firestoreCore.js`: shared Firestore helpers, collection names, batch/chunk helpers και common error handling.
- `employeeService.js`: employee subscribe/create/update/delete.
- `shiftService.js`: shifts, shift templates, batch replacements, date/employee deletes και Sunday lookup.
- `settingsService.js`: scheduler settings subscribe/upsert.
- `announcementService.js`: announcement subscribe/create/delete.
- `weekService.js`: attendance history, week locks, week history και week templates.
- `auditLogService.js`: immutable audit log writes.
- `schedulerService.js`: deprecated compatibility barrel για παλιά imports. Νέος κώδικας να χρησιμοποιεί τα domain services.

Κανόνας συντήρησης: components και Zustand store δεν πρέπει να μιλάνε απευθείας σε Firestore όταν υπάρχει service. Το store λειτουργεί ως state/orchestration layer, ενώ persistence και Firebase communication ανήκουν στα services.
