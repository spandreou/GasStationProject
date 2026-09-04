import type { SchedulerConfigV2 } from './configV2.ts';

export type BaseScheduleRole = 'CORE_A' | 'CORE_B' | 'FLEX_A' | 'FLEX_B';
export type ExtraScheduleRole = 'EXTRA_A' | 'EXTRA_B';
export type ScheduleRole = BaseScheduleRole | ExtraScheduleRole | string;

export type Weekday =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type ShiftType =
  | 'MORNING'
  | 'INTERMEDIATE'
  | 'AFTERNOON'
  | 'NIGHT'
  | 'SPLIT'
  | 'SUNDAY_12H'
  | 'SPECIAL'
  | string;

export type ExtraEmployeeMode =
  | 'DISABLED'
  | 'SUBSTITUTE_ONLY'
  | 'ACTIVE_SEASONAL';

export type AbsenceType = 'LEAVE' | 'SICK' | 'OTHER';

export type AbsenceScope =
  | 'FULL_DAY'
  | 'MORNING_ONLY'
  | 'INTERMEDIATE_ONLY'
  | 'AFTERNOON_ONLY'
  | 'SUNDAY_12H_ONLY';

export type ReplacementMode =
  | 'AUTO'
  | 'MANUAL'
  | 'NO_REPLACEMENT';

export type EmployeeScheduleConfig = {
  employeeId: string;
  fullName: string;
  scheduleRole: ScheduleRole;
  isEnabled: boolean;
  fixedDayOff?: Weekday;
  defaultShiftPreference?: string;
  participatesInWeeklyRotation?: boolean;
  participatesInSundayRotation?: boolean;
  weeklyFixedShiftSideRotation?: boolean;
  extraMode?: ExtraEmployeeMode;
  activeFrom?: string;
  activeTo?: string;
  skills?: string[];
  canCoverLeaves?: boolean;
  canWorkMorning?: boolean;
  canWorkIntermediate?: boolean;
  canWorkAfternoon?: boolean;
  canWorkSunday?: boolean;
};

export type EmployeeAbsence = {
  id: string;
  employeeId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  scope: AbsenceScope;
  replacementMode: ReplacementMode;
  manualReplacementEmployeeId?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type GeneratedShift = {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  scheduleRole: ScheduleRole;
  shiftType: ShiftType;
  shiftTemplateId?: string;
  demandSlotId?: string;
  startTime: string;
  endTime: string;
  crossMidnight?: boolean;
  durationHours?: number;
  source:
    | 'BASE'
    | 'SUNDAY_ROTATION'
    | 'ABSENCE_REPLACEMENT'
    | 'MANUAL_OVERRIDE';
  replacedEmployeeId?: string;
  absenceId?: string;
  warningIds?: string[];
};

export type ScheduleGap = {
  id: string;
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  missingRole?: ScheduleRole;
  reason:
    | 'ABSENCE'
    | 'UNAVAILABLE'
    | 'NO_EMPLOYEE'
    | 'MANUAL_NO_REPLACEMENT';
  originalEmployeeId?: string;
  absenceId?: string;
};

export type ScheduleWarning = {
  id: string;
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  date?: string;
  employeeId?: string;
};

export type ResolvedScheduleRoles = {
  roles: Partial<Record<ScheduleRole, EmployeeScheduleConfig>>;
  extras: EmployeeScheduleConfig[];
  baseEmployees: EmployeeScheduleConfig[];
  warnings: ScheduleWarning[];
};

export type DayPlan = {
  date: string;
  weekday: Weekday;
  weekIndex: number;
  plannedOffRoles: ScheduleRole[];
  assignments: Array<{
    scheduleRole: ScheduleRole;
    shiftType: ShiftType;
  }>;
};

export type GenerateScheduleInput = {
  startDate: string;
  endDate: string;
  employees: EmployeeScheduleConfig[];
  absences?: EmployeeAbsence[];
  previousSundayEmployeeId?: string;
  schedulerConfig?: SchedulerConfigV2;
  rules?: {
    weeklyRotationEnabled?: boolean;
    avoidConsecutiveSundays?: boolean;
    startWithCoreAMorning?: boolean;
    fixedDaysOff?: Record<string, Weekday>;
    specialDaysByDate?: Record<string, any>;
    [key: string]: any;
  };
  manualOverrides?: GeneratedShift[];
};

export type GenerateScheduleResult = {
  shifts: GeneratedShift[];
  warnings: ScheduleWarning[];
  unresolvedGaps: ScheduleGap[];
  validation: {
    valid: boolean;
    violations: ScheduleWarning[];
  };
  debug: {
    resolvedRoles: ResolvedScheduleRoles;
    dayPlans: DayPlan[];
  };
};
