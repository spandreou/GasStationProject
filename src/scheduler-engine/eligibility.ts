import { calculateRestHoursBetweenShifts, getMondayStart, getWeekday, isDateInRange } from './dateUtils.ts';
import { getAffectingAbsence } from './availability.ts';
import type { EmployeeAbsence, EmployeeScheduleConfig, GeneratedShift, ShiftType } from './types.ts';
import type { RestAndComplianceRules, ShiftTemplateConfigV2 } from './configV2.ts';
import type { DemandSlot } from './demandMatrix.ts';

export type EligibilityResult =
  | { eligible: true; reason: 'AVAILABLE' }
  | {
      eligible: false;
      reason:
        | 'ARCHIVED'
        | 'OUT_OF_SEASON'
        | 'ABSENT'
        | 'FIXED_DAY_OFF'
        | 'INCAPABLE'
        | 'ROLE_MISMATCH'
        | 'SKILL_MISMATCH'
        | 'SUNDAY_ROLE_EXCLUDED'
        | 'ROLE_RESTRICTED'
        | 'DOUBLE_SHIFT'
        | 'REST_VIOLATION'
        | 'MAX_CONSECUTIVE_DAYS_EXCEEDED'
        | 'MIN_DAYS_OFF_VIOLATION'
        | 'DAILY_HOURS_EXCEEDED'
        | 'WEEKLY_HOURS_EXCEEDED';
      details?: string;
    };

