import type { EmployeeScheduleConfig, Weekday } from './types.ts';
import { isShiftContainedInWindow, shiftToTimestampInterval } from './dateUtils.ts';

export type BusinessCategory =
  | 'FUEL_STATION'
  | 'CAFE'
  | 'RESTAURANT'
  | 'HAIR_SALON'
  | 'RETAIL'
  | 'OTHER';

export type ShiftCategoryType =
  | 'MORNING'
  | 'INTERMEDIATE'
  | 'AFTERNOON'
  | 'NIGHT'
  | 'SPLIT'
  | 'CUSTOM'
  | 'SPECIAL';

export type SundayRotationMode =
  | 'CYCLIC_FAIR'
  | 'FIXED_ASSIGNMENT'
  | 'STANDARD_WEEKDAY_LIKE'
  | 'CLOSED';

export type ReplacementStrategy =
  | 'EXTRA_FIRST'
  | 'EQUAL_HOURS'
  | 'ROLE_MATCH'
  | 'MANUAL_ONLY';

export const REPLACEMENT_STRATEGY_STATUS = 'DEFERRED_NOT_ACTIVE' as const;

export interface TimeWindow {
  openTime: string;
  closeTime: string;
  crossMidnight?: boolean;
  label?: string;
}

export interface OperatingDayConfig {
  weekday: Weekday;
  isOpen: boolean;
  windows: TimeWindow[];
}

export interface ShiftTemplateConfigV2 {
  id: string;
  label: string;
  shortCode: string;
  shiftType: ShiftCategoryType;
  startTime: string;
  endTime: string;
  durationHours: number;
  unpaidBreakMinutes: number;
  crossMidnight: boolean;
  color: string;
  isActive: boolean;
  requiredSkillsOrRoles?: string[];
}

export interface CoverageRequirementSlot {
  shiftTemplateId: string;
  minHeadcount: number;
  targetHeadcount: number;
  maxHeadcount?: number;
  requiredRole?: string;
  optionalCandidateRoles?: string[];
}

export interface DailyCoveragePattern {
  weekday: Weekday;
  dayType: 'FULL_COVERAGE' | 'STANDARD_COVERAGE' | 'SPLIT_COVERAGE' | 'MINIMAL_COVERAGE' | 'CUSTOM';
  slots: CoverageRequirementSlot[];
}

export interface RestAndComplianceRules {
  targetDaysOffPerWeek: number;
  minDaysOffPerWeek: number;
  maxConsecutiveWorkingDays: number;
  minRestIntervalBetweenShiftsHours: number;
  maxDailyWorkingHours: number;
  maxWeeklyStandardHours: number;
  preventClashingTurnaround: boolean;
}

export interface SundayAndHolidayRules {
  sundayMode: SundayRotationMode;
  sundayShiftTemplateId: string;
  fixedSundayEmployeeIds?: string[];
  avoidConsecutiveSundays: boolean;
  participatingRoleTypes: string[];
  holidaysTreatedAsSundays: boolean;
  closedOnPublicHolidays: boolean;
}

export interface SpecialDayOverride {
  date: string;
  isHoliday: boolean;
  isSpecialOperatingHours: boolean;
  label: string;
  operatingWindows?: TimeWindow[];
  customShiftTemplateIds?: string[];
  notes?: string;
}

export interface SubstituteAndSeasonalRules {
  replacementStrategy: ReplacementStrategy;
  autoFillGaps: boolean;
  allowPartialCoverageWithWarning: boolean;
  extraSubstituteRoles: string[];
  seasonalActivationStrictDates: boolean;
}

export interface LegacyRotationSettings {
  weeklyRotationEnabled: boolean;
  startWithCoreAMorning: boolean;
  allowManualOverride: boolean;
  avoidConsecutiveSundays: boolean;
}

