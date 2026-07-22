# BP Kallis Self-Hosted Deployment

This is the live homelab deployment runbook for:

```txt
https://bp-kallis.homelabshare.gr/
```

The app remains one shared React/Vite codebase. `bp-kallis` is the first tenant-aware pilot, not a separate fork.

## ShiftOryx Domain Direction

This runbook covers the current legacy pilot endpoint only:

```text
Current: https://bp-kallis.homelabshare.gr/
Target:  https://bp-kallis.shiftoryx.gr/
Root:    https://shiftoryx.gr/
```

The current endpoint stays active until roadmap Phase 6 verifies wildcard DNS/routing, Firebase authorized domains, auth handoff, monitoring and rollback. Do not change Cloudflare, Firebase, Docker or the live domain from this documentation update.

## Naming Map

Use these names exactly:

```txt
Correct local Windows workspaces (use the one present on the current computer):
Desktop PC: C:\Users\Spyros\OneDrive\Υπολογιστής\projects\shiftoryx
Laptop: C:\Users\thugs\Desktop\projects\shiftoryx

Wrong/old local folder:
GasStationProject-main

GitHub remote:
https://github.com/spandreou/shiftoryx.git

Active server checkout:
/home/spandreou/projects/GasStationProject
```

The GitHub repository is `spandreou/shiftoryx`, while the server checkout remains `/home/spandreou/projects/GasStationProject` as a deployment compatibility path. The local Codex workspace folder is `shiftoryx`. Do not spend time in `GasStationProject-main`.

## Current Server State

```txt
SSH target: homelab
Server path: /home/spandreou/projects/GasStationProject
Current verified deployment branch: main
Production source-of-truth branch: main
Compose project: gasstationproject
Compose file: /home/spandreou/projects/GasStationProject/docker-compose.yml
Frontend service: gasstation-frontend
Frontend container: gasstation-bp-kallis
Image: gasstation-shift-manager:bp-kallis
Host port: 8085
Container port: 8080
Cloudflare tunnel container: gasstation-cloudflared
```

The deployment is self-hosted Docker behind Cloudflare/Tunnel. It is not automatically updated just because a GitHub push succeeded.

## Architecture

```txt
bp-kallis.homelabshare.gr
  -> Cloudflare DNS/proxy or Cloudflare Tunnel
  -> Docker container on the homelab server
  -> Nginx static server with SPA fallback
  -> Firebase Auth + Firestore
```

## Required Server Env

Vite embeds `VITE_*` values at build time. Keep real Firebase values only in the server `.env`; do not commit them.

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
VITE_ENABLE_MONTHLY_PDF_ARCHIVE=false
GASSTATION_FRONTEND_PORT=8085
```

`GASSTATION_FRONTEND_PORT=8085` is required because port `8080` is already allocated on the homelab server.

`VITE_ADMIN_EMAIL` is demo-only. Do not use it as production authorization.

`VITE_ENABLE_MONTHLY_PDF_ARCHIVE` defaults to `false`. The live BP Kallis deployment may set it to `true` only after Firebase Storage is active, Firestore/Storage rules are deployed, unauthenticated Storage access returns `403`, and the monthly archive generate/download flow is verified.

## Deploy

Use this sequence for the active homelab site, which tracks `main`:

```bash
ssh homelab
cd /home/spandreou/projects/GasStationProject
git status --short --branch
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
curl -I --max-time 10 http://127.0.0.1:8085/
```

Do not treat a GitHub merge as an automatic deploy. Pull `main`, rebuild Docker, and verify the local and public URLs deliberately.

Expected container state:

```txt
gasstation-bp-kallis   Up ... (healthy)   0.0.0.0:8085->8080/tcp
```

If Docker reports `Bind for 0.0.0.0:8080 failed`, confirm the server `.env` has:

```env
GASSTATION_FRONTEND_PORT=8085
```

Then rerun:

```bash
docker compose up -d
```

## Firebase Rules Deploy

The frontend can be updated while Firebase rules are still stale. If admin-only feeds fail with `permission-denied`, deploy the checked-in Firestore and Storage rules:

```bash
npm run deploy:firebase-rules -- --project gasstationproject-9dd89
```

This uses `firebase.json`, which points Firebase CLI at:

```txt
firestore.rules
storage.rules
```

Deploy rules after changing Firestore collections, Storage archive paths, admin-only reads/writes, public sanitized collections, or SaaS tenant access.

Monthly PDF archive files are private under:

```txt
tenants/{tenantId}/monthly_schedule_pdfs/{YYYY-MM}/program_month_{YYYY-MM}.pdf
```

Do not expose signed/public URLs for these files and do not write Storage paths or URLs into audit logs.

## Cloudflare

Recommended options:

- Cloudflare Tunnel public hostname:
  - `bp-kallis.homelabshare.gr` -> `http://localhost:8085`
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

```txt
bp-kallis.homelabshare.gr
gas.homelabshare.gr
```

Password reset action links must be allowed to return to:

```txt
https://bp-kallis.homelabshare.gr/reset-password
https://gas.homelabshare.gr/reset-password
```

## Current Tenant And Target Direction

The first pilot uses:

```txt
Tenant slug: bp-kallis
Tenant domain: bp-kallis.homelabshare.gr
```

Future tenant data should live under tenant-aware paths:

```txt
tenants/{tenantId}/employees
tenants/{tenantId}/shifts
tenants/{tenantId}/settings
tenants/{tenantId}/auditLogs
```

Do not hardcode email-to-domain mappings. Resolve tenant access through Firebase `uid` and tenant memberships.

The operational data is now tenant-scoped; legacy root scheduler collections are locked and must not be used as runtime fallbacks. New MVP tenant memberships use `OWNER` only. Existing `ADMIN`/`MANAGER` values remain compatibility data until Phase 2.

## Production Verification

After deploy, verify both the local container and public URL:

```bash
curl -I --max-time 10 http://127.0.0.1:8085/
curl -I --max-time 10 https://bp-kallis.homelabshare.gr/
```

Browser QA checklist:

- `https://bp-kallis.homelabshare.gr/` loads over HTTPS.
- Hard refresh does not bring back stale assets.
- Browser refresh works on `/`, `/forgot-password`, and `/reset-password`.
- The scheduler loads without a blank screen.
- Firebase login/logout works.
- Admin login/logout still works.
- Weekly and monthly schedule views still render.
- Export dropdown opens above panels and does not get clipped.
- PDF/Excel/Word exports still complete.
- Forgot password shows only the generic success message.
- Reset password with a valid Firebase `oobCode` succeeds.
- Reset password with an invalid or expired code fails safely.
- No password, token, or full reset URL appears in logs.
- Docker container restarts cleanly.
- Cloudflare does not expose the origin unnecessarily.

## Branch Note

As of the verified rollout, the homelab server tracks `main`. Keep `main` as the production source of truth for BP Kallis until the central-domain rollout is planned and validated separately.
