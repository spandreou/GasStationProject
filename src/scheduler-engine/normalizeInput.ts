import { DEFAULT_DAYS_OFF } from './constants.ts';
import type { SchedulerConfigV2 } from './configV2.ts';
import type { EmployeeAbsence, EmployeeScheduleConfig, GeneratedShift, GenerateScheduleInput } from './types.ts';

export type NormalizedScheduleInput = {
  startDate: string;
  endDate: string;
  employees: EmployeeScheduleConfig[];
  absences: EmployeeAbsence[];
  previousSundayEmployeeId?: string;
  schedulerConfig?: SchedulerConfigV2;
  manualOverrides?: GeneratedShift[];
  rules: {
    weeklyRotationEnabled: boolean;
    avoidConsecutiveSundays: boolean;
    startWithCoreAMorning: boolean;
    [key: string]: any;
  };
};

export function normalizeInput(input: GenerateScheduleInput): NormalizedScheduleInput {
  const employees = [...(input.employees || [])]
    .map((employee) => ({
      ...employee,
      fullName: employee.fullName || employee.employeeId,
      fixedDayOff: employee.fixedDayOff || (DEFAULT_DAYS_OFF as any)[employee.scheduleRole],
      defaultShiftPreference: employee.defaultShiftPreference || 'AUTO',
      participatesInWeeklyRotation: employee.participatesInWeeklyRotation !== false,
      participatesInSundayRotation: employee.participatesInSundayRotation !== false,
      weeklyFixedShiftSideRotation: employee.weeklyFixedShiftSideRotation === true,
      extraMode: employee.extraMode || (employee.scheduleRole?.startsWith('EXTRA') ? 'DISABLED' : undefined),
      skills: Array.isArray(employee.skills) ? employee.skills : [],
      canCoverLeaves: employee.canCoverLeaves !== false,
      canWorkMorning: employee.canWorkMorning !== false,
      canWorkIntermediate: employee.canWorkIntermediate !== false,
      canWorkAfternoon: employee.canWorkAfternoon !== false,
      canWorkSunday: employee.canWorkSunday !== false,
    }))
    .sort((a, b) => {
      const roleA = String(a.scheduleRole || '');
      const roleB = String(b.scheduleRole || '');
      if (roleA !== roleB) return roleA < roleB ? -1 : 1;
      const idA = String(a.employeeId || '');
      const idB = String(b.employeeId || '');
      return idA < idB ? -1 : idA > idB ? 1 : 0;
    });

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    employees,
    absences: [...(input.absences || [])].sort((a, b) => {
      const dateA = String(a.startDate || '');
      const dateB = String(b.startDate || '');
      if (dateA !== dateB) return dateA < dateB ? -1 : 1;
      const idA = String(a.id || '');
      const idB = String(b.id || '');
      return idA < idB ? -1 : idA > idB ? 1 : 0;
    }),
    previousSundayEmployeeId: input.previousSundayEmployeeId,
    schedulerConfig: input.schedulerConfig,
    manualOverrides: input.manualOverrides,
    rules: {
      ...(input.rules || {}),
      weeklyRotationEnabled: input.rules?.weeklyRotationEnabled !== false,
      avoidConsecutiveSundays: input.rules?.avoidConsecutiveSundays !== false,
      startWithCoreAMorning: input.rules?.startWithCoreAMorning !== false,
    },
  };
}
