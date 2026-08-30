import { buildDemandSlots, type DemandSlot } from './demandMatrix.ts';
import { evaluateEmployeeEligibility } from './eligibility.ts';
import { normalizeSchedulerConfig, validateSchedulerConfig, type SchedulerConfigV2 } from './configV2.ts';
import {
  calculateRestHoursBetweenShifts,
  eachDateInclusive,
  getMondayStart,
  getWeekday,
  isShiftContainedInWindow,
} from './dateUtils.ts';
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
    (a, b) =>
      (a?.fullName || '').localeCompare(b?.fullName || '', 'el') ||
      (a?.employeeId || '').localeCompare(b?.employeeId || '')
  );
}

export function generateScheduleV2(input: GenerateScheduleV2Input): GenerateScheduleV2Result {
  const warnings: ScheduleWarning[] = [];
  const violations: ScheduleWarning[] = [];

  // 1. Guard against empty/malformed date range
  if (!input || !input.startDate || !input.endDate || input.startDate > input.endDate) {
    return {
      shifts: [],
      warnings: [],
      unresolvedGaps: [],
      validation: {
        valid: false,
        violations: [
          {
            id: 'INVALID_DATE_RANGE',
            severity: 'error',
            code: 'INVALID_DATE_RANGE',
            message: 'Μη έγκυρο εύρος ημερομηνιών.',
          },
        ],
      },
      analytics: {
        totalShifts: 0,
        hoursPerEmployee: {},
        shiftsPerEmployee: {},
        sundaysPerEmployee: {},
      },
    };
  }

  // 2. Resolve and validate configuration (MANDATORY PRECONDITION)
  const config = input.config || normalizeSchedulerConfig(input.rawSettings, input.employees || []);
  const configValidation = validateSchedulerConfig(config);
  if (!configValidation.valid) {
    return {
      shifts: [],
      warnings: [],
      unresolvedGaps: [],
      validation: {
        valid: false,
        violations: configValidation.errors.map((err, idx) => ({
          id: `CONFIG_INVALID_${idx}`,
          severity: 'error',
          code: 'CONFIG_INVALID',
          message: `Μη έγκυρη ρύθμιση προγραμματισμού: ${err}`,
        })),
      },
      analytics: {
        totalShifts: 0,
        hoursPerEmployee: {},
        shiftsPerEmployee: {},
        sundaysPerEmployee: {},
      },
    };
  }

  const rawEmployees = Array.isArray(input.employees) ? input.employees : [];
  const absences = Array.isArray(input.absences) ? input.absences : [];
  const manualOverrides = Array.isArray(input.manualOverrides) ? input.manualOverrides : [];

  // Stage A: Resolve Active Employees
  const activeEmployees = stableSortEmployees(
    rawEmployees.filter((e) => e && e.employeeId && e.isEnabled !== false)
  );

  const shifts: GeneratedShift[] = [];
  const gaps: ScheduleGap[] = [];

  // Trackers
  const shiftsPerEmp: Record<string, number> = {};
  const hoursPerEmp: Record<string, number> = {};
  const sundaysPerEmp: Record<string, number> = {};
  const weeklyHoursMap: Record<string, Record<string, number>> = {};
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
    if (!manual || !manual.employeeId) continue;
    shifts.push(manual);
    const empId = manual.employeeId;
    shiftsPerEmp[empId] = (shiftsPerEmp[empId] || 0) + 1;
    const duration = 8; // Default manual duration
    hoursPerEmp[empId] = (hoursPerEmp[empId] || 0) + duration;
    const weekKey = getMondayStart(manual.date);
    if (!weeklyHoursMap[weekKey]) weeklyHoursMap[weekKey] = {};
    weeklyHoursMap[weekKey][empId] = (weeklyHoursMap[weekKey][empId] || 0) + duration;
  }

  // Stage B: Build Demand Slots
  const demandSlots = buildDemandSlots(config, input.startDate, input.endDate, manualOverrides);

  // Group slots by date
  const dateSlotsMap = new Map<string, DemandSlot[]>();
  for (const slot of demandSlots) {
    if (!dateSlotsMap.has(slot.date)) dateSlotsMap.set(slot.date, []);
    dateSlotsMap.get(slot.date)!.push(slot);
  }

  // Stage C: Heuristic Constraint Satisfaction per Date
  const allDates = eachDateInclusive(input.startDate, input.endDate);

  for (const date of allDates) {
    const daySlots = dateSlotsMap.get(date) || [];
    const weekday = getWeekday(date);
    const weekKey = getMondayStart(date);
    if (!weeklyHoursMap[weekKey]) weeklyHoursMap[weekKey] = {};

    // Sort slots by priority (MRV heuristic: hard roles/skills first)
    daySlots.sort((a, b) => a.priority - b.priority || a.slotId.localeCompare(b.slotId));

    const workedToday = new Set<string>();
    for (const s of shifts.filter((s) => s.date === date)) {
      workedToday.add(s.employeeId);
    }

    for (const slot of daySlots) {
      if (slot.isLockedManualOverride && slot.assignedEmployeeId) {
        const existing = shifts.find((s) => s.date === date && s.employeeId === slot.assignedEmployeeId);
        if (!existing) {
          const emp = activeEmployees.find((e) => e.employeeId === slot.assignedEmployeeId);
          if (emp) {
            const fixedShift: GeneratedShift = {
              id: `shift-${slot.slotId}-${emp.employeeId}`,
              date,
              employeeId: emp.employeeId,
              employeeName: emp.fullName,
              scheduleRole: emp.scheduleRole,
              shiftType: slot.template.shiftType as ShiftType,
              startTime: slot.template.startTime,
              endTime: slot.template.endTime,
              source: weekday === 'SUNDAY' ? 'SUNDAY_ROTATION' : 'BASE',
            };
            shifts.push(fixedShift);
            shiftsPerEmp[emp.employeeId] = (shiftsPerEmp[emp.employeeId] || 0) + 1;
            hoursPerEmp[emp.employeeId] = (hoursPerEmp[emp.employeeId] || 0) + slot.template.durationHours;
            weeklyHoursMap[weekKey][emp.employeeId] =
              (weeklyHoursMap[weekKey][emp.employeeId] || 0) + slot.template.durationHours;
          }
        }
        workedToday.add(slot.assignedEmployeeId);
        continue;
      }

      // Filter candidates with hard eligibility checks
      const eligibleCandidates = activeEmployees.filter((emp) => {
        if (workedToday.has(emp.employeeId)) return false;

        const streak = consecutiveDaysMap[emp.employeeId] || 0;
        const currentWeeklyHours = weeklyHoursMap[weekKey][emp.employeeId] || 0;

        const check = evaluateEmployeeEligibility({
          employee: emp,
          date,
          slot,
          absences,
          existingShifts: shifts,
          complianceRules: config.complianceRules,
          consecutiveDaysWorked: streak,
          weeklyHoursWorked: currentWeeklyHours,
        });

        return check.eligible;
      });

      if (eligibleCandidates.length === 0) {
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
          id: `UNRESOLVED_GAP-${date}-${slot.template.id}-${slot.slotId}`,
          severity: slot.isHardMinimum ? 'error' : 'warning',
          code: slot.isHardMinimum ? 'UNRESOLVED_GAP' : 'TARGET_COVERAGE_NOT_MET',
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

        // 1. Shift & Hours Balance
        cost += (shiftsPerEmp[emp.employeeId] || 0) * 10;
        cost += (hoursPerEmp[emp.employeeId] || 0) * 2;

        // 2. Sunday Rotation Balance
        if (weekday === 'SUNDAY') {
          if (emp.employeeId === lastSundayEmpId && config.sundayAndHolidays?.avoidConsecutiveSundays) {
            cost += 1000;
          }
          cost += (sundaysPerEmp[emp.employeeId] || 0) * 200;
        }

        // 3. Shift Preference Match
        if (emp.defaultShiftPreference && emp.defaultShiftPreference === slot.template.shiftType) {
          cost -= 25;
        }

        // 4. Consecutive Working Days Fair Spreading
        const streak = consecutiveDaysMap[emp.employeeId] || 0;
        cost += streak * 8;

        // 5. Deterministic Tie-Breaker (FNV-1a)
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
      weeklyHoursMap[weekKey][bestCandidate.employeeId] =
        (weeklyHoursMap[weekKey][bestCandidate.employeeId] || 0) + slot.template.durationHours;

      if (weekday === 'SUNDAY') {
        sundaysPerEmp[bestCandidate.employeeId] = (sundaysPerEmp[bestCandidate.employeeId] || 0) + 1;
        lastSundayEmpId = bestCandidate.employeeId;
      }
    }

    // Update consecutive days worked
    for (const emp of activeEmployees) {
      if (workedToday.has(emp.employeeId)) {
        consecutiveDaysMap[emp.employeeId] = (consecutiveDaysMap[emp.employeeId] || 0) + 1;
      } else {
        consecutiveDaysMap[emp.employeeId] = 0;
      }
    }
  }

  // =========================================================================
  // Stage D: Independent Post-Generation Compliance Validator
  // =========================================================================

  // Check 1: Hard minimum gaps make schedule invalid
  const hardMinimumGaps = gaps.filter((g) => {
    const matchingWarning = warnings.find((w) => w.id.includes(g.id.replace('gap-', '')));
    return !matchingWarning || matchingWarning.code !== 'TARGET_COVERAGE_NOT_MET';
  });
  if (hardMinimumGaps.length > 0) {
    violations.push({
      id: 'UNRESOLVED_GAPS_PRESENT',
      severity: 'error',
      code: 'UNRESOLVED_GAPS_PRESENT',
      message: `Το πρόγραμμα έχει ${hardMinimumGaps.length} ακάλυπτες υποχρεωτικές βάρδιες.`,
    });
  }

  // Check 2: Double shifts or overlapping hours
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

  // Check 3: Inactive / Deactivated employees
  const inactiveIds = new Set(rawEmployees.filter((e) => e && e.isEnabled === false).map((e) => e.employeeId));
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

  // Check 4: Approved Absence overlap
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

  // Check 5: Turnaround Rest Intervals
  if (config.complianceRules?.minRestIntervalBetweenShiftsHours && config.complianceRules.preventClashingTurnaround !== false) {
    const minRest = config.complianceRules.minRestIntervalBetweenShiftsHours;
    for (let i = 0; i < shifts.length; i++) {
      for (let j = i + 1; j < shifts.length; j++) {
        const s1 = shifts[i];
        const s2 = shifts[j];
        if (s1.employeeId !== s2.employeeId) continue;
        if (s1.date < s2.date) {
          const rest = calculateRestHoursBetweenShifts(
            s1.date,
            s1.startTime,
            s1.endTime,
            Boolean((s1 as any).crossMidnight),
            s2.date,
            s2.startTime,
            s2.endTime,
            Boolean((s2 as any).crossMidnight),
          );
          if (rest < minRest) {
            violations.push({
              id: `REST_INTERVAL_VIOLATED-${s1.id}-${s2.id}`,
              severity: 'error',
              code: 'REST_INTERVAL_VIOLATED',
              message: `Ανεπαρκής ανάπαυση (${rest.toFixed(1)}h < ${minRest}h) για τον υπάλληλο ${s1.employeeId} μεταξύ ${s1.date} και ${s2.date}`,
              date: s2.date,
              employeeId: s1.employeeId,
            });
          }
        }
      }
    }
  }

  const sortedShifts = [...shifts].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.employeeId.localeCompare(b.employeeId)
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

