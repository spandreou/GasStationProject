# Scheduler QA Checklist

Αυτό το checklist πρέπει να περνάει για κάθε αλλαγή στο scheduler module.

## UI Checks

- [ ] Δεν εμφανίζονται περιττά labels στις weekly cards.
- [ ] Δεν εμφανίζονται auto-generated notes.
- [ ] Δεν εμφανίζεται duration `(8ω | 8 ώρες)`.
- [ ] Δεν εμφανίζεται `(1 ημέρα)` στις compact weekly cards.
- [ ] Cards/day boxes είναι compact.
- [ ] Edit/delete/manual actions δουλεύουν.
- [ ] Conflicts/warnings φαίνονται.
- [ ] Manual notes που δεν είναι auto-generated εμφανίζονται μόνο διακριτικά ή ως tooltip, αν χρειάζεται.

## Generator Checks

- [ ] Με 4 διαθέσιμους Δευτέρα:
  - [ ] 4 shifts
  - [ ] 2 morning
  - [ ] 2 evening
  - [ ] 0 intermediate
- [ ] Με 4 διαθέσιμους Παρασκευή:
  - [ ] 4 shifts
  - [ ] 2 morning
  - [ ] 2 evening
  - [ ] 0 intermediate
- [ ] Τρίτη/Τετάρτη/Πέμπτη με 1 off:
  - [ ] 3 shifts
  - [ ] 1 morning
  - [ ] 1 intermediate
  - [ ] 1 evening
- [ ] Σάββατο:
  - [ ] Δεν δημιουργείται άσκοπη intermediate shift όταν υπάρχουν 4 διαθέσιμοι.
- [ ] Κυριακή:
  - [ ] 1 shift
  - [ ] `08:00-20:00`
  - [ ] Fairness / no consecutive Sunday when possible
- [ ] No employee overlap.
- [ ] Ίδια inputs δίνουν ίδιο output.
- [ ] Όταν κανόνας δεν μπορεί να ικανοποιηθεί, εμφανίζεται warning αντί για ψεύτικα σωστό schedule.

## PDF Checks

- [ ] Μία row ανά ημερομηνία.
- [ ] Δεν επαναλαμβάνεται η ίδια ημερομηνία 4 φορές.
- [ ] Header `Εργασία/Ανάπαυση`.
- [ ] Δεν εμφανίζεται header `Εργασία/Ρεπό`.
- [ ] Values `ΕΡΓ` / `ΑΝ`.
- [ ] Πρώτα εμφανίζονται οι εργαζόμενοι ταξινομημένοι με ώρα έναρξης.
- [ ] Μετά εμφανίζονται όσοι έχουν `ΑΝ`.
- [ ] Greek text renders correctly.

## Commands

- [ ] `npm run build`
- [ ] Αν προστεθεί script: `npm run qa:scheduler`
