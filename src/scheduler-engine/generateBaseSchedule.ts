import { BASE_ROLES, DEFAULT_SHIFT_DEFINITIONS } from './constants';
import { eachDateInclusive, getWeekIndex, getWeekday } from './dateUtils';
import type { DayPlan, GeneratedShift, ResolvedScheduleRoles, ScheduleRole, ShiftType } from './types';

function shiftForRole(date: string, role: ScheduleRole, shiftType: ShiftType, resolvedRoles: ResolvedScheduleRoles): GeneratedShift | null {
  const employee = resolvedRoles.roles[role];
  if (!employee) return null;
  const definition = DEFAULT_SHIFT_DEFINITIONS[shiftType];
  return {
    id: `base-${date}-${role}-${shiftType}`,
    date,
    employeeId: employee.employeeId,
    employeeName: employee.fullName,
    scheduleRole: role,
    shiftType,
    startTime: definition.startTime,
    endTime: definition.endTime,
    source: 'BASE',
  };
}

function getCoreSides(weekIndex: number): { morningCore: ScheduleRole; afternoonCore: ScheduleRole } {
  const isEvenWeek = weekIndex % 2 === 0;
  return {
    morningCore: isEvenWeek ? 'CORE_A' : 'CORE_B',
    afternoonCore: isEvenWeek ? 'CORE_B' : 'CORE_A',
  };
}

function getFlexSides(weekIndex: number): { morningFlex: ScheduleRole; afternoonFlex: ScheduleRole } {
  const swapFlex = weekIndex % 4 >= 2;
  return {
    morningFlex: swapFlex ? 'FLEX_B' : 'FLEX_A',
    afternoonFlex: swapFlex ? 'FLEX_A' : 'FLEX_B',
  };
}

function chooseWeekdayAssignments(date: string, weekIndex: number, resolvedRoles: ResolvedScheduleRoles): DayPlan['assignments'] {
  const weekday = getWeekday(date);
  const { morningCore, afternoonCore } = getCoreSides(weekIndex);
  const offRole = BASE_ROLES.find((role) => resolvedRoles.roles[role]?.fixedDayOff === weekday);
  const availableRoles = BASE_ROLES.filter((role) => role !== offRole);

  if (availableRoles.includes(morningCore) && availableRoles.includes(afternoonCore)) {
    const flexRole = availableRoles.find((role) => role === 'FLEX_A' || role === 'FLEX_B') as ScheduleRole;
    return [
      { scheduleRole: morningCore, shiftType: 'MORNING' },
      { scheduleRole: flexRole, shiftType: 'INTERMEDIATE' },
      { scheduleRole: afternoonCore, shiftType: 'AFTERNOON' },
    ];
  }

  const remainingCore = availableRoles.find((role) => role === 'CORE_A' || role === 'CORE_B') as ScheduleRole | undefined;
  const flexRoles = availableRoles.filter((role) => role === 'FLEX_A' || role === 'FLEX_B') as ScheduleRole[];
  const missingCoreShift: ShiftType = offRole === morningCore ? 'MORNING' : 'AFTERNOON';
  const remainingCoreShift: ShiftType = remainingCore === morningCore ? 'MORNING' : 'AFTERNOON';
  const coverFlex = flexRoles[0];
  const intermediateFlex = flexRoles[1];

  return [
    remainingCore ? { scheduleRole: remainingCore, shiftType: remainingCoreShift } : null,
    coverFlex ? { scheduleRole: coverFlex, shiftType: missingCoreShift } : null,
    intermediateFlex ? { scheduleRole: intermediateFlex, shiftType: 'INTERMEDIATE' } : null,
  ].filter(Boolean) as DayPlan['assignments'];
}

export function generateBaseSchedule(params: {
  startDate: string;
  endDate: string;
  resolvedRoles: ResolvedScheduleRoles;
}): { shifts: GeneratedShift[]; dayPlans: DayPlan[] } {
  const shifts: GeneratedShift[] = [];
  const dayPlans: DayPlan[] = [];

  for (const date of eachDateInclusive(params.startDate, params.endDate)) {
    const weekday = getWeekday(date);
    const weekIndex = getWeekIndex(params.startDate, date);
    if (weekday === 'SUNDAY') {
      dayPlans.push({ date, weekday, weekIndex, plannedOffRoles: [], assignments: [] });
      continue;
    }

    let assignments: DayPlan['assignments'];
    let plannedOffRoles: ScheduleRole[] = [];
    if (weekday === 'MONDAY' || weekday === 'SATURDAY') {
      const { morningCore, afternoonCore } = getCoreSides(weekIndex);
      const { morningFlex, afternoonFlex } = getFlexSides(weekIndex);
      assignments = [
        { scheduleRole: morningCore, shiftType: 'MORNING' },
        { scheduleRole: morningFlex, shiftType: 'MORNING' },
        { scheduleRole: afternoonCore, shiftType: 'AFTERNOON' },
        { scheduleRole: afternoonFlex, shiftType: 'AFTERNOON' },
      ];
    } else {
      assignments = chooseWeekdayAssignments(date, weekIndex, params.resolvedRoles);
      plannedOffRoles = BASE_ROLES.filter((role) => !assignments.some((assignment) => assignment.scheduleRole === role));
    }

    dayPlans.push({ date, weekday, weekIndex, plannedOffRoles, assignments });
    for (const assignment of assignments) {
      const shift = shiftForRole(date, assignment.scheduleRole, assignment.shiftType, params.resolvedRoles);
      if (shift) shifts.push(shift);
    }
  }

  return { shifts, dayPlans };
}
