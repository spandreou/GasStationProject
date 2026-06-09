import { assignSundayShift } from './assignSundayShift.ts';
import { applyAbsences } from './applyAbsences.ts';
import { fillScheduleGaps } from './fillScheduleGaps.ts';
import { generateBaseSchedule } from './generateBaseSchedule.ts';
import { normalizeInput } from './normalizeInput.ts';
import { resolveScheduleRoles } from './resolveRoles.ts';
import { validateSchedule } from './validateSchedule.ts';
import type { GenerateScheduleInput, GenerateScheduleResult } from './types.ts';

export function generateSchedule(input: GenerateScheduleInput): GenerateScheduleResult {
  const normalized = normalizeInput(input);
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
      (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.employeeId.localeCompare(b.employeeId),
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
