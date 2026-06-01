import { generateSchedule } from '../scheduler-engine/index.ts';
import { SHIFT_TYPES } from './analytics';

const APP_SHIFT_TYPES = {
  MORNING: 'morning',
  INTERMEDIATE: 'intermediate',
  AFTERNOON: 'evening',
  SUNDAY_12H: 'custom',
};

const APP_SHIFT_LABELS = {
  MORNING: 'Πρωινός',
  INTERMEDIATE: 'Ενδιάμεσος',
  AFTERNOON: 'Απογευματινός',
  SUNDAY_12H: 'Κυριακή',
};

const NUMERIC_WEEKDAY_TO_ENGINE = {
  0: 'SUNDAY',
  1: 'MONDAY',
  2: 'TUESDAY',
  3: 'WEDNESDAY',
  4: 'THURSDAY',
  5: 'FRIDAY',
  6: 'SATURDAY',
};

function normalizeRoleToken(value) {
  return `${value || ''}`
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s-]+/g, '_');
}

function getEmployeeRoleToken(employee) {
  return normalizeRoleToken(employee?.scheduleRole || employee?.roleType || '');
}

function mapExplicitRole(token) {
  if (token === 'CORE_A' || token === 'CORE1' || token === 'CORE_1' || token === 'COREA') return 'CORE_A';
  if (token === 'CORE_B' || token === 'CORE2' || token === 'CORE_2' || token === 'COREB') return 'CORE_B';
  if (token === 'FLEX_A' || token === 'FLEX1' || token === 'FLEX_1') return 'FLEX_A';
  if (token === 'FLEX_B' || token === 'FLEX2' || token === 'FLEX_2') return 'FLEX_B';
  if (token === 'EXTRA_A' || token === 'EXTRA1' || token === 'EXTRA_1') return 'EXTRA_A';
  if (token === 'EXTRA_B' || token === 'EXTRA2' || token === 'EXTRA_2') return 'EXTRA_B';
  return '';
}

function stableEmployeeSort(a, b) {
  return (
    (a.fullName || '').localeCompare(b.fullName || '', 'el') ||
    `${a.id || a.employeeId || ''}`.localeCompare(`${b.id || b.employeeId || ''}`)
  );
}

function resolveEngineRoleMap(employees) {
  const sorted = [...employees].sort(stableEmployeeSort);
  const roleById = new Map();

  sorted.forEach((employee) => {
    const explicit = mapExplicitRole(getEmployeeRoleToken(employee));
    if (explicit) roleById.set(employee.id, explicit);
  });

  const assignFirst = (role, predicate) => {
    if ([...roleById.values()].includes(role)) return;
    const employee = sorted.find((item) => !roleById.has(item.id) && predicate(getEmployeeRoleToken(item), item));
    if (employee) roleById.set(employee.id, role);
  };

  assignFirst('CORE_A', (token) => token === 'CORE');
  assignFirst('CORE_B', (token) => token === 'CORE');
  assignFirst('FLEX_A', (token) => token === 'INTERMEDIATE' || token === 'COVERAGE');
  assignFirst('FLEX_B', (token) => token === 'INTERMEDIATE' || token === 'COVERAGE');
  assignFirst('EXTRA_A', (token) => token === 'CUSTOM' || token === 'GENERAL' || token === '');
  assignFirst('EXTRA_B', (token) => token === 'CUSTOM' || token === 'GENERAL' || token === '');

  return roleById;
}

