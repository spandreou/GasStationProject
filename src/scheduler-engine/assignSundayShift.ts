import { DEFAULT_SHIFT_DEFINITIONS } from './constants';
import { eachDateInclusive, getWeekday } from './dateUtils';
import { isEmployeeAvailable } from './availability';
import type { EmployeeAbsence, EmployeeScheduleConfig, GeneratedShift, ScheduleWarning } from './types';

function sundayPriority(employee: EmployeeScheduleConfig): number {
  if (employee.scheduleRole === 'FLEX_A') return 0;
  if (employee.scheduleRole === 'FLEX_B') return 1;
  if (employee.scheduleRole === 'CORE_A') return 2;
  if (employee.scheduleRole === 'CORE_B') return 3;
  return 4;
}

function isSundayCandidate(employee: EmployeeScheduleConfig, date: string, absences: EmployeeAbsence[]): boolean {
  if (!employee.participatesInSundayRotation) return false;
  if (employee.scheduleRole.startsWith('EXTRA') && employee.extraMode !== 'ACTIVE_SEASONAL') return false;
  return isEmployeeAvailable({
    employeeId: employee.employeeId,
    date,
    shiftType: 'SUNDAY_12H',
    absences,
    employeeConfig: employee,
  });
}

export function assignSundayShift(params: {
  startDate: string;
  endDate: string;
  shifts: GeneratedShift[];
  employees: EmployeeScheduleConfig[];
  absences: EmployeeAbsence[];
  previousSundayEmployeeId?: string;
}): { shifts: GeneratedShift[]; warnings: ScheduleWarning[] } {
  const shifts = [...params.shifts];
  const warnings: ScheduleWarning[] = [];
  let lastSundayEmployeeId = params.previousSundayEmployeeId || '';

  for (const date of eachDateInclusive(params.startDate, params.endDate)) {
    if (getWeekday(date) !== 'SUNDAY') continue;
    const candidates = params.employees
      .filter((employee) => isSundayCandidate(employee, date, params.absences))
      .sort((a, b) => sundayPriority(a) - sundayPriority(b) || a.employeeId.localeCompare(b.employeeId));

    const preferred = candidates.find((employee) => employee.employeeId !== lastSundayEmployeeId);
    const selected = preferred || candidates[0];
    if (!selected) {
      warnings.push({
        id: `sunday-unresolved-${date}`,
        severity: 'error',
        code: 'SUNDAY_UNRESOLVED',
        message: `Δεν βρέθηκε διαθέσιμος εργαζόμενος για Κυριακή ${date}.`,
        date,
      });
      continue;
    }

    if (selected.employeeId === lastSundayEmployeeId) {
      warnings.push({
        id: `consecutive-sunday-${date}-${selected.employeeId}`,
        severity: 'warning',
        code: 'CONSECUTIVE_SUNDAY',
        message: `Ο ίδιος εργαζόμενος τοποθετήθηκε σε συνεχόμενη Κυριακή στις ${date}.`,
        date,
        employeeId: selected.employeeId,
      });
    }

    const definition = DEFAULT_SHIFT_DEFINITIONS.SUNDAY_12H;
    shifts.push({
      id: `sunday-${date}-${selected.employeeId}`,
      date,
      employeeId: selected.employeeId,
      employeeName: selected.fullName,
      scheduleRole: selected.scheduleRole,
      shiftType: 'SUNDAY_12H',
      startTime: definition.startTime,
      endTime: definition.endTime,
      source: 'SUNDAY_ROTATION',
    });
    lastSundayEmployeeId = selected.employeeId;
  }

  return { shifts, warnings };
}
