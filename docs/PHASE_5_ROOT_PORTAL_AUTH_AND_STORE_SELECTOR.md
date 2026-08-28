# ShiftOryx — Phase 5: Root Portal, Registration & Store Selector

**Status:** IMPLEMENTATION_READY_FOR_HUMAN_REVIEW  
**Version:** 1.0.0  
**Phase Target:** Phase 5 Root Portal Auth, Registration & Store Selector  
**Core Deliverables:**
1. `/register` progressive tenant registration flow (`RegisterPage.jsx`)
2. `/stores` (and `/select-tenant`) tenant directory and switcher (`SelectTenantPage.jsx`)
3. Root `/login` identity resolution and routing
4. Central landing page integration
5. Client-side registration token validation & provisioning service

---

## 1. Executive Architecture & Trust Boundaries

Phase 5 delivers the user-facing web portal on root and central domains that connects prospective tenant owners to the backend services implemented in Phase 3 (Registration Tokens) and Phase 4 (Automated Tenant Provisioning).

```text
[Browser: /register]
       │
       ├─► 1. Token Entry & Validation ──► [Callable: validateRegistrationToken]
       │                                       │ (Transient token in-memory only;
       │                                       │  Never saved to localStorage/URL)
       ├─► 2. Firebase Auth SDK ─────────► [Firebase Auth: createUser/signIn]
       │                                       │ (Client SDK password handling only;
       │                                       │  No passwords pass through functions)
       ├─► 3. Business Info Collection ──► [displayName, slug, businessCategory]
       │
       ├─► 4. Provisioning Execution ────► [Callable: provisionTenantFromRegistrationToken]
       │                                       │ (Strict payload: token, slug, displayName,
       │                                       │  businessCategory. Auth derived from request.auth)
       └─► 5. Post-Provisioning Routing ──► [1 Tenant -> Direct / Auth Broker; Multi -> /stores]
```

### 1.1 Invariants & Security Rules
- **No Raw Token Persistence:** Registration tokens remain strictly transient in component state memory and are cleared upon completion, cancelation, or navigation. They are never written to `localStorage`, `sessionStorage`, cookies, query parameters, or client logs.
- **No Custom Backend Password Handling:** User authentication and password verification execute strictly through Firebase Auth client SDKs (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`).
- **No Privilege or Identity Injection:** Provisioning payload is strictly limited to `{ token, slug, displayName, businessCategory }`. The client never submits `uid`, `role`, `status`, `email`, `templateId`, or `domain`.
- **Hostname as Routing Context Only:** Hostname determines visual layout and routing suggestions, never authorization or tenant access.
- **Auth Broker Integration:** Cross-domain transitions from central portal to tenant subdomains reuse the existing single-use, time-bounded auth ticket broker (`createAuthTicket` / `exchangeAuthTicket`).

---

## 2. Component Structure & Workflows

### 2.1 `/register` — Progressive Registration Workflow
The registration page is organized into a clean, progressive flow:
1. **Token Stage:** User inputs token `stx_...`. Client validates format and calls `validateRegistrationToken`. If valid, receives token validity and optional `businessCategoryHint`.
2. **Account Stage:** If not authenticated, user creates a new account or signs in with an existing Firebase Auth account.
3. **Store Details Stage:** User provides Store Display Name, Tenant Slug (with immediate client validation and syntax guidance), and selects Business Category (`FUEL_STATION`, `CAFE`, `RESTAURANT`, `HAIR_SALON`, `RETAIL`, `OTHER`).
4. **Provisioning & Confirmation Stage:** Invokes `provisionTenantFromRegistrationToken` with active auth state. Displays progress spinner and clear feedback. On success, transitions user to their new tenant dashboard or store directory.

### 2.2 `/stores` — Tenant Selector & Switcher
- Queries canonical `tenantMemberships` for authenticated user.
- If user possesses 0 memberships: Displays friendly onboarding guidance directing to `/register`.
- If user possesses 1 active membership: Provides direct navigation button and store summary.
- If user possesses multiple memberships: Renders interactive store cards with search/filter and direct navigation.
- If user is an active Platform Admin: Offers direct link to `/admin-console`.

### 2.3 `/login` — Identity-Aware Routing
After successful authentication on `/login`:
- Platform Admin (`platformAdmins/{uid}.status === 'ACTIVE'`) -> routes to `/admin-console`.
- Single Tenant Owner -> routes directly to the tenant origin via `createTenantAuthTicketRedirect`.
- Multiple Tenants -> routes to `/stores`.
- Zero Tenants -> routes to `/stores` (onboarding guidance) or `/register`.

---

## 3. Verification & Testing Strategy

- **Unit / Static Tests:** Validation of slug constraints, category allowlist, token format, and error mapping.
- **Emulator Integration Tests:** End-to-end simulation of token validation, account creation, business metadata submission, tenant provisioning, and auth broker handoff.
- **Edge Cases Tested:**
  - Expired, revoked, and consumed tokens.
  - Slug collisions (existing tenant or reserved slug).
  - Existing membership fail-closed behavior.
  - Platform admin registration denial.
  - Network and callable error redaction.
