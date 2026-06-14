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
- `hireDate` (string): Ημερομηνία πρόσληψης (`DD-MM-YYYY`).
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

## Collection: `monthly_schedule_exports`
Admin-only index για τα αποθηκευμένα PDF μηνιαίου προγράμματος.

### Fields
- `yearMonth` (string): Μήνας snapshot σε μορφή `YYYY-MM`.
- `monthStart` / `monthEnd` (string): ISO ημερομηνίες αρχής/τέλους μήνα.
- `fileName` (string): Όνομα PDF, π.χ. `program_month_2026-06.pdf`.
- `storagePath` (string): Firebase Storage path, π.χ. `monthly_schedule_pdfs/2026-06/program_month_2026-06.pdf`.
- `contentType` (string): `application/pdf`.
- `size` (number): Μέγεθος αρχείου σε bytes.
- `shiftCount` (number): Πλήθος βαρδιών που μπήκαν στο PDF.
- `createdBy` (string): Email admin που δημιούργησε το snapshot.
- `createdAt` / `updatedAt` (timestamp): Χρόνοι δημιουργίας/τελευταίας αντικατάστασης.

## Firebase Storage
- `monthly_schedule_pdfs/{YYYY-MM}/program_month_{YYYY-MM}.pdf`: Admin-only μηνιαία PDF snapshots.
- Deploy rules με `npm run deploy:storage-rules` ή μαζί με Firestore μέσω `npm run deploy:firebase-rules`.
