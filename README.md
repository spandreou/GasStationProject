# Gas Station Project

Demo-ready dashboard για διαχείριση βαρδιών πρατηρίου με weekly/monthly scheduling, πίνακα ανακοινώσεων και σύνοψη ωρών ανά υπάλληλο.

## Τρέχουσα Κατάσταση

Η εφαρμογή είναι σε **demo / experimental mode** για παρουσίαση:

- Admin-only πρόσβαση
- Firebase config μέσω env vars
- Demo-safe ονομασίες και sample δεδομένα
- Χωρίς production credentials μέσα στον κώδικα

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
VITE_ADMIN_PASSWORD=
```

## Demo Auth Model

- Υποστηρίζεται μόνο **admin login**.
- Το `VITE_ADMIN_EMAIL` είναι allowlist email για demo admin.
- Το `VITE_ADMIN_PASSWORD` είναι ο demo κωδικός.
- Δεν υπάρχει employee login flow στο τρέχον scope.

## Demo-only Σημεία

- Demo admin allowlist/fallback logic
- Demo employee/sample ονομασίες
- Presentation-safe κείμενα/labels

## Τι Θα Αλλάξει Σε Production Hardening (Επόμενη Φάση)

- Κατάργηση demo fallback admin email
- Production admin identity management (χωρίς demo defaults)
- Tightening rules/policies με πραγματικά business constraints
- Operational monitoring και incident-ready security checks
