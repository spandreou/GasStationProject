# Platform Super-Admin Runbook

## 1. Purpose
This runbook documents the platform super-admin role (`platformAdmins/{uid}`) for the GasStation Shift Manager platform. It explains the architectural boundaries between platform-level management and tenant-level operations, provides CLI usage instructions, and details bootstrap workflows.

---

## 2. Tenant Admin vs. Platform Admin

| Capability | Tenant Admin (e.g. OWNER / MANAGER) | Platform Super-Admin (SUPER_ADMIN) |
| :--- | :--- | :--- |
| **Scope** | Single Tenant (e.g., `bp-kallis` or `eko-example`) | Global Platform (Whole project instance) |
| **Manage Roster** | Yes (inside own tenant) | No (unless explicitly added as tenant admin) |
| **Onboard New Tenant** | No | Yes (via provisioning commands/CLI) |
| **Edit Metadata** | No | Yes (update tenant names, slugs, domains) |
| **User Profiles** | No (limited to self-read) | Yes (can read/write profile documents) |
| **Emergency Support** | No (restricted to own tenant) | Yes (can assist with config recovery/emergency audits) |

Tenant isolation is strictly maintained. A platform super-admin status does **not** bypass tenant boundaries for operational data (shifts, absences, employees) unless they hold a valid active membership record for that specific tenant.

---

## 3. Firestore Data Model
Platform admin privileges are granted through a dedicated collection:
* **Path**: `/platformAdmins/{uid}`
* **Allowed Client Operations**: Read own status (`isSelf(uid)`). Client writes are denied (`allow write: if false;`).
* **Document Schema**:
  ```json
  {
    "uid": "firebaseAuthUid",
    "role": "SUPER_ADMIN",
    "status": "ACTIVE",
    "createdAt": "2026-07-02T00:00:00.000Z",
    "updatedAt": "2026-07-02T00:00:00.000Z",
    "createdBy": "bootstrap-emulator"
  }
  ```

---

## 4. Bootstrapping platformAdmins

To seed the initial platform admin, use the `scripts/bootstrap-platform-admin.mjs` script.

### CLI Usage & Modes

```bash
node scripts/bootstrap-platform-admin.mjs --uid <uid> [options]
```

#### 1. Dry-Run Mode
Always execute a dry-run first to validate target paths:
```bash
node scripts/bootstrap-platform-admin.mjs --uid super-admin-uid --dry-run
```

#### 2. Local Emulator Bootstrap
Write to local Firestore emulator (runs on port 8088):
```bash
node scripts/bootstrap-platform-admin.mjs --uid super-admin-uid --write --emulator
```

#### 3. Verification Mode
Confirm that the platform admin documents are properly written:
```bash
node scripts/bootstrap-platform-admin.mjs --uid super-admin-uid --verify --emulator
```

---

## 5. Production Bootstrap Warning
> [!WARNING]
> Platform admin writes in production are disabled by default. If `--write` is specified without `--emulator`, the script will immediately abort. Live production bootstrapping must be coordinated via Console management or explicit Service Account ADC execution.

---

## 6. Live Rollout Sequence (Controlled)
1. **Identify the Operator UID**: Retrieve the administrator's Firebase Auth UID.
2. **Seed Platform Admin**: Create the `platformAdmins/{uid}` document via Firebase Console or approved Admin SDK CLI execution.
3. **Deploy Security Rules**:
   `firebase deploy --only firestore:rules`
4. **Verify Access**:
   Execute the verification checks to confirm platform operations.

---

## 7. Rollback Plan
If a platform admin's permissions must be revoked:
1. Locate the document `/platformAdmins/{uid}`.
2. Change the `status` field to `SUSPENDED` or delete the document. Any change to a status other than `ACTIVE` immediately revokes all platform admin rights via Firestore rules.
