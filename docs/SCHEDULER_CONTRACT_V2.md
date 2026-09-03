# ShiftOryx — Master Product Specification: Scheduler Contract V2

## Canonical Status
- **Document Version:** `2.0.0`
- **Schema Version:** `2`
- **Date:** 30 August 2026
- **Status:** **IMPLEMENTED_TESTED WITH EXPLICIT DEFERRED FIELDS**
- **Roadmap position:** approved cross-cutting scheduler hardening; it is not a new numbered roadmap phase.
- **Compatibility:** the legacy scheduler path and PR #41 regression suite remain active and passing for existing BP Kallis inputs. V2 is selected only when V2 configuration is present or generalized normalization is required.

---

## Executive Summary & Product Vision

ShiftOryx is a multi-tenant business operating system serving diverse business categories:
- `FUEL_STATION` (24/7 or 16h multi-shift operations)
- `CAFE` (early morning opening, peak afternoon rushes, weekend brunch)
- `RESTAURANT` (split shifts, evening service, closing leads)
- `HAIR_SALON` (commercial operating hours, individual client slots, fixed rest days)
- `RETAIL` (store hours, inventory shifts, weekend staffing)
- `OTHER` (safe generic customizable scheduling)

The scheduling engine evolves from a narrowly fixed 4–6 employee topology into a **tenant-configurable constraint and assignment engine**.

## Implementation Status Matrix

| Capability | Status | Evidence boundary |
| --- | --- | --- |
| Tenant-scoped `SchedulerConfigV2` normalization and validation | `IMPLEMENTED_TESTED` | deterministic contract suite and production store integration |
| Scheduler-local operating windows, shift templates and coverage slots | `IMPLEMENTED_TESTED` | OWNER UI, config validation and engine tests |
| `minHeadcount` / `maxHeadcount` | `IMPLEMENTED_TESTED` hard constraints | independent post-generation validator |
| `targetHeadcount` | `SOFT_OBJECTIVE` | valid schedule with `TARGET_COVERAGE_NOT_MET` warning |
| `minDaysOffPerWeek` | `IMPLEMENTED_TESTED` hard constraint | eligibility plus independent validator |
| `targetDaysOffPerWeek` | `SOFT_OBJECTIVE` | candidate scoring after all hard filters |
| `shiftTemplateId` / `demandSlotId` | `IMPLEMENTED_TESTED` | every generated V2 shift carries explicit identity |
| Manual work overrides during auto-generation | `IMPLEMENTED_TESTED` hard validation | the real app adapter includes preserved manual work in the final week/month candidate and blocks automatic persistence on hard violations |
| Week/month zero-write persistence | `IMPLEMENTED_TESTED` | one shared production helper gates replace, history, public projection and audit boundaries |
| `substituteRules.replacementStrategy` enum | `DEFERRED_NOT_ACTIVE` | retained for forward-compatible schema only; no UI or scheduling effect |
| Phase 9 general SaaS template catalog | `DEFERRED_TO_PHASE_9` | V2 shift templates are scheduler-local and do not implement the catalog/admin system |
| Billing, entitlements and multistore lifecycle | `DEFERRED_TO_OWNING_PHASES` | not implemented or changed by Scheduler V2 |

---

## Primary Product Contract

A valid ShiftOryx schedule is deterministically derived from four inputs:

$$\text{Schedule} = f(\text{Tenant Configuration}, \text{Employee Pool}, \text{Availability \& Absences}, \text{Operational Constraints})$$

The engine is **NOT** driven by:
- Hardcoded employee headcount (e.g. universal 4–6 restriction).
- Hardcoded industry role names (`CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B`) as mandatory SaaS concepts.
- Implicit array ordering or client-side object positions.
- Silent fallback role mappings.
- Special-case employee IDs.

Tenant configuration defines what a valid schedule means. The engine decides whether the active employee pool can satisfy it.

---

## Absolute Design Rule: Zero Dynamic Code Execution

Tenant scheduling logic is strictly declarative. Under no circumstances does ShiftOryx execute tenant-supplied scripts.

### Forbidden:
- `eval()`
- `new Function()`
- Dynamic JavaScript / WebAssembly execution
- Arbitrary expressions stored in Firestore
- Tenant-supplied shell commands

### Mandatory Implementation:
All tenant rules are expressed through validated, versioned JSON/TypeScript schemas with bounded numeric limits, explicit enums, standard 24-hour time ranges (`HH:mm`), and strict constraint objects.

---

## The 12 Non-Negotiable Scheduler Product Contracts

### Contract 1: Tenant Ownership of Scheduling Rules
Each tenant defines its own:
- Operating days (which weekdays the store is open).
- Operating time windows (e.g. `06:00–22:00`, `08:00–16:00`, `24h`, split shifts).
- Shift templates (ID, label, start time, end time, duration, break, color).
- Staffing demand (minimum and target workers per shift/day).
- Skill / role requirements where applicable.
- Rest and compliance rules (minimum rest interval between shifts, target days off, maximum consecutive working days).
- Sunday and holiday participation policies.
- Absence/unavailability constraints. Strategy selection remains schema-only and deferred in this release.

