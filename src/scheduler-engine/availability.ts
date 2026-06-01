import { getWeekday, isDateInRange } from './dateUtils';
import type { AbsenceScope, EmployeeAbsence, EmployeeScheduleConfig, ShiftType } from './types';

export function absenceAffectsShift(scope: AbsenceScope, shiftType: ShiftType): boolean {
  if (scope === 'FULL_DAY') return true;
  if (scope === 'MORNING_ONLY') return shiftType === 'MORNING';
  if (scope === 'INTERMEDIATE_ONLY') return shiftType === 'INTERMEDIATE';
  if (scope === 'AFTERNOON_ONLY') return shiftType === 'AFTERNOON';
  if (scope === 'SUNDAY_12H_ONLY') return shiftType === 'SUNDAY_12H';
  return false;
}

export function getAffectingAbsence(params: {
  employeeId: string;
  date: string;
  shiftType: ShiftType;
  absences: EmployeeAbsence[];
}): EmployeeAbsence | undefined {
  return params.absences.find(
    (absence) =>
      absence.employeeId === params.employeeId &&
      isDateInRange(params.date, absence.startDate, absence.endDate) &&
      absenceAffectsShift(absence.scope, params.shiftType),
  );
}

export function canEmployeeWorkShiftType(employeeConfig: EmployeeScheduleConfig, shiftType: ShiftType): boolean {
  if (shiftType === 'MORNING') return employeeConfig.canWorkMorning !== false;
  if (shiftType === 'INTERMEDIATE') {
    if (employeeConfig.scheduleRole === 'CORE_A' || employeeConfig.scheduleRole === 'CORE_B') return false;
    return employeeConfig.canWorkIntermediate !== false;
  }
  if (shiftType === 'AFTERNOON') return employeeConfig.canWorkAfternoon !== false;
  if (shiftType === 'SUNDAY_12H') return employeeConfig.canWorkSunday !== false;
  return true;
}

export function isEmployeeAvailable(params: {
  employeeId: string;
  date: string;
  shiftType: ShiftType;
  absences: EmployeeAbsence[];
  employeeConfig: EmployeeScheduleConfig;
}): boolean {
  const { employeeConfig, date, shiftType, absences } = params;
  if (employeeConfig.isEnabled === false) return false;
  if (employeeConfig.fixedDayOff && employeeConfig.fixedDayOff === getWeekday(date)) return false;
  if (employeeConfig.scheduleRole.startsWith('EXTRA')) {
    if (employeeConfig.extraMode === 'DISABLED') return false;
    if (employeeConfig.extraMode === 'ACTIVE_SEASONAL' && !isDateInRange(date, employeeConfig.activeFrom, employeeConfig.activeTo)) {
      return false;
    }
  }
  if (!canEmployeeWorkShiftType(employeeConfig, shiftType)) return false;
  if (getAffectingAbsence({ employeeId: params.employeeId, date, shiftType, absences })) return false;
  return true;
}
