import type { ScheduleRole, ShiftType, Weekday } from './types';

export const DEFAULT_SHIFT_DEFINITIONS: Record<ShiftType, {
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
}> = {
  MORNING: {
    shiftType: 'MORNING',
    startTime: '06:00',
    endTime: '14:00',
  },
  INTERMEDIATE: {
    shiftType: 'INTERMEDIATE',
    startTime: '10:00',
    endTime: '18:00',
  },
  AFTERNOON: {
    shiftType: 'AFTERNOON',
    startTime: '14:00',
    endTime: '22:00',
  },
  SUNDAY_12H: {
    shiftType: 'SUNDAY_12H',
    startTime: '08:00',
    endTime: '20:00',
  },
};

export function getShiftDefinition(
  shiftType: ShiftType,
  employee?: { defaultShiftPreference?: string },
): {
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
} {
  if (shiftType === 'INTERMEDIATE') {
    if (employee?.defaultShiftPreference === 'INTERMEDIATE_0900') {
      return { shiftType, startTime: '09:00', endTime: '17:00' };
    }
    if (employee?.defaultShiftPreference === 'INTERMEDIATE_1000') {
      return { shiftType, startTime: '10:00', endTime: '18:00' };
    }
  }
  return DEFAULT_SHIFT_DEFINITIONS[shiftType];
}

export const DEFAULT_DAYS_OFF: Partial<Record<ScheduleRole, Weekday>> = {
  CORE_A: 'WEDNESDAY',
  CORE_B: 'THURSDAY',
  FLEX_A: 'TUESDAY',
  FLEX_B: 'FRIDAY',
} as const;

export const REQUIRED_BASE_ROLES: ScheduleRole[] = ['CORE_A', 'CORE_B', 'FLEX_A', 'FLEX_B'];
export const EXTRA_ROLES: ScheduleRole[] = ['EXTRA_A', 'EXTRA_B'];
export const BASE_ROLES: ScheduleRole[] = [...REQUIRED_BASE_ROLES];
export const WEEKDAYS: Weekday[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
