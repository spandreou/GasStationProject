# Firebase Schema (Firestore)

## Collection: `employees`
Κάθε έγγραφο αντιστοιχεί σε έναν υπάλληλο.

### Προτεινόμενα fields
- `fullName` (string): Ονοματεπώνυμο.
- `role` (string): Ρόλος (π.χ. Ταμείο, Υπεύθυνος).
- `color` (string): Hex χρώμα για οπτική αναγνώριση.
- `afm` (string): ΑΦΜ υπαλλήλου (ευαίσθητο πεδίο).
- `phone` (string): Τηλέφωνο επικοινωνίας.
- `email` (string): Email επικοινωνίας.
- `hireDate` (string): Ημερομηνία πρόσληψης (`YYYY-MM-DD`).
- `isActive` (boolean): Αν είναι ενεργός στο πρόγραμμα.
- `createdAt` (timestamp): Χρόνος δημιουργίας.
- `updatedAt` (timestamp): Χρόνος τελευταίας αλλαγής.

## Collection: `shifts`
Κάθε έγγραφο είναι μία ανάθεση βάρδιας.

### Προτεινόμενα fields
- `employeeId` (string): Αναφορά σε `employees/{id}`.
- `date` (string): ISO ημερομηνία (`YYYY-MM-DD`).
- `startTime` (string): Ώρα έναρξης (`HH:mm`).
- `endTime` (string): Ώρα λήξης (`HH:mm`).
- `label` (string): `Πρωινή`, `Απογευματινή` ή `Χειροκίνητη`.
- `notes` (string, optional): Παρατηρήσεις.
- `createdAt` (timestamp): Χρόνος δημιουργίας.
- `updatedAt` (timestamp): Χρόνος τελευταίας αλλαγής.

## Ενδεικτικοί indexes
- `shifts`: `date` ASC
- `shifts`: `employeeId` ASC, `date` ASC
