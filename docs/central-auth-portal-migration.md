# ShiftOryx Central Authentication Portal Migration

This document records the existing homelabshare foundation and the approved
ShiftOryx target. It does not authorize a domain or runtime rollout.

## Current Foundation And Target Domains

Current/legacy central foundation:

```text
gas.homelabshare.gr
```

Tenant dashboard example:

```text
bp-kallis.homelabshare.gr
```

Approved target:

```text
https://shiftoryx.gr
https://{tenantSlug}.shiftoryx.gr
https://bp-kallis.shiftoryx.gr
```

The target uses one wildcard/shared application. Existing homelabshare origins remain compatibility endpoints until roadmap Phase 6.

The central portal owns landing, login, forgot-password, reset-password,
tenant selection and future account management. Tenant domains should contain
only operational dashboards.

## Current Implementation

The React app now contains the central portal foundation:

- `gas.homelabshare.gr/` renders the SaaS landing page.
- `/login` signs in with Firebase Auth.
- `/forgot-password` sends generic reset responses.
- `/reset-password` validates Firebase reset action codes without logging codes
  or reset URLs.
- `/select-tenant` shows active tenant memberships when more than one tenant is
  available.
- Direct tenant access can redirect unauthenticated users to central login with
  a preserved `returnTo` URL when `VITE_ENABLE_TENANT_GATE=true`.

The authorization source of truth remains:

```text
tenantMemberships/{uid}_{tenantId}
```

Required membership:

```json
{
  "status": "ACTIVE",
  "role": "OWNER"
}
```

No email allowlist or Firebase custom claim grants tenant admin access.

Current compatibility: deployed code/rules may still accept `ADMIN` and `MANAGER`. New provisioning must not create them; Phase 2 owns their inventory and migration.

## Important Production Blocker

Firebase client authentication persistence is origin-scoped. A Firebase Auth
session created on:

```text
gas.homelabshare.gr
```

is not automatically available to:

```text
bp-kallis.homelabshare.gr
```

Because of that, a pure frontend-only central-login redirect can create this
loop:

```text
gas login -> tenant dashboard -> no tenant-origin Firebase session -> gas login
```

Do not enable tenant-domain enforcement in production until one of these is
implemented and verified:

1. A backend session-cookie bridge that sets a secure domain cookie for
   `.homelabshare.gr` and validates it server-side.
2. A dedicated Firebase auth broker flow that does not expose Firebase ID
   tokens, refresh tokens, reset links or one-time codes in URLs.
3. A tenant-local silent session establishment mechanism reviewed for token
   exposure and CSRF risks.

The approved direction is the Firebase-native short-lived auth broker. Any legacy `.homelabshare.gr` cookie option must not be assumed to solve the future `.shiftoryx.gr` architecture.

Do not pass Firebase ID tokens, refresh tokens, password reset `oobCode` values,
or signed session material through query strings.

## Safe Rollout Sequence

This sequence describes compatibility validation for the existing foundation. The ShiftOryx domain rollout belongs to Phase 6 and must update exact origins only after the Phase 1/2/5 gates pass.

1. Keep `VITE_ENABLE_AUTH_BROKER=false`.
2. Keep `VITE_ENABLE_TENANT_GATE=false`.
3. Deploy the central portal route only after adding the Cloudflare ingress rule
   for `gas.homelabshare.gr`.
4. Verify:
   - `gas.homelabshare.gr/` renders the landing page.
   - `gas.homelabshare.gr/login` renders central login.
   - Forgot/reset pages work without raw Firebase errors.
   - Existing tenant dashboard still works.
5. Implement and verify the cross-subdomain auth handoff backend.
6. Seed/verify:
   - `tenants/bp-kallis`
   - `tenantMemberships/{uid}_bp-kallis`
   - `users/{uid}`
7. Enable `VITE_ENABLE_AUTH_BROKER=true` only after the Functions broker is
   deployed and verified.
8. Enable `VITE_ENABLE_TENANT_GATE=true` in a maintenance window only after the
   broker flow is known-good.
9. Verify unauthenticated tenant access redirects to:

```text
gas.homelabshare.gr/login?returnTo=<encoded tenant URL>
```

10. Verify authenticated tenant access is granted only by active membership.
11. Verify wrong tenant, inactive membership and unknown roles are denied.

## Cloudflared Notes

The homelab tunnel is locally managed. Do not migrate it to dashboard-managed
Cloudflare Tunnel.

When approved for deployment, add only the required ingress rule for:

```text
gas.homelabshare.gr
```

Use the verified local service URL/port for the central portal container. Backup
the cloudflared config before editing. Restart only the affected tunnel during a
documented maintenance window.

## Rollback

If rollout fails:

1. Set `VITE_ENABLE_AUTH_BROKER=false`.
2. Set `VITE_ENABLE_TENANT_GATE=false`.
3. Rebuild/redeploy the tenant app.
4. Restore the previous cloudflared config backup if the central route caused
   routing issues.
5. Verify:
   - `bp-kallis.homelabshare.gr` returns `200`.
   - `homelabshare.gr` returns `200`.
   - `status.homelabshare.gr` returns `200`.

Rollback must not delete Firebase Auth users, tenant documents or membership
documents.

## Never Log Or Expose

- Firebase ID tokens
- Firebase refresh tokens
- Reset URLs
- `oobCode` values
- Tunnel tokens
- Service account values
- `.env` values
- Private keys
- Signed URLs
