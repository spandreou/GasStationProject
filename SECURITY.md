# Security Policy

## Dependency Scanning Policy

This project uses a baseline dependency and static scanning workflow:

- `npm audit` blocks HIGH and CRITICAL npm advisories.
- OWASP CVE Lite CLI scans the npm lockfile and blocks HIGH and CRITICAL findings.
- Trivy scans repository dependencies, configuration, and accidental secrets.
- Semgrep runs as report-only static analysis until the initial finding set is reviewed.

MEDIUM and LOW findings should be reviewed during maintenance, but they are not initial CI blockers.

## Local Security Scans

Run the Node dependency checks locally:

```bash
npm run security:hardening
npm run security:audit
npm run security:cve
npm run security:scan
```

Run Trivy locally when the CLI is available:

```bash
trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL --exit-code 1 .
```

Run Semgrep locally when the CLI is available:

```bash
semgrep scan --config auto .
```

## Blocking Vulnerabilities

HIGH and CRITICAL dependency vulnerabilities are blocking for pull requests and main branch pushes when the scanner supports severity thresholds reliably.

If a scanner cannot enforce thresholds clearly, keep it in report-only mode and document the follow-up before enabling it as a gate.

## Dependency Updates

- Do not upgrade dependencies automatically as part of vulnerability scanning.
- Prefer the smallest safe patch or minor update that fixes the vulnerability.
- Major upgrades require a focused compatibility review, build verification, and scheduler regression checks.
- Re-run the security scan, scheduler QA, and build before merging dependency changes.

## Secrets And Environment Files

- Never commit Firebase secrets, admin credentials, API keys, private keys, or recovery codes.
- Keep real `.env` files out of Git.
- Use `.env.example` only for variable names and non-sensitive defaults.
- Rotate any secret immediately if it is accidentally committed or exposed in logs.

## Admin-Only Sign-In Model

- Only the station admin signs in.
- Employees do not have app accounts, Firebase Auth identities, role claims, or write access.
- Employee-facing views, where present, must be public-safe and read-only.
- UI hiding is not security. Firestore rules are the enforcement layer.
- Admin/private collections require Firebase Auth plus an ACTIVE tenant membership for the matching tenant with role `OWNER`, `ADMIN`, or `MANAGER`.
- Public collections may be readable without sign-in only when every field is intentionally sanitized.
- Production tenant membership bootstrapping must happen from a trusted local/admin environment with a Firebase service account, never from frontend code.
- The `admin:bootstrap` helper only prepares the Firebase Auth user. It does not grant tenant access. Tenant access comes from `tenantMemberships/{uid}_{tenantId}`.
- The bootstrap helpers read temporary credentials from environment variables and must not print passwords, private keys, access tokens, or service account objects.

## Firestore Privacy Model

- `employees` is admin-only because it contains private data and scheduling role fields.
- `employeeAbsences` is admin-only and remains the private source of truth for the scheduler generator.
- `attendance_history` and `week_history` are admin-only because they are loaded through admin-only UI flows.
- Public/employee views must read only dedicated sanitized collections.
- Sanitized public collections are readable without sign-in and writable only by admins.

## Application Security Baseline

- Do not trust frontend-only validation for production authorization decisions.
- Production admin authorization uses Firebase Auth plus an ACTIVE `tenantMemberships/{uid}_{tenantId}` document for the matching tenant.
- Email allowlists and Firebase custom claims must not grant tenant admin access.
- Do not put admin passwords in Vite env vars. Vite env vars are included in the frontend bundle.
- Firestore protected data must require tenant membership authorization for reads and writes unless it is a dedicated sanitized public collection.
- Server-side data access must use parameterized queries or a trusted SDK/ORM.
- Passwords must be hashed with a strong password hashing function such as Argon2id or bcrypt.
- JWT/session secrets must be high-entropy values stored only in environment-specific secret storage.
- Login, admin, and write-heavy endpoints must use rate limiting when production backend services are introduced.

## Rate Limiting Follow-up