No fuel-station-specific topology is assumed globally.

### Contract 2: General Employee Capacity Model
- The engine removes the universal 4–6 employee limit.
- Small teams (1, 2, 3 employees) are fully supported if their tenant rules are mathematically satisfiable (or produce explicit, clear coverage gap diagnostics if unsatisfiable).
- Larger teams (7, 8, 10, 15, 20, 30+ employees) are covered by deterministic tests.
- The current benchmark suite is tested up to 50 employees over 30 days. Observed local runs are in the tens of milliseconds; this is evidence of the tested range, not a claimed Firestore or product maximum.

### Contract 3: Automatic Employee Addition Lifecycle
- When an employee is `ACTIVE`, scheduling-enabled, and within their employment/seasonal range, the employee **must automatically participate** in subsequent schedule generation.
- There are no hidden manual engine slot assignments, manual role registries, or array index expectations.
- Adding a valid employee must never result in that employee silently disappearing or receiving 0 shifts when work is available and fairness permits.

### Contract 4: Non-Destructive Employee Removal & Deactivation
- Deactivating or archiving an employee:
  1. Excludes them from all future schedule generation pools (0 future shifts).
  2. Preserves historical schedule fixtures, exports, and attendance records; deactivation changes future eligibility and does not delete history.
- If future persisted schedules contain shifts for a deactivated employee:
  - The system surfaces an explicit conflict diagnostic (`DEACTIVATED_EMPLOYEE_FUTURE_ASSIGNMENT`).
  - It requires admin regeneration or reassignment.
  - It never converts orphaned assignments into silent fake rest (`ΑΝ`).

### Contract 5: Operating Days & Hours
- Tenants configure operating days per week. Unchecked days are closed (0 shifts demanded).
- Daily operating windows are tenant-defined.
- Shifts are validated to ensure they fall within the tenant's daily operating window.
- Cross-midnight shifts (e.g. `22:00–06:00`) are supported with explicit midnight rollover rest calculation.

### Contract 6: Shift Templates
- Shift templates define discrete working shifts (e.g. Morning `06:00–14:00`, Intermediate `10:00–18:00`, Evening `14:00–22:00`, Night `22:00–06:00`, Sunday 12H `08:00–20:00`).
- Display labels are user-facing; internal IDs are immutable and stable.
- Templates specify duration and optional required skills.

### Contract 7: Coverage & Staffing Demand
- A schedule is valid only if all configured coverage requirements are satisfied.
- If the available workforce cannot satisfy required coverage on any date:
  - The engine produces an explicit `ScheduleGap` and warning code (e.g. `INSUFFICIENT_STAFF`, `UNRESOLVED_GAP`).
  - `validation.valid` evaluates to `false`.
  - Zero fabricated or ghost assignments are created.

### Contract 8: Absence & Availability Precedence
- Approved absences (`LEAVE`, `SICK`, `UNPAID_REST`, `OTHER`) and fixed days off take absolute precedence over shift generation.
- An absent or unavailable employee cannot receive an overlapping work assignment.
- The schema retains `EXTRA_FIRST`, `EQUAL_HOURS`, `ROLE_MATCH` and `MANUAL_ONLY` for forward compatibility, but these strategies are `DEFERRED_NOT_ACTIVE` in this release and are not exposed as an active tenant control.
- Substitutes on standby receive `-`, never false statutory rest `ΑΝ`.

### Contract 9: Full Validation Before Persistence (Zero Partial Persistence)
- Schedule generation is a pure in-memory calculation returning:
  - Candidate shifts
  - Validation report (`valid: boolean`, `violations: ScheduleWarning[]`)
  - Diagnostics and coverage analytics
- **Invariant:** If `validation.valid !== true` or any error-level violation exists, **EXACTLY ZERO Firestore writes occur** (0 shifts written, 0 history snapshots, 0 public projections, 0 audit logs).

### Contract 10: Deterministic Reproducibility
- Given identical inputs (tenant config, employee snapshot, absences, target date range, seed), generation produces byte-for-byte identical schedules across all platforms and timezones.
- Tie-breaking uses deterministic 32-bit hashing (FNV-1a / Mulberry32), never unseeded `Math.random()`.
- Calendar arithmetic uses pure UTC ISO dates (`YYYY-MM-DD`).

### Contract 11: Multi-Objective Fairness Heuristics
- The engine uses a multi-objective cost function:
  1. Contract hours / shift count balancing (pulls under-scheduled staff up).
  2. Sunday / weekend rotation balance (penalizes consecutive Sundays).
  3. Continuous stretch spacing (prevents fatigue from 5+ consecutive days).
  4. Minimum rest turnaround protection ($\ge 11\text{h}$ mandatory, $\ge 14\text{h}$ preferred).
- `targetDaysOffPerWeek` adds a soft cost when a candidate would exceed the preferred working-day count. It never bypasses hard coverage, role, skill, rest, hours or minimum-days-off constraints.
- Fairness is subordinate to hard labor and coverage constraints.