function toEngineWeekday(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return NUMERIC_WEEKDAY_TO_ENGINE[value];
  const token = normalizeRoleToken(value);
  if (NUMERIC_WEEKDAY_TO_ENGINE[token]) return NUMERIC_WEEKDAY_TO_ENGINE[token];
  if (['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].includes(token)) return token;
  return undefined;
}

function mapShiftPreference(value) {
  const token = normalizeRoleToken(value);
  if (token.includes('MORNING')) return 'MORNING';
  if (token.includes('INTERMEDIATE')) return 'INTERMEDIATE';
  if (token.includes('EVENING') || token.includes('AFTERNOON')) return 'AFTERNOON';
  return 'AUTO';
}

function toEngineEmployee(employee, scheduleRole, rules = {}) {
  const fixedDayOff = toEngineWeekday(rules.fixedDaysOff?.[employee.id] ?? employee.fixedDayOff);
  return {
    employeeId: employee.id,
    fullName: employee.fullName || employee.id,
    scheduleRole,
    isEnabled: employee.isActive !== false,
    fixedDayOff,
    defaultShiftPreference: mapShiftPreference(employee.defaultShiftPreference),
    participatesInWeeklyRotation: employee.participatesInRotation !== false,
    participatesInSundayRotation: employee.participatesInSundayRotation !== false,
    extraMode: employee.extraMode || (scheduleRole.startsWith('EXTRA') ? 'SUBSTITUTE_ONLY' : undefined),
    activeFrom: employee.activeFrom || undefined,
    activeTo: employee.activeTo || undefined,
    canCoverLeaves: employee.canCoverLeaves !== false,
    canWorkMorning: employee.canWorkMorning !== false,
    canWorkIntermediate: employee.canWorkIntermediate !== false,
    canWorkAfternoon: employee.canWorkAfternoon !== false,
    canWorkSunday: employee.canWorkSunday !== false,
  };
}

function toEngineEmployees(employees = [], rules = {}) {
  const activeEmployees = (employees || []).filter((employee) => employee?.isActive !== false && employee?.id);
  const roleById = resolveEngineRoleMap(activeEmployees);
  return activeEmployees
    .filter((employee) => roleById.has(employee.id))
    .map((employee) => toEngineEmployee(employee, roleById.get(employee.id), rules));
}

function toEngineAbsence(shift) {
  const type = shift.type === SHIFT_TYPES.SICK ? 'SICK' : shift.type === SHIFT_TYPES.LEAVE ? 'LEAVE' : 'OTHER';
  return {
    id: shift.id || `absence-${shift.employeeId}-${shift.date}`,
    employeeId: shift.employeeId,
    type,
    startDate: shift.date,
    endDate: shift.date,
    scope: 'FULL_DAY',
    replacementMode: 'AUTO',
    note: shift.notes || '',
    createdAt: shift.createdAt || `${shift.date}T00:00:00.000Z`,
    updatedAt: shift.updatedAt || `${shift.date}T00:00:00.000Z`,
  };
}

function toEngineAbsences(shifts = [], visibleDates = []) {
  const visibleSet = new Set(visibleDates);
  return (shifts || [])
    .filter((shift) => visibleSet.has(shift.date))
    .filter((shift) => shift?.employeeId && (shift.type === SHIFT_TYPES.REST || shift.type === SHIFT_TYPES.LEAVE || shift.type === SHIFT_TYPES.SICK))
    .map(toEngineAbsence);
}

function toAppWarning(warning) {
  if (typeof warning === 'string') return warning;
  return warning?.message || warning?.code || 'Προειδοποίηση scheduler engine.';
}

function toAppShift(shift) {
  return {
    employeeId: shift.employeeId,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    type: SHIFT_TYPES.WORK,
    label: APP_SHIFT_LABELS[shift.shiftType] || 'Εργασία',
    shiftType: APP_SHIFT_TYPES[shift.shiftType] || 'custom',
    customLabel: shift.shiftType === 'SUNDAY_12H' ? 'Κυριακή' : '',
    notes: `Auto-generated scheduler engine (${shift.source})`,
    isHoliday: false,
    isSpecialDay: false,
    specialDayLabel: '',
    isManualOverride: false,
  };
}

function timeToMinutes(value) {
  const [hours, minutes] = `${value || '00:00'}`.split(':').map(Number);
  return hours * 60 + minutes;
}

function overlaps(a, b) {
  if (a.date !== b.date) return false;
  return timeToMinutes(a.startTime) < timeToMinutes(b.endTime) && timeToMinutes(b.startTime) < timeToMinutes(a.endTime);
}

function filterAgainstManualEntries(shifts, existingShifts = []) {
  const manualEntries = (existingShifts || []).filter((shift) => shift.isManualOverride);
  if (!manualEntries.length) return shifts;
  return shifts.filter((shift) => {
    return !manualEntries.some((manual) => {
      if (manual.date !== shift.date) return false;
      if (manual.employeeId === shift.employeeId) return true;
      if ((manual.type || SHIFT_TYPES.WORK) !== SHIFT_TYPES.WORK) return false;
      return overlaps(manual, shift);
    });
  });
}

function getMonthDays(year, month) {
  const days = [];
  const date = new Date(Date.UTC(year, month, 1));
  while (date.getUTCMonth() === month) {
    days.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return days;
}

function collectWarnings(engineResult) {
  return [
    ...(engineResult.warnings || []).map(toAppWarning),
    ...((engineResult.validation?.violations || []).map(toAppWarning)),
  ];
}

export async function generateEngineWeekSchedule({
  weekDays,
  employees,
  allShifts = [],
  rules = {},
}) {
  if (!Array.isArray(weekDays) || weekDays.length !== 7) {
    throw new Error('Μη έγκυρες ημέρες εβδομάδας για scheduler engine.');
  }

  const engineEmployees = toEngineEmployees(employees, rules);
  const engineResult = generateSchedule({
    startDate: weekDays[0],
    endDate: weekDays[weekDays.length - 1],
    employees: engineEmployees,
    absences: toEngineAbsences(allShifts, weekDays),
  });

  return {
    shifts: filterAgainstManualEntries(engineResult.shifts.map(toAppShift), allShifts),
    warnings: collectWarnings(engineResult),
    meta: {
      engine: 'scheduler-engine',
      resolvedRoles: engineResult.debug.resolvedRoles,
      dayPlans: engineResult.debug.dayPlans,
    },
  };
}

export function generateEngineMonthSchedule({
  month,
  year,
  employees,
  allShifts = [],
  existingMonthShifts = [],
  rules = {},
}) {
  const monthDays = getMonthDays(year, month);
  const engineEmployees = toEngineEmployees(employees, rules);
  const engineResult = generateSchedule({
    startDate: monthDays[0],
    endDate: monthDays[monthDays.length - 1],
    employees: engineEmployees,
    absences: toEngineAbsences([...allShifts, ...existingMonthShifts], monthDays),
  });

  return {
    shifts: filterAgainstManualEntries(engineResult.shifts.map(toAppShift), existingMonthShifts),
    warnings: collectWarnings(engineResult),
    unresolvedGaps: engineResult.unresolvedGaps,
    validation: engineResult.validation,
    meta: {
      monthDays,
      engine: 'scheduler-engine',
      resolvedRoles: engineResult.debug.resolvedRoles,
      dayPlans: engineResult.debug.dayPlans,
    },
  };
}
