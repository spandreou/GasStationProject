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
- Server-side data access must use parameterized queries or a trusted SDK/ORM.
- Passwords must be hashed with a strong password hashing function such as Argon2id or bcrypt.
- JWT/session secrets must be high-entropy values stored only in environment-specific secret storage.
- Login, admin, and write-heavy endpoints must use rate limiting when production backend services are introduced.
