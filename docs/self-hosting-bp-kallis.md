# BP Kallis Self-Hosted Deployment

This document describes the first production-like deployment target:

```text
bp-kallis.homelabshare.gr
```

The app remains one shared React/Vite codebase. `bp-kallis` is the first tenant-aware pilot, not a separate fork.

## Architecture

```text
bp-kallis.homelabshare.gr
  -> Cloudflare DNS/proxy or Cloudflare Tunnel
  -> Docker container on the homelab server
  -> Nginx static server with SPA fallback
  -> Firebase Auth + Firestore
```

## Build-Time Environment

Vite embeds `VITE_*` values at build time. Keep real values in `.env` on the server; do not commit `.env`.

Start from:

```bash
cp .env.example .env
```

Required Firebase values:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

Pilot tenant values:

```env
VITE_APP_MODE=production
VITE_PUBLIC_APP_BASE_DOMAIN=homelabshare.gr
VITE_CENTRAL_PORTAL_DOMAIN=gas.homelabshare.gr
VITE_DEFAULT_TENANT_SLUG=bp-kallis
```

`VITE_ADMIN_EMAIL` is demo-only. Do not use it as production authorization.

## Docker Commands

Build and run:

```bash
docker compose up -d --build
```

Default host port:

```text
8080
```

Override if needed:

```env
GASSTATION_FRONTEND_PORT=18080
```

Then:

```bash
docker compose up -d --build
```

## Cloudflare

Recommended options:

- Cloudflare Tunnel public hostname:
  - `bp-kallis.homelabshare.gr` -> `http://localhost:8080`
- Or proxied DNS record to the server if the origin port is intentionally exposed.

Prefer Tunnel so origin ports do not need to be public.

Suggested Cloudflare protections:

- HTTPS only.
- Managed WAF rules where available.
- Rate limiting or challenge rules for:
  - `/login`
  - `/forgot-password`
  - `/reset-password`
  - `/request-token`
  - `/admin-console`

## Firebase Console Checklist

Add these Firebase Auth authorized domains:

```text
bp-kallis.homelabshare.gr
gas.homelabshare.gr
```

Password reset action links must be allowed to return to:

```text
https://bp-kallis.homelabshare.gr/reset-password
https://gas.homelabshare.gr/reset-password
```

## Tenant Direction

The first pilot uses:

```text
Tenant slug: bp-kallis
Tenant domain: bp-kallis.homelabshare.gr
```

Future tenant data should live under tenant-aware paths:

```text
tenants/{tenantId}/employees
tenants/{tenantId}/shifts
tenants/{tenantId}/settings
tenants/{tenantId}/auditLogs
```

Do not hardcode email-to-domain mappings. Resolve tenant access through Firebase `uid` and tenant memberships.

## Manual QA

- `https://bp-kallis.homelabshare.gr` loads over HTTPS.
- Browser refresh works on `/`, `/forgot-password`, and `/reset-password`.
- Firebase login/logout works.
- Forgot password shows only the generic success message.
- Reset password with a valid Firebase `oobCode` succeeds.
- Reset password with an invalid or expired code fails safely.
- No password, token, or full reset URL appears in logs.
- Docker container restarts cleanly.
- Cloudflare does not expose the origin unnecessarily.