### Contract 12: Visible & Safe Failure (No Silent Fallback)
The engine never:
- Silently drops an active employee.
- Maps an unknown role to a silent fallback (e.g. `|| 'EXTRA_A'`).
- Saves a partial or broken schedule to the database.
- Renders missing assignments as statutory rest (`ΑΝ`) in PDF/Excel/Word/WhatsApp exports.
- Ignores an unsatisfied hard constraint.

---

## Data Model Specification: `SchedulerConfigV2`

```typescript
export interface SchedulerConfigV2 {
  schemaVersion: 2;
  tenantId: string;
  businessCategory: 'FUEL_STATION' | 'CAFE' | 'RESTAURANT' | 'HAIR_SALON' | 'RETAIL' | 'OTHER';
  templateId: string;
  templateVersion: number;
  timezone: string; // 'Europe/Athens'
  weekStartDay: 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1 = Monday

  operatingDays: Array<{
    weekday: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
    isOpen: boolean;
    windows: Array<{ openTime: string; closeTime: string; crossMidnight?: boolean }>;
  }>;

  shiftTemplates: Array<{
    id: string;
    label: string;
    shortCode: string;
    shiftType: 'MORNING' | 'INTERMEDIATE' | 'AFTERNOON' | 'NIGHT' | 'SPLIT' | 'CUSTOM' | 'SPECIAL';
    startTime: string; // '06:00'
    endTime: string;   // '14:00'
    durationHours: number;
    unpaidBreakMinutes: number;
    crossMidnight: boolean;
    color: string;
    isActive: boolean;
    requiredSkillsOrRoles?: string[];
  }>;

  coverageRequirements: Array<{
    weekday: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
    dayType: 'FULL_COVERAGE' | 'STANDARD_COVERAGE' | 'SPLIT_COVERAGE' | 'MINIMAL_COVERAGE' | 'CUSTOM';
    slots: Array<{
      shiftTemplateId: string;
      minHeadcount: number;
      targetHeadcount: number;
      maxHeadcount?: number;
      requiredRole?: string;
      optionalCandidateRoles?: string[];
    }>;
  }>;

  complianceRules: {
    targetDaysOffPerWeek: number;
    minDaysOffPerWeek: number;
    maxConsecutiveWorkingDays: number;
    minRestIntervalBetweenShiftsHours: number;
    maxDailyWorkingHours: number;
    maxWeeklyStandardHours: number;
    preventClashingTurnaround: boolean;
  };

  sundayAndHolidays: {
    sundayMode: 'CYCLIC_FAIR' | 'FIXED_ASSIGNMENT' | 'STANDARD_WEEKDAY_LIKE' | 'CLOSED';
    sundayShiftTemplateId: string;
    avoidConsecutiveSundays: boolean;
    participatingRoleTypes: string[];
    holidaysTreatedAsSundays: boolean;
    closedOnPublicHolidays: boolean;
  };

  specialDaysByDate: Record<string, {
    date: string;
    isHoliday: boolean;
    isSpecialOperatingHours: boolean;
    label: string;
    operatingWindows?: Array<{ openTime: string; closeTime: string }>;
  }>;

  substituteRules: {
    replacementStrategy: 'EXTRA_FIRST' | 'EQUAL_HOURS' | 'ROLE_MATCH' | 'MANUAL_ONLY';
    autoFillGaps: boolean;
    allowPartialCoverageWithWarning: boolean;
    extraSubstituteRoles: string[];
    seasonalActivationStrictDates: boolean;
  };

  legacyRotation: {
    weeklyRotationEnabled: boolean;
    startWithCoreAMorning: boolean;
    allowManualOverride: boolean;
    avoidConsecutiveSundays: boolean;
  };
}
```

---

## Backward Compatibility & Migration Guarantee

1. **Zero-Mutation Migration:** Legacy settings documents in `tenants/bp-kallis/settings/scheduler` and employee records are normalized in-memory via `normalizeSchedulerConfig`.
2. **BP Kallis Regression Boundary:** the unchanged legacy path is verified by `npm run test:new-employee-scheduler` and the scheduler regression suites. This is the exact tested compatibility claim; no unproved mathematical-equivalence claim is made.
3. **Opportunistic V2 Persistence:** When an owner saves settings via the UI, the record is written with `schemaVersion: 2` containing the canonical V2 structure.

## Scope And Authorization Boundary

- Scheduler configuration is stored under the tenant-scoped scheduler settings document. In the current data model a store workspace is a tenant; Phase 8 owns any later store-lifecycle changes.
- Scheduler settings writes remain protected by active `OWNER` membership and reject active Platform Admin identities. Hostname selects tenant context and never authorizes access.
- Direct OWNER manual editing remains available by product contract; violations stay visible. The hard-validation claim in this document is specifically the automatic week/month generation candidate, which includes preserved manual work and performs zero generation writes when that final candidate is invalid.
- Scheduler-local `shiftTemplates` are staffing definitions only. They do not implement or claim ownership of the Phase 9 presentation/template catalog.
- This work requires no Firebase deployment, Vercel production deployment, DNS change, production data write, production auth change or production scheduler-settings mutation.
