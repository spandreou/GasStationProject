# Scheduler UI And Export Rules

Αυτό το αρχείο περιγράφει τους κανόνες εμφάνισης και export για το scheduling module. Οι κανόνες είναι presentation/export contracts και δεν πρέπει να οδηγούν σε διαγραφή δεδομένων από το model.

## Compact Weekly UI

Οι shift cards στην εβδομαδιαία προβολή πρέπει να είναι compact.

Δεν πρέπει να εμφανίζονται:

- `Εργασία`
- `Πρωινός`
- `Απογευματινός` / `Βραδινός`
- `Ενδιάμεσος`
- Auto-generated notes
- Duration labels όπως `(8ω | 8 ώρες)`
- `(1 ημέρα)`

Πρέπει να εμφανίζονται:

- Ονοματεπώνυμο
- Ωράριο
- Μικρά edit/delete actions
- Warning/conflict indicators όπου υπάρχουν

Παράδειγμα work card:

```text
Λουλακάκης Κώστας    06:00 - 14:00
```

Παράδειγμα rest card:

```text
Δροση Βασιλικη    ΑΝ
```

## Presentation-Only Rule

Τα παρακάτω fields δεν διαγράφονται από το data model:

- `label`
- `shiftType`
- `notes`
- `duration`

Κανόνες:

- Αν δεν πρέπει να φαίνονται στην compact weekly προβολή, απλά δεν εμφανίζονται.
- Τα δεδομένα παραμένουν διαθέσιμα για manual edit, drag and drop, templates, history, Firebase persistence και exports.
- Manual notes που δεν είναι auto-generated μπορούν να εμφανίζονται διακριτικά ή ως tooltip.
- Auto-generated notes δεν εμφανίζονται στις compact weekly cards.

## PDF Export

Το PDF export πρέπει να χρησιμοποιεί table columns:

- `Ημερομηνία`
- `ΑΦΜ`
- `Ονοματεπώνυμο`
- `Ωράριο`
- `Εργασία/Ανάπαυση`

Κανόνες header:

- Χρησιμοποιείται `Εργασία/Ανάπαυση`.
- Δεν χρησιμοποιείται `Εργασία/Ρεπό`.

Κανόνες ημερομηνίας:

- Η ημερομηνία εμφανίζεται μία φορά ανά ημέρα.
- Υπάρχει μία row ανά ημέρα.
- Τα υπόλοιπα cells έχουν multiline values για τους υπαλλήλους της ημέρας.
- Δεν επαναλαμβάνεται η ίδια ημερομηνία σε ξεχωριστή row για κάθε υπάλληλο.

Values:

- `ΕΡΓ` για εργασία
- `ΑΝ` για ανάπαυση

Σειρά μέσα στη μέρα:

- Πρώτα όσοι εργάζονται, ταξινομημένοι με ώρα έναρξης.
- Μετά όσοι έχουν `ΑΝ`.
- Fallback sort by `fullName` με ελληνικό locale.

Encoding:

- Το PDF πρέπει να κρατάει σωστά ελληνικά.
- Μην εισάγεις mojibake ή broken Greek text σε headers, names, labels ή values.
