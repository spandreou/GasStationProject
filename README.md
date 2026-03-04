# Gas Station Shift Manager

Εφαρμογή διαχείρισης εβδομαδιαίων βαρδιών για πρατήριο καυσίμων, με real-time συγχρονισμό μέσω Firebase.

## Stack
- React + Vite + Tailwind CSS
- dnd-kit (Drag and Drop)
- Firebase Firestore + Firebase Authentication
- Zustand store

## Βασικές Δυνατότητες
- Εβδομαδιαίο grid (Δευτέρα-Κυριακή) με πολλαπλά shift slots ανά ημέρα
- Preset βάρδιες και χειροκίνητες ενδιάμεσες βάρδιες
- Έλεγχος overlap/σύγκρουσης βαρδιών
- Analytics ωρών ανά εργαζόμενο και σύνολο εβδομάδας
- Export σε WhatsApp, PDF, Excel, Word
- Admin controls με login, profile editing και undo ενεργειών
- Light/Dark mode με glassmorphism UI πάνω από animated Hyperspeed background

## Εκκίνηση
```bash
npm install
npm run dev
```

## Περιβάλλον (`.env`)
Χρησιμοποίησε τις μεταβλητές Firebase (Vite format):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_ADMIN_EMAIL`

## Mobile-First Roadmap
- Πλήρες responsive mobile UI με βελτιστοποιημένο weekly grid για μικρές οθόνες
- Bottom navigation/actions για γρήγορη διαχείριση βαρδιών από κινητό
- Mobile-friendly drag/drop και touch interactions με καλύτερο feedback