export interface SchedulerConfigV2 {
  schemaVersion: 2;
  tenantId: string;
  businessCategory: BusinessCategory;
  templateId: string;
  templateVersion: number;
  timezone: string;
  weekStartDay: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  operatingDays: OperatingDayConfig[];
  shiftTemplates: ShiftTemplateConfigV2[];
  coverageRequirements: DailyCoveragePattern[];
  complianceRules: RestAndComplianceRules;
  sundayAndHolidays: SundayAndHolidayRules;
  specialDaysByDate: Record<string, SpecialDayOverride>;
  substituteRules: SubstituteAndSeasonalRules;
  legacyRotation: LegacyRotationSettings;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const AUTHORIZATION_ROLE_TOKENS = new Set([
  'OWNER',
  'ADMIN',
  'MANAGER',
  'SUPER_ADMIN',
  'PLATFORM_ADMIN',
  'SHIFTORYX_ADMIN',
]);
let fallbackSchedulerItemIdCounter = 0;

function normalizeSchedulingToken(value: unknown): string {
  return `${value || ''}`.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function isAuthorizationRoleToken(value: unknown): boolean {
  return AUTHORIZATION_ROLE_TOKENS.has(normalizeSchedulingToken(value));
}

export function createSchedulerItemId(prefix = 'item'): string {
  const safePrefix = `${prefix || 'item'}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `${safePrefix}-${randomUuid}`;

  fallbackSchedulerItemIdCounter += 1;
  return `${safePrefix}-${Date.now().toString(36)}-${fallbackSchedulerItemIdCounter.toString(36)}`;
}

export function mergeSchedulerConfigSpecialDays(
  config: SchedulerConfigV2,
  rawSpecialDays: Record<string, unknown> = {},
): SchedulerConfigV2 {
  const normalizedSpecialDays: Record<string, SpecialDayOverride> = {
    ...(config?.specialDaysByDate || {}),
  };
  for (const [date, value] of Object.entries(rawSpecialDays || {})) {
    const raw = (value || {}) as Partial<SpecialDayOverride> & {
      isSpecialDay?: boolean;
      operatingStartTime?: string;
      operatingEndTime?: string;
    };
    const operatingWindows = Array.isArray(raw.operatingWindows)
      ? raw.operatingWindows.map((window) => ({ ...window }))
      : raw.operatingStartTime && raw.operatingEndTime
        ? [{ openTime: raw.operatingStartTime, closeTime: raw.operatingEndTime }]
        : undefined;
    normalizedSpecialDays[date] = {
      date,
      isHoliday: Boolean(raw.isHoliday),
      isSpecialOperatingHours: Boolean(raw.isSpecialOperatingHours ?? raw.isSpecialDay),
      label: raw.label || (raw.isHoliday ? 'Αργία' : 'Ειδικό Ωράριο'),
      operatingWindows,
      customShiftTemplateIds: raw.customShiftTemplateIds,
      notes: raw.notes,
    };
  }

  return {
    ...config,
    specialDaysByDate: normalizedSpecialDays,
  };
}

export function getDefaultCategoryConfig(
  tenantId = 'default',
  category: BusinessCategory = 'FUEL_STATION'
): SchedulerConfigV2 {
  const isFuel = category === 'FUEL_STATION';
  const isSalon = category === 'HAIR_SALON';

  const defaultOperatingDays: OperatingDayConfig[] = isSalon
    ? [
        { weekday: 'MONDAY', isOpen: true, windows: [{ openTime: '09:00', closeTime: '20:00' }] },
        { weekday: 'TUESDAY', isOpen: true, windows: [{ openTime: '09:00', closeTime: '20:00' }] },
        { weekday: 'WEDNESDAY', isOpen: true, windows: [{ openTime: '09:00', closeTime: '20:00' }] },
        { weekday: 'THURSDAY', isOpen: true, windows: [{ openTime: '09:00', closeTime: '20:00' }] },
        { weekday: 'FRIDAY', isOpen: true, windows: [{ openTime: '09:00', closeTime: '20:00' }] },
        { weekday: 'SATURDAY', isOpen: true, windows: [{ openTime: '09:00', closeTime: '18:00' }] },
        { weekday: 'SUNDAY', isOpen: false, windows: [] },
      ]
    : isFuel
    ? [
        { weekday: 'MONDAY', isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
        { weekday: 'TUESDAY', isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
        { weekday: 'WEDNESDAY', isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
        { weekday: 'THURSDAY', isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
        { weekday: 'FRIDAY', isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
        { weekday: 'SATURDAY', isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
        { weekday: 'SUNDAY', isOpen: true, windows: [{ openTime: '08:00', closeTime: '20:00' }] },
      ]
    : [
        { weekday: 'MONDAY', isOpen: true, windows: [{ openTime: '07:00', closeTime: '23:00' }] },
        { weekday: 'TUESDAY', isOpen: true, windows: [{ openTime: '07:00', closeTime: '23:00' }] },
        { weekday: 'WEDNESDAY', isOpen: true, windows: [{ openTime: '07:00', closeTime: '23:00' }] },
        { weekday: 'THURSDAY', isOpen: true, windows: [{ openTime: '07:00', closeTime: '23:00' }] },
        { weekday: 'FRIDAY', isOpen: true, windows: [{ openTime: '07:00', closeTime: '23:00' }] },
        { weekday: 'SATURDAY', isOpen: true, windows: [{ openTime: '07:00', closeTime: '23:00' }] },
        { weekday: 'SUNDAY', isOpen: true, windows: [{ openTime: '07:00', closeTime: '23:00' }] },
      ];

  const defaultTemplates: ShiftTemplateConfigV2[] = isFuel
    ? [
        { id: 'morning', label: 'Πρωινή', shortCode: 'ΠΡ', shiftType: 'MORNING', startTime: '06:00', endTime: '14:00', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#1D4ED8', isActive: true },
        { id: 'intermediate-1000', label: 'Ενδιάμεση (10:00)', shortCode: 'ΕΝΔ', shiftType: 'INTERMEDIATE', startTime: '10:00', endTime: '18:00', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#D97706', isActive: true },
        { id: 'intermediate-0900', label: 'Ενδιάμεση (09:00)', shortCode: 'ΕΝΔ9', shiftType: 'INTERMEDIATE', startTime: '09:00', endTime: '17:00', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#D97706', isActive: true },
        { id: 'afternoon', label: 'Απογευματινή', shortCode: 'ΑΠΟ', shiftType: 'AFTERNOON', startTime: '14:00', endTime: '22:00', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#4338CA', isActive: true },
        { id: 'sunday-12h', label: 'Κυριακή 12ωρη', shortCode: 'ΚΥΡ', shiftType: 'SPECIAL', startTime: '08:00', endTime: '20:00', durationHours: 12.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#BE185D', isActive: true },
      ]
    : isSalon
    ? [
        { id: 'morning', label: 'Πρωινή', shortCode: 'ΠΡ', shiftType: 'MORNING', startTime: '09:00', endTime: '15:00', durationHours: 6.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#1D4ED8', isActive: true },
        { id: 'afternoon', label: 'Απογευματινή', shortCode: 'ΑΠΟ', shiftType: 'AFTERNOON', startTime: '14:00', endTime: '18:00', durationHours: 4.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#4338CA', isActive: true },
      ]
    : [
        { id: 'morning', label: 'Πρωινή', shortCode: 'ΠΡ', shiftType: 'MORNING', startTime: '07:00', endTime: '15:00', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#1D4ED8', isActive: true },
        { id: 'afternoon', label: 'Απογευματινή', shortCode: 'ΑΠΟ', shiftType: 'AFTERNOON', startTime: '15:00', endTime: '23:00', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#4338CA', isActive: true },
      ];


  const defaultCoverage: DailyCoveragePattern[] = isFuel
    ? [
        { weekday: 'MONDAY', dayType: 'FULL_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 2 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 2 }] },
        { weekday: 'TUESDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'intermediate-1000', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'WEDNESDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'intermediate-1000', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'THURSDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'intermediate-1000', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'FRIDAY', dayType: 'FULL_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 2 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 2 }] },
        { weekday: 'SATURDAY', dayType: 'FULL_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 2 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 2 }] },
        { weekday: 'SUNDAY', dayType: 'MINIMAL_COVERAGE', slots: [{ shiftTemplateId: 'sunday-12h', minHeadcount: 1, targetHeadcount: 1 }] },
      ]
    : [
        { weekday: 'MONDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'TUESDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'WEDNESDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'THURSDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'FRIDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'SATURDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'SUNDAY', dayType: isSalon ? 'MINIMAL_COVERAGE' : 'STANDARD_COVERAGE', slots: isSalon ? [] : [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }] },
      ];

  return {
    schemaVersion: 2,
    tenantId,
    businessCategory: category,
    templateId: `${category.toLowerCase().replace(/_/g, '-')}-standard-v1`,
    templateVersion: 1,
    timezone: 'Europe/Athens',
    weekStartDay: 1,
    operatingDays: defaultOperatingDays,
    shiftTemplates: defaultTemplates,
    coverageRequirements: defaultCoverage,
    complianceRules: {
      targetDaysOffPerWeek: 1,
      minDaysOffPerWeek: 1,
      maxConsecutiveWorkingDays: 6,
      minRestIntervalBetweenShiftsHours: 11.0,
      maxDailyWorkingHours: 12.0,
      maxWeeklyStandardHours: 48.0,
      preventClashingTurnaround: true,
    },
    sundayAndHolidays: {
      sundayMode: isSalon ? 'CLOSED' : 'CYCLIC_FAIR',
      sundayShiftTemplateId: isFuel ? 'sunday-12h' : 'morning',
      avoidConsecutiveSundays: true,
      participatingRoleTypes: isFuel
        ? ['CORE_A', 'CORE_B', 'FLEX_A', 'FLEX_B', 'EXTRA_A', 'EXTRA_B']
        : ['CORE_A', 'CORE_B', 'FLEX_A', 'FLEX_B', 'EXTRA_A', 'EXTRA_B', 'STAFF', 'BARISTA', 'WAITER', 'CHEF', 'CASHIER', 'REGULAR_WORKER', 'ROLE_A', 'ROLE_B', 'ROLE_C', 'AUTO'],
      holidaysTreatedAsSundays: false,
      closedOnPublicHolidays: false,
    },
    specialDaysByDate: {},
    substituteRules: {
      replacementStrategy: 'EXTRA_FIRST',
      autoFillGaps: true,
      allowPartialCoverageWithWarning: true,
      extraSubstituteRoles: ['EXTRA_A', 'EXTRA_B'],
      seasonalActivationStrictDates: true,
    },
    legacyRotation: {
      weeklyRotationEnabled: true,
      startWithCoreAMorning: true,
      allowManualOverride: true,
      avoidConsecutiveSundays: true,
    },
  };
}

const VALID_WEEKDAYS = new Set(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function deriveShiftDurationHours(
  startTime: string,
  endTime: string,
  crossMidnight = false,
  unpaidBreakMinutes = 0
): number {
  if (!TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
    return 0;
  }
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startTotalMinutes = sh * 60 + sm;
  const endTotalMinutes = eh * 60 + em;

  let spanMinutes = endTotalMinutes - startTotalMinutes;
  if (crossMidnight || endTotalMinutes <= startTotalMinutes) {
    spanMinutes = (24 * 60 - startTotalMinutes) + endTotalMinutes;
  }
  const breakMins = typeof unpaidBreakMinutes === 'number' && unpaidBreakMinutes >= 0 ? unpaidBreakMinutes : 0;
  const netMinutes = Math.max(0, spanMinutes - breakMins);
  return Math.round((netMinutes / 60) * 100) / 100;
}

export function validateSchedulerConfig(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Configuration must be a non-null object'] };
  }
  const c = config as Partial<SchedulerConfigV2>;

  if (c.schemaVersion !== 2) {
    errors.push('schemaVersion must be 2');
  }
  if (!c.tenantId || typeof c.tenantId !== 'string') {
    errors.push('tenantId is required and must be a string');
  }

  const operatingDayMap = new Map<string, OperatingDayConfig>();
  if (!Array.isArray(c.operatingDays) || c.operatingDays.length !== 7) {
    errors.push('operatingDays must contain exactly 7 weekday configurations');
  } else {
    const seenDays = new Set<string>();
    for (const d of c.operatingDays) {
      if (!VALID_WEEKDAYS.has(d.weekday)) {
        errors.push(`Invalid weekday in operatingDays: ${d.weekday}`);
      }
      if (seenDays.has(d.weekday)) {
        errors.push(`Duplicate weekday in operatingDays: ${d.weekday}`);
      }
      seenDays.add(d.weekday);
      operatingDayMap.set(d.weekday, d);

      if (typeof d.isOpen !== 'boolean') {
        errors.push(`operatingDays.${d.weekday}.isOpen must be a boolean`);
      }
      if (!Array.isArray(d.windows)) {
        errors.push(`operatingDays.${d.weekday}.windows must be an array`);
      } else {
        if (d.isOpen && d.windows.length === 0) {
          errors.push(`operatingDays.${d.weekday} is marked open but has no operating windows configured`);
        }
        for (const w of d.windows) {
          if (!TIME_REGEX.test(w.openTime) || !TIME_REGEX.test(w.closeTime)) {
            errors.push(`operatingDays.${d.weekday} window contains invalid time format: ${w.openTime}-${w.closeTime}`);
          }
          if (w.openTime === w.closeTime) {
            errors.push(`operatingDays.${d.weekday} window has zero duration: ${w.openTime}-${w.closeTime}`);
          }
          if (w.crossMidnight && w.openTime < w.closeTime) {
            errors.push(`operatingDays.${d.weekday} window has crossMidnight: true but openTime (${w.openTime}) is before closeTime (${w.closeTime})`);
          }
          if (!w.crossMidnight && w.openTime > w.closeTime) {
            errors.push(`operatingDays.${d.weekday} window openTime (${w.openTime}) > closeTime (${w.closeTime}) without crossMidnight flag`);
          }
        }

        if (d.windows.length > 1) {
          const intervals = d.windows
            .filter((w) => TIME_REGEX.test(w.openTime) && TIME_REGEX.test(w.closeTime))
            .map((w) => shiftToTimestampInterval('2026-01-01', w.openTime, w.closeTime, Boolean(w.crossMidnight)));
          for (let i = 0; i < intervals.length; i++) {
            for (let j = i + 1; j < intervals.length; j++) {
              if (intervals[i].startMs < intervals[j].endMs && intervals[j].startMs < intervals[i].endMs) {
                errors.push(`operatingDays.${d.weekday} has overlapping operating windows: ${d.windows[i].openTime}-${d.windows[i].closeTime} and ${d.windows[j].openTime}-${d.windows[j].closeTime}`);
              }
            }
          }
        }
      }
    }
  }

  const templateMap = new Map<string, ShiftTemplateConfigV2>();
  if (!Array.isArray(c.shiftTemplates) || c.shiftTemplates.length === 0) {
    errors.push('shiftTemplates must contain at least one active shift template');
  } else {
    for (const t of c.shiftTemplates) {
      if (!t.id || typeof t.id !== 'string') {
        errors.push('All shift templates must have a valid string id');
      } else if (templateMap.has(t.id)) {
        errors.push(`Duplicate shift template id: ${t.id}`);
      } else {
        templateMap.set(t.id, t);
      }

      const validStart = t.startTime && TIME_REGEX.test(t.startTime);
      const validEnd = t.endTime && TIME_REGEX.test(t.endTime);
      if (!validStart || !validEnd) {
        errors.push(`Shift template ${t.id} must have valid startTime and endTime in HH:mm format`);
      }

      if (!Number.isFinite(t.unpaidBreakMinutes) || !Number.isInteger(t.unpaidBreakMinutes) || t.unpaidBreakMinutes < 0) {
        errors.push(`Shift template ${t.id} unpaidBreakMinutes must be a finite integer >= 0`);
      }
      for (const requiredToken of t.requiredSkillsOrRoles || []) {
        if (isAuthorizationRoleToken(requiredToken)) {
          errors.push(`Shift template ${t.id} cannot use authorization role ${requiredToken} as a scheduling skill or role`);
        }
      }

      if (validStart && validEnd) {
        if (t.startTime === t.endTime) {
          errors.push(`Shift template ${t.id} startTime cannot equal endTime (${t.startTime})`);
        }
        if (t.startTime < t.endTime && t.crossMidnight === true) {
          errors.push(`Shift template ${t.id} has crossMidnight: true but startTime (${t.startTime}) is before endTime (${t.endTime})`);
        }
        if (t.startTime > t.endTime && t.crossMidnight === false) {
          errors.push(`Shift template ${t.id} spans past midnight (${t.startTime}-${t.endTime}) but crossMidnight is false`);
        }

        const derivedDuration = deriveShiftDurationHours(t.startTime, t.endTime, Boolean(t.crossMidnight), t.unpaidBreakMinutes || 0);
        if (!Number.isFinite(t.durationHours) || t.durationHours < 0.5 || t.durationHours > 24) {
          errors.push(`Shift template ${t.id} durationHours must be between 0.5 and 24`);
        } else if (Math.abs(t.durationHours - derivedDuration) > 0.05) {
          errors.push(`Shift template ${t.id} durationHours (${t.durationHours}) does not match derived duration (${derivedDuration}h) from start/end times and break.`);
        }
      }
    }
  }

  if (!Array.isArray(c.coverageRequirements)) {
    errors.push('coverageRequirements must be an array');
  } else {
    const seenCoverageWeekdays = new Set<string>();
    for (const pattern of c.coverageRequirements) {
      if (!VALID_WEEKDAYS.has(pattern.weekday)) {
        errors.push(`Invalid weekday in coverageRequirements: ${pattern.weekday}`);
      }
      if (seenCoverageWeekdays.has(pattern.weekday)) {
        errors.push(`Duplicate weekday in coverageRequirements: ${pattern.weekday}`);
      }
      seenCoverageWeekdays.add(pattern.weekday);
      const opDay = operatingDayMap.get(pattern.weekday);
      if (Array.isArray(pattern.slots)) {
        const seenCoverageTemplates = new Set<string>();
        for (const slot of pattern.slots) {
          if (seenCoverageTemplates.has(slot.shiftTemplateId)) {
            errors.push(`Duplicate coverage slot template ${slot.shiftTemplateId} on ${pattern.weekday}`);
          }
          seenCoverageTemplates.add(slot.shiftTemplateId);
          if (!slot.shiftTemplateId || !templateMap.has(slot.shiftTemplateId)) {
            errors.push(`Coverage slot references unknown shift template: ${slot.shiftTemplateId}`);
          } else {
            const tpl = templateMap.get(slot.shiftTemplateId)!;
            const minCount = typeof slot.minHeadcount === 'number' ? slot.minHeadcount : 0;
            const targetCount = typeof slot.targetHeadcount === 'number' ? slot.targetHeadcount : minCount;

            if (minCount > 0 || targetCount > 0) {
              if (opDay && !opDay.isOpen) {
                errors.push(`Cannot require coverage on closed operating day ${pattern.weekday}`);
              } else if (opDay && (!Array.isArray(opDay.windows) || opDay.windows.length === 0)) {
                errors.push(`Coverage slot shift template "${slot.shiftTemplateId}" on ${pattern.weekday} cannot be scheduled because the operating day has no operating windows.`);
              } else if (opDay && Array.isArray(opDay.windows) && opDay.windows.length > 0) {
                const fits = isShiftContainedInWindow(
                  tpl.startTime,
                  tpl.endTime,
                  opDay.windows,
                  undefined,
                  Boolean(tpl.crossMidnight)
                );
                if (!fits) {
                  errors.push(`Coverage slot shift template "${slot.shiftTemplateId}" on ${pattern.weekday} (${tpl.startTime}-${tpl.endTime}) does not fit within any configured operating window for that day.`);
                }
              }
            }
          }

          if (!Number.isFinite(slot.minHeadcount) || !Number.isInteger(slot.minHeadcount) || slot.minHeadcount < 0 || slot.minHeadcount > 30) {
            errors.push(`Coverage slot minHeadcount must be a finite integer between 0 and 30 for template ${slot.shiftTemplateId}`);
          }
          if (!Number.isFinite(slot.targetHeadcount) || !Number.isInteger(slot.targetHeadcount) || slot.targetHeadcount < (slot.minHeadcount || 0) || slot.targetHeadcount > 30) {
            errors.push(`Coverage slot targetHeadcount must be a finite integer between minHeadcount and 30 for template ${slot.shiftTemplateId}`);
          }
          if (
            typeof slot.maxHeadcount !== 'undefined' &&
            (!Number.isFinite(slot.maxHeadcount) || !Number.isInteger(slot.maxHeadcount) || slot.maxHeadcount < slot.targetHeadcount || slot.maxHeadcount > 30)
          ) {
            errors.push(`Coverage slot maxHeadcount must be a finite integer between targetHeadcount and 30 for template ${slot.shiftTemplateId}`);
          }
          if (slot.requiredRole && isAuthorizationRoleToken(slot.requiredRole)) {
            errors.push(`Coverage slot cannot use authorization role ${slot.requiredRole} as requiredRole`);
          }
          for (const optionalRole of slot.optionalCandidateRoles || []) {
            if (isAuthorizationRoleToken(optionalRole)) {
              errors.push(`Coverage slot cannot use authorization role ${optionalRole} as optionalCandidateRole`);
            }
          }
        }
      }
    }
  }

  if (c.complianceRules) {
    const r = c.complianceRules;
    if (!Number.isFinite(r.minDaysOffPerWeek) || !Number.isInteger(r.minDaysOffPerWeek) || r.minDaysOffPerWeek < 1 || r.minDaysOffPerWeek > 6) {
      errors.push('complianceRules.minDaysOffPerWeek must be between 1 and 6');
    }
    if (!Number.isFinite(r.targetDaysOffPerWeek) || !Number.isInteger(r.targetDaysOffPerWeek) || r.targetDaysOffPerWeek < (r.minDaysOffPerWeek || 1) || r.targetDaysOffPerWeek > 6) {
      errors.push('complianceRules.targetDaysOffPerWeek must be >= minDaysOffPerWeek and <= 6');
    }
    if (!Number.isFinite(r.maxConsecutiveWorkingDays) || !Number.isInteger(r.maxConsecutiveWorkingDays) || r.maxConsecutiveWorkingDays < 1 || r.maxConsecutiveWorkingDays > 14) {
      errors.push('complianceRules.maxConsecutiveWorkingDays must be between 1 and 14');
    }
    if (!Number.isFinite(r.minRestIntervalBetweenShiftsHours) || r.minRestIntervalBetweenShiftsHours < 8 || r.minRestIntervalBetweenShiftsHours > 24) {
      errors.push('complianceRules.minRestIntervalBetweenShiftsHours must be between 8 and 24');
    }
    if (!Number.isFinite(r.maxDailyWorkingHours) || r.maxDailyWorkingHours < 1 || r.maxDailyWorkingHours > 24) {
      errors.push('complianceRules.maxDailyWorkingHours must be between 1 and 24');
    }
    if (!Number.isFinite(r.maxWeeklyStandardHours) || r.maxWeeklyStandardHours < 10 || r.maxWeeklyStandardHours > 84) {
      errors.push('complianceRules.maxWeeklyStandardHours must be between 10 and 84');
    }
  } else {
    errors.push('complianceRules is required');
  }

  if (c.sundayAndHolidays) {
    const s = c.sundayAndHolidays;
    const mode = s.sundayMode || (s as any).sundayPolicy;
    const validSundayModes = ['CYCLIC_FAIR', 'FIXED_ASSIGNMENT', 'STANDARD_WEEKDAY_LIKE', 'CLOSED'];
    if (!validSundayModes.includes(mode)) {
      errors.push(`Invalid sundayMode: ${mode}`);
    }
    if (mode !== 'CLOSED') {
      if (!s.sundayShiftTemplateId || !templateMap.has(s.sundayShiftTemplateId)) {
        errors.push(`sundayShiftTemplateId references unknown template: ${s.sundayShiftTemplateId || 'none'}`);
      }
    }
    if (mode === 'FIXED_ASSIGNMENT') {
      if (!Array.isArray(s.fixedSundayEmployeeIds) || s.fixedSundayEmployeeIds.length === 0) {
        errors.push('fixedSundayEmployeeIds must contain at least one employee ID when sundayMode is FIXED_ASSIGNMENT');
      }
    }
    for (const participatingRole of s.participatingRoleTypes || []) {
      if (isAuthorizationRoleToken(participatingRole)) {
        errors.push(`Sunday policy cannot use authorization role ${participatingRole} as a participatingRoleType`);
      }
    }
  }

  if (c.specialDaysByDate && typeof c.specialDaysByDate === 'object') {
    const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    for (const [dateKey, override] of Object.entries(c.specialDaysByDate)) {
      if (!DATE_REGEX.test(dateKey)) {
        errors.push(`specialDaysByDate key "${dateKey}" is not a valid YYYY-MM-DD date`);
      }
      if (override && Array.isArray(override.operatingWindows)) {
        for (const w of override.operatingWindows) {
          if (!TIME_REGEX.test(w.openTime) || !TIME_REGEX.test(w.closeTime)) {
            errors.push(`specialDaysByDate[${dateKey}] operating window contains invalid time format: ${w.openTime}-${w.closeTime}`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function normalizeSchedulerConfig(
  rawSettings: any,
  rawEmployees: any[] = [],
  businessCategory: BusinessCategory = 'FUEL_STATION',
  tenantId = 'default'
): SchedulerConfigV2 {
  if (rawSettings?.schemaVersion === 2 && Array.isArray(rawSettings?.shiftTemplates)) {
    return {
      ...rawSettings,
      tenantId: tenantId || rawSettings.tenantId || 'default',
    };
  }

  const base = getDefaultCategoryConfig(tenantId, businessCategory);
  const legacyRules = rawSettings?.generatorRules || rawSettings?.rules || rawSettings || {};
  const legacySpecialDays = rawSettings?.specialDaysByDate || legacyRules?.specialDaysByDate || {};

  const specialDaysByDate: Record<string, SpecialDayOverride> = {};
  for (const [date, val] of Object.entries(legacySpecialDays)) {
    const raw = (val || {}) as any;
    specialDaysByDate[date] = {
      date,
      isHoliday: Boolean(raw.isHoliday),
      isSpecialOperatingHours: Boolean(raw.isSpecialDay),
      label: raw.label || (raw.isHoliday ? 'Αργία' : 'Ειδικό Ωράριο'),
      operatingWindows: raw.operatingStartTime && raw.operatingEndTime ? [{ openTime: raw.operatingStartTime, closeTime: raw.operatingEndTime }] : undefined,
    };
  }

  return {
    ...base,
    tenantId,
    specialDaysByDate,
    legacyRotation: {
      weeklyRotationEnabled: legacyRules.weeklyRotationEnabled !== false,
      startWithCoreAMorning: legacyRules.startWithCoreAMorning !== false,
      allowManualOverride: legacyRules.allowManualOverride !== false,
      avoidConsecutiveSundays: legacyRules.avoidConsecutiveSundays !== false,
    },
    sundayAndHolidays: {
      ...base.sundayAndHolidays,
      avoidConsecutiveSundays: legacyRules.avoidConsecutiveSundays !== false,
    },
  };
}
