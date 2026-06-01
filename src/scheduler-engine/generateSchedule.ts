import { assignSundayShift } from './assignSundayShift';
import { applyAbsences } from './applyAbsences';
import { fillScheduleGaps } from './fillScheduleGaps';
import { generateBaseSchedule } from './generateBaseSchedule';
import { normalizeInput } from './normalizeInput';
import { resolveScheduleRoles } from './resolveRoles';
import { validateSchedule } from './validateSchedule';
import type { GenerateScheduleInput, GenerateScheduleResult } from './types';

export function generateSchedule(input: GenerateScheduleInput): GenerateScheduleResult {
  const normalized = normalizeInput(input);
  const resolvedRoles = resolveScheduleRoles(normalized.employees);
  const base = generateBaseSchedule({
    startDate: normalized.startDate,
    endDate: normalized.endDate,
    resolvedRoles,
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
