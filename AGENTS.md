# GasStation Shift Manager

## Project

GasStation Shift Manager

## Stack

- React + Vite
- Tailwind CSS
- Zustand
- Firebase Auth / Firestore
- dnd-kit
- jsPDF / xlsx / docx exports

## Main Domain

Το project διαχειρίζεται πρόγραμμα βαρδιών πρατηρίου καυσίμων.

Κύριες περιοχές:

- Weekly/monthly schedule
- Automatic schedule generation
- Fixed days off
- Leave/sick/manual overrides
- PDF/Excel/Word exports

## General Rules

- Κράτα όλα τα ελληνικά UTF-8 safe.
- Μην εισάγεις mojibake ή broken Greek text.
- Μην αφαιρείς δεδομένα από objects απλά επειδή δεν εμφανίζονται στο UI.
- Αν κάτι πρέπει να μη φαίνεται, κάν' το presentation-only.
- Μην σπάσεις:
  - manual edit
  - drag and drop
  - templates
  - history
  - Firebase persistence
  - exports
  - locked week behavior
- Κάθε αλλαγή στο scheduler πρέπει να περνάει:
  - `npm run build`
  - scheduler QA checklist
- Προτίμησε μικρές, καθαρές αλλαγές αντί για μεγάλο ανεξέλεγκτο rewrite.
- Αν ένας κανόνας προγράμματος δεν μπορεί να ικανοποιηθεί, βγάλε warning αντί να δημιουργήσεις ψεύτικα σωστό πρόγραμμα.

## Scheduler References

- Business rules: `docs/scheduler-rules.md`
- UI/export rules: `docs/scheduler-ui-export-rules.md`
- QA checklist: `docs/scheduler-qa-checklist.md`

## Project Brain And Security

- Project brain: `docs/project-brain.md`
- Security guidelines: `docs/SECURITY_GUIDELINES.md`
