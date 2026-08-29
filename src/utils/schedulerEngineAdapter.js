import { generateSchedule } from '../scheduler-engine/index.ts';
import { SHIFT_TYPES } from './analytics.js';

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

export function validateSchedulerEmployeeCapacity(employees = []) {
  const activeEmployees = (employees || []).filter((e) => e?.isActive !== false && e?.id);
  if (activeEmployees.length < 4) {
    return {
      valid: false,
      count: activeEmployees.length,
      message: 'Το αυτόματο πρόγραμμα χρειάζεται τουλάχιστον 4 ενεργούς εργαζομένους.',
    };
  }
  if (activeEmployees.length > 6) {
    return {
      valid: false,
      count: activeEmployees.length,
      message: 'Το αυτόματο πρόγραμμα υποστηρίζει έως 6 ενεργούς εργαζομένους.',
    };
  }
  return {
    valid: true,
    count: activeEmployees.length,
    message: '',
  };
}

function resolveEngineRoleMap(employees) {
  const sorted = [...employees].sort(stableEmployeeSort);
  const roleById = new Map();
  const assignedRoles = new Set();

  const isExplicitCustom = (emp) => {
    const token = getEmployeeRoleToken(emp);
    return token === 'CUSTOM' || token === 'EXTRA' || token === 'SUBSTITUTE';
  };

  const isExplicitCore1 = (emp) => {
    const token = getEmployeeRoleToken(emp);
    return token === 'CORE_A' || token === 'CORE1' || token === 'CORE_1' || token === 'COREA';
  };

  const isExplicitCore2 = (emp) => {
    const token = getEmployeeRoleToken(emp);
    return token === 'CORE_B' || token === 'CORE2' || token === 'CORE_2' || token === 'COREB';
  };

  const isExplicitIntermediate = (emp) => {
    const token = getEmployeeRoleToken(emp);
    return (
      token === 'INTERMEDIATE' ||
      token === 'COVERAGE' ||
      token === 'FLEX_A' ||
      token === 'FLEX_B' ||
      token === 'FLEX1' ||
      token === 'FLEX2'
    );
  };

  // 1. Explicit Core 1 (maps to CORE_A)
  sorted.forEach((employee) => {
    if (isExplicitCore1(employee)) {
      if (!assignedRoles.has('CORE_A')) {
        roleById.set(employee.id, 'CORE_A');
        assignedRoles.add('CORE_A');
      }
    }
  });

  // 2. Explicit Core 2 (maps to CORE_B)
  sorted.forEach((employee) => {
    if (roleById.has(employee.id)) return;
    if (isExplicitCore2(employee)) {
      if (!assignedRoles.has('CORE_B')) {
        roleById.set(employee.id, 'CORE_B');
        assignedRoles.add('CORE_B');
      }
    }
  });

  // 3. Explicit Intermediate (maps to FLEX_A, then FLEX_B)
  sorted.forEach((employee) => {
    if (roleById.has(employee.id)) return;
    if (isExplicitIntermediate(employee)) {
      if (!assignedRoles.has('FLEX_A')) {
        roleById.set(employee.id, 'FLEX_A');
        assignedRoles.add('FLEX_A');
      } else if (!assignedRoles.has('FLEX_B')) {
        roleById.set(employee.id, 'FLEX_B');
        assignedRoles.add('FLEX_B');
      }
    }
  });

  // 4. Explicit Custom / Extra (maps ONLY to EXTRA_A, then EXTRA_B, NEVER base slots)
  sorted.forEach((employee) => {
    if (roleById.has(employee.id)) return;
    if (isExplicitCustom(employee)) {
      if (!assignedRoles.has('EXTRA_A')) {
        roleById.set(employee.id, 'EXTRA_A');
        assignedRoles.add('EXTRA_A');
      } else if (!assignedRoles.has('EXTRA_B')) {
        roleById.set(employee.id, 'EXTRA_B');
        assignedRoles.add('EXTRA_B');
      }
    }
  });

  // 5. Legacy / unconfigured fallback ONLY for employees without explicit modern role
  const unassignedLegacy = sorted.filter(
    (emp) =>
      !roleById.has(emp.id) &&
      !isExplicitCustom(emp) &&
      !isExplicitCore1(emp) &&
      !isExplicitCore2(emp) &&
      !isExplicitIntermediate(emp),
  );

  const baseSlots = ['CORE_A', 'CORE_B', 'FLEX_A', 'FLEX_B'];
  for (const slot of baseSlots) {
    if (!assignedRoles.has(slot) && unassignedLegacy.length > 0) {
      const nextEmp = unassignedLegacy.shift();
      roleById.set(nextEmp.id, slot);
      assignedRoles.add(slot);
    }
  }

  const extraSlots = ['EXTRA_A', 'EXTRA_B'];
  for (const slot of extraSlots) {
    if (!assignedRoles.has(slot) && unassignedLegacy.length > 0) {
      const nextEmp = unassignedLegacy.shift();
      roleById.set(nextEmp.id, slot);
      assignedRoles.add(slot);
    }
  }

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
  if (token.includes('INTERMEDIATE_0900') || token.includes('0900') || token.includes('09_00')) return 'INTERMEDIATE_0900';
  if (token.includes('INTERMEDIATE_1000') || token.includes('1000') || token.includes('10_00')) return 'INTERMEDIATE_1000';
  if (token.includes('INTERMEDIATE')) return 'INTERMEDIATE';
  if (token.includes('EVENING') || token.includes('AFTERNOON')) return 'AFTERNOON';
  return 'AUTO';
}

