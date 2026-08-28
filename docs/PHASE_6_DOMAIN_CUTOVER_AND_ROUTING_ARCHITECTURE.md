# ShiftOryx — Phase 6: Domain Routing, Wildcard SSL & Cutover Architecture

**Status:** ARCHITECTURE_AND_RUNBOOK_READY_FOR_REVIEW  
**Version:** 1.0.0  
**Phase Target:** Phase 6 Domain Architecture, Wildcard Routing & Pilot Cutover  

---

## 1. Executive Summary & Core Invariant

Phase 6 establishes the primary SaaS domains (`shiftoryx.gr` and `*.shiftoryx.gr`) and defines the controlled cutover path from the legacy pilot host (`bp-kallis.homelabshare.gr`).

```text
                  ┌───────────────────────────────┐
                  │    Cloudflare DNS / Edge     │
                  │   SSL/TLS: Full (Strict)      │
                  └───────────────┬───────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         │                                                 │
         ▼                                                 ▼
[Root: shiftoryx.gr]                          [Tenant: *.shiftoryx.gr]
 • / (Landing Page)                            • Tenant Schedule Dashboard
 • /login (Central Auth)                       • Public Sanitized Schedule
 • /register (Token Provisioning)              • Tenant-Isolated Data
 • /stores (Multi-Store Selector)              • Auth Broker Token Exchange
 • /admin-console (Platform Admin)
```

### 1.1 Non-Negotiable Invariants
1. **Hostname Is Routing Context, Not Authorization:**
   - Hostname selects which tenant document or central portal view to load.
   - Access to private tenant data, editing schedules, and managing settings strictly requires a valid Firebase Auth UID with an `ACTIVE` role of `OWNER` in `tenantMemberships/{uid}_{tenantId}`.
2. **One Shared Codebase & Container:**
   - Never create tenant-specific source branches, frontend builds, or Docker containers.
   - A single SPA container handles all tenant subdomains and central portal routes via config-driven context resolution (`resolveTenantHostContext`).
3. **Pilot Host Preservation Until Verified:**
   - `bp-kallis.homelabshare.gr` must remain fully operational until wildcard routing, SSL certificates, Firebase Authorized Domains, and broker redirection are verified.

---

## 2. Edge & Infrastructure Architecture

### 2.1 Domain & Subdomain Mapping
| Hostname | Role | Route Target | Auth Context |
| :--- | :--- | :--- | :--- |
| `shiftoryx.gr` | Primary Root | Central Portal (`/`, `/login`, `/register`, `/stores`) | Platform Admin / Multi-Store Owner |
| `www.shiftoryx.gr` | CNAME Root | Redirects 301 to `shiftoryx.gr` | N/A |
| `*.shiftoryx.gr` | Wildcard Tenant | Tenant Single-Page App | Tenant OWNER / Anonymous Public Viewer |
| `bp-kallis.shiftoryx.gr` | Primary Pilot | BP Kallis Tenant Schedule | BP Kallis OWNER / Public Viewer |
| `bp-kallis.homelabshare.gr` | Legacy Pilot | Dual-Host Transitional Access | BP Kallis OWNER / Public Viewer |

### 2.2 Nginx & Container Routing Configuration
The shared frontend container runs Nginx serving the Vite build artifacts. When wildcards are routed through Cloudflare to the origin VPS/Homelab:
```nginx
server {
    listen 8080;
    server_name shiftoryx.gr *.shiftoryx.gr bp-kallis.homelabshare.gr;

    root /usr/share/nginx/html;
    index index.html;

    # Gzip & Security Headers
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 3. Firebase & Auth Broker Configuration

### 3.1 Firebase Authorized Domains
Before cutover, the following domains must be registered under Firebase Authentication Authorized Domains:
- `shiftoryx.gr`
- `bp-kallis.shiftoryx.gr`
- `*.shiftoryx.gr` (or individual tenant subdomains)
- `gasstationproject-9dd89.firebaseapp.com`
- `localhost`
- `bp-kallis.homelabshare.gr` (retained during transitional coexistence)

### 3.2 Auth Broker Allowed Origins
The `createAuthTicket` and `exchangeAuthTicket` Cloud Functions validate the request `Origin` and `returnTo` URLs. Allowed origins list must include:
- `https://shiftoryx.gr`
- `https://bp-kallis.shiftoryx.gr`
- `https://*.shiftoryx.gr`
- `https://gas.homelabshare.gr`
- `https://bp-kallis.homelabshare.gr`
- `http://localhost:5173` / `http://localhost:4173`

---

## 4. Phase 6 Production Cutover Runbook

> [!WARNING]
> All execution commands below are marked `FUTURE_ONLY_DO_NOT_EXECUTE` and require explicit human approval and active domain cutover phase authorization.

### Step 1: Pre-Flight DNS & SSL Verification
```text
FUTURE_ONLY_DO_NOT_EXECUTE:
1. Configure Cloudflare DNS A/CNAME records:
   - A shiftoryx.gr -> <VPS_IP> (Proxied)
   - CNAME *.shiftoryx.gr -> shiftoryx.gr (Proxied)
2. Verify SSL/TLS mode in Cloudflare is set to "Full (strict)".
3. Verify Origin CA certificate installed on origin reverse proxy.
```

### Step 2: Firebase Console Configuration
```text
FUTURE_ONLY_DO_NOT_EXECUTE:
1. Add shiftoryx.gr to Firebase Auth Authorized Domains.
2. Add *.shiftoryx.gr to Firebase Auth Authorized Domains.
```

### Step 3: Cloud Functions Environment & Origin Update
```text
FUTURE_ONLY_DO_NOT_EXECUTE:
1. Update Cloud Functions config / environment vars with new central domain:
   VITE_PUBLIC_APP_BASE_DOMAIN="shiftoryx.gr"
   VITE_CENTRAL_PORTAL_DOMAIN="shiftoryx.gr"
2. Deploy updated Cloud Functions.
```

### Step 4: Verification Checklist
```text
1. GET https://shiftoryx.gr/ -> 200 OK (Central Landing Page)
2. GET https://shiftoryx.gr/login -> 200 OK (Central Login)
3. GET https://shiftoryx.gr/register -> 200 OK (Registration Portal)
4. GET https://bp-kallis.shiftoryx.gr/ -> 200 OK (Tenant Dashboard)
5. GET https://bp-kallis.homelabshare.gr/ -> 200 OK (Legacy Pilot Still Functional)
6. Test login on shiftoryx.gr -> Auth Ticket -> redirect to bp-kallis.shiftoryx.gr/app.
```

### Step 5: Rollback Strategy
```text
FUTURE_ONLY_DO_NOT_EXECUTE:
If routing or auth failure occurs on shiftoryx.gr:
1. Keep bp-kallis.homelabshare.gr active as primary pilot.
2. Revert Cloudflare DNS proxy mode if needed.
3. Revert Functions origin configuration to homelabshare.gr baseline.
```
