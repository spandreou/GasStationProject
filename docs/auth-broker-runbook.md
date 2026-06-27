# Firebase Auth Broker Runbook

## Purpose

The Firebase auth broker is the planned cross-subdomain handoff layer for
GasStation SaaS.

Target flow:

```text
gas.homelabshare.gr
-> Firebase login
-> createAuthTicket Cloud Function
-> tenant URL with #authTicket
-> exchangeAuthTicket Cloud Function
-> signInWithCustomToken on tenant origin
-> tenant dashboard
```

This implementation is a foundation only. It must remain disabled until the
functions are deployed and verified in a maintenance window.

## Feature Flags

Default safe values:

```text
VITE_ENABLE_AUTH_BROKER=false
VITE_ENABLE_TENANT_GATE=false
```

Do not enable `VITE_ENABLE_TENANT_GATE=true` in production until the broker flow
has passed staging/live verification. With the broker disabled, existing BP
Kallis tenant login behavior continues.

## Cloud Functions

Functions package:

```text
functions/
```

Endpoints:

- `createAuthTicket`
- `exchangeAuthTicket`
- `cleanupAuthTickets`

`createAuthTicket` is called only by the central portal after Firebase login.
It verifies the Firebase auth context, central origin, tenant membership,
tenant existence, and `returnTo`, then creates a short-lived ticket.

`exchangeAuthTicket` is called only by a tenant origin. It consumes the ticket
once, re-checks tenant membership, and returns a Firebase custom token for
`signInWithCustomToken`.

`cleanupAuthTickets` removes expired/used records. Security must not depend on
cleanup; exchange always rejects expired or used tickets.

## Firestore Model

```text
authTickets/{ticketHash}
```

Fields:

- `uid`
- `tenantId`
- `role`
- `status`
- `returnTo`
- `returnToHost`
- `centralOrigin`
- `allowedTenantOrigin`
- `createdAt`
- `expiresAt`
- `usedAt`
- `usedByOrigin`
- `requestId`

Ticket values are random 32-byte hex strings. Firestore stores only the SHA-256
ticket hash as the document id.

## Firestore Rules

Clients must never access auth tickets directly:

```text
match /authTickets/{ticketId} {
  allow read, write: if false;
}
```

Only Cloud Functions Admin SDK may read or write auth tickets.

## Expiration And Replay Protection

- Ticket TTL: 60 seconds.
- Single use only.
- Ticket is consumed in a Firestore transaction.
- Expired tickets fail even if cleanup has not run.
- Used tickets fail on replay.
- Tenant origin must match the ticket's `allowedTenantOrigin`.
- Tenant id from origin must match the ticket tenant id.
- Membership is re-checked during exchange.

## returnTo Validation

Accepted:

- HTTPS production URLs.
- Known tenant hostnames under `homelabshare.gr`.
- Tenant id derived from host.
- Active membership for the same tenant.
- Allowed tenant app paths: `/`, `/app`, and `/app/...`.

Rejected:

- External domains.
- `javascript:` and `data:` URLs.
- URLs with username or password.
- Central portal return URLs.
- Unknown tenant subdomains.
- Paths outside allowed dashboard routes.

The ticket is sent in the URL fragment:

```text
https://bp-kallis.homelabshare.gr/#authTicket=<ticket>
```

The tenant callback removes the fragment immediately with `history.replaceState`.

## CORS And Origins

Do not use wildcard CORS.

Central origin:

```text
https://gas.homelabshare.gr
```

Initial tenant origin:

```text
https://bp-kallis.homelabshare.gr
```

Future tenant origins should be added through controlled function configuration
or trusted tenant config. CORS is not the security boundary; functions still
validate ticket, tenant, membership, and origin.

## Never Log Or Store

Never log or store in Firestore/audit logs:

- Firebase ID tokens
- refresh tokens
- custom tokens
- raw auth tickets
- password reset URLs
- `oobCode` values
- tunnel tokens
- service account keys
- `.env` values

## Safe Rollout

1. Keep `VITE_ENABLE_AUTH_BROKER=false`.
2. Keep `VITE_ENABLE_TENANT_GATE=false`.
3. Deploy Firestore rules with `authTickets` denied to clients.
4. Deploy Cloud Functions.
5. Verify `createAuthTicket` rejects anonymous callers.
6. Verify `exchangeAuthTicket` rejects missing, malformed, expired, used, and
   wrong-origin tickets.
7. Enable `VITE_ENABLE_AUTH_BROKER=true` in a controlled environment.
8. Login from `gas.homelabshare.gr`.
9. Verify redirect to `bp-kallis.homelabshare.gr/#authTicket=...`.
10. Verify the tenant removes the fragment and signs in with custom token.
11. Verify dashboard loads and membership checks still pass.
12. Only after broker success, evaluate `VITE_ENABLE_TENANT_GATE=true`.

## Rollback

1. Set `VITE_ENABLE_AUTH_BROKER=false`.
2. Set `VITE_ENABLE_TENANT_GATE=false`.
3. Rebuild/redeploy the frontend if a flag was changed.
4. Existing tenant login behavior continues.
5. Leave `authTickets` rules denied.
6. Functions can remain deployed but unused.

No tenant data migration is required.
