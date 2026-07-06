# Domain And DNS Strategy

## Target

ShiftFlow should support customer workspaces without manually creating a DNS record for every customer.

Target domains:

```text
shiftflow.gr
www.shiftflow.gr
*.shiftflow.gr
```

Examples:

```text
bp-kallis.shiftflow.gr
eko-larisa.shiftflow.gr
coffeehouse.shiftflow.gr
```

## Recommended DNS Model

Use one wildcard record:

```text
*.shiftflow.gr -> ShiftFlow app / Cloudflare Tunnel / reverse proxy
```

Recommended Cloudflare Tunnel model:

```text
CNAME * -> <cloudflared tunnel target>
Proxy enabled
```

Alternative direct-origin model:

```text
A * -> <server public IP>
Proxy enabled
```

Prefer Cloudflare Tunnel so origin ports are not publicly exposed.

## Root Domain

The root domain should serve the public portal:

```text
shiftflow.gr -> landing / login / register / pricing
```

`www.shiftflow.gr` should redirect to or serve the same public portal.

## Platform Admin Route

Platform admin lives under the root domain:

```text
shiftflow.gr/admin
```

It must be protected by platform admin authorization, not tenant membership alone.

## Tenant Host Resolution

The app should resolve hostnames like this:

```text
shiftflow.gr -> public
www.shiftflow.gr -> public
shiftflow.gr/admin -> platform admin route
{tenantSlug}.shiftflow.gr -> tenant
unknown.shiftflow.gr -> not found
reserved.shiftflow.gr -> reserved/not allowed
localhost -> local development
```

Hostname resolution selects context only. It is not authorization.

## Reserved Subdomains

Reserved slugs:

```text
admin
api
www
app
dashboard
status
support
help
docs
mail
smtp
imap
cdn
static
assets
billing
payments
auth
login
register
root
system
superadmin
owner
cloudflare
internal
```

## Slug Validation

Suggested validation:

```text
^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$
```

Rules:

- lowercase latin letters, numbers, hyphens
- starts and ends with alphanumeric character
- no underscores
- no Greek characters
- no spaces
- no duplicate slugs
- no reserved words

## Tenant Creation

Tenant creation should write database state, not DNS state.

Minimum records:

```text
tenants/{tenantId}
tenantMemberships/{uid}_{tenantId}
users/{uid}
tenants/{tenantId}/settings/main
```

The tenant becomes reachable because wildcard DNS already routes the hostname to the app.

## Unknown Tenant Behavior

If a hostname resolves to a slug that does not exist, show a safe page:

```text
Το workspace δεν βρέθηκε.
Ελέγξτε το link ή επιστρέψτε στο shiftflow.gr.
```

Do not reveal whether similar tenants exist.

## Suspended Tenant Behavior

If the tenant exists but is not active, show a safe blocked page:

```text
Το workspace είναι προσωρινά ανενεργό.
Επικοινωνήστε με τον διαχειριστή ή ανανεώστε τη συνδρομή σας.
```

Do not render tenant data before status and membership checks pass.

## Firebase Auth Note

Wildcard DNS does not automatically solve Firebase Auth across subdomains.

Verify how Firebase authorized domains behave for:

```text
shiftflow.gr
bp-kallis.shiftflow.gr
newtenant.shiftflow.gr
```

Do not enable central-only login across tenant domains until the auth broker/session handoff is verified.

## Custom Domains

Custom domains are a future premium feature, not MVP.

Example:

```text
schedule.customer.gr -> tenant workspace
```

Custom domains require separate verification, ownership proof, SSL behavior, and admin controls.
