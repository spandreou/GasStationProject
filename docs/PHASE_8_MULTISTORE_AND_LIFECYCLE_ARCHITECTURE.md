# ShiftOryx — Phase 8: Multi-Store & Tenant Lifecycle Architecture

**Status:** ARCHITECTURE_AND_DESIGN_READY  
**Version:** 1.0.0  
**Phase Target:** Phase 8 Multi-Store Ownership, Store Switching & Tenant Lifecycle  

---

## 1. Evolution from Phase 4 MVP to Phase 8 Multi-Store

### 1.1 Baseline Comparison
| Dimension | Phase 4/5 MVP Baseline | Phase 8 Target Architecture |
| :--- | :--- | :--- |
| **Membership Policy** | Single-tenant per account (`FAIL_CLOSED_IF_ANY_CANONICAL_MEMBERSHIP_EXISTS`) | Multi-store enabled (`MULTI_STORE_MEMBERSHIPS_ALLOWED`) |
| **Additional Stores** | Denied at provisioning gate | Permitted via `provisionAdditionalStoreFromToken` |
| **Tenant Switching** | Single tenant redirect / `/select-tenant` | Global multi-store header switcher + `/stores` dashboard |
| **Ownership Transfer** | Manual admin-only operation | Structured two-party cryptographic transfer protocol |
| **Store Archival** | Manual Firestore status write | Atomic lifecycle state machine (`ACTIVE` -> `ARCHIVED` / `SUSPENDED`) |

### 1.2 Non-Negotiable Invariants
1. **Tenant Isolation Unbroken:** Multi-store ownership never merges tenant collections. Each tenant's schedules, employees, settings, and subscriptions remain isolated under `tenants/{tenantId}/*`.
2. **Canonical Role Model Unchanged:** `OWNER` remains the exclusive authenticated tenant role. Multi-store users hold multiple independent `tenantMemberships/{uid}_{tenantId}` records.
3. **Platform Admin Decoupling:** Active Platform Administrators cannot hold or acquire tenant memberships even in multi-store mode.

---

## 2. Multi-Store Lifecycle Operations & Workflows

### 2.1 Additional Store Provisioning (`provisionAdditionalStoreFromToken`)
```text
[Authenticated Owner (owns store-a)]
       │
       ├─► 1. Acquires Registration Token for second store
       ├─► 2. Submits { token, slug: 'store-b', displayName: 'Second Store', businessCategory }
       ├─► 3. Backend verifies caller is authenticated & not Platform Admin
       ├─► 4. Atomic Transaction:
       │       - Reserve slugReservations/store-b
       │       - Create tenants/store-b
       │       - Create tenantMemberships/{uid}_store-b (role: 'OWNER', status: 'ACTIVE')
       │       - Update users/{uid}.memberships['store-b']
       │       - Consume registration token
       │       - Write platformAuditLog
       └─► 5. User now possesses 2 active stores in /stores directory
```

### 2.2 Store Context Switching
- The frontend preserves active tenant context in memory and URL structure (`{tenantSlug}.shiftoryx.gr` or query parameter `/app?tenant={tenantSlug}` in single-origin development).
- Cross-subdomain transitions reuse the Auth Broker (`createAuthTicketRedirect`).

### 2.3 Ownership Transfer Protocol (`transferTenantOwnership`)
To safely transfer a tenant from Owner A to User B without downtime or security risk:
1. **Initiate (`transferInitiate`):** Current OWNER (Owner A) creates a transfer offer specifying candidate email and expiry. Document written to `tenants/{tenantId}/ownershipTransfers/{transferId}` (`status: 'PENDING'`).
2. **Accept (`transferAccept`):** Candidate User (User B) signs in and accepts the transfer.
3. **Atomic Commit Transaction:**
   - Verify User B has no conflicting memberships or platform admin status.
   - Update `tenants/{tenantId}.createdBy` to User B.
   - Update `tenantMemberships/{ownerA_uid}_{tenantId}.status = 'REVOKED'`.
   - Create `tenantMemberships/{userB_uid}_{tenantId}` (`role: 'OWNER'`, `status: 'ACTIVE'`).
   - Synchronize `users/{ownerA_uid}.memberships` and `users/{userB_uid}.memberships`.
   - Update transfer doc `status = 'COMPLETED'`.
   - Write audit log `TENANT_OWNERSHIP_TRANSFERRED`.

---

## 3. Security Boundary & Future Implementation Rules

- **No Premature Activation:** Multi-store provisioning must not be activated in Phase 5 or 6. Phase 4 fail-closed rules protect MVP pilot boundaries until Phase 8 is formally approved.
- **Strict Role Boundaries:** No intermediate `MANAGER` or `ADMIN` roles. If future delegate access is required, it must be designed with explicit role matrices and automated tests.
