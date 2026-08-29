import { DEFAULT_SHIFT_DEFINITIONS } from './constants.ts';
import { eachDateInclusive, getWeekday, parseIsoDate } from './dateUtils.ts';
import { isEmployeeAvailable } from './availability.ts';
import type { EmployeeAbsence, EmployeeScheduleConfig, GeneratedShift, ScheduleWarning } from './types.ts';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const SUNDAY_ROTATION_EPOCH = '1970-01-04';
const SUNDAY_ROLE_ORDER: Record<string, number> = {
  CORE_A: 0,
  CORE_B: 1,
  FLEX_A: 2,
  FLEX_B: 3,
  EXTRA_A: 4,
  EXTRA_B: 5,
};

function sundayRotationRank(employee: EmployeeScheduleConfig): number {
  return SUNDAY_ROLE_ORDER[employee.scheduleRole] ?? 99;
}

function sundayOrdinal(date: string): number {
  const diff = parseIsoDate(date).getTime() - parseIsoDate(SUNDAY_ROTATION_EPOCH).getTime();
  return Math.floor(diff / MS_PER_WEEK);
}

function isSundayRotationMember(employee: EmployeeScheduleConfig, date: string): boolean {
  if (!employee.participatesInSundayRotation) return false;
  if (employee.isEnabled === false) return false;
  if (employee.canWorkSunday === false) return false;
  if (employee.scheduleRole.startsWith('EXTRA') && employee.extraMode === 'DISABLED') return false;
  if (employee.activeFrom && date < employee.activeFrom) return false;
  if (employee.activeTo && date > employee.activeTo) return false;
  return true;
}

function sortSundayRotation(a: EmployeeScheduleConfig, b: EmployeeScheduleConfig): number {
  return (
    sundayRotationRank(a) - sundayRotationRank(b) ||
    a.fullName.localeCompare(b.fullName, 'el') ||
    a.employeeId.localeCompare(b.employeeId)
  );
}

function rotateFrom<T>(items: T[], startIndex: number): T[] {
  if (!items.length) return [];
  const normalizedIndex = ((startIndex % items.length) + items.length) % items.length;
  return [...items.slice(normalizedIndex), ...items.slice(0, normalizedIndex)];
}

function isSundayCandidate(employee: EmployeeScheduleConfig, date: string, absences: EmployeeAbsence[]): boolean {
  if (!isSundayRotationMember(employee, date)) return false;
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
  avoidConsecutiveSundays?: boolean;
}): { shifts: GeneratedShift[]; warnings: ScheduleWarning[] } {
  const shifts = [...params.shifts];
  const warnings: ScheduleWarning[] = [];
  let lastSundayEmployeeId = params.previousSundayEmployeeId || '';
  const avoidConsecutiveSundays = params.avoidConsecutiveSundays !== false;

  for (const date of eachDateInclusive(params.startDate, params.endDate)) {
    if (getWeekday(date) !== 'SUNDAY') continue;
    const rotationPool = params.employees
      .filter((employee) => isSundayRotationMember(employee, date))
      .sort(sortSundayRotation);
    const orderedPool = rotateFrom(rotationPool, sundayOrdinal(date));
    const candidates = orderedPool.filter((employee) => isSundayCandidate(employee, date, params.absences));

    const preferred = avoidConsecutiveSundays
      ? candidates.find((employee) => employee.employeeId !== lastSundayEmployeeId)
      : candidates[0];
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

    if (avoidConsecutiveSundays && selected.employeeId === lastSundayEmployeeId) {
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
