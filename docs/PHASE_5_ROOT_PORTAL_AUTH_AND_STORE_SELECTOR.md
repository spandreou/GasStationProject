# ShiftOryx — Phase 5: Root Portal, Registration & Store Selector

**Status:** DRAFT_REMEDIATED_TESTED_READY_FOR_HUMAN_REVIEW  
**Version:** 1.1.0 (Phase 4 Contract Alignment & Production-Linked QA)  
**Phase Target:** Phase 5 Root Portal Auth, Registration & Store Selector  
**Core Deliverables:**
1. `/register` progressive tenant registration flow (`RegisterPage.jsx`)
2. `/stores` (and `/select-tenant`) tenant directory and selector (`SelectTenantPage.jsx`)
3. Root `/login` identity resolution and routing (`LoginPage.jsx`)
4. Central landing page integration (`CentralLandingPage.jsx`)
5. Client-side registration token validation & provisioning service (`registrationTokenClient.js`)
6. Centralized portal production helpers & error normalizer (`portalHelpers.js`)

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
       ├─► 3. Business Info Collection ──► [displayName, slug (3–40 chars), businessCategory]
       │                                       │ (Safe OTHER default; Token hint respected)
       ├─► 4. Provisioning Execution ────► [Callable: provisionTenantFromRegistrationToken]
       │                                       │ (Strict payload: token, slug, displayName,
       │                                       │  businessCategory. Auth derived from request.auth.uid)
       └─► 5. Post-Provisioning Routing ──► [Direct Tenant Navigation via Auth Broker / Store Selector]
```

### 1.1 Invariants & Security Rules
- **No Raw Token Persistence:** Registration tokens remain strictly transient in component state memory and are cleared upon completion, cancelation, or navigation. They are never written to `localStorage`, `sessionStorage`, cookies, query parameters, or client logs.
- **No Custom Backend Password Handling:** User authentication and password verification execute strictly through Firebase Auth client SDKs (`createUserWithEmailAndPassword`, `signInWithEmailAndPassword`).
- **Strict Payload Allowlist:** Provisioning payload is strictly limited to `{ token, slug, displayName, businessCategory }`. The client never submits `uid`, `ownerUid`, `actorUid`, `role`, `status`, `email`, `domain`, `templateId`, `templateVersion`, `platformAdmin`, or `createdBy`.
- **Slug Constraints:** 3–40 lowercase alphanumeric characters and hyphens (`^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`), with reserved slug prevention.
- **Trial Duration:** 7 days (`TRIAL_DURATION_DAYS = 7`). All user-facing copy reflects the 7-day trial contract.
- **Domain Cutover Boundary:** New tenants are created with `domain: null`. Phase 5 does not require or assume operational `*.shiftoryx.gr` wildcard domains (Phase 6).
- **Hostname as Routing Context Only:** Hostname determines visual layout and routing suggestions, never authorization or tenant access.
- **Real Platform Admin Resolution:** Platform Admin identity is resolved via real `firebaseAuthRepository.isPlatformAdmin(uid)` querying `platformAdmins/{uid}` in Firestore. Active Platform Admins route to `/admin`.
- **Auth Broker Integration:** Cross-domain transitions from central portal to tenant subdomains reuse the existing single-use, time-bounded auth ticket broker (`createAuthTicket` / `exchangeAuthTicket`).

---

## 2. Component Structure & Workflows

### 2.1 `/register` — Progressive Registration Workflow
The registration page is organized into a clean, progressive flow:
1. **Token Stage:** User inputs token `stx_...`. Client validates format and calls `validateRegistrationToken`. If valid, receives token validity and optional `businessCategoryHint`.
2. **Account Stage:** If not authenticated, user creates a new account or signs in with an existing Firebase Auth account.
3. **Store Details Stage:** User provides Store Display Name, Tenant Slug (3–40 chars, client-validated with real-time feedback), and selects Business Category (`OTHER` default, `FUEL_STATION`, `CAFE`, `RESTAURANT`, `HAIR_SALON`, `RETAIL`).
4. **Provisioning & Confirmation Stage:** Invokes `provisionTenantFromRegistrationToken` with active auth state. Displays progress spinner and clear feedback. On success, transitions user to their new tenant dashboard or store directory.

### 2.2 `/stores` — Tenant Selector & Switcher
- Queries canonical `tenantMemberships` for authenticated user.
- If user possesses 0 memberships: Displays friendly onboarding guidance directing to `/register`.
- If user possesses 1 active membership: Renders the store card with direct entry navigation via Auth Broker, keeping the directory selector accessible per roadmap.
- If user possesses multiple memberships: Renders interactive store cards with search/filter and direct navigation.
- If user is an active Platform Admin: Displays notification banner with direct navigation to `/admin`.

### 2.3 `/login` — Identity-Aware Routing
After successful authentication on `/login`:
- Platform Admin (`platformAdmins/{uid}.status === 'ACTIVE'`) -> routes to `/admin`.
- Authorized `returnTo` destination -> routes to the target URL via Auth Broker.
- Single / Multiple Tenant Owners -> routes to tenant URL or `/stores`.
- Zero Tenants -> routes to `/stores` onboarding guidance or `/register`.

---

## 3. Structured Error Normalization

Phase 5 maps backend structured error reasons (`error.details.reason`) to fixed Greek user-facing messages without exposing raw `err.message` or stack traces:
- `platform-admin-overlap` -> 'Οι διαχειριστές πλατφόρμας δεν επιτρέπεται να δημιουργούν καταστήματα.'
- `existing-membership` -> 'Ο λογαριασμός σας έχει ήδη συσχετισμένο κατάστημα ShiftOryx.'
- `tenant-slug-taken` -> 'Το αναγνωριστικό (slug) χρησιμοποιείται ήδη. Παρακαλώ επιλέξτε διαφορετικό.'
- `registration-token-expired` -> 'Το Registration Token έχει λήξει. Επικοινωνήστε με τον διαχειριστή.'
- `registration-token-revoked` -> 'Το Registration Token έχει ανακληθεί. Επικοινωνήστε με τον διαχειριστή.'
- `registration-token-consumed` -> 'Το Registration Token έχει ήδη χρησιμοποιηθεί για τη δημιουργία καταστήματος.'
- `registration-token-invalid` -> 'Το Registration Token δεν είναι έγκυρο. Ελέγξτε την τιμή και δοκιμάστε ξανά.'
- `invalid-argument` -> 'Μη έγκυρα στοιχεία εγγραφής. Ελέγξτε τα πεδία της φόρμας.'
- `provisioning-internal` / UNKNOWN -> 'Η ενέργεια δεν ήταν δυνατό να ολοκληρωθεί. Δοκιμάστε ξανά.'

---

## 4. Verification & Testing Evidence

- **Unit / Static Tests (`npm run qa:phase5-portal`):** Tests actual production helpers in `src/utils/portalHelpers.js` and `src/repositories/firebase/firebaseAuthRepository.js`.
- **Emulator Integration Tests (`npm run test:phase5:emulator`):** End-to-end verification in Firebase emulator suite covering token generation, validation, account creation, 7-day trial creation, Firestore state assertions, failure matrix, and auth broker handoff.