function toEngineRules(rules = {}) {
  return {
    weeklyRotationEnabled: rules.weeklyRotationEnabled !== false,
    avoidConsecutiveSundays: rules.avoidConsecutiveSundays !== false,
    startWithCoreAMorning: rules.startWithCoreAMorning !== false,
  };
}

function toEngineEmployee(employee, scheduleRole, rules = {}) {
  const rawFixedDayOff = rules.fixedDaysOff?.[employee.id] ?? employee.fixedDayOff;
  const fixedDayOff = toEngineWeekday(rawFixedDayOff);
  const isExtra = typeof scheduleRole === 'string' && scheduleRole.startsWith('EXTRA');
  return {
    employeeId: employee.id,
    fullName: employee.fullName || employee.id,
    scheduleRole,
    isEnabled: employee.isActive !== false,
    fixedDayOff,
    defaultShiftPreference: mapShiftPreference(employee.defaultShiftPreference),
    participatesInWeeklyRotation: employee.participatesInRotation !== false,
    participatesInSundayRotation: employee.participatesInSundayRotation !== false,
    weeklyFixedShiftSideRotation: employee.weeklyFixedShiftSideRotation === true,
    extraMode: employee.extraMode || (isExtra ? 'SUBSTITUTE_ONLY' : undefined),
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
  return activeEmployees.map((employee) => {
    const scheduleRole = roleById.get(employee.id) || 'EXTRA_A';
    return toEngineEmployee(employee, scheduleRole, rules);
  });
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

function toEngineStoredAbsence(absence) {
  return {
    id: absence.id || `stored-absence-${absence.employeeId}-${absence.startDate}-${absence.endDate}`,
    employeeId: absence.employeeId,
    type: ['LEAVE', 'SICK', 'OTHER'].includes(absence.type) ? absence.type : 'OTHER',
    startDate: absence.startDate,
    endDate: absence.endDate || absence.startDate,
    scope: absence.scope || 'FULL_DAY',
    replacementMode: absence.replacementMode || 'AUTO',
    manualReplacementEmployeeId: absence.manualReplacementEmployeeId || undefined,
    note: absence.note || '',
    createdAt: absence.createdAt || `${absence.startDate}T00:00:00.000Z`,
    updatedAt: absence.updatedAt || `${absence.startDate}T00:00:00.000Z`,
  };
}

function toEngineAbsences(shifts = [], visibleDates = []) {
  const visibleSet = new Set(visibleDates);
  return (shifts || [])
    .filter((shift) => visibleSet.has(shift.date))
    .filter((shift) => shift?.employeeId && (shift.type === SHIFT_TYPES.REST || shift.type === SHIFT_TYPES.LEAVE || shift.type === SHIFT_TYPES.SICK))
    .map(toEngineAbsence);
}

function toEngineStoredAbsences(absences = [], startDate, endDate) {
  return (absences || [])
    .filter((absence) => absence?.status !== 'CANCELLED')
    .filter((absence) => absence?.employeeId && absence?.startDate && absence?.endDate)
    .filter((absence) => absence.startDate <= endDate && absence.endDate >= startDate)
    .map(toEngineStoredAbsence);
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
    source: shift.source,
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
  absences = [],
  rules = {},
}) {
  if (!Array.isArray(weekDays) || weekDays.length !== 7) {
    throw new Error('Μη έγκυρες ημέρες εβδομάδας για scheduler engine.');
  }

  const capacity = validateSchedulerEmployeeCapacity(employees);
  if (!capacity.valid) {
    return {
      shifts: [],
      warnings: [capacity.message],
      meta: {
        engine: 'scheduler-engine',
        valid: false,
        resolvedRoles: { roles: {}, extras: [], baseEmployees: [], warnings: [] },
        dayPlans: [],
      },
    };
  }

  const engineEmployees = toEngineEmployees(employees, rules);
  const engineAbsences = [
    ...toEngineAbsences(allShifts, weekDays),
    ...toEngineStoredAbsences(absences, weekDays[0], weekDays[weekDays.length - 1]),
  ];
  const engineResult = generateSchedule({
    startDate: weekDays[0],
    endDate: weekDays[weekDays.length - 1],
    employees: engineEmployees,
    absences: engineAbsences,
    rules: toEngineRules(rules),
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
  absences = [],
  rules = {},
}) {
  const monthDays = getMonthDays(year, month);
  const capacity = validateSchedulerEmployeeCapacity(employees);
  if (!capacity.valid) {
    return {
      shifts: [],
      warnings: [capacity.message],
      unresolvedGaps: [],
      validation: {
        valid: false,
        violations: [
          {
            id: 'capacity-violation',
            code: 'UNSUPPORTED_CAPACITY',
            message: capacity.message,
            severity: 'error',
          },
        ],
      },
      meta: {
        monthDays,
        engine: 'scheduler-engine',
        valid: false,
        resolvedRoles: { roles: {}, extras: [], baseEmployees: [], warnings: [] },
        dayPlans: [],
      },
    };
  }

  const engineEmployees = toEngineEmployees(employees, rules);
  const engineAbsences = [
    ...toEngineAbsences([...allShifts, ...existingMonthShifts], monthDays),
    ...toEngineStoredAbsences(absences, monthDays[0], monthDays[monthDays.length - 1]),
  ];
  const engineResult = generateSchedule({
    startDate: monthDays[0],
    endDate: monthDays[monthDays.length - 1],
    employees: engineEmployees,
    absences: engineAbsences,
    rules: toEngineRules(rules),
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
