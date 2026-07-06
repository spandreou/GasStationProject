# Project Rename Plan: GasStationProject To ShiftFlow

## Goal

Rename the product identity to **ShiftFlow** without breaking the current BP Kallis pilot deployment.

There are three different rename layers. They should not all be changed at once.

## Layer 1 — Product / Brand Name

Safe to change first.

Use:

```text
ShiftFlow
```

for:

- README title
- docs
- landing page copy
- GitHub About description
- future domain references
- roadmap files

Keep legacy GasStation references only when describing the old repo, current pilot, or deployment history.

## Layer 2 — GitHub Repository Name

Current:

```text
spandreou/GasStationProject
```

Target:

```text
spandreou/ShiftFlow
```

GitHub usually redirects old repository URLs after a rename, but local clones, server checkouts, scripts, docs, and deployment notes should still be updated deliberately.

After renaming the repository in GitHub UI, update local remotes:

```bash
git remote set-url origin https://github.com/spandreou/ShiftFlow.git
git remote -v
```

On the homelab server, either keep the existing folder temporarily:

```text
/home/spandreou/projects/GasStationProject
```

or rename it only during a planned maintenance step:

```bash
cd /home/spandreou/projects
mv GasStationProject ShiftFlow
cd ShiftFlow
git remote set-url origin https://github.com/spandreou/ShiftFlow.git
```

Do not rename the server folder until deploy commands, docs, and any scripts that reference the old path are updated.

## Layer 3 — Runtime / Deployment Names

These are currently GasStation-specific and can affect deployment:

```text
package.json name: gas-station-shift-manager
docker compose service: gasstation-frontend
Docker image: gasstation-shift-manager:bp-kallis
Docker container: gasstation-bp-kallis
Compose project: gasstationproject
Env var: GASSTATION_FRONTEND_PORT
Firebase project references: gasstationproject-9dd89
```

Do not rename all of these in one uncontrolled step.

Recommended order:

1. Rename product/docs to ShiftFlow.
2. Rename GitHub repo after PRs are clean.
3. Update local and server git remotes.
4. Keep Docker/Firebase names stable until the ShiftFlow domain rollout is verified.
5. Later, plan a deployment-name migration with rollback.

## GitHub About Description

Recommended short description:

```text
ShiftFlow — multi-tenant SaaS for employee shift scheduling, tenant workspaces, absences, reports, and platform admin management.
```

Recommended topics:

```text
shiftflow
saas
multi-tenant
shift-scheduling
employee-management
react
vite
firebase
firestore
tailwindcss
cloudflare
```

## Safe Rule

Brand rename first. Runtime rename later.

The current BP Kallis pilot should remain stable while the public product identity moves to ShiftFlow.
