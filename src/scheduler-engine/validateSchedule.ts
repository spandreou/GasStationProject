import { EXTRA_ROLES, REQUIRED_BASE_ROLES } from './constants';
import { eachDateInclusive, getWeekday, isDateInRange } from './dateUtils';
import { getAffectingAbsence } from './availability';
import type {
  EmployeeAbsence,
  EmployeeScheduleConfig,
  GeneratedShift,
  ScheduleGap,
  ScheduleWarning,
} from './types';

function violation(code: string, message: string, date?: string, employeeId?: string): ScheduleWarning {
  return { id: `${code}-${date || 'global'}-${employeeId || 'all'}`, severity: 'error', code, message, date, employeeId };
}

function shiftsOn(shifts: GeneratedShift[], date: string): GeneratedShift[] {
  return shifts.filter((shift) => shift.date === date);
}

function countType(shifts: GeneratedShift[], date: string, shiftType: GeneratedShift['shiftType']): number {
  return shiftsOn(shifts, date).filter((shift) => shift.shiftType === shiftType).length;
}

function hasGapForDate(gaps: ScheduleGap[], date: string): boolean {
  return gaps.some((gap) => gap.date === date);
}

export function validateSchedule(params: {
  startDate: string;
  endDate: string;
  employees: EmployeeScheduleConfig[];
  absences: EmployeeAbsence[];
  shifts: GeneratedShift[];
  unresolvedGaps: ScheduleGap[];
  warnings: ScheduleWarning[];
}): { valid: boolean; violations: ScheduleWarning[] } {
  const violations: ScheduleWarning[] = [];
  const enabledEmployees = params.employees.filter((employee) => employee.isEnabled !== false);
  if (enabledEmployees.length < 4 || enabledEmployees.length > 6) {
    violations.push(violation('INVALID_EMPLOYEE_COUNT', 'Το πρόγραμμα χρειάζεται 4 έως 6 ενεργούς εργαζόμενους.'));
  }

  for (const role of REQUIRED_BASE_ROLES) {
    const count = enabledEmployees.filter((employee) => employee.scheduleRole === role).length;
    if (count !== 1) violations.push(violation('INVALID_ROLE_COUNT', `Ο ρόλος ${role} πρέπει να έχει ακριβώς έναν εργαζόμενο.`));
  }

  for (const role of EXTRA_ROLES) {
    const count = enabledEmployees.filter((employee) => employee.scheduleRole === role).length;
    if (count > 1) violations.push(violation('INVALID_EXTRA_ROLE_COUNT', `Ο ρόλος ${role} είναι προαιρετικός και μοναδικός.`));
  }

  const employeesById = new Map(params.employees.map((employee) => [employee.employeeId, employee]));
  const seenEmployeeDates = new Set<string>();
  const sundayShifts = params.shifts.filter((shift) => shift.shiftType === 'SUNDAY_12H').sort((a, b) => a.date.localeCompare(b.date));

  for (const shift of params.shifts) {
    const employee = employeesById.get(shift.employeeId);
    if (!employee) {
      violations.push(violation('UNKNOWN_EMPLOYEE', 'Βάρδια με άγνωστο εργαζόμενο.', shift.date, shift.employeeId));
      continue;
    }

    const employeeDateKey = `${shift.date}:${shift.employeeId}`;
    if (seenEmployeeDates.has(employeeDateKey)) {
      violations.push(violation('DOUBLE_SHIFT', 'Ο εργαζόμενος έχει δύο βάρδιες την ίδια ημέρα.', shift.date, shift.employeeId));
    }
    seenEmployeeDates.add(employeeDateKey);

    if (employee.scheduleRole.startsWith('EXTRA')) {
      if (employee.extraMode === 'DISABLED') {
        violations.push(violation('DISABLED_EXTRA_WORKED', 'Απενεργοποιημένος extra εργαζόμενος έχει βάρδια.', shift.date, shift.employeeId));
      }
      if (employee.extraMode === 'SUBSTITUTE_ONLY' && shift.source !== 'ABSENCE_REPLACEMENT' && shift.source !== 'MANUAL_OVERRIDE') {
        violations.push(violation('SUBSTITUTE_ONLY_BASE_SHIFT', 'Extra substitute-only μπήκε χωρίς gap/replacement reason.', shift.date, shift.employeeId));
      }
      if (employee.extraMode === 'ACTIVE_SEASONAL' && !isDateInRange(shift.date, employee.activeFrom, employee.activeTo)) {
        violations.push(violation('SEASONAL_OUT_OF_RANGE', 'Seasonal extra μπήκε εκτός ενεργού περιόδου.', shift.date, shift.employeeId));
      }
    }

    if (getAffectingAbsence({ employeeId: shift.employeeId, date: shift.date, shiftType: shift.shiftType, absences: params.absences })) {
      violations.push(violation('ABSENT_EMPLOYEE_WORKED', 'Υπάλληλος με άδεια/ασθένεια έχει βάρδια.', shift.date, shift.employeeId));
    }

    if ((shift.scheduleRole === 'CORE_A' || shift.scheduleRole === 'CORE_B') && shift.shiftType === 'INTERMEDIATE') {
      violations.push(violation('CORE_INTERMEDIATE', 'CORE_A/CORE_B δεν επιτρέπεται να μπει ενδιάμεσος.', shift.date, shift.employeeId));
    }
  }

  for (const date of eachDateInclusive(params.startDate, params.endDate)) {
    const weekday = getWeekday(date);
    if (weekday === 'SUNDAY') {
      const dayShifts = shiftsOn(params.shifts, date);
      if (dayShifts.length !== 1 || dayShifts[0]?.shiftType !== 'SUNDAY_12H') {
        violations.push(violation('INVALID_SUNDAY_COVERAGE', 'Η Κυριακή πρέπει να έχει ακριβώς μία βάρδια.', date));
      } else if (dayShifts[0].startTime !== '08:00' || dayShifts[0].endTime !== '20:00') {
        violations.push(violation('INVALID_SUNDAY_HOURS', 'Η Κυριακή πρέπει να είναι 08:00-20:00.', date, dayShifts[0].employeeId));
      }
      continue;
    }

    if (hasGapForDate(params.unresolvedGaps, date)) continue;
    const dayShifts = shiftsOn(params.shifts, date);
    const isFullCoverageDay = weekday === 'MONDAY' || weekday === 'SATURDAY' || (weekday === 'FRIDAY' && dayShifts.length >= 4);
    if (isFullCoverageDay) {
      if (countType(params.shifts, date, 'MORNING') !== 2 || countType(params.shifts, date, 'AFTERNOON') !== 2 || countType(params.shifts, date, 'INTERMEDIATE') !== 0) {
        violations.push(violation('INVALID_FULL_COVERAGE', 'Ημέρα πλήρους κάλυψης πρέπει να έχει 2 πρωί και 2 απόγευμα.', date));
      }
    } else {
      if (countType(params.shifts, date, 'MORNING') !== 1 || countType(params.shifts, date, 'INTERMEDIATE') !== 1 || countType(params.shifts, date, 'AFTERNOON') !== 1) {
        violations.push(violation('INVALID_WEEKDAY_COVERAGE', 'Τρίτη-Παρασκευή πρέπει να έχουν 1 πρωί, 1 ενδιάμεσο, 1 απόγευμα.', date));
      }
    }

    const coreA = shiftsOn(params.shifts, date).find((shift) => shift.scheduleRole === 'CORE_A');
    const coreB = shiftsOn(params.shifts, date).find((shift) => shift.scheduleRole === 'CORE_B');
    if (coreA && coreB && coreA.shiftType === coreB.shiftType) {
      violations.push(violation('CORE_SAME_SHIFT', 'CORE_A και CORE_B δεν πρέπει να είναι ίδια βάρδια.', date));
    }
  }

  for (let index = 1; index < sundayShifts.length; index += 1) {
    if (
      sundayShifts[index].employeeId === sundayShifts[index - 1].employeeId &&
      !params.warnings.some((warning) => warning.code === 'CONSECUTIVE_SUNDAY' && warning.date === sundayShifts[index].date)
    ) {
      violations.push(violation('CONSECUTIVE_SUNDAY_WITHOUT_WARNING', 'Συνεχόμενη Κυριακή χωρίς warning.', sundayShifts[index].date, sundayShifts[index].employeeId));
    }
  }

  for (const gap of params.unresolvedGaps) {
    if (!params.warnings.some((warning) => warning.code === 'UNRESOLVED_GAP' && warning.date === gap.date)) {
      violations.push(violation('UNRESOLVED_GAP_WITHOUT_WARNING', 'Ακάλυπτη βάρδια χωρίς warning.', gap.date, gap.originalEmployeeId));
    }
  }

  return { valid: violations.length === 0, violations };
}