export function evaluateEmployeeEligibility(params: {
  employee: EmployeeScheduleConfig;
  date: string;
  slot?: DemandSlot;
  shiftTemplate?: ShiftTemplateConfigV2;
  absences?: EmployeeAbsence[];
  existingShifts?: GeneratedShift[];
  complianceRules?: RestAndComplianceRules;
  consecutiveDaysWorked?: number;
  weeklyHoursWorked?: number;
  weeklyDaysWorked?: number;
}): EligibilityResult {
  const {
    employee,
    date,
    slot,
    absences = [],
    existingShifts = [],
    complianceRules,
    consecutiveDaysWorked = 0,
    weeklyHoursWorked = 0,
    weeklyDaysWorked,
  } = params;
  const shiftTemplate = slot?.template || params.shiftTemplate;
  if (!employee || !shiftTemplate) {
    return { eligible: false, reason: 'INCAPABLE' };
  }

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

  // 6. Hard Role Requirement
  if (slot?.requiredRole) {
    const matchesRequired = employee.scheduleRole === slot.requiredRole;
    const matchesOptional = Array.isArray(slot.optionalCandidateRoles) && slot.optionalCandidateRoles.includes(employee.scheduleRole);
    if (!matchesRequired && !matchesOptional) {
      return { eligible: false, reason: 'ROLE_MISMATCH', details: `Requires role ${slot.requiredRole}` };
    }
  }

  // 7. Hard Skill Requirement
  const requiredSkills = slot?.requiredSkillsOrRoles || shiftTemplate.requiredSkillsOrRoles;
  if (Array.isArray(requiredSkills) && requiredSkills.length > 0) {
    const employeeSkills = new Set(Array.isArray(employee.skills) ? employee.skills : []);
    const hasAllSkills = requiredSkills.every(
      (reqSkill) => employeeSkills.has(reqSkill) || employee.scheduleRole === reqSkill
    );
    if (!hasAllSkills) {
      return { eligible: false, reason: 'SKILL_MISMATCH', details: `Missing required skills: ${requiredSkills.join(', ')}` };
    }
  }

  // 8. Sunday Participating Roles Constraint
  if (slot?.participatingRoles && slot.participatingRoles.length > 0) {
    if (!slot.participatingRoles.includes(employee.scheduleRole)) {
      return { eligible: false, reason: 'SUNDAY_ROLE_EXCLUDED', details: `Role ${employee.scheduleRole} not in Sunday rotation` };
    }
  }

  // 9. Legacy Role Restriction (Core A/B cannot work Intermediate only if legacy rule requested)
  if (
    (complianceRules as any)?.enforceLegacyCoreRoleRestrictions === true &&
    (employee.scheduleRole === 'CORE_A' || employee.scheduleRole === 'CORE_B') &&
    shiftTemplate.shiftType === 'INTERMEDIATE'
  ) {
    return { eligible: false, reason: 'ROLE_RESTRICTED' };
  }

  // 10. Double Shift on Same Date
  const hasShiftOnDate = existingShifts.some(
    (s) => s.date === date && s.employeeId === employee.employeeId
  );
  if (hasShiftOnDate) {
    return { eligible: false, reason: 'DOUBLE_SHIFT' };
  }

  // 11. Hard Compliance: Max Consecutive Working Days
  if (complianceRules?.maxConsecutiveWorkingDays && consecutiveDaysWorked >= complianceRules.maxConsecutiveWorkingDays) {
    return {
      eligible: false,
      reason: 'MAX_CONSECUTIVE_DAYS_EXCEEDED',
      details: `${consecutiveDaysWorked} consecutive days >= max ${complianceRules.maxConsecutiveWorkingDays}`,
    };
  }

  // 12. Hard Compliance: Min Days Off Per Week (workingDays <= 7 - minDaysOffPerWeek)
  if (
    complianceRules?.minDaysOffPerWeek &&
    typeof weeklyDaysWorked === 'number' &&
    weeklyDaysWorked + 1 > 7 - complianceRules.minDaysOffPerWeek
  ) {
    return {
      eligible: false,
      reason: 'MIN_DAYS_OFF_VIOLATION',
      details: `Working ${weeklyDaysWorked + 1} days in week would exceed maximum allowed working days (${7 - complianceRules.minDaysOffPerWeek}) for minDaysOffPerWeek (${complianceRules.minDaysOffPerWeek})`,
    };
  }

  // 13. Hard Compliance: Max Daily Working Hours
  if (complianceRules?.maxDailyWorkingHours && shiftTemplate.durationHours > complianceRules.maxDailyWorkingHours) {
    return {
      eligible: false,
      reason: 'DAILY_HOURS_EXCEEDED',
      details: `${shiftTemplate.durationHours}h > max daily ${complianceRules.maxDailyWorkingHours}h`,
    };
  }

  // 14. Hard Compliance: Max Weekly Standard Hours
  if (complianceRules?.maxWeeklyStandardHours && (weeklyHoursWorked + shiftTemplate.durationHours) > complianceRules.maxWeeklyStandardHours) {
    return {
      eligible: false,
      reason: 'WEEKLY_HOURS_EXCEEDED',
      details: `${weeklyHoursWorked + shiftTemplate.durationHours}h > max weekly ${complianceRules.maxWeeklyStandardHours}h`,
    };
  }

  // 15. Hard Compliance: Turnaround Rest Interval (Past & Pre-assigned Future)
  if (complianceRules?.minRestIntervalBetweenShiftsHours && complianceRules.preventClashingTurnaround !== false) {
    const minRequiredRest = complianceRules.minRestIntervalBetweenShiftsHours;

    for (const adjacentShift of existingShifts) {
      if (adjacentShift.employeeId !== employee.employeeId) continue;
      if (adjacentShift.date < date) {
        const restHours = calculateRestHoursBetweenShifts(
          adjacentShift.date,
          adjacentShift.startTime,
          adjacentShift.endTime,
          Boolean((adjacentShift as any).crossMidnight),
          date,
          shiftTemplate.startTime,
          shiftTemplate.endTime,
          Boolean(shiftTemplate.crossMidnight),
        );
        if (restHours < minRequiredRest) {
          return {
            eligible: false,
            reason: 'REST_VIOLATION',
            details: `${restHours.toFixed(1)}h rest < required ${minRequiredRest}h after shift on ${adjacentShift.date}`,
          };
        }
      } else if (adjacentShift.date > date) {
        const restHours = calculateRestHoursBetweenShifts(
          date,
          shiftTemplate.startTime,
          shiftTemplate.endTime,
          Boolean(shiftTemplate.crossMidnight),
          adjacentShift.date,
          adjacentShift.startTime,
          adjacentShift.endTime,
          Boolean((adjacentShift as any).crossMidnight),
        );
        if (restHours < minRequiredRest) {
          return {
            eligible: false,
            reason: 'REST_VIOLATION',
            details: `${restHours.toFixed(1)}h rest < required ${minRequiredRest}h before pre-assigned shift on ${adjacentShift.date}`,
          };
        }
      }
    }
  }

  return { eligible: true, reason: 'AVAILABLE' };
}

