import { buildDemandSlots, type DemandSlot } from './demandMatrix.ts';
import { evaluateEmployeeEligibility } from './eligibility.ts';
import {
  deriveShiftDurationHours,
  normalizeSchedulerConfig,
  validateSchedulerConfig,
  type SchedulerConfigV2,
  type TimeWindow,
} from './configV2.ts';
import {
  addDays,
  calculateRestHoursBetweenShifts,
  eachDateInclusive,
  getMondayStart,
  getWeekday,
  isShiftContainedInWindow,
} from './dateUtils.ts';
import { getAffectingAbsence } from './availability.ts';
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

export function validateGeneratedScheduleCompliance(params: {
  config: SchedulerConfigV2;
  employees: EmployeeScheduleConfig[];
  absences?: EmployeeAbsence[];
  shifts: GeneratedShift[];
  startDate: string;
  endDate: string;
}): { valid: boolean; violations: ScheduleWarning[] } {
  const { config, employees, absences = [], shifts, startDate, endDate } = params;
  const violations: ScheduleWarning[] = [];
  const validEmployees = (employees || []).filter((e): e is EmployeeScheduleConfig => Boolean(e && e.employeeId));
  const empMap = new Map(validEmployees.map((e) => [e.employeeId, e]));
  const tplMap = new Map((config?.shiftTemplates || []).map((t) => [t.id, t]));
  const opDayMap = new Map((config?.operatingDays || []).map((d) => [d.weekday, d]));

  // Chronologically sorted shifts
  const sorted = [...shifts].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.employeeId.localeCompare(b.employeeId)
  );

  // Trackers
  const shiftsByEmpDate = new Map<string, GeneratedShift[]>();
  const shiftsByEmp = new Map<string, GeneratedShift[]>();
  const datesByEmp = new Map<string, Set<string>>();

  for (const s of sorted) {
    const emp = empMap.get(s.employeeId);

    // Rule 1: Unknown employee existence
    if (!emp) {
      violations.push({
        id: `UNKNOWN_EMPLOYEE-${s.id}`,
        severity: 'error',
        code: 'UNKNOWN_EMPLOYEE',
        message: `Άγνωστος υπάλληλος ${s.employeeId} έλαβε βάρδια στις ${s.date}`,
        date: s.date,
        employeeId: s.employeeId,
      });
      continue;
    }

    // Rule 2: Inactive / Seasonality
    if (emp.isEnabled === false) {
      violations.push({
        id: `DEACTIVATED_EMPLOYEE_ASSIGNED-${s.id}`,
        severity: 'error',
        code: 'DEACTIVATED_EMPLOYEE_ASSIGNED',
        message: `Απενεργοποιημένος υπάλληλος ${s.employeeId} έλαβε βάρδια στις ${s.date}`,
        date: s.date,
        employeeId: s.employeeId,
      });
    }
    if (emp.activeFrom && s.date < emp.activeFrom) {
      violations.push({
        id: `OUT_OF_SEASON_EMPLOYEE_ASSIGNED-${s.id}`,
        severity: 'error',
        code: 'OUT_OF_SEASON_EMPLOYEE_ASSIGNED',
        message: `Υπάλληλος ${s.employeeId} έλαβε βάρδια στις ${s.date} πριν την ενεργοποίηση (${emp.activeFrom})`,
        date: s.date,
        employeeId: s.employeeId,
      });
    }
    if (emp.activeTo && s.date > emp.activeTo) {
      violations.push({
        id: `OUT_OF_SEASON_EMPLOYEE_ASSIGNED-${s.id}`,
        severity: 'error',
        code: 'OUT_OF_SEASON_EMPLOYEE_ASSIGNED',
        message: `Υπάλληλος ${s.employeeId} έλαβε βάρδια στις ${s.date} μετά τη λήξη (${emp.activeTo})`,
        date: s.date,
        employeeId: s.employeeId,
      });
    }

    // Rule 3: Approved Absence Check
    const affectingAbsence = getAffectingAbsence({
      employeeId: s.employeeId,
      date: s.date,
      shiftType: s.shiftType as ShiftType,
      absences,
    });
    if (affectingAbsence) {
      violations.push({
        id: `ABSENT_EMPLOYEE_WORKED-${s.id}`,
        severity: 'error',
        code: 'ABSENT_EMPLOYEE_WORKED',
        message: `Υπάλληλος ${s.employeeId} με άδεια/ασθένεια έλαβε βάρδια στις ${s.date}`,
        date: s.date,
        employeeId: s.employeeId,
      });
    }

    // Rule 4: Fixed Day Off
    const weekday = getWeekday(s.date);
    if (emp.fixedDayOff && emp.fixedDayOff === weekday) {
      violations.push({
        id: `FIXED_DAY_OFF_VIOLATION-${s.id}`,
        severity: 'error',
        code: 'FIXED_DAY_OFF_VIOLATION',
        message: `Υπάλληλος ${s.employeeId} εργάστηκε σε σταθερό ρεπό (${weekday}) στις ${s.date}`,
        date: s.date,
        employeeId: s.employeeId,
      });
    }

    // Rule 5: Operating Window & Store Closure
    const specialDay = config.specialDaysByDate?.[s.date];
    let applicableWindows: TimeWindow[] = [];
    if (specialDay && specialDay.isSpecialOperatingHours && Array.isArray(specialDay.operatingWindows) && specialDay.operatingWindows.length > 0) {
      applicableWindows = specialDay.operatingWindows;
    } else {
      const opDay = opDayMap.get(weekday);
      if (opDay && opDay.isOpen && Array.isArray(opDay.windows)) {
        applicableWindows = opDay.windows;
      }
    }

    if (applicableWindows.length === 0) {
      violations.push({
        id: `STORE_CLOSED_SHIFT_ASSIGNED-${s.id}`,
        severity: 'error',
        code: 'STORE_CLOSED_SHIFT_ASSIGNED',
        message: `Ανάθεση βάρδιας στις ${s.date} ενώ η επιχείρηση είναι κλειστή`,
        date: s.date,
        employeeId: s.employeeId,
      });
    } else {
      const fits = isShiftContainedInWindow(
        s.startTime,
        s.endTime,
        applicableWindows,
        undefined,
        Boolean((s as any).crossMidnight)
      );
      if (!fits) {
        violations.push({
          id: `OUTSIDE_OPERATING_WINDOW-${s.id}`,
          severity: 'error',
          code: 'OUTSIDE_OPERATING_WINDOW',
          message: `Βάρδια ${s.startTime}-${s.endTime} στις ${s.date} εκτός ωραρίου λειτουργίας`,
          date: s.date,
          employeeId: s.employeeId,
        });
      }
    }

    // Rule 6: Skills check if template defines requiredSkillsOrRoles
    const tpl = tplMap.get(s.shiftType) || [...tplMap.values()].find((t) => t.startTime === s.startTime && t.endTime === s.endTime);
    if (tpl?.requiredSkillsOrRoles && tpl.requiredSkillsOrRoles.length > 0) {
      const empSkills = new Set(Array.isArray(emp.skills) ? emp.skills : []);
      const hasAll = tpl.requiredSkillsOrRoles.every((r) => empSkills.has(r) || emp.scheduleRole === r);
      if (!hasAll) {
        violations.push({
          id: `SKILL_REQUIREMENT_UNMET-${s.id}`,
          severity: 'error',
          code: 'SKILL_REQUIREMENT_UNMET',
          message: `Υπάλληλος ${s.employeeId} δεν διαθέτει τα απαιτούμενα skills για τη βάρδια στις ${s.date}`,
          date: s.date,
          employeeId: s.employeeId,
        });
      }
    }

    // Indexing
    const empDateKey = `${s.employeeId}:${s.date}`;
    if (!shiftsByEmpDate.has(empDateKey)) shiftsByEmpDate.set(empDateKey, []);
    shiftsByEmpDate.get(empDateKey)!.push(s);

    if (!shiftsByEmp.has(s.employeeId)) shiftsByEmp.set(s.employeeId, []);
    shiftsByEmp.get(s.employeeId)!.push(s);

    if (!datesByEmp.has(s.employeeId)) datesByEmp.set(s.employeeId, new Set());
    datesByEmp.get(s.employeeId)!.add(s.date);
  }

  // Rule 7 & 8: Double Shifts & Overlapping Shifts on Same Day
  for (const [empDateKey, dayShifts] of shiftsByEmpDate.entries()) {
    if (dayShifts.length > 1) {
      const [empId, date] = empDateKey.split(':');
      violations.push({
        id: `DOUBLE_SHIFT-${empDateKey}`,
        severity: 'error',
        code: 'DOUBLE_SHIFT',
        message: `Διπλή βάρδια για τον εργαζόμενο ${empId} στις ${date}`,
        date,
        employeeId: empId,
      });
    }
  }

  // Rule 9: Daily Working Hours
  if (config.complianceRules?.maxDailyWorkingHours) {
    const maxDaily = config.complianceRules.maxDailyWorkingHours;
    for (const [empDateKey, dayShifts] of shiftsByEmpDate.entries()) {
      let totalDailyHours = 0;
      for (const s of dayShifts) {
        const tpl = tplMap.get(s.shiftType) || [...tplMap.values()].find((t) => t.startTime === s.startTime && t.endTime === s.endTime);
        const dur = tpl?.durationHours || deriveShiftDurationHours(s.startTime, s.endTime);
        totalDailyHours += dur;
      }
      if (totalDailyHours > maxDaily) {
        const [empId, date] = empDateKey.split(':');
        violations.push({
          id: `DAILY_HOURS_EXCEEDED-${empDateKey}`,
          severity: 'error',
          code: 'DAILY_HOURS_EXCEEDED',
          message: `Υπέρβαση ημερήσιου ορίου (${totalDailyHours}h > ${maxDaily}h) για ${empId} στις ${date}`,
          date,
          employeeId: empId,
        });
      }
    }
  }

  // Rule 10: Weekly Standard Hours & Min Days Off Per Week
  const minDaysOff = config.complianceRules?.minDaysOffPerWeek || 1;
  const maxWeeklyHours = config.complianceRules?.maxWeeklyStandardHours;

  const weeks = new Set<string>();
  for (const d of eachDateInclusive(startDate, endDate)) {
    weeks.add(getMondayStart(d));
  }

  for (const weekStart of weeks) {
    const weekDates = eachDateInclusive(weekStart, addDays(weekStart, 6));
    const weekSet = new Set(weekDates);

    for (const emp of validEmployees) {
      if (emp.isEnabled === false) continue;
      const empShifts = (shiftsByEmp.get(emp.employeeId) || []).filter((s) => weekSet.has(s.date));
      const workedDatesInWeek = new Set(empShifts.map((s) => s.date));

      // Min Days Off (workingDays <= 7 - minDaysOff)
      const maxAllowedWorkingDays = 7 - minDaysOff;
      if (workedDatesInWeek.size > maxAllowedWorkingDays) {
        violations.push({
          id: `MIN_DAYS_OFF_VIOLATION-${emp.employeeId}-${weekStart}`,
          severity: 'error',
          code: 'MIN_DAYS_OFF_VIOLATION',
          message: `Παραβίαση ελάχιστων ρεπό: ${emp.employeeId} εργάζεται ${workedDatesInWeek.size} ημέρες στην εβδομάδα ${weekStart} (επιτρεπτές: ${maxAllowedWorkingDays})`,
          employeeId: emp.employeeId,
        });
      }

      // Max Weekly Standard Hours
      if (maxWeeklyHours) {
        let weeklyHours = 0;
        for (const s of empShifts) {
          const tpl = tplMap.get(s.shiftType) || [...tplMap.values()].find((t) => t.startTime === s.startTime && t.endTime === s.endTime);
          const dur = tpl?.durationHours || deriveShiftDurationHours(s.startTime, s.endTime);
          weeklyHours += dur;
        }
        if (weeklyHours > maxWeeklyHours) {
          violations.push({
            id: `WEEKLY_HOURS_EXCEEDED-${emp.employeeId}-${weekStart}`,
            severity: 'error',
            code: 'WEEKLY_HOURS_EXCEEDED',
            message: `Υπέρβαση εβδομαδιαίων ωρών (${weeklyHours}h > ${maxWeeklyHours}h) για ${emp.employeeId} στην εβδομάδα ${weekStart}`,
            employeeId: emp.employeeId,
          });
        }
      }
    }
  }

  // Rule 11: Rest Turnaround Intervals
  if (config.complianceRules?.minRestIntervalBetweenShiftsHours && config.complianceRules.preventClashingTurnaround !== false) {
    const minRest = config.complianceRules.minRestIntervalBetweenShiftsHours;
    for (const [empId, empShifts] of shiftsByEmp.entries()) {
      const empSorted = [...empShifts].sort(
        (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
      );
      for (let i = 0; i < empSorted.length - 1; i++) {
        const s1 = empSorted[i];
        const s2 = empSorted[i + 1];
        const rest = calculateRestHoursBetweenShifts(
          s1.date,
          s1.startTime,
          s1.endTime,
          Boolean((s1 as any).crossMidnight),
          s2.date,
          s2.startTime,
          s2.endTime,
          Boolean((s2 as any).crossMidnight)
        );
        if (rest < minRest) {
          violations.push({
            id: `REST_INTERVAL_VIOLATED-${s1.id}-${s2.id}`,
            severity: 'error',
            code: 'REST_INTERVAL_VIOLATED',
            message: `Ανεπαρκής ανάπαυση (${rest.toFixed(1)}h < ${minRest}h) για τον υπάλληλο ${empId} μεταξύ ${s1.date} και ${s2.date}`,
            date: s2.date,
            employeeId: empId,
          });
        }
      }
    }
  }

  // Rule 12: Max Consecutive Working Days
  if (config.complianceRules?.maxConsecutiveWorkingDays) {
    const maxConsecutive = config.complianceRules.maxConsecutiveWorkingDays;
    for (const [empId, datesSet] of datesByEmp.entries()) {
      let streak = 0;
      for (const d of eachDateInclusive(startDate, endDate)) {
        if (datesSet.has(d)) {
          streak++;
          if (streak > maxConsecutive) {
            violations.push({
              id: `MAX_CONSECUTIVE_DAYS_EXCEEDED-${empId}-${d}`,
              severity: 'error',
              code: 'MAX_CONSECUTIVE_DAYS_EXCEEDED',
              message: `Υπέρβαση συνεχόμενων ημερών εργασίας (${streak} > ${maxConsecutive}) για ${empId} στις ${d}`,
              date: d,
              employeeId: empId,
            });
          }
        } else {
          streak = 0;
        }
      }
    }
  }

  return { valid: violations.length === 0, violations };
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
  const weeklyDaysMap: Record<string, Record<string, Set<string>>> = {};
  const consecutiveDaysMap: Record<string, number> = {};
  let lastSundayEmpId = input.previousSundayEmployeeId;

  for (const emp of activeEmployees) {
    shiftsPerEmp[emp.employeeId] = 0;
    hoursPerEmp[emp.employeeId] = 0;
    sundaysPerEmp[emp.employeeId] = 0;
    consecutiveDaysMap[emp.employeeId] = 0;
  }

  // Pre-bind Manual Overrides with Safety Validation
  for (const manual of manualOverrides) {
    if (!manual || !manual.employeeId) continue;
    shifts.push(manual);
    const empId = manual.employeeId;
    shiftsPerEmp[empId] = (shiftsPerEmp[empId] || 0) + 1;
    const duration = deriveShiftDurationHours(manual.startTime || '08:00', manual.endTime || '16:00') || 8.0;
    hoursPerEmp[empId] = (hoursPerEmp[empId] || 0) + duration;
    const weekKey = getMondayStart(manual.date);
    if (!weeklyHoursMap[weekKey]) weeklyHoursMap[weekKey] = {};
    if (!weeklyDaysMap[weekKey]) weeklyDaysMap[weekKey] = {};
    if (!weeklyDaysMap[weekKey][empId]) weeklyDaysMap[weekKey][empId] = new Set();
    weeklyHoursMap[weekKey][empId] = (weeklyHoursMap[weekKey][empId] || 0) + duration;
    weeklyDaysMap[weekKey][empId].add(manual.date);
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
    if (!weeklyDaysMap[weekKey]) weeklyDaysMap[weekKey] = {};

    // Sort slots by priority (MRV heuristic: hard roles/skills first)
    daySlots.sort((a, b) => a.priority - b.priority || a.slotId.localeCompare(b.slotId));

    const workedToday = new Set<string>();
    for (const s of shifts.filter((s) => s.date === date)) {
      workedToday.add(s.employeeId);
    }

    for (const slot of daySlots) {
      // 1. Manual override slot that was already assigned
      if (slot.isLockedManualOverride && slot.assignedEmployeeId) {
        workedToday.add(slot.assignedEmployeeId);
        continue;
      }

      // 2. Fixed Sunday Assignment Handling
      if (slot.sundayMode === 'FIXED_ASSIGNMENT') {
        const targetEmpId = slot.fixedEmployeeId;
        const targetEmp = activeEmployees.find((e) => e.employeeId === targetEmpId);

        if (!targetEmp) {
          // Fixed employee does not exist or is disabled
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
            id: `FIXED_EMPLOYEE_NOT_FOUND-${date}-${slot.slotId}`,
            severity: 'error',
            code: 'FIXED_EMPLOYEE_NOT_FOUND',
            message: `Ο σταθερός υπάλληλος Κυριακής (${targetEmpId || 'none'}) δεν βρέθηκε ή είναι ανενεργός.`,
            date,
            employeeId: targetEmpId,
          });
          continue;
        }

        const streak = consecutiveDaysMap[targetEmp.employeeId] || 0;
        const currentWeeklyHours = weeklyHoursMap[weekKey][targetEmp.employeeId] || 0;
        const weeklyDaysSet = weeklyDaysMap[weekKey][targetEmp.employeeId] || new Set();

        const eligibility = evaluateEmployeeEligibility({
          employee: targetEmp,
          date,
          slot,
          absences,
          existingShifts: shifts,
          complianceRules: config.complianceRules,
          consecutiveDaysWorked: streak,
          weeklyHoursWorked: currentWeeklyHours,
          weeklyDaysWorked: weeklyDaysSet.size,
        });

        if (eligibility.eligible) {
          const fixedShift: GeneratedShift = {
            id: `shift-${slot.slotId}-${targetEmp.employeeId}`,
            date,
            employeeId: targetEmp.employeeId,
            employeeName: targetEmp.fullName,
            scheduleRole: targetEmp.scheduleRole,
            shiftType: slot.template.shiftType as ShiftType,
            startTime: slot.template.startTime,
            endTime: slot.template.endTime,
            source: 'SUNDAY_ROTATION',
          };
          shifts.push(fixedShift);
          workedToday.add(targetEmp.employeeId);
          shiftsPerEmp[targetEmp.employeeId] = (shiftsPerEmp[targetEmp.employeeId] || 0) + 1;
          hoursPerEmp[targetEmp.employeeId] = (hoursPerEmp[targetEmp.employeeId] || 0) + slot.template.durationHours;
          weeklyHoursMap[weekKey][targetEmp.employeeId] =
            (weeklyHoursMap[weekKey][targetEmp.employeeId] || 0) + slot.template.durationHours;
          if (!weeklyDaysMap[weekKey][targetEmp.employeeId]) weeklyDaysMap[weekKey][targetEmp.employeeId] = new Set();
          weeklyDaysMap[weekKey][targetEmp.employeeId].add(date);
          sundaysPerEmp[targetEmp.employeeId] = (sundaysPerEmp[targetEmp.employeeId] || 0) + 1;
          lastSundayEmpId = targetEmp.employeeId;
        } else {
          gaps.push({
            id: `gap-${slot.slotId}`,
            date,
            shiftType: slot.template.shiftType as ShiftType,
            startTime: slot.template.startTime,
            endTime: slot.template.endTime,
            missingRole: slot.requiredRole as any,
            reason: 'UNAVAILABLE',
          });
          warnings.push({
            id: `UNRESOLVED_GAP-${date}-${slot.template.id}-${slot.slotId}`,
            severity: 'error',
            code: 'UNRESOLVED_GAP',
            message: `Αδυναμία σταθερής ανάθεσης Κυριακής στον ${targetEmp.fullName} (${eligibility.reason})`,
            date,
            employeeId: targetEmp.employeeId,
          });
        }
        continue;
      }

      // 3. Filter candidates with hard eligibility checks
      const eligibleCandidates = activeEmployees.filter((emp) => {
        if (workedToday.has(emp.employeeId)) return false;

        const streak = consecutiveDaysMap[emp.employeeId] || 0;
        const currentWeeklyHours = weeklyHoursMap[weekKey][emp.employeeId] || 0;
        const weeklyDaysSet = weeklyDaysMap[weekKey][emp.employeeId] || new Set();

        const check = evaluateEmployeeEligibility({
          employee: emp,
          date,
          slot,
          absences,
          existingShifts: shifts,
          complianceRules: config.complianceRules,
          consecutiveDaysWorked: streak,
          weeklyHoursWorked: currentWeeklyHours,
          weeklyDaysWorked: weeklyDaysSet.size,
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

      if (!weeklyDaysMap[weekKey][bestCandidate.employeeId]) weeklyDaysMap[weekKey][bestCandidate.employeeId] = new Set();
      weeklyDaysMap[weekKey][bestCandidate.employeeId].add(date);

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
  // Stage D: Independent Defense-in-Depth Post-Generation Compliance Validator
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

  // Run full independent rulebook validation
  const independentValidation = validateGeneratedScheduleCompliance({
    config,
    employees: rawEmployees,
    absences,
    shifts,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  for (const v of independentValidation.violations) {
    violations.push(v);
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


