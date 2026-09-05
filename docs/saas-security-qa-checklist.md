# ShiftOryx SaaS Security QA Checklist

Use this checklist before enabling tenant-gated access or deploying SaaS foundation changes. It distinguishes current homelabshare compatibility from the future ShiftOryx domain rollout.

## Auth

- `/login` loads without raw Firebase errors.
- `/login` uses Firebase Auth and does not render protected scheduler data as the primary login experience.
- After central portal login, `0/1/2+` memberships resolve to no-access, tenant redirect, or `/select-tenant`.
- Owner login succeeds only for a Firebase Auth user with an ACTIVE matching tenant membership.
- No email allowlist or Firebase custom claim grants tenant access.
- New memberships use `OWNER` only; legacy `ADMIN`/`MANAGER` acceptance is tested only as temporary Phase 2 compatibility.
- Logout clears admin access and returns the UI to read-only mode.
- Failed login shows a safe, human-readable message.
- No passwords are logged.

## Forgot / Reset Password

- `/forgot-password` always shows:

```text
Αν υπάρχει λογαριασμός με αυτό το email, θα σταλεί σύνδεσμος επαναφοράς.
```

- The forgot-password flow does not reveal whether an email exists.
- Email reset input is trimmed before use and bounded to a safe maximum length.
- `/reset-password?mode=resetPassword&oobCode=...` accepts Firebase reset action codes.
- New password values never appear in the URL.
- New password inputs enforce minimum and maximum lengths.
- Full reset URLs and action codes are not logged.
- After success, the user is redirected to `/login` without query parameters.

## Tenant Resolver

- Current compatibility: `gas.homelabshare.gr` resolves as central portal context.
- `bp-kallis.homelabshare.gr` resolves as tenant context with slug `bp-kallis`.
- Phase 6 target: `shiftoryx.gr` is root context and `{tenantSlug}.shiftoryx.gr` resolves the tenant through one wildcard/shared app.
- `localhost` / `127.0.0.1` resolves as local development context.
- Hostname detection is not treated as authorization.

## Membership Access

- Access checks use Firebase Auth `uid`.
- `tenantMemberships/{uid}_{tenantId}` is the membership id pattern.
- No email-to-domain hardcoding exists.
- Scheduler roles are never accepted as authorization roles.
- `0` memberships shows:

```text
Δεν υπάρχει ενεργό κατάστημα συνδεδεμένο με αυτόν τον λογαριασμό.
```

- `1` membership redirects to the tenant domain.
- `2+` memberships show `/select-tenant`.
- Tenant denial shows:

```text
Δεν έχετε πρόσβαση σε αυτό το κατάστημα.
```

## Tenant Gate

- `VITE_ENABLE_TENANT_GATE=false` keeps the BP Kallis pilot stable until seed data exists.
- When enabled, the tenant gate must not block `/login`, `/forgot-password`, or `/reset-password`.
- Before enabling the gate, seed:

```text
tenants/bp-kallis
tenantMemberships/{uid}_bp-kallis
users/{uid}
```

- With the gate enabled, tenant data is rendered only after active membership verification.
- With no active membership, tenant data is not rendered.
- Anonymous users retain the sanitized public view and never receive private tenant data.

## Public Privacy

- Current public snapshots contain only work schedule/display-safe fields and safe aggregates.
- No absence reason, medical detail, contact field, UID, membership, audit data, archive metadata or private/generic note is public.
- Phase 10 status labels require a dedicated `publicNote`, owner preview, schema/rules review and leakage tests before enablement.

## Public Domain / Docker

- `https://bp-kallis.homelabshare.gr/` returns HTTP 200/301/302.
- Server-local `curl -I http://localhost:8085` returns HTTP 200/301/302.
- `gasstation-bp-kallis` container is healthy after Docker restart.
- Cloudflare Tunnel config/tokens are not printed in logs.

## Repository Safety

- `.env` and `.env.*` are ignored.
- No service account JSON, private key, token, API secret, or password is committed.
- No raw stack traces or raw Firebase errors are shown to end users.
- GitHub Actions permissions were not changed.

## Commands

```bash
npm run qa:saas-foundation
npm run build
npm run qa:scheduler-engine
npm run qa:scheduler
npm run qa:tenant-authorization
npm run qa:public-readonly
npm run qa:auth-broker
npm run security:hardening
```
