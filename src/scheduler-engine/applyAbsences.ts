import { DEFAULT_SHIFT_DEFINITIONS } from './constants.ts';
import { getWeekday } from './dateUtils.ts';
import { getAffectingAbsence } from './availability.ts';
import type { EmployeeAbsence, EmployeeScheduleConfig, GeneratedShift, ScheduleGap } from './types.ts';

export function applyAbsences(params: {
  shifts: GeneratedShift[];
  absences: EmployeeAbsence[];
  employees: EmployeeScheduleConfig[];
}): { shifts: GeneratedShift[]; gaps: ScheduleGap[] } {
  const employeesById = new Map(params.employees.map((employee) => [employee.employeeId, employee]));
  const keptShifts: GeneratedShift[] = [];
  const gaps: ScheduleGap[] = [];

  for (const shift of params.shifts) {
    const employee = employeesById.get(shift.employeeId);
    const absence = getAffectingAbsence({
      employeeId: shift.employeeId,
      date: shift.date,
      shiftType: shift.shiftType,
      absences: params.absences,
    });
    const fixedDayOffHit = Boolean(employee?.fixedDayOff && employee.fixedDayOff === getWeekday(shift.date));

    if (!absence && !fixedDayOffHit) {
      keptShifts.push(shift);
      continue;
    }

    gaps.push({
      id: `gap-${shift.date}-${shift.shiftType}-${shift.employeeId}`,
      date: shift.date,
      shiftType: shift.shiftType,
      startTime: DEFAULT_SHIFT_DEFINITIONS[shift.shiftType].startTime,
      endTime: DEFAULT_SHIFT_DEFINITIONS[shift.shiftType].endTime,
      missingRole: shift.scheduleRole,
      reason: absence ? 'ABSENCE' : 'UNAVAILABLE',
      originalEmployeeId: shift.employeeId,
      absenceId: absence?.id,
    });
  }

  return { shifts: keptShifts, gaps };
}
