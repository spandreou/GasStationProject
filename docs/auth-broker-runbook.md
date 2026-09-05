# ShiftOryx Firebase Auth Broker Runbook

## Purpose

The Firebase auth broker is the planned cross-subdomain handoff layer for ShiftOryx. Current homelabshare origins are compatibility endpoints; the approved target is `shiftoryx.gr` and `{tenantSlug}.shiftoryx.gr`.

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

Approved target flow after roadmap Phase 6:

```text
shiftoryx.gr
-> Firebase login
-> createAuthTicket
-> {tenantSlug}.shiftoryx.gr with fragment ticket
-> exchangeAuthTicket
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

## Dual-Domain Architecture & CORS

Do not use wildcard CORS. The Auth Broker supports two domain families:

1. **Primary Family:**
   - Central: `https://shiftoryx.gr`, `https://www.shiftoryx.gr`
   - Tenant workspaces: `https://{tenantSlug}.shiftoryx.gr` (e.g. `https://bp-kallis.shiftoryx.gr`)

2. **Legacy Rollback Family:**
   - Central: `https://gas.homelabshare.gr`
   - Tenant workspaces: `https://{tenantSlug}.homelabshare.gr` (e.g. `https://bp-kallis.homelabshare.gr`)

CORS origins are dynamically and securely validated:
- `createAuthTicket`: restricted to allowlisted central origins (`https://shiftoryx.gr`, `https://www.shiftoryx.gr`, `https://gas.homelabshare.gr`).
- `exchangeAuthTicket`: dynamically verified against known domain families and active tenant slug rules.

Cross-family redirection is strictly rejected (e.g., central `shiftoryx.gr` cannot broker a session directly to legacy `bp-kallis.homelabshare.gr`, and vice-versa).

## Gate G Discovery and Remediation Invariant

During Phase 6 cutover preflight, a critical data invariant was discovered:
- **Defect:** `tenants/bp-kallis` previously contained `domain = "bp-kallis.homelabshare.gr"`.
- **Impact:** `resolveValidatedTenantOrigin` gave precedence to explicit `tenant.domain`. Because the pinned domain belonged to the legacy family (`homelabshare.gr`), any login originating from `https://shiftoryx.gr` was rejected with `tenant-origin-mismatch` / `null`.
- **Approved State:** For the dual-domain burn-in period, `tenants/bp-kallis.domain` MUST be set to Firestore `null` (or omitted).
- **Behavior with domain = null:** Both primary (`bp-kallis.shiftoryx.gr`) and legacy (`bp-kallis.homelabshare.gr`) origins resolve dynamically according to the caller's active domain family.

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

## Production Activation & Human OWNER Runbook

The staged production activation sequence:

### Step 1: Pre-Activation Health Check
1. Confirm `tenants/bp-kallis.domain == null`.
2. Confirm live HTTPS endpoints respond HTTP 200:
   - `https://shiftoryx.gr`
   - `https://bp-kallis.shiftoryx.gr`
   - `https://bp-kallis.homelabshare.gr`
3. Confirm Cloud Functions (`createAuthTicket`, `exchangeAuthTicket`) CORS passes.

### Step 2: Auth Broker Flag Activation (State 1)
1. In Vercel Project Environment Variables, set:
   ```text
   VITE_ENABLE_AUTH_BROKER=true
   VITE_ENABLE_TENANT_GATE=false
   ```
2. Redeploy frontend on Vercel Production.
3. Verify live endpoints load without redirect loops.

### Step 3: Human OWNER E2E Flow
1. Open browser to `https://shiftoryx.gr/login`.
2. Sign in with the OWNER credentials.
3. Central portal authenticates and presents store selector or direct redirection.
4. Select `BP Κάλλης` (`bp-kallis`).
5. Observe redirection:
   `https://shiftoryx.gr` -> `createAuthTicket` -> `https://bp-kallis.shiftoryx.gr/#authTicket=...`
6. Observe callback execution:
   `exchangeAuthTicket` -> `signInWithCustomToken` -> URL fragment removed cleanly.
7. Verify OWNER access to tenant dashboard and schedule management.
8. Verify legacy path `https://bp-kallis.homelabshare.gr` remains healthy and accessible.

### Step 4: Tenant Gate Activation (State 2)
Only AFTER the human OWNER E2E passes:
1. In Vercel Project Environment Variables, set:
   ```text
   VITE_ENABLE_AUTH_BROKER=true
   VITE_ENABLE_TENANT_GATE=true
   ```
2. Redeploy frontend on Vercel Production.
3. Confirm unauthenticated direct requests to `https://bp-kallis.shiftoryx.gr` redirect to central authentication rather than exposing tenant schedules.

## Rollback

1. Set `VITE_ENABLE_AUTH_BROKER=false`.
2. Set `VITE_ENABLE_TENANT_GATE=false`.
3. Rebuild/redeploy the frontend.
4. Existing direct tenant login behavior continues.
5. Functions remain deployed but unused. No tenant data migration is required.
