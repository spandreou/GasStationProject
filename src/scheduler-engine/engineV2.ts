import { buildDemandSlots, type DemandSlot } from './demandMatrix.ts';
import { evaluateEmployeeEligibility } from './eligibility.ts';
import { normalizeSchedulerConfig, type SchedulerConfigV2 } from './configV2.ts';
import { eachDateInclusive, getWeekday, isDateInRange } from './dateUtils.ts';
import { resolveScheduleRoles } from './resolveRoles.ts';
import type {
  EmployeeAbsence,
  EmployeeScheduleConfig,
  GeneratedShift,
  ScheduleGap,
  ScheduleWarning,
  ShiftType,
} from './types.ts';

export interface GenerateScheduleV2Input {
  startDate: string;
  endDate: string;
  employees: EmployeeScheduleConfig[];
  absences?: EmployeeAbsence[];
  config?: SchedulerConfigV2;
  rawSettings?: any;
  previousSundayEmployeeId?: string;
  manualOverrides?: GeneratedShift[];
}

export interface GenerateScheduleV2Result {
  shifts: GeneratedShift[];
  warnings: ScheduleWarning[];
  unresolvedGaps: ScheduleGap[];
  validation: {
    valid: boolean;
    violations: ScheduleWarning[];
  };
  analytics: {
    totalShifts: number;
    hoursPerEmployee: Record<string, number>;
    shiftsPerEmployee: Record<string, number>;
    sundaysPerEmployee: Record<string, number>;
  };
}

function stableHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0xffffffff;
}

function stableSortEmployees(employees: EmployeeScheduleConfig[]): EmployeeScheduleConfig[] {
  return [...employees].sort(
    (a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'el') || a.employeeId.localeCompare(b.employeeId)
  );
}

