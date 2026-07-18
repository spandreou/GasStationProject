# ShiftOryx Domain Activation Plan

Status date: 18 July 2026

This is a planning and verification record only. It does not authorize DNS, Cloudflare, Firebase, tunnel, Docker or production changes.

## Current Status

```text
Domain: shiftoryx.gr
Domain ownership: PURCHASED
Overall domain state: PURCHASED_NOT_CONFIGURED
DNS configuration: NOT_STARTED
Cloudflare zone: NOT_VERIFIED
Wildcard DNS: NOT_CONFIGURED
Firebase Authorized Domains: NOT_UPDATED
Auth broker origins: NOT_UPDATED
Production cutover: NOT_APPROVED
```

Current protected legacy pilot:

```text
https://bp-kallis.homelabshare.gr/
```

Future targets:

```text
https://shiftoryx.gr/
https://bp-kallis.shiftoryx.gr/
https://{tenantSlug}.shiftoryx.gr/
```

The legacy BP Kallis URL must remain active until the new root and wildcard domain paths, Firebase authentication origins, broker handoff, monitoring and rollback are verified.

## Activation Preconditions

- Phase 0 documentation approved by a human.
- Phase 1 current-state audit completed and accepted.
- OWNER-only role migration plan reviewed before tenant gate changes.
- Exact current Cloudflare zone/tunnel topology recorded read-only.
- Firebase Authorized Domains and auth broker origin strategy reviewed.
- Shared wildcard tenant resolver tested in emulator/staging.
- Unknown, suspended and expired tenant behavior tested.
- CSP, CORS, `returnTo` and open-redirect controls tested.
- Backup and rollback evidence available.
- Maintenance window and monitoring prepared.

## Planned Phase 6 Sequence

1. Back up affected Cloudflare/tunnel and deployment configuration.
2. Verify ownership and nameserver state without changing production.
3. Configure the Cloudflare zone only after explicit approval.
4. Configure root/www and one wildcard route to the shared application.
5. Do not create per-tenant DNS records, containers, deployments or tunnel routes.
6. Add only the required Firebase Authorized Domains and exact trusted auth broker origins.
7. Validate root portal, tenant resolution, public mode and owner auth handoff.
8. Run dual-domain BP Kallis smoke tests while the legacy URL remains active.
9. Verify local/public health, logs, monitoring and rollback.
10. Approve cutover separately; do not infer approval from successful configuration.

## Validation Checklist

- `shiftoryx.gr` resolves correctly over HTTPS.
- `www.shiftoryx.gr` follows the approved canonical behavior.
- a known tenant slug reaches the shared application.
- an unknown slug returns a safe not-found response.
- suspended/expired tenants receive the approved safe state.
- anonymous users retain sanitized public access.
- OWNER login and cross-subdomain broker exchange work without loops.
- wrong-origin, wrong-tenant, expired and replayed tickets are denied.
- no wildcard CORS or hostname-only authorization is introduced.
- `bp-kallis.homelabshare.gr` remains healthy during dual-domain validation.

## Rollback

1. Keep or restore `bp-kallis.homelabshare.gr` as the active pilot URL.
2. Disable the new frontend domain flags/origins if they were enabled.
3. Restore backed-up Cloudflare/tunnel configuration only for the affected ShiftOryx routes.
4. Remove or disable new ShiftOryx routing without deleting tenant data or memberships.
5. Verify legacy public and OWNER flows, container health and public HTTP status.
6. Record the incident and do not retry until the failure is understood.

## Security Notes

- Domain ownership and hostname never grant tenant authorization.
- Do not use wildcard CORS.
- Do not expose Firebase tokens, auth tickets, reset codes, tunnel credentials or environment values.
- Do not log full handoff URLs or sensitive URL fragments.
- Production cutover always requires separate explicit approval.
