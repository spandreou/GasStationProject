# Homelab Notes

## Purpose

This file explains how this project should look up homelab server context and credentials during development or deployment tasks.

Do not store real secrets in this repository. Record only paths, variable names, service names, and safe commands.

## SSH Access

Preferred SSH target:

```bash
ssh homelab
```

Direct server identity:

```txt
spandreou@192.168.1.50:22
```

Local SSH config uses the private key at `C:\Users\Spyros\.ssh\id_ed25519`. Never copy the key contents into docs, logs, tickets, or chat.

## Credential Lookup Rules

Use these locations only as lookup references:

```txt
/home/spandreou/Desktop/Credentials
/home/spandreou/projects/homelab/.env
/home/spandreou/projects/homelab/.env.example
/opt/municipal-police/MunicipalPoliceProject/.env.server.pilot
/opt/municipal-police/MunicipalPoliceProject/.env*.example
```

No project-specific `.env.example` file was found locally.

## Repository And Folder Map

Use these names to avoid wasting time on the wrong checkout:

```txt
Correct local Codex workspace:
C:\Users\Spyros\OneDrive\Υπολογιστής\projects\GasStation-main

Do not use:
GasStationProject-main

GitHub remote:
https://github.com/spandreou/GasStationProject.git

Active homelab checkout:
/home/spandreou/projects/GasStationProject
```

`GasStationProject-main` was an old wrong/empty local folder. The server path still uses `GasStationProject` because it is the deployed checkout name, not the Windows workspace name.

## Project Server Mapping

Verified homelab deployment:

```txt
Public URL: https://bp-kallis.homelabshare.gr/
Server path: /home/spandreou/projects/GasStationProject
Active branch on server: chore/dependabot-config
Compose project: gasstationproject
Compose file: /home/spandreou/projects/GasStationProject/docker-compose.yml
Frontend service: gasstation-frontend
Frontend container: gasstation-bp-kallis
Image: gasstation-shift-manager:bp-kallis
Host port: 8085
Container port: 8080
Cloudflare tunnel container: gasstation-cloudflared
```

The server `.env` must include this non-secret runtime setting because port `8080` is already used by Pi-hole:

```env
GASSTATION_FRONTEND_PORT=8085
```

Do not assume a GitHub push deploys the live site automatically. The current live target is self-hosted Docker and needs a server pull plus Docker rebuild/recreate.

## Deploy Commands

Use this for the active homelab deployment:

```bash
ssh homelab
cd /home/spandreou/projects/GasStationProject
git status --short --branch
git pull --ff-only origin chore/dependabot-config
docker compose up -d --build
docker compose ps
curl -I --max-time 10 http://127.0.0.1:8085/
```

If Docker tries to bind `0.0.0.0:8080`, check that `.env` contains `GASSTATION_FRONTEND_PORT=8085`.

## Useful Server Commands

```bash
ssh homelab
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker compose ls
cd /home/spandreou/projects/GasStationProject && docker compose ps
curl -I --max-time 10 http://127.0.0.1:8085/
```

## Do Not Store Secrets

- Do not paste passwords, tokens, API keys, private keys, recovery codes, or full database URLs into this file.
- Do not commit `.env` files.
- If a secret-bearing file must be inspected, read the minimum needed and summarize only variable names or paths.
