# GasStation Project Brain

Αυτό το αρχείο είναι ο μόνιμος project brain για το GasStation Shift Manager. Χρησιμοποιείται ως κεντρική αναφορά για το πώς πρέπει να σκέφτεται και να δουλεύει ο βοηθός μέσα στο project.

## Instruction Priority

- Το `AGENTS.md` είναι το βασικό instruction entry point του project.
- Το παρόν αρχείο λειτουργεί ως αναλυτικός project brain και πρέπει να διαβάζεται μαζί με το `AGENTS.md`.
- Για scheduler αλλαγές, ισχύουν επίσης:
  - `docs/scheduler-rules.md`
  - `docs/scheduler-ui-export-rules.md`
  - `docs/scheduler-qa-checklist.md`
- Για security αλλαγές, ισχύει επίσης:
  - `docs/SECURITY_GUIDELINES.md`
- Για SaaS, tenant isolation ή central auth αλλαγές, διάβασε πρώτα τα σχετικά docs:
  - `docs/central-auth-portal-migration.md`
  - `docs/tenant-authorization-model.md`
  - `docs/firebase-security-rules.md`

Αν υπάρχει σύγκρουση ανάμεσα σε γενικό κανόνα και πιο ειδικό scheduler/security κανόνα, ο πιο ειδικός κανόνας υπερισχύει.

## Project Identity

Το GasStation Shift Manager είναι εφαρμογή διαχείρισης βαρδιών για πρατήριο καυσίμων.

Βασικές λειτουργίες:

- Εβδομαδιαίο και μηνιαίο πρόγραμμα βαρδιών.
- Αυτόματη δημιουργία προγράμματος.
- Ρόλοι εργαζομένων και rotation.
- Σταθερά ρεπό, άδειες, ασθένειες και manual overrides.
- Drag and drop ανάθεση.
- Templates, history και locked week behavior.
- Firebase persistence.
- PDF, Excel και Word exports.

## Stack

- React + Vite
- Tailwind CSS
- Zustand
- Firebase Auth / Firestore
- dnd-kit
- jsPDF / @e965/xlsx / docx exports

## Non-Negotiable Rules

- Κράτα όλα τα ελληνικά UTF-8 safe.
- Μην εισάγεις mojibake ή broken Greek text.
- Μην αφαιρείς data fields από objects μόνο επειδή δεν εμφανίζονται στο UI.
- Αν κάτι πρέπει να μη φαίνεται, κάν' το presentation-only.
- Μην σπας persistence shape χωρίς migration-safe fallback.
- Μην κάνεις μεγάλο rewrite όταν αρκεί μικρή στοχευμένη αλλαγή.
- Μην δημιουργείς ψεύτικα σωστό πρόγραμμα. Αν κανόνας δεν μπορεί να ικανοποιηθεί, βγάλε καθαρό warning.

## Scheduler Source Of Truth

Οι ρόλοι προγραμματισμού προέρχονται πρώτα από τα employee scheduling rules:

- `employee.scheduleRole`
- `employee.roleType`

Οι ενεργοί scheduler roles είναι:

- `core1`
- `core2`
- `intermediate`
- `custom`

Οι monthly role selectors ή legacy role configs δεν πρέπει να κάνουν override explicit employee roles, εκτός αν υπάρχει ξεκάθαρο manual override mode.

## Scheduler Business Guarantees

- Core 1 και Core 2 δεν πρέπει να είναι στην ίδια βάρδια όταν δουλεύουν την ίδια ημέρα.
- Core εργαζόμενος δεν πρέπει να μπαίνει σε intermediate shift.
- Intermediate shift πρέπει να ανατίθεται μόνο σε Intermediate / Coverage εργαζόμενο.
- Fixed day off είναι hard constraint.
- Με 3 διαθέσιμους εργαζόμενους πρέπει να υπάρχει:
  - 1 morning
  - 1 intermediate
  - 1 evening