- Current limiter: no dedicated backend limiter is present because the app is Firebase/client-heavy.
- Affected features: login/admin entry points, schedule writes, employee writes, audit-log writes, and any future API or Cloud Function endpoints.
- Implemented now: documented the production limiter requirement; no runtime limiter changes were made in this pass.
- Deferred: Firebase App Check enforcement, Cloud Function or backend throttles for write-heavy actions, and Cloudflare/Firebase abuse controls.
- Recommended production path: enable Firebase App Check for supported clients, keep Firestore rules as the authorization boundary, and add server-side rate limiting when privileged writes move behind Cloud Functions or a backend API.

## Phase 1 Production Hardening Notes

- Removed client-side admin password checks and fallback credentials from the frontend.
- Removed hardcoded demo admin authorization from Firestore rules.
- Added basic Firestore field allowlists and type/date checks for scheduler collections.
- Added Vercel security headers: HSTS, nosniff, frame deny, referrer policy, and permissions policy.
- CSP is intentionally not enabled yet because Firebase Auth, Firestore, Analytics, dynamic chunks, and inline style behavior need a dedicated browser compatibility pass.

## Phase 2 Firestore Integrity And Audit Trail

- Schedule generation, clear operations, template/history loads, and week finalization use Firestore batch/chunked writes where practical to reduce partial-write risk.
- Generated shifts include a `generationRunId` so a schedule can be tied back to the generation event that created it.
- Admin actions write an immutable audit log entry in the `audit_logs` collection when practical.
- The audit log captures action, actor uid/email, target collection/scope/id, before/after data where practical, metadata, timestamp, and `generationRunId` for generation-related actions.
- Firestore rules allow audit log reads and creates only for authenticated admins.
- Firestore rules deny audit log update and delete from the client.

Remaining limitation: without a backend or Cloud Function, audit log creation is initiated by the trusted admin client. Firestore rules protect who may create/read logs and prevent client edits/deletes, but they cannot guarantee that every allowed write is accompanied by a matching audit entry. A server-side write layer or Firestore trigger is the future hardening path for fully enforced audit logging.

## Absence Data Access

Private source of truth:

- `employeeAbsences` is admin-only read/write.
- It contains full absence data used by admin screens and the scheduler generator, including employee ids, replacement mode, manual replacement employee id, notes, status, and audit metadata.
- The generator uses `employeeAbsences`, never the sanitized public view.

Public view:

- Public users must not read absence mirrors, absence labels, absence date ranges, sick leave, leave-related rest days, replacement reasons, notes, or absence status.
- The legacy `employeeAbsencesPublic` collection is no longer anonymous-readable. It remains admin-only for legacy cleanup and must not be used by public UI.
- Public/employee schedule views may show only work schedule fields: employee full name, date, shift label/type, start time, and end time.
- Public schedule snapshots must not include employee ids, user ids, emails, phones, tenant memberships, audit metadata, internal notes, absence data, or private archive data.

Remaining limitation: without a backend or Cloud Function, the trusted admin client still creates sanitized public schedule snapshots. Firestore rules restrict raw absence and admin data, and validation checks must keep public snapshots limited to work shifts only.

## Phase 4 Content Security Policy

Vercel sends a conservative Content-Security-Policy for the deployed app.

Allowed runtime origins are scoped to:

- `self` for Vite app shell, chunks, CSS, local images, and local fonts.
- `https://*.googleapis.com`, `https://*.firebaseio.com`, `https://*.firebaseapp.com`, and `https://*.appspot.com` for Firebase Auth, Firestore, and related Firebase APIs.
- Google Analytics / Firebase Analytics endpoints such as `https://www.googletagmanager.com`, Google Analytics hosts, and `https://app-measurement.com`.
- `data:` and `blob:` for browser-generated images/download/export flows and embedded fonts.

Temporary compatibility trade-off:

- `style-src 'unsafe-inline'` remains enabled because the React UI uses inline/dynamic styles in several places.
- `script-src` does not allow `'unsafe-inline'`; scripts are limited to `self` and Google Tag Manager for Firebase Analytics compatibility.

Browser QA checklist:

- See `docs/csp-qa-checklist.md`.
- Re-run browser QA after adding auth providers, external media/fonts, new Firebase products, export libraries, or deployment header changes.
- Check console and network panels for CSP violations or blocked Firebase/Google endpoints.
