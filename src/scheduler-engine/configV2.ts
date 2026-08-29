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
        { weekday: 'MONDAY', dayType: 'FULL_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 2, targetHeadcount: 2, requiredRole: 'CORE_A' }, { shiftTemplateId: 'afternoon', minHeadcount: 2, targetHeadcount: 2, requiredRole: 'CORE_B' }] },
        { weekday: 'TUESDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'intermediate-1000', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'WEDNESDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'intermediate-1000', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'THURSDAY', dayType: 'STANDARD_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'intermediate-1000', minHeadcount: 1, targetHeadcount: 1 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 1 }] },
        { weekday: 'FRIDAY', dayType: 'FULL_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 1, targetHeadcount: 2 }, { shiftTemplateId: 'afternoon', minHeadcount: 1, targetHeadcount: 2 }] },
        { weekday: 'SATURDAY', dayType: 'FULL_COVERAGE', slots: [{ shiftTemplateId: 'morning', minHeadcount: 2, targetHeadcount: 2 }, { shiftTemplateId: 'afternoon', minHeadcount: 2, targetHeadcount: 2 }] },
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
  }
  if (!Array.isArray(c.shiftTemplates) || c.shiftTemplates.length === 0) {
    errors.push('shiftTemplates must contain at least one active shift template');
  } else {
    const templateIds = new Set<string>();
    for (const t of c.shiftTemplates) {
      if (!t.id || typeof t.id !== 'string') {
        errors.push('All shift templates must have a valid string id');
      } else if (templateIds.has(t.id)) {
        errors.push(`Duplicate shift template id: ${t.id}`);
      }
      templateIds.add(t.id);

      if (!t.startTime || !t.endTime) {
        errors.push(`Shift template ${t.id} must have startTime and endTime`);
      }
      if (typeof t.durationHours !== 'number' || t.durationHours <= 0 || t.durationHours > 24) {
        errors.push(`Shift template ${t.id} durationHours must be between 0.5 and 24`);
      }
    }
  }

  if (!Array.isArray(c.coverageRequirements)) {
    errors.push('coverageRequirements must be an array');
  }

  if (c.complianceRules) {
    const r = c.complianceRules;
    if (typeof r.maxConsecutiveWorkingDays !== 'number' || r.maxConsecutiveWorkingDays < 1 || r.maxConsecutiveWorkingDays > 14) {
      errors.push('complianceRules.maxConsecutiveWorkingDays must be between 1 and 14');
    }
    if (typeof r.minRestIntervalBetweenShiftsHours !== 'number' || r.minRestIntervalBetweenShiftsHours < 8 || r.minRestIntervalBetweenShiftsHours > 24) {
      errors.push('complianceRules.minRestIntervalBetweenShiftsHours must be between 8 and 24');
    }
  } else {
    errors.push('complianceRules is required');
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
  const legacySpecialDays = rawSettings?.specialDaysByDate || {};

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