- Με 4 διαθέσιμους σε full coverage day πρέπει να υπάρχει:
  - 2 morning
  - 2 evening
  - 0 intermediate
- Κυριακή:
  - ακριβώς 1 εργαζόμενος
  - `08:00-20:00`
  - fair rotation σε όλους τους eligible εργαζόμενους
  - αποφυγή συνεχόμενων Κυριακών όταν είναι εφικτό
  - συνέχεια rotation από μήνα σε μήνα

## UI Rules

- Το weekly/monthly schedule πρέπει να παραμένει compact αλλά readable.
- Μην εμφανίζεις ξανά στις compact cards:
  - `Εργασία`
  - `Πρωινός`
  - `Απογευματινός`
  - `Ενδιάμεσος`
  - auto-generated notes
  - duration labels
- Shift cards:
  - όνομα εργαζόμενου στην πρώτη γραμμή
  - ωράριο ή κατάσταση στη δεύτερη γραμμή
  - μικρά edit/delete/manual controls
  - εμφανή conflicts/warnings
- Monthly view πρέπει να εμφανίζεται ως stacked weekly blocks, όχι 3-column month grid.

## Security Rules

Ακολούθησε πάντα το `docs/SECURITY_GUIDELINES.md`.

Σημαντικά για αυτό το project:

- Μην βάζεις secrets σε source code.
- Μην εκθέτεις Firebase credentials πέρα από τα ήδη public-safe client config patterns.
- Μην βασίζεσαι μόνο στο frontend για authorization.
- Firestore rules πρέπει να προστατεύουν admin-only actions.
- Μην κάνεις logs με passwords, tokens, προσωπικά δεδομένα ή ευαίσθητα στοιχεία.
- Validate user input πριν χρησιμοποιηθεί σε persistence, exports ή admin workflows.
- Για exports, μην διαρρέεις επιπλέον πεδία πέρα από αυτά που χρειάζονται.

## Persistence And Data Safety

- Μην διαγράφεις fields όπως:
  - `label`
  - `notes`
  - `shiftType`
  - `duration`
  - `isManualOverride`
  - special-day fields
  - role fields
- Manual overrides πρέπει να προστατεύονται από automatic generation εκτός αν ο κανόνας λέει ρητά ότι δεν διατηρούνται.
- Firebase persistence, templates, history και locked week behavior είναι κρίσιμα και δεν πρέπει να σπάνε.

## QA Expectations

Για scheduler αλλαγές τρέξε:

```bash
npm run qa:scheduler
npm run build
```

Όταν αλλάζει το scheduler engine ή generator logic, τρέξε επίσης:

```bash
npm run qa:scheduler-engine
```

Όταν αλλάζει UI flow ή role persistence, προτίμησε και:

```bash
npm run test:e2e:scheduler
```

Αν το e2e απαιτεί dev server, ξεκίνα προσωρινά Vite και κλείσ' το μετά.

Για SaaS, auth, Firebase rules ή export-security αλλαγές, πρόσθεσε τα κατάλληλα checks:

```bash
npm run qa:tenant-authorization
npm run qa:public-readonly
npm run qa:repositories
npm run qa:export-security
npm run qa:saas-foundation
npm run security:scan
```

## Git Hygiene

- Μην κάνεις commit/stash/push χωρίς ρητό αίτημα.
- Πριν από commit, έλεγξε `git status --short`.
- Μην διαγράφεις untracked αρχεία του χρήστη χωρίς ρητή άδεια.
- Μην κάνεις reset/revert σε αλλαγές που δεν έκανες εσύ.

## Development Style

- Διάβασε πρώτα το σχετικό code path.
- Πρόσθεσε tests για bugs πριν ή μαζί με το fix.
- Κράτα αλλαγές μικρές και εστιασμένες.
- Μην πειράζεις unrelated dashboard/analytics/export/Firebase code όταν το αίτημα αφορά scheduler UI ή generator.
- Προτίμησε deterministic logic. Όχι random output για πρόγραμμα.
