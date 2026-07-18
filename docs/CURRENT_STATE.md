# ShiftOryx Current State

Snapshot date: 17 July 2026

Source branch/commit: `main@865f2b2`

Master direction: `ShiftOryx - Master Product, Technical Architecture & Codex Execution Roadmap`

This is the Phase 0 current-state skeleton. Phase 1 must refresh every row with direct code, rules, emulator, browser and live evidence before runtime work begins.

## Status Legend

- **Implemented**: present in the current pilot and backed by existing code/docs/tests.
- **Foundation/partial**: code or model exists but the complete product flow is not enabled.
- **Target**: approved future roadmap, not implemented.
- **Legacy/compatibility**: retained to keep the pilot/repository/deployment stable.
- **Risk/review**: requires focused evidence or remediation.

## Current Capability Matrix

| Area | Status | Current evidence/constraint |
| --- | --- | --- |
| Weekly/monthly scheduler | Implemented | Automatic generation, manual edit, rules, warnings, history and templates |
| Public read-only view | Implemented | Anonymous sanitized tenant snapshots; no private absence details |
| Owner/admin pilot login | Implemented with compatibility | Firebase Auth plus ACTIVE matching membership; legacy roles may still be accepted |
| Tenant-scoped runtime data | Implemented | Core operational data under `tenants/{tenantId}`; legacy root collections locked |
| Exports and audit | Implemented | PDF/Excel/Word/WhatsApp and protected audit flow |
| Monthly PDF archive | Implemented for pilot | Private Storage and admin-only metadata/download flow |
| Central auth portal | Foundation/partial | UI/routes and broker foundation exist; production target remains gated by flags and rollout validation |
| Firebase auth broker | Foundation/partial | Functions/ticket model exist; target ShiftOryx origins and full production cutover are future work |
| Platform admin | Foundation/partial | `platformAdmins/{uid}` model and tooling; no complete lifecycle UI |
| Tenant provisioning | Foundation/partial | Controlled CLI/emulator foundation; not the future registration-token product flow |
| Registration tokens | Target | Phase 3 |
| Automated signup/provisioning | Target | Phase 4 |
| Root store selector | Target | Phase 5 |
| `*.shiftoryx.gr` wildcard routing | Target | Phase 6 |
| Trials/subscriptions/entitlements | Target | Phase 7 |
| Multi-store lifecycle | Target | Phase 8 |
| ShiftOryx admin panel | Target | Phase 9 |
| Public status labels/notes | Target | Phase 10; current public runtime omits them |
| Slug rename/aliases | Target | Phase 11 |
| Customization requests | Target | Phase 12 |
| EU VPS production | Target | Phase 13 |
| HomeOps integration | Target | Phase 14; read-only metrics only |
| Billing provider | Target | Phase 15 |

## Current Operational Identities

- Product name: ShiftOryx.
- Current public pilot: `https://bp-kallis.homelabshare.gr/`.
- Target root/tenant domains: `shiftoryx.gr` and `{tenantSlug}.shiftoryx.gr`.
- Current repository/server identifiers remain `GasStationProject`, `GasStation-main`, `gasstationproject` and `gasstation-bp-kallis` where operationally required.
- Current homelab branch: `main` according to deployment runbooks; Phase 1 should re-verify live state.

## Known Compatibility

- Existing membership authorization may recognize `OWNER`, `ADMIN` and `MANAGER`; the target creates only `OWNER`.
- Platform role identifier `SUPER_ADMIN` may remain while the product label becomes ShiftOryx Admin.
- Existing homelabshare domains remain active until the approved wildcard-domain cutover.
- Existing central portal/auth broker code may contain legacy homelabshare origin configuration while flags remain disabled.

## Known Review Items

- Re-run dependency audits and assess advisories without force upgrades.
- Verify every target/current claim during Phase 1 rather than relying only on prior reports.
- Inventory all role checks, origin allowlists, feature flags and legacy names before Phase 2/6.
- Confirm public snapshots contain no generic notes, absence reasons, contact fields, identifiers, membership/audit/archive data.
- Confirm no runtime fallback to locked legacy root collections.

## Phase Gate

The only approved next phase after documentation review is Phase 1 current-state audit. Do not implement roles, tokens, provisioning, domains, subscriptions, public statuses, VPS or billing from this document.
