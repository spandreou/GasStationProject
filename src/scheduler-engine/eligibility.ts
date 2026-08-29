import { getWeekday, isDateInRange, timeToMinutes } from './dateUtils.ts';
import { getAffectingAbsence } from './availability.ts';
import type { EmployeeAbsence, EmployeeScheduleConfig, GeneratedShift, ShiftType } from './types.ts';
import type { RestAndComplianceRules, ShiftTemplateConfigV2 } from './configV2.ts';

export type EligibilityResult =
  | { eligible: true; reason: 'AVAILABLE' }
  | { eligible: false; reason: 'ARCHIVED' | 'OUT_OF_SEASON' | 'ABSENT' | 'FIXED_DAY_OFF' | 'INCAPABLE' | 'ROLE_RESTRICTED' | 'DOUBLE_SHIFT' | 'REST_VIOLATION'; details?: string };

export function evaluateEmployeeEligibility(params: {
  employee: EmployeeScheduleConfig;
  date: string;
  shiftTemplate: ShiftTemplateConfigV2;
  absences: EmployeeAbsence[];
  existingShifts: GeneratedShift[];
  complianceRules?: RestAndComplianceRules;
}): EligibilityResult {
  const { employee, date, shiftTemplate, absences, existingShifts, complianceRules } = params;

  // 1. Lifecycle Status
  if (employee.isEnabled === false) {
    return { eligible: false, reason: 'ARCHIVED' };
  }

  // 2. Seasonal Range
  if (employee.activeFrom && date < employee.activeFrom) {
    return { eligible: false, reason: 'OUT_OF_SEASON', details: `Active from ${employee.activeFrom}` };
  }
  if (employee.activeTo && date > employee.activeTo) {
    return { eligible: false, reason: 'OUT_OF_SEASON', details: `Active to ${employee.activeTo}` };
  }
  if (employee.scheduleRole?.startsWith('EXTRA') && employee.extraMode === 'ACTIVE_SEASONAL') {
    if (!isDateInRange(date, employee.activeFrom, employee.activeTo)) {
      return { eligible: false, reason: 'OUT_OF_SEASON' };
    }
  }
  if (employee.scheduleRole?.startsWith('EXTRA') && employee.extraMode === 'DISABLED') {
    return { eligible: false, reason: 'ARCHIVED' };
  }

  // 3. Approved Absence Check
  const affectingAbsence = getAffectingAbsence({
    employeeId: employee.employeeId,
    date,
    shiftType: shiftTemplate.shiftType as ShiftType,
    absences,
  });
  if (affectingAbsence) {
    return { eligible: false, reason: 'ABSENT', details: affectingAbsence.type };
  }

  // 4. Fixed Day Off
  const weekday = getWeekday(date);
  if (employee.fixedDayOff && employee.fixedDayOff === weekday) {
    return { eligible: false, reason: 'FIXED_DAY_OFF' };
  }

  // 5. Capability / Shift Preference
  if (shiftTemplate.shiftType === 'MORNING' && employee.canWorkMorning === false) {
    return { eligible: false, reason: 'INCAPABLE' };
  }
  if (shiftTemplate.shiftType === 'INTERMEDIATE' && employee.canWorkIntermediate === false) {
    return { eligible: false, reason: 'INCAPABLE' };
  }
  if (shiftTemplate.shiftType === 'AFTERNOON' && employee.canWorkAfternoon === false) {
    return { eligible: false, reason: 'INCAPABLE' };
  }
  if ((shiftTemplate.shiftType === 'SPECIAL' || weekday === 'SUNDAY') && employee.canWorkSunday === false) {
    return { eligible: false, reason: 'INCAPABLE' };
  }

  // 6. Role Restrict (Core A/B cannot work Intermediate)
  if ((employee.scheduleRole === 'CORE_A' || employee.scheduleRole === 'CORE_B') && shiftTemplate.shiftType === 'INTERMEDIATE') {
    return { eligible: false, reason: 'ROLE_RESTRICTED' };
  }

  // 7. Double Shift on Same Date
  const hasShiftOnDate = existingShifts.some(
    (s) => s.date === date && s.employeeId === employee.employeeId
  );
  if (hasShiftOnDate) {
    return { eligible: false, reason: 'DOUBLE_SHIFT' };
  }

  // 8. Turnaround Rest Interval Violation (if prior day shift exists)
  if (complianceRules && complianceRules.preventClashingTurnaround) {
    const prevDate = getPreviousDate(date);
    const prevShift = existingShifts.find((s) => s.date === prevDate && s.employeeId === employee.employeeId);
    if (prevShift) {
      const restMinutes = (1440 - timeToMinutes(prevShift.endTime)) + timeToMinutes(shiftTemplate.startTime);
      const minRequiredMinutes = complianceRules.minRestIntervalBetweenShiftsHours * 60;
      if (restMinutes < minRequiredMinutes) {
        return { eligible: false, reason: 'REST_VIOLATION', details: `${restMinutes / 60}h rest < ${complianceRules.minRestIntervalBetweenShiftsHours}h` };
      }
    }
  }

  return { eligible: true, reason: 'AVAILABLE' };
}

function getPreviousDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