export function generateScheduleV2(input: GenerateScheduleV2Input): GenerateScheduleV2Result {
  const config = input.config || normalizeSchedulerConfig(input.rawSettings, input.employees);
  const absences = input.absences || [];
  const manualOverrides = input.manualOverrides || [];

  // Stage A: Resolve & Sort Eligible Employees
  const activeEmployees = stableSortEmployees(
    input.employees.filter((e) => e.isEnabled !== false)
  );

  const shifts: GeneratedShift[] = [];
  const gaps: ScheduleGap[] = [];
  const warnings: ScheduleWarning[] = [];

  // Carry-over trackers
  const shiftsPerEmp: Record<string, number> = {};
  const hoursPerEmp: Record<string, number> = {};
  const sundaysPerEmp: Record<string, number> = {};
  const consecutiveDaysMap: Record<string, number> = {};
  let lastSundayEmpId = input.previousSundayEmployeeId;

  for (const emp of activeEmployees) {
    shiftsPerEmp[emp.employeeId] = 0;
    hoursPerEmp[emp.employeeId] = 0;
    sundaysPerEmp[emp.employeeId] = 0;
    consecutiveDaysMap[emp.employeeId] = 0;
  }

  // Pre-bind Manual Overrides
  for (const manual of manualOverrides) {
    shifts.push(manual);
    if (shiftsPerEmp[manual.employeeId] !== undefined) {
      shiftsPerEmp[manual.employeeId]++;
      hoursPerEmp[manual.employeeId] += 8;
    }
  }

  // Stage B: Build Demand Slots
  const demandSlots = buildDemandSlots(config, input.startDate, input.endDate, manualOverrides);

  // Group slots by date
  const dateSlotsMap = new Map<string, DemandSlot[]>();
  for (const slot of demandSlots) {
    if (!dateSlotsMap.has(slot.date)) dateSlotsMap.set(slot.date, []);
    dateSlotsMap.get(slot.date)!.push(slot);
  }

  // Stage C: Constraint Satisfaction & Heuristic Assignment per Date
  const allDates = eachDateInclusive(input.startDate, input.endDate);

  for (const date of allDates) {
    const daySlots = dateSlotsMap.get(date) || [];
    const weekday = getWeekday(date);

    // Reset daily work flags
    const workedToday = new Set<string>();
    for (const s of shifts.filter((s) => s.date === date)) {
      workedToday.add(s.employeeId);
    }

    for (const slot of daySlots) {
      if (slot.isLockedManualOverride && slot.assignedEmployeeId) {
        workedToday.add(slot.assignedEmployeeId);
        continue;
      }

      // Filter eligible candidates
      const eligibleCandidates = activeEmployees.filter((emp) => {
        if (workedToday.has(emp.employeeId)) return false;

        const check = evaluateEmployeeEligibility({
          employee: emp,
          date,
          shiftTemplate: slot.template,
          absences,
          existingShifts: shifts,
          complianceRules: config.complianceRules,
        });
        return check.eligible;
      });

      if (eligibleCandidates.length === 0) {
        // Record Unresolved Gap
        gaps.push({
          id: `gap-${slot.slotId}`,
          date,
          shiftType: slot.template.shiftType as ShiftType,
          startTime: slot.template.startTime,
          endTime: slot.template.endTime,
          missingRole: slot.requiredRole as any,
          reason: 'NO_EMPLOYEE',
        });
        warnings.push({
          id: `UNRESOLVED_GAP-${date}-${slot.template.id}`,
          severity: 'warning',
          code: 'UNRESOLVED_GAP',
          message: `Ακάλυπτη βάρδια ${slot.template.label} (${slot.template.startTime}-${slot.template.endTime}) στις ${date}`,
          date,
        });
        continue;
      }

      // Score candidates (Lowest Cost = Best Match)
      let bestCandidate = eligibleCandidates[0];
      let lowestCost = Infinity;

      for (const emp of eligibleCandidates) {
        let cost = 0;

        // 1. Shift / Hours Balancing Cost
        cost += (shiftsPerEmp[emp.employeeId] || 0) * 10;
        cost += (hoursPerEmp[emp.employeeId] || 0) * 2;

        // 2. Role Requirement Match
        if (slot.requiredRole && emp.scheduleRole === slot.requiredRole) {
          cost -= 100;
        } else if (slot.requiredRole && emp.scheduleRole !== slot.requiredRole) {
          cost += 50;
        }

        // 3. Sunday Rotation Balancing
        if (weekday === 'SUNDAY') {
          if (emp.employeeId === lastSundayEmpId && config.sundayAndHolidays.avoidConsecutiveSundays) {
            cost += 1000; // Heavy penalty for consecutive Sunday
          }
          cost += (sundaysPerEmp[emp.employeeId] || 0) * 200;
        }

        // 4. Consecutive Working Days
        const streak = consecutiveDaysMap[emp.employeeId] || 0;
        if (streak >= config.complianceRules.maxConsecutiveWorkingDays) {
          cost += 500;
        } else {
          cost += streak * 5;
        }

        // 5. Shift Preference
        if (emp.defaultShiftPreference === slot.template.shiftType) {
          cost -= 15;
        }

        // 6. Deterministic Tie-Breaker
        const tieBreaker = stableHash(`${slot.slotId}:${emp.employeeId}`);
        cost += tieBreaker;

        if (cost < lowestCost) {
          lowestCost = cost;
          bestCandidate = emp;
        }
      }

      // Assign Shift
      const newShift: GeneratedShift = {
        id: `shift-${slot.slotId}-${bestCandidate.employeeId}`,
        date,
        employeeId: bestCandidate.employeeId,
        employeeName: bestCandidate.fullName,
        scheduleRole: bestCandidate.scheduleRole,
        shiftType: slot.template.shiftType as ShiftType,
        startTime: slot.template.startTime,
        endTime: slot.template.endTime,
        source: weekday === 'SUNDAY' ? 'SUNDAY_ROTATION' : 'BASE',
      };

      shifts.push(newShift);
      workedToday.add(bestCandidate.employeeId);
      shiftsPerEmp[bestCandidate.employeeId] = (shiftsPerEmp[bestCandidate.employeeId] || 0) + 1;
      hoursPerEmp[bestCandidate.employeeId] = (hoursPerEmp[bestCandidate.employeeId] || 0) + slot.template.durationHours;
      if (weekday === 'SUNDAY') {
        sundaysPerEmp[bestCandidate.employeeId] = (sundaysPerEmp[bestCandidate.employeeId] || 0) + 1;
        lastSundayEmpId = bestCandidate.employeeId;
      }
    }

    // Update consecutive days
    for (const emp of activeEmployees) {
      if (workedToday.has(emp.employeeId)) {
        consecutiveDaysMap[emp.employeeId] = (consecutiveDaysMap[emp.employeeId] || 0) + 1;
      } else {
        consecutiveDaysMap[emp.employeeId] = 0;
      }
    }
  }

  // Stage D: Validation Violations
  const violations: ScheduleWarning[] = [];

  // Check 1: Unresolved gaps make schedule invalid
  if (gaps.length > 0) {
    violations.push({
      id: 'UNRESOLVED_GAPS_PRESENT',
      severity: 'error',
      code: 'UNRESOLVED_GAPS_PRESENT',
      message: `Το πρόγραμμα έχει ${gaps.length} ακάλυπτες βάρδιες.`,
    });
  }

  // Check 2: Double shifts
  const seenEmpDate = new Set<string>();
  for (const s of shifts) {
    const key = `${s.date}:${s.employeeId}`;
    if (seenEmpDate.has(key)) {
      violations.push({
        id: `DOUBLE_SHIFT-${key}`,
        severity: 'error',
        code: 'DOUBLE_SHIFT',
        message: `Διπλή βάρδια για τον εργαζόμενο ${s.employeeId} στις ${s.date}`,
        date: s.date,
        employeeId: s.employeeId,
      });
    }
    seenEmpDate.add(key);
  }

  // Check 3: Inactive employee assigned
  const inactiveIds = new Set(input.employees.filter((e) => e.isEnabled === false).map((e) => e.employeeId));
  for (const s of shifts) {
    if (inactiveIds.has(s.employeeId)) {
      violations.push({
        id: `DEACTIVATED_EMPLOYEE_ASSIGNED-${s.id}`,
        severity: 'error',
        code: 'DEACTIVATED_EMPLOYEE_ASSIGNED',
        message: `Απενεργοποιημένος υπάλληλος ${s.employeeId} έλαβε βάρδια στις ${s.date}`,
        date: s.date,
        employeeId: s.employeeId,
      });
    }
  }

  // Check 4: Absent employee assigned
  for (const s of shifts) {
    const abs = absences.find(
      (a) => a.employeeId === s.employeeId && s.date >= a.startDate && s.date <= a.endDate
    );
    if (abs) {
      violations.push({
        id: `ABSENT_EMPLOYEE_WORKED-${s.id}`,
        severity: 'error',
        code: 'ABSENT_EMPLOYEE_WORKED',
        message: `Υπάλληλος ${s.employeeId} με άδεια/ασθένεια έλαβε βάρδια στις ${s.date}`,
        date: s.date,
        employeeId: s.employeeId,
      });
    }
  }

  const sortedShifts = [...shifts].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.employeeId.localeCompare(b.employeeId)
  );

  return {
    shifts: sortedShifts,
    warnings,
    unresolvedGaps: gaps,
    validation: {
      valid: violations.length === 0,
      violations,
    },
    analytics: {
      totalShifts: sortedShifts.length,
      hoursPerEmployee: hoursPerEmp,
      shiftsPerEmployee: shiftsPerEmp,
      sundaysPerEmployee: sundaysPerEmp,
    },
  };
}
