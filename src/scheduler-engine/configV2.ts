import type { EmployeeScheduleConfig, Weekday } from './types.ts';

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

export function getDefaultCategoryConfig(
  tenantId = 'default',
  category: BusinessCategory = 'FUEL_STATION'
): SchedulerConfigV2 {
  const isFuel = category === 'FUEL_STATION';
  const isSalon = category === 'HAIR_SALON';

  const defaultOperatingDays: OperatingDayConfig[] = [
    { weekday: 'MONDAY', isOpen: true, windows: [{ openTime: isSalon ? '09:00' : '06:00', closeTime: isSalon ? '20:00' : '22:00' }] },
    { weekday: 'TUESDAY', isOpen: true, windows: [{ openTime: isSalon ? '09:00' : '06:00', closeTime: isSalon ? '20:00' : '22:00' }] },
    { weekday: 'WEDNESDAY', isOpen: true, windows: [{ openTime: isSalon ? '09:00' : '06:00', closeTime: isSalon ? '20:00' : '22:00' }] },
    { weekday: 'THURSDAY', isOpen: true, windows: [{ openTime: isSalon ? '09:00' : '06:00', closeTime: isSalon ? '20:00' : '22:00' }] },
    { weekday: 'FRIDAY', isOpen: true, windows: [{ openTime: isSalon ? '09:00' : '06:00', closeTime: isSalon ? '20:00' : '22:00' }] },
    { weekday: 'SATURDAY', isOpen: true, windows: [{ openTime: isSalon ? '09:00' : '06:00', closeTime: isSalon ? '18:00' : '22:00' }] },
    { weekday: 'SUNDAY', isOpen: !isSalon, windows: [{ openTime: '08:00', closeTime: '20:00' }] },
  ];

  const defaultTemplates: ShiftTemplateConfigV2[] = isFuel
    ? [
        { id: 'morning', label: 'Πρωινή', shortCode: 'ΠΡ', shiftType: 'MORNING', startTime: '06:00', endTime: '14:00', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#1D4ED8', isActive: true },
        { id: 'intermediate-1000', label: 'Ενδιάμεση (10:00)', shortCode: 'ΕΝΔ', shiftType: 'INTERMEDIATE', startTime: '10:00', endTime: '18:00', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#D97706', isActive: true },
        { id: 'intermediate-0900', label: 'Ενδιάμεση (09:00)', shortCode: 'ΕΝΔ9', shiftType: 'INTERMEDIATE', startTime: '09:00', endTime: '17:00', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#D97706', isActive: true },
        { id: 'afternoon', label: 'Απογευματινή', shortCode: 'ΑΠΟ', shiftType: 'AFTERNOON', startTime: '14:00', endTime: '22:00', durationHours: 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#4338CA', isActive: true },
        { id: 'sunday-12h', label: 'Κυριακή 12ωρη', shortCode: 'ΚΥΡ', shiftType: 'SPECIAL', startTime: '08:00', endTime: '20:00', durationHours: 12.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#BE185D', isActive: true },
      ]
    : [
        { id: 'morning', label: 'Πρωινή', shortCode: 'ΠΡ', shiftType: 'MORNING', startTime: isSalon ? '09:00' : '07:00', endTime: isSalon ? '15:00' : '15:00', durationHours: isSalon ? 6.0 : 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#1D4ED8', isActive: true },
        { id: 'afternoon', label: 'Απογευματινή', shortCode: 'ΑΠΟ', shiftType: 'AFTERNOON', startTime: isSalon ? '14:00' : '15:00', endTime: isSalon ? '20:00' : '23:00', durationHours: isSalon ? 6.0 : 8.0, unpaidBreakMinutes: 0, crossMidnight: false, color: '#4338CA', isActive: true },
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
      participatingRoleTypes: ['CORE_A', 'CORE_B', 'FLEX_A', 'FLEX_B', 'EXTRA_A', 'EXTRA_B'],
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
      if (typeof d.isOpen !== 'boolean') {
        errors.push(`operatingDays.${d.weekday}.isOpen must be a boolean`);
      }
      if (!Array.isArray(d.windows)) {
        errors.push(`operatingDays.${d.weekday}.windows must be an array`);
      } else {
        for (const w of d.windows) {
          if (!TIME_REGEX.test(w.openTime) || !TIME_REGEX.test(w.closeTime)) {
            errors.push(`operatingDays.${d.weekday} window contains invalid time format: ${w.openTime}-${w.closeTime}`);
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

      if (!t.startTime || !TIME_REGEX.test(t.startTime) || !t.endTime || !TIME_REGEX.test(t.endTime)) {
        errors.push(`Shift template ${t.id} must have valid startTime and endTime in HH:mm format`);
      }
      if (typeof t.durationHours !== 'number' || t.durationHours <= 0 || t.durationHours > 24) {
        errors.push(`Shift template ${t.id} durationHours must be between 0.5 and 24`);
      }
    }
  }

  if (!Array.isArray(c.coverageRequirements)) {
    errors.push('coverageRequirements must be an array');
  } else {
    for (const pattern of c.coverageRequirements) {
      if (!VALID_WEEKDAYS.has(pattern.weekday)) {
        errors.push(`Invalid weekday in coverageRequirements: ${pattern.weekday}`);
      }
      if (Array.isArray(pattern.slots)) {
        for (const slot of pattern.slots) {
          if (!slot.shiftTemplateId || !templateMap.has(slot.shiftTemplateId)) {
            errors.push(`Coverage slot references unknown shift template: ${slot.shiftTemplateId}`);
          }
          if (typeof slot.minHeadcount !== 'number' || slot.minHeadcount < 0) {
            errors.push(`Coverage slot minHeadcount must be >= 0 for template ${slot.shiftTemplateId}`);
          }
          if (typeof slot.targetHeadcount !== 'number' || slot.targetHeadcount < (slot.minHeadcount || 0)) {
            errors.push(`Coverage slot targetHeadcount must be >= minHeadcount for template ${slot.shiftTemplateId}`);
          }
          if (typeof slot.maxHeadcount === 'number' && slot.maxHeadcount < slot.targetHeadcount) {
            errors.push(`Coverage slot maxHeadcount must be >= targetHeadcount for template ${slot.shiftTemplateId}`);
          }
        }
      }
    }
  }

  if (c.complianceRules) {
    const r = c.complianceRules;
    if (typeof r.maxConsecutiveWorkingDays !== 'number' || r.maxConsecutiveWorkingDays < 1 || r.maxConsecutiveWorkingDays > 14) {
      errors.push('complianceRules.maxConsecutiveWorkingDays must be between 1 and 14');
    }
    if (typeof r.minRestIntervalBetweenShiftsHours !== 'number' || r.minRestIntervalBetweenShiftsHours < 8 || r.minRestIntervalBetweenShiftsHours > 24) {
      errors.push('complianceRules.minRestIntervalBetweenShiftsHours must be between 8 and 24');
    }
    if (typeof r.maxDailyWorkingHours !== 'number' || r.maxDailyWorkingHours < 1 || r.maxDailyWorkingHours > 24) {
      errors.push('complianceRules.maxDailyWorkingHours must be between 1 and 24');
    }
    if (typeof r.maxWeeklyStandardHours !== 'number' || r.maxWeeklyStandardHours < 10 || r.maxWeeklyStandardHours > 84) {
      errors.push('complianceRules.maxWeeklyStandardHours must be between 10 and 84');
    }
  } else {
    errors.push('complianceRules is required');
  }

  if (c.sundayAndHolidays) {
    const s = c.sundayAndHolidays;
    const mode = s.sundayMode || s.sundayPolicy;
    const validSundayModes = ['CYCLIC_FAIR', 'FIXED_ASSIGNMENT', 'STANDARD_WEEKDAY_LIKE', 'CLOSED'];
    if (!validSundayModes.includes(mode)) {
      errors.push(`Invalid sundayMode: ${mode}`);
    }
    if (mode !== 'CLOSED' && s.sundayShiftTemplateId && !templateMap.has(s.sundayShiftTemplateId)) {
      errors.push(`sundayShiftTemplateId references unknown template: ${s.sundayShiftTemplateId}`);
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
