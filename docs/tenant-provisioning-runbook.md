# ShiftOryx Tenant Provisioning Foundation Runbook

## 1. Purpose
This runbook describes the existing controlled CLI/emulator foundation. It is not the final ShiftOryx signup flow. The approved product target uses a secure registration token and automated trusted provisioning in roadmap Phases 3-4.

The manual per-tenant homelabshare DNS steps below are legacy pilot procedures, not the target architecture. Phase 6 uses one shared app and wildcard `*.shiftoryx.gr` routing.

---

## 2. Infrastructure Setup (Manual Steps)

Before writing any database configurations, the following network and portal integrations must be configured:

### A. DNS & Subdomain Routing (Cloudflare)
1. Log in to the Cloudflare dashboard.
2. Under the target zone (`homelabshare.gr`), add a CNAME record:
   * **Name**: `<tenantId>` (e.g. `eko-example`)
   * **Target**: Your public cloudflared tunnel endpoint.
   * **Proxy Status**: Proxied (orange cloud).
3. On the homelab server hosting the tunnel, update the `cloudflared` configuration yaml:
   ```yaml
   ingress:
     - hostname: eko-example.homelabshare.gr
       service: http://localhost:8085
   ```
4. Restart the `cloudflared` service/container to apply changes.

### B. Firebase Authorized Domains
1. Open the Firebase Console for your project (`gasstationproject-9dd89`).
2. Go to **Authentication** -> **Settings** -> **Authorized Domains**.
3. Add the tenant subdomain (e.g., `eko-example.homelabshare.gr`) to the allowed list. This is required for Firebase Auth handlers to function on that origin.

### C. Auth Broker Allowed Origins
1. Update the Firebase Functions environment variable `AUTH_BROKER_TENANT_ORIGINS` to append the new tenant origin:
   ```txt
   AUTH_BROKER_TENANT_ORIGINS=https://bp-kallis.homelabshare.gr,https://eko-example.homelabshare.gr
   ```
2. Redeploy the functions backend:
   ```bash
   firebase deploy --only functions
   ```

### D. Monitoring (Uptime Kuma)
1. Add a HTTP monitor in Uptime Kuma targeting the new public address:
   `https://eko-example.homelabshare.gr/`

---

## 3. Database Seeding via CLI (`scripts/provision-tenant.mjs`)

The `scripts/provision-tenant.mjs` script validates the slug formatting, ensures central names are reserved, and provisions the required metadata, memberships, and default configurations.

### CLI Usage & Modes

```bash
node scripts/provision-tenant.mjs --tenant <tenantId> --admin-uid <uid> [options]
```

#### 1. Dry-Run Mode (Default / Safe Mode)
Always run with `--dry-run` first to validate parameters and preview paths:
```bash
node scripts/provision-tenant.mjs \
  --tenant eko-example \
  --admin-uid eko-admin-uid \
  --admin-email admin@example.test \
  --display-name "EKO Example" \
  --domain eko-example.homelabshare.gr \
  --dry-run
```

#### 2. Emulator Write Mode
To verify the CLI setup locally on the Firestore emulator:
```bash
node scripts/provision-tenant.mjs \
  --tenant eko-example \
  --admin-uid eko-admin-uid \
  --admin-email admin@example.test \
  --display-name "EKO Example" \
  --domain eko-example.homelabshare.gr \
  --write \
  --emulator
```

#### 3. Verification Mode
To verify that all required documents exist inside the database:
```bash
node scripts/provision-tenant.mjs \
  --tenant eko-example \
  --admin-uid eko-admin-uid \
  --verify \
  --emulator
```

---

## 4. Production Write WARNING
> [!WARNING]
> Direct production writes via CLI are blocked in Phase 2C.4. If `--write` is specified without `--emulator`, the script will fail safely and abort. Live database writes should be managed only after the next phase reviews the Admin SDK service account setup.

---

## 5. Security & Verification Notes
* The script enforces strict slug filtering (`^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$`).
* Slugs containing `gas` or matching reserved names are blocked.
* User password credentials are **never** handled or stored by the CLI.
* Tenant isolation is enforced through `tenantMemberships` checking.
* New tenant membership must use role `OWNER` only. Do not create `ADMIN` or `MANAGER` memberships.
* Future registration tokens are stored as hashes, consumed atomically once, expire/revoke safely and are never logged. This CLI does not implement that product flow.

---

## 6. Rollback / Offboarding
If a tenant must be suspended or deleted:
1. Set the status field of the tenant document to `DISABLED`:
   `tenants/{tenantId}/status = "DISABLED"`
2. Set the status of all memberships to `SUSPENDED` or `EXPIRED` to immediately cut off access:
   `tenantMemberships/{uid}_{tenantId}/status = "EXPIRED"`
3. Remove the domain from DNS and Firebase Authorized Domains.
