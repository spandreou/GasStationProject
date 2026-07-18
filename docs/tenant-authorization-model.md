# ShiftOryx Tenant Authorization Model

This document defines the approved target authorization model and records current compatibility. It does not change runtime behavior or Firestore Rules.

## Authorization Boundaries

- Hostname resolves tenant context only.
- Firebase Auth proves user identity only.
- Tenant access requires an ACTIVE membership for the same `uid` and `tenantId`.
- Platform administration and tenant ownership are separate privileges.
- Public viewers read sanitized collections anonymously and have no membership.

## MVP Tenant Role

New tenant memberships use only:

```json
{
  "uid": "firebase-auth-uid",
  "tenantId": "tenant-slug",
  "role": "OWNER",
  "status": "ACTIVE"
}
```

Document path:

```text
tenantMemberships/{uid}_{tenantId}
```

`ADMIN` and `MANAGER` are legacy compatibility roles currently recognized by parts of the runtime/rules. Do not create new memberships with them. Phase 2 must inventory live values, update code/rules/tests, migrate safely and preserve rollback before they can be removed.

Unknown roles and non-ACTIVE statuses deny private access.

## ShiftOryx Admin

Platform owner authorization uses:

```text
platformAdmins/{uid}
```

The technical compatibility role may remain `SUPER_ADMIN` with `ACTIVE` status. Client writes are denied. Platform admin status does not bypass tenant isolation; operational access still requires the tenant's OWNER membership unless a future trusted support flow is explicitly designed and audited.

## Employees And Public Viewers

Employees/public viewers do not receive Firebase accounts, passwords, UIDs or memberships in the MVP. They may read only dedicated sanitized collections. They cannot edit schedules, employees or absences; export; access archives/audit; or call privileged lifecycle operations.

Scheduler classifications such as `CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B`, `INTERMEDIATE`, `CUSTOM`, `EXTRA_A` and `EXTRA_B` are employee business data and never grant authorization.

## Rule Expectations

- Deny raw/private tenant data to anonymous users.
- Scope private reads/writes to ACTIVE matching membership.
- Deny client writes to memberships, platform admin grants, registration tokens, auth tickets, slug reservations and subscription enforcement state.
- Allow anonymous reads only from intentionally sanitized tenant public collections.
- Never authorize by email, host alone or frontend visibility.
- Enforce high-risk provisioning, token, slug, subscription and platform actions server-side and audit them.

## Phase 2 Migration Gate

Before OWNER-only enforcement:

1. inventory current membership roles and call sites,
2. identify bootstrap/provisioning paths that still create legacy roles,
3. update emulator and browser authorization tests,
4. migrate records with backup and verification,
5. deploy rules/runtime in a controlled window,
6. verify pilot owner login and anonymous public view,
7. retain a documented rollback.

Until that phase is approved, compatibility behavior remains a current-state fact and must not be silently removed.
