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

## Project Server Mapping

No verified homelab deployment was found for this project.

Local stack hints:

```txt
package.json
package name: gas-station-shift-manager
scripts: dev, build, preview, scheduler QA/e2e scripts
```

If this project is deployed later, update this file with the server path, compose project name, container names, ports, public URL, and health checks.

## Useful Server Commands

```bash
ssh homelab
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker compose ls
find /home/spandreou/projects /opt -maxdepth 3 -type d -iname '*gas*' 2>/dev/null
```

## Do Not Store Secrets

- Do not paste passwords, tokens, API keys, private keys, recovery codes, or full database URLs into this file.
- Do not commit `.env` files.
- If a secret-bearing file must be inspected, read the minimum needed and summarize only variable names or paths.
