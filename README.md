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
