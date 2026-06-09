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

## Application Security Baseline

- Do not trust frontend-only validation for production authorization decisions.
- Production admin authorization uses Firebase Auth plus a Firebase custom claim `admin=true`.
- Demo email allowlists are allowed only in `VITE_APP_MODE=demo` and must not be treated as production authorization.
- Do not put admin passwords in Vite env vars. Vite env vars are included in the frontend bundle.
- Firestore protected data must require authentication for reads and custom-claim admin authorization for writes.
- Server-side data access must use parameterized queries or a trusted SDK/ORM.
- Passwords must be hashed with a strong password hashing function such as Argon2id or bcrypt.
- JWT/session secrets must be high-entropy values stored only in environment-specific secret storage.
- Login, admin, and write-heavy endpoints must use rate limiting when production backend services are introduced.

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
