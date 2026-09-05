import { assignSundayShift } from './assignSundayShift.ts';
import { applyAbsences } from './applyAbsences.ts';
import { fillScheduleGaps } from './fillScheduleGaps.ts';
import { generateBaseSchedule } from './generateBaseSchedule.ts';
import { normalizeInput } from './normalizeInput.ts';
import { resolveScheduleRoles } from './resolveRoles.ts';
import { validateSchedule } from './validateSchedule.ts';
import { generateScheduleV2 } from './engineV2.ts';
import { normalizeSchedulerConfig } from './configV2.ts';
import type { GenerateScheduleInput, GenerateScheduleResult } from './types.ts';

export function generateSchedule(input: GenerateScheduleInput): GenerateScheduleResult {
  const normalized = normalizeInput(input);
  const enabledEmployees = normalized.employees.filter((e) => e.isEnabled !== false);

  // 1. If explicit V2 SchedulerConfig is provided, route directly to V2 Engine
  const explicitV2Config =
    normalized.schedulerConfig?.schemaVersion === 2
      ? normalized.schedulerConfig
      : normalized.rules?.schemaVersion === 2
      ? normalized.rules
      : normalized.schedulerConfig;

  if (explicitV2Config) {
    const v2Result = generateScheduleV2({
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      employees: normalized.employees,
      absences: normalized.absences,
      config: explicitV2Config,
      manualOverrides: normalized.manualOverrides,
      previousSundayEmployeeId: normalized.previousSundayEmployeeId,
    });

    const resolvedRoles = resolveScheduleRoles(normalized.employees);

    return {
      shifts: v2Result.shifts,
      warnings: v2Result.warnings,
      unresolvedGaps: v2Result.unresolvedGaps,
      validation: v2Result.validation,
      debug: {
        resolvedRoles,
        dayPlans: [],
      },
    };
  }

  // 2. Check if input matches legacy 4-6 Store topology
  const hasBaseRoles =
    enabledEmployees.length >= 4 &&
    enabledEmployees.length <= 6 &&
    enabledEmployees.some((e) => e.scheduleRole === 'CORE_A') &&
    enabledEmployees.some((e) => e.scheduleRole === 'CORE_B') &&
    enabledEmployees.some((e) => e.scheduleRole === 'FLEX_A') &&
    enabledEmployees.some((e) => e.scheduleRole === 'FLEX_B');

  if (hasBaseRoles) {
    // Legacy BP Kallis 100% Mathematical Equivalence Pipeline
    const resolvedRoles = resolveScheduleRoles(normalized.employees);
    const base = generateBaseSchedule({
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      resolvedRoles,
      rules: normalized.rules,
    });
    const afterAbsences = applyAbsences({
      shifts: base.shifts,
      absences: normalized.absences,
      employees: normalized.employees,
    });
    const filled = fillScheduleGaps({
      shifts: afterAbsences.shifts,
      gaps: afterAbsences.gaps,
      employees: normalized.employees,
      absences: normalized.absences,
    });
    const withSundays = assignSundayShift({
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      shifts: filled.shifts,
      employees: normalized.employees,
      absences: normalized.absences,
      previousSundayEmployeeId: normalized.previousSundayEmployeeId,
      avoidConsecutiveSundays: normalized.rules.avoidConsecutiveSundays,
    });
    const warnings = [...resolvedRoles.warnings, ...filled.warnings, ...withSundays.warnings];
    const validation = validateSchedule({
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      employees: normalized.employees,
      absences: normalized.absences,
      shifts: withSundays.shifts,
      unresolvedGaps: filled.unresolvedGaps,
      warnings,
    });

    return {
      shifts: [...withSundays.shifts].sort(
        (a, b) => {
          if (a.date !== b.date) return a.date < b.date ? -1 : 1;
          if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
          if (a.employeeId !== b.employeeId) return a.employeeId < b.employeeId ? -1 : 1;
          return 0;
        }
      ),
      warnings,
      unresolvedGaps: filled.unresolvedGaps,
      validation,
      debug: {
        resolvedRoles,
        dayPlans: base.dayPlans,
      },
    };
  }

  // 3. Generalized V2 Engine Pipeline for Legacy Normalization
  const v2Config = normalizeSchedulerConfig(normalized.rules, normalized.employees);
  const v2Result = generateScheduleV2({
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    employees: normalized.employees,
    absences: normalized.absences,
    config: v2Config,
    manualOverrides: normalized.manualOverrides,
    previousSundayEmployeeId: normalized.previousSundayEmployeeId,
  });

  const resolvedRoles = resolveScheduleRoles(normalized.employees);

  return {
    shifts: v2Result.shifts,
    warnings: v2Result.warnings,
    unresolvedGaps: v2Result.unresolvedGaps,
    validation: v2Result.validation,
    debug: {
      resolvedRoles,
      dayPlans: [],
    },
  };
}
