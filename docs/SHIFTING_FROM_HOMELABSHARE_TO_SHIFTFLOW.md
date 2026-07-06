# Shift From Homelabshare To ShiftFlow

## Purpose

This document separates the current pilot deployment from the target SaaS brand.

## Current Pilot

The current production-like pilot is:

```text
bp-kallis.homelabshare.gr
```

This is the verified BP Kallis homelab deployment and should remain stable until the ShiftFlow migration is planned and tested.

## Target Product

The target product identity is:

```text
ShiftFlow
```

Target root domain:

```text
shiftflow.gr
```

Target tenant pattern:

```text
{tenantSlug}.shiftflow.gr
```

Target BP Kallis tenant:

```text
bp-kallis.shiftflow.gr
```

## Migration Principle

Do not break the current BP Kallis pilot while preparing ShiftFlow.

The migration should happen in controlled phases:

1. Align docs and roadmap.
2. Confirm tenant model and current state.
3. Verify wildcard domain routing.
4. Verify Firebase Auth behavior across subdomains.
5. Prepare tenant resolver for ShiftFlow domains.
6. Seed/verify BP Kallis tenant metadata.
7. Test tenant gate in a safe environment.
8. Move public route only after rollback is ready.

## Naming Rule

Use `GasStation` only when referring to the legacy repo, codebase, current pilot, or historical deployment.

Use `ShiftFlow` when referring to the SaaS product, future platform, public portal, admin panel, and tenant-domain model.

## Rollback Principle

Any ShiftFlow routing change must be reversible without deleting Firebase users, tenant documents, memberships, or BP Kallis operational data.
