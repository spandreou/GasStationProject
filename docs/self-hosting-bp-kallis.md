# BP Kallis Self-Hosted Deployment

This is the live homelab deployment runbook for:

```txt
https://bp-kallis.homelabshare.gr/
```

## Naming Map

Use these names exactly:

```txt
Correct local Windows workspace:
C:\Users\Spyros\OneDrive\Υπολογιστής\projects\GasStation-main

Wrong/old local folder:
GasStationProject-main

GitHub remote:
https://github.com/spandreou/GasStationProject.git

Active server checkout:
/home/spandreou/projects/GasStationProject
```

The GitHub repository and server checkout still use `GasStationProject`. The local Codex workspace is `GasStation-main`. Do not spend time in `GasStationProject-main`.

## Current Server State

```txt
SSH target: homelab
Server path: /home/spandreou/projects/GasStationProject
Active deployment branch: chore/dependabot-config
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

## Required Server Env

Keep real Firebase values only in the server `.env`; do not commit them.

The server `.env` must include:

```env
VITE_APP_MODE=production
VITE_PUBLIC_APP_BASE_DOMAIN=homelabshare.gr
VITE_CENTRAL_PORTAL_DOMAIN=gas.homelabshare.gr
VITE_DEFAULT_TENANT_SLUG=bp-kallis
GASSTATION_FRONTEND_PORT=8085
```

`GASSTATION_FRONTEND_PORT=8085` is required because port `8080` is already allocated on the homelab server.

## Deploy

Use this sequence for the active homelab site:

```bash
ssh homelab
cd /home/spandreou/projects/GasStationProject
git status --short --branch
git pull --ff-only origin chore/dependabot-config
docker compose up -d --build
docker compose ps
curl -I --max-time 10 http://127.0.0.1:8085/
```

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

## Firestore Rules Deploy

The frontend can be updated while Firestore rules are still stale. If admin-only feeds fail with `permission-denied`, deploy the checked-in rules:

```bash
npm run deploy:firestore-rules -- --project gasstationproject-9dd89
```

This uses `firebase.json`, which points Firebase CLI at:

```txt
firestore.rules
```

Deploy rules after changing Firestore collections, admin-only reads/writes, public sanitized collections, or SaaS tenant access.

## Production Verification

After deploy, verify both the local container and public URL:

```bash
curl -I --max-time 10 http://127.0.0.1:8085/
curl -I --max-time 10 https://bp-kallis.homelabshare.gr/
```

Browser QA checklist:

- `https://bp-kallis.homelabshare.gr/` returns the current UI.
- Hard refresh does not bring back stale assets.
- The scheduler loads without a blank screen.
- Admin login/logout still works.
- Weekly and monthly schedule views still render.
- Export dropdown opens above panels and does not get clipped.
- PDF/Excel/Word exports still complete.

## Branch Note

As of the current deployment, the homelab server tracks `chore/dependabot-config`. If the Docker/SaaS deployment artifacts are later merged into `main`, update this file and `HOMELAB.md` in the same commit and switch the server checkout deliberately.
