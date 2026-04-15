import { SHIFT_TYPES } from './analytics';
import { getMonthDays, getWeekStartFromDate, inferShiftTypeFromTimes } from './scheduleUtils';
import { formatDateGreek, getIsoDate } from './time';

const MORNING_SHIFT = { shiftType: 'morning', startTime: '06:00', endTime: '14:00', label: 'Πρωινός' };
const EVENING_SHIFT = { shiftType: 'evening', startTime: '14:00', endTime: '22:00', label: 'Απογευματινός' };
const INTERMEDIATE_SHIFT_A = { shiftType: 'intermediate', startTime: '09:00', endTime: '17:00', label: 'Ενδιάμεσος' };
const INTERMEDIATE_SHIFT_B = { shiftType: 'intermediate', startTime: '10:00', endTime: '18:00', label: 'Ενδιάμεσος' };
const SUNDAY_SHIFT = {
  shiftType: 'custom',
  startTime: '08:00',
  endTime: '20:00',
  label: 'Κυριακή',
  customLabel: 'Κυριακή 08:00-20:00',
};

const DEFAULT_FIXED_DAYS_OFF = {
  coreA: 3,
  coreB: 4,
  intermediate: 2,
};

const DEFAULT_MONTH_RULES = {
  weeklyRotationEnabled: true,
  avoidConsecutiveSundays: true,
  allowManualOverride: true,
  fixedDaysOff: {},
  specialDaysByDate: {},
  startWithCoreAMorning: true,
};
const DEFAULT_WEEK_RULES = {
  weeklyRotationEnabled: true,
  avoidConsecutiveSundays: true,
  allowManualOverride: true,
  startWithCoreAMorning: true,
  generationMode: 'balanced', // strict | balanced | manual_assist
  fixedDaysOff: {},
};
const INTERMEDIATE_EXTRA_WEEKDAYS = new Set([1, 5, 6]); // Mon, Fri, Sat
const INTERMEDIATE_PRIMARY_WEEKDAYS = new Set([2, 3, 4]); // Tue, Wed, Thu
const CORE_FIXED_OFF_WEEKDAYS = { coreA: 2, coreB: 3, intermediate: 4 }; // Tue/Wed/Thu

function shiftKey(shift) {
  return `${shift.date}_${shift.employeeId}_${shift.startTime}_${shift.endTime}_${shift.type || SHIFT_TYPES.WORK}`;
}

function toDate(value) {
  return new Date(`${value}T00:00:00`);
}

function addDays(isoDate, delta) {
  const value = toDate(isoDate);
  value.setDate(value.getDate() + delta);
  return getIsoDate(value);
}

function minutesFromTime(value) {
  const [hours, minutes] = (value || '00:00').split(':').map(Number);
  return hours * 60 + minutes;
}

function hasOverlap(list, candidate) {
  const startA = minutesFromTime(candidate.startTime);
  const endA = minutesFromTime(candidate.endTime);

  return list.some((item) => {
    if (item.employeeId !== candidate.employeeId) return false;
    if (item.date !== candidate.date) return false;
    const startB = minutesFromTime(item.startTime);
    const endB = minutesFromTime(item.endTime);
    return startA < endB && startB < endA;
  });
}

function getPreviousWeekDays(weekDays) {
  return weekDays.map((day) => addDays(day, -7));
}

function getSundayDate(weekDays) {
  return weekDays[6] || '';
}

function getPreviousSundayDate(weekDays) {
  const sunday = getSundayDate(weekDays);
  if (!sunday) return '';
  return addDays(sunday, -7);
}

function isMorningShift(shift) {
  const shiftType = shift?.shiftType || inferShiftTypeFromTimes(shift?.startTime, shift?.endTime);
  return shiftType === 'morning';
}

function isEveningShift(shift) {
  const shiftType = shift?.shiftType || inferShiftTypeFromTimes(shift?.startTime, shift?.endTime);
  return shiftType === 'evening';
}

function getStaticSchedule(employee) {
  const startTime = employee?.fixedStartTime || employee?.staticStartTime || '';
  const endTime = employee?.fixedEndTime || employee?.staticEndTime || '';
  const enabled = Boolean(startTime && endTime);
  return { enabled, startTime, endTime };
}

function buildRotationMap(previousWeekShifts) {
  const map = new Map();
  previousWeekShifts.forEach((shift) => {
    const key = `${shift.employeeId}_${shift.date}`;
    map.set(key, shift);
  });
  return map;
}

function getAlternatingShift(previousShift) {
  if (isMorningShift(previousShift)) return EVENING_SHIFT;
  if (isEveningShift(previousShift)) return MORNING_SHIFT;
  return MORNING_SHIFT;
}

function ensureUnique(shifts) {
  const seen = new Set();
  return shifts.filter((shift) => {
    const key = shiftKey(shift);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeRole(value) {
  const token = `${value || ''}`.toLowerCase();
  if (token.includes('intermediate') || token.includes('ενδιά') || token.includes('μεσα')) return 'intermediate';
  if (token.includes('core') || token.includes('βασ')) return 'core';
  return '';
}

function sortEmployeesByName(employees) {
  return [...(employees || [])].sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'el'));
}

function findEmployeeById(employees, id) {
  if (!id) return null;
  return employees.find((employee) => employee.id === id) || null;
}

function canParticipateInRotation(employee) {
  return employee?.participatesInRotation !== false;
}

function canParticipateInSundayRotation(employee) {
  return employee?.participatesInSundayRotation !== false;
}

function resolveMonthlyEmployees(activeEmployees, roleConfig = {}) {
  const sorted = sortEmployeesByName(activeEmployees);
  const rotationEligible = sorted.filter(canParticipateInRotation);
  const configuredCoreA = findEmployeeById(sorted, roleConfig.coreAId);
  const configuredCoreBInitial = findEmployeeById(sorted, roleConfig.coreBId);
  const configuredIntermediateInitial = findEmployeeById(sorted, roleConfig.intermediateId);

  const configuredCoreB =
    configuredCoreBInitial && configuredCoreBInitial.id !== configuredCoreA?.id ? configuredCoreBInitial : null;
  const configuredIntermediate =
    configuredIntermediateInitial &&
    configuredIntermediateInitial.id !== configuredCoreA?.id &&
    configuredIntermediateInitial.id !== configuredCoreB?.id
      ? configuredIntermediateInitial
      : null;

  const configuredUnique = [configuredCoreA, configuredCoreB, configuredIntermediate].filter(Boolean);
  const configuredSet = new Set(configuredUnique.map((employee) => employee.id));

  const roleDetectedCore = rotationEligible.filter(
    (employee) => normalizeRole(employee.scheduleRole || employee.roleType) === 'core',
  );
  const roleDetectedIntermediate = sorted.find(
    (employee) => normalizeRole(employee.scheduleRole || employee.roleType) === 'intermediate',
  );

  const remaining = sorted.filter((employee) => !configuredSet.has(employee.id));
  const rotationRemaining = remaining.filter(canParticipateInRotation);

  const coreA =
    configuredCoreA ||
    roleDetectedCore.find((employee) => employee.id !== configuredCoreB?.id) ||
    rotationRemaining[0] ||
    remaining[0] ||
    sorted[0] ||
    null;

  const coreB =
    configuredCoreB ||
    roleDetectedCore.find((employee) => employee.id !== coreA?.id) ||
    rotationRemaining.find((employee) => employee.id !== coreA?.id) ||
    remaining.find((employee) => employee.id !== coreA?.id) ||
    sorted.find((employee) => employee.id !== coreA?.id) ||
    null;

  const intermediate =
    configuredIntermediate ||
    roleDetectedIntermediate ||
    sorted.find((employee) => employee.id !== coreA?.id && employee.id !== coreB?.id) ||
    null;

  return { coreA, coreB, intermediate };
}

const WEEKDAY_NAME_TO_INDEX = new Map([
  ['κυριακη', 0],
  ['δευτερα', 1],
  ['τριτη', 2],
  ['τεταρτη', 3],
  ['πεμπτη', 4],
  ['παρασκευη', 5],
  ['σαββατο', 6],
  ['sunday', 0],
  ['monday', 1],
  ['tuesday', 2],
  ['wednesday', 3],
  ['thursday', 4],
  ['friday', 5],
  ['saturday', 6],
]);

function normalizeWeekdayToken(value) {
  return `${value || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function normalizeDayIndex(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
  }

  const token = normalizeWeekdayToken(value);
  if (!token) return null;

  if (/^\d+$/.test(token)) {
    const numeric = Number(token);
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= 6 ? numeric : null;
  }

  return WEEKDAY_NAME_TO_INDEX.get(token) ?? null;
}

function normalizeDayList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeDayIndex(item)).filter((item) => item !== null);
  }

  if (value && typeof value === 'object') {
    const resolved = [];
    Object.entries(value).forEach(([key, flag]) => {
      if (!flag) return;
      const parsed = normalizeDayIndex(key);
      if (parsed !== null) resolved.push(parsed);
    });
    return resolved;
  }

  if (typeof value === 'string' && /[,;|]/.test(value)) {
    return value
      .split(/[,;|]/)
      .map((item) => normalizeDayIndex(item))
      .filter((item) => item !== null);
  }

  const single = normalizeDayIndex(value);
  return single === null ? [] : [single];
}

function getFixedDayOff(employee, fallbackValue, rules) {
  const explicit = rules.fixedDaysOff?.[employee?.id];
  const employeeLevel = employee?.fixedDayOff;

  const explicitDay = normalizeDayIndex(explicit);
  if (explicitDay !== null) return explicitDay;

  const employeeDay = normalizeDayIndex(employeeLevel);
  if (employeeDay !== null) return employeeDay;

  const fallbackDay = normalizeDayIndex(fallbackValue);
  return fallbackDay;
}

function hasFixedDayOffOnWeekday(employee, weekday, rules) {
  const explicit = rules?.fixedDaysOff?.[employee?.id];
  const explicitDays = normalizeDayList(explicit);
  if (explicitDays.includes(weekday)) return true;

  const employeeDays = normalizeDayList(employee?.fixedDaysOff);
  if (employeeDays.includes(weekday)) return true;

  const employeeDay = normalizeDayIndex(employee?.fixedDayOff);
  if (employeeDay === weekday) return true;

  return false;
}

function buildWeekRotationIndex(monthDays) {
  const keys = [];
  monthDays.forEach((date) => {
    const weekKey = getWeekStartFromDate(date);
    if (!keys.includes(weekKey)) keys.push(weekKey);
  });
  return keys;
}

function getIntermediateShiftByWeek(weekIndex) {
  return weekIndex % 2 === 0 ? INTERMEDIATE_SHIFT_A : INTERMEDIATE_SHIFT_B;
}

function usesWeeklyFixedShiftSideRotation(employee) {
  return employee?.weeklyFixedShiftSideRotation === true;
}

function resolveWeeklyShiftSideTemplate(employee, weekIndex) {
  if (!usesWeeklyFixedShiftSideRotation(employee)) return null;
  return weekIndex % 2 === 0 ? MORNING_SHIFT : EVENING_SHIFT;
}

function respectsWeeklyShiftSideRule(employee, weekIndex, shiftType) {
  const weeklyTemplate = resolveWeeklyShiftSideTemplate(employee, weekIndex);
  if (!weeklyTemplate) return true;
  if (shiftType !== 'morning' && shiftType !== 'evening') return false;
  return weeklyTemplate.shiftType === shiftType;
}

function applyWeeklyShiftSideTemplate(employee, weekIndex, template, { preserveCoverage = false } = {}) {
  if (!template || preserveCoverage) return template;
  const weeklyTemplate = resolveWeeklyShiftSideTemplate(employee, weekIndex);
  if (!weeklyTemplate) return template;
  if (template.shiftType !== 'morning' && template.shiftType !== 'evening' && template.shiftType !== 'intermediate') {
    return template;
  }
  return weeklyTemplate;
}

function getPreferredIntermediateShift(employee, weekIndex) {
  const preference = `${employee?.defaultShiftPreference || ''}`.toLowerCase();
  if (preference === 'morning') return MORNING_SHIFT;
  if (preference === 'evening') return EVENING_SHIFT;
  if (preference === 'intermediate_0900') return INTERMEDIATE_SHIFT_A;
  if (preference === 'intermediate_1000') return INTERMEDIATE_SHIFT_B;
  return getIntermediateShiftByWeek(weekIndex);
}

function getAdditionalEmployeeTemplate(employee, weekIndex, slotIndex) {
  const role = normalizeRole(employee?.scheduleRole || employee?.roleType);
  if (role === 'intermediate') {
    return getPreferredIntermediateShift(employee, weekIndex);
  }
  if (role === 'core') {
    return (weekIndex + slotIndex) % 2 === 0 ? MORNING_SHIFT : EVENING_SHIFT;
  }

  const preference = `${employee?.defaultShiftPreference || ''}`.toLowerCase();
  if (preference === 'morning') return MORNING_SHIFT;
  if (preference === 'evening') return EVENING_SHIFT;
  if (preference === 'intermediate_0900') return INTERMEDIATE_SHIFT_A;
  if (preference === 'intermediate_1000') return INTERMEDIATE_SHIFT_B;

  const cycle = [MORNING_SHIFT, INTERMEDIATE_SHIFT_A, EVENING_SHIFT];
  return cycle[(weekIndex + slotIndex) % cycle.length];
}

function buildSpecialDayLabel(specialDay) {
  const label = specialDay?.label?.trim() || '';
  const hasWindow = specialDay?.operatingStartTime && specialDay?.operatingEndTime;
  const fallback = specialDay?.isHoliday ? 'Αργία' : 'Ειδικό Ωράριο';
  if (label && hasWindow) return `${label} (${specialDay.operatingStartTime}-${specialDay.operatingEndTime})`;
  if (label) return label;
  if (hasWindow) return `${fallback} ${specialDay.operatingStartTime}-${specialDay.operatingEndTime}`;
  return fallback;
}

function buildShiftFromTemplate({ employee, date, template, notes, specialDay = null }) {
  const isSpecial = Boolean(specialDay?.isHoliday || specialDay?.isSpecialDay);
  return {
    employeeId: employee.id,
    date,
    startTime: template.startTime,
    endTime: template.endTime,
    type: SHIFT_TYPES.WORK,
    label: template.label,
    shiftType: template.shiftType,
    customLabel: template.customLabel || '',
    notes: notes || '',
    isHoliday: Boolean(specialDay?.isHoliday),
    isSpecialDay: isSpecial,
    specialDayLabel: isSpecial ? buildSpecialDayLabel(specialDay) : '',
    isManualOverride: false,
  };
}

function workedOnSundayDate(shifts, employeeId, sundayDate) {
  return (shifts || []).some((shift) => {
    if (shift.employeeId !== employeeId) return false;
    if (shift.date !== sundayDate) return false;
    return (shift.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK;
  });
}

function buildSundayCountMap(shifts, monthDays) {
  const sundaySet = new Set(monthDays.filter((date) => toDate(date).getDay() === 0));
  return (shifts || []).reduce((acc, shift) => {
    if (!sundaySet.has(shift.date)) return acc;
    if ((shift.type || SHIFT_TYPES.WORK) !== SHIFT_TYPES.WORK) return acc;
    acc[shift.employeeId] = (acc[shift.employeeId] || 0) + 1;
    return acc;
  }, {});
}

function getManualOverridesByDate(shifts) {
  const map = new Map();
  (shifts || [])
    .filter((shift) => shift.isManualOverride)
    .forEach((shift) => {
      if (!map.has(shift.date)) map.set(shift.date, []);
      map.get(shift.date).push(shift);
    });
  return map;
}

function pickSundayEmployee({
  candidates,
  previousSundayDate,
  sundayCounts,
  historicalShifts,
  avoidConsecutiveSundays,
}) {
  const ranked = [...candidates].sort((a, b) => {
    const blockedA = avoidConsecutiveSundays && previousSundayDate ? workedOnSundayDate(historicalShifts, a.id, previousSundayDate) : false;
    const blockedB = avoidConsecutiveSundays && previousSundayDate ? workedOnSundayDate(historicalShifts, b.id, previousSundayDate) : false;

    if (blockedA !== blockedB) return blockedA ? 1 : -1;

    const countA = sundayCounts[a.id] || 0;
    const countB = sundayCounts[b.id] || 0;
    if (countA !== countB) return countA - countB;

    return (a.fullName || '').localeCompare(b.fullName || '', 'el');
  });

  return ranked[0] || null;
}

function applySpecialDayTemplate({
  date,
  specialDay,
  employeesById,
  generated,
  existingEntries,
  warnings,
}) {
  if (!specialDay?.shifts?.length) return false;

  specialDay.shifts.forEach((item) => {
    const employee = employeesById.get(item.employeeId);
    if (!employee) {
      warnings.push(`Η ειδική ημέρα ${formatDateGreek(date)} περιέχει άγνωστο υπάλληλο (${item.employeeId}).`);
      return;
    }

    const template = {
      shiftType: item.shiftType || inferShiftTypeFromTimes(item.startTime, item.endTime),
      startTime: item.startTime,
      endTime: item.endTime,
      label: item.customLabel || item.label || 'Ειδικό Ωράριο',
      customLabel: item.customLabel || item.label || 'Ειδικό Ωράριο',
    };

    const candidate = buildShiftFromTemplate({
      employee,
      date,
      template,
      notes: 'Auto-generated from special-day template',
      specialDay: { ...specialDay, isSpecialDay: true },
    });

    const combined = [...existingEntries, ...generated];
    if (hasOverlap(combined, candidate)) {
      warnings.push(`Παράλειψη ειδικής βάρδιας ${formatDateGreek(date)} λόγω overlap για ${employee.fullName}.`);
      return;
    }

    generated.push(candidate);
  });

  return true;
}

export async function generateSmartWeekSchedule({
  weekDays,
  employees,
  allShifts,
  hasConsecutiveSundayAssignmentFn,
  rules = {},
}) {
  if (!Array.isArray(weekDays) || weekDays.length !== 7) {
    throw new Error('Μη έγκυρες ημέρες εβδομάδας για Magic Wand.');
  }

  const normalizedRules = {
    ...DEFAULT_WEEK_RULES,
    ...(rules || {}),
    fixedDaysOff: { ...(rules?.fixedDaysOff || {}) },
  };
  const generationMode = ['strict', 'balanced', 'manual_assist'].includes(normalizedRules.generationMode)
    ? normalizedRules.generationMode
    : 'balanced';

  const activeEmployees = sortEmployeesByName((employees || []).filter((employee) => employee?.isActive !== false));
  const hasExactlyFourEmployees = activeEmployees.length === 4;
  if (!activeEmployees.length) {
    return { shifts: [], warnings: ['Δεν βρέθηκαν ενεργοί υπάλληλοι.'] };
  }

  const generated = [];
  const warnings = [];

  const { coreA, coreB, intermediate } = resolveMonthlyEmployees(activeEmployees, {});
  if (!coreA || !coreB) {
    warnings.push('Δεν εντοπίστηκαν 2 core εργαζόμενοι. Εφαρμόστηκε best-effort fallback.');
  }

  const fixedOffById = {};
  activeEmployees.forEach((employee) => {
    let resolved = getFixedDayOff(employee, null, normalizedRules);

    if (typeof resolved === 'number' && resolved >= 0 && resolved <= 6) {
      fixedOffById[employee.id] = resolved;
    }
  });

  const sundayDate = getSundayDate(weekDays);
  const previousSundayDate = getPreviousSundayDate(weekDays);
  const sundayCounts = (allShifts || []).reduce((acc, shift) => {
    if ((shift.type || SHIFT_TYPES.WORK) !== SHIFT_TYPES.WORK) return acc;
    if (toDate(shift.date).getDay() !== 0) return acc;
    acc[shift.employeeId] = (acc[shift.employeeId] || 0) + 1;
    return acc;
  }, {});

  let sundayCandidates = activeEmployees.filter(canParticipateInSundayRotation);
  if (!sundayCandidates.length) sundayCandidates = [...activeEmployees];
  if (normalizedRules.avoidConsecutiveSundays && typeof hasConsecutiveSundayAssignmentFn === 'function') {
    const checks = await Promise.all(
      sundayCandidates.map(async (employee) => ({
        employee,
        blocked: await hasConsecutiveSundayAssignmentFn({
          employeeId: employee.id,
          previousSundayDate,
        }),
      })),
    );

    const available = checks.filter((item) => !item.blocked).map((item) => item.employee);
    if (available.length) {
      sundayCandidates = available;
    } else {
      warnings.push('Δεν βρέθηκε διαθέσιμος υπάλληλος για Κυριακή χωρίς συνεχόμενη ανάθεση.');
    }
  }

  sundayCandidates.sort((a, b) => {
    const countDiff = (sundayCounts[a.id] || 0) - (sundayCounts[b.id] || 0);
    if (countDiff !== 0) return countDiff;
    return (a.fullName || '').localeCompare(b.fullName || '', 'el');
  });
  const sundayAvailable = sundayCandidates.filter((employee) => !hasFixedDayOffOnWeekday(employee, 0, normalizedRules));
  if (!sundayAvailable.length) {
    warnings.push('Δεν βρέθηκε διαθέσιμος υπάλληλος για Κυριακή χωρίς να παραβιαστεί σταθερό ρεπό.');
  }
  const sundayEmployee = sundayAvailable[0] || null;

  const assignedCountByEmployee = Object.fromEntries(activeEmployees.map((employee) => [employee.id, 0]));
  const targetWorkDaysByEmployee = Object.fromEntries(
    activeEmployees.map((employee) => [employee.id, employee.id === sundayEmployee?.id ? 6 : 5]),
  );

  const weekStartDate = toDate(weekDays[0]);
  const weekIndex = Math.floor(weekStartDate.getTime() / (7 * 24 * 60 * 60 * 1000));
  const coreAMorningThisWeek = normalizedRules.weeklyRotationEnabled
    ? (normalizedRules.startWithCoreAMorning ? weekIndex % 2 === 0 : weekIndex % 2 !== 0)
    : Boolean(normalizedRules.startWithCoreAMorning);

  const morningPrimary = coreAMorningThisWeek ? coreA : coreB;
  const eveningPrimary = coreAMorningThisWeek ? coreB : coreA;

  function isOffDay(employee, weekday) {
    if (!employee?.id) return false;
    if (hasFixedDayOffOnWeekday(employee, weekday, normalizedRules)) return true;
    return fixedOffById[employee.id] === weekday;
  }

  function isUnderTarget(employee) {
    const assigned = assignedCountByEmployee[employee?.id] || 0;
    const target = targetWorkDaysByEmployee[employee?.id] || 99;
    return assigned < target;
  }

  function canAssignForDay(employee, weekday, assignedToday, allowOverTarget = false) {
    if (!employee?.id) return false;
    if (assignedToday.has(employee.id)) return false;
    if (isOffDay(employee, weekday)) return false;
    if (!allowOverTarget && !isUnderTarget(employee)) return false;
    return true;
  }

  function canAssignIntermediateForPattern(employee, weekday, assignedToday, allowOverTarget = false) {
    if (!employee?.id) return false;
    if (assignedToday.has(employee.id)) return false;
    if (isOffDay(employee, weekday)) return false;
    if (!allowOverTarget && !isUnderTarget(employee)) return false;
    return true;
  }

  function candidateScore(employee, shiftType) {
    const assigned = assignedCountByEmployee[employee.id] || 0;
    const target = targetWorkDaysByEmployee[employee.id] || 99;
    let score = assigned - target;
    if (employee.id === sundayEmployee?.id && assigned < target) score -= 0.5;
    if (assigned >= target) score += 50;
    const preference = `${employee.defaultShiftPreference || ''}`.toLowerCase();
    if (shiftType === 'morning' && preference === 'morning') score -= 0.15;
    if (shiftType === 'evening' && preference === 'evening') score -= 0.15;
    if (shiftType === 'intermediate' && (preference === 'intermediate_0900' || preference === 'intermediate_1000')) {
      score -= 0.15;
    }
    if (!respectsWeeklyShiftSideRule(employee, weekIndex, shiftType)) {
      score += 12;
    }
    return score;
  }

  function addShiftForDay({ employee, date, template, notes }) {
    if (!employee?.id) return false;
    const candidate = buildShiftFromTemplate({
      employee,
      date,
      template,
      notes,
    });
    if (hasOverlap(generated, candidate)) return false;
    generated.push(candidate);
    assignedCountByEmployee[employee.id] = (assignedCountByEmployee[employee.id] || 0) + 1;
    return true;
  }

  function getPreferredRank(employee, preferred) {
    const index = preferred.findIndex((item) => item?.id === employee?.id);
    if (index >= 0) return index;
    return preferred.length + 1;
  }

  function pickSlotCandidate({
    slotTemplate,
    preferred,
    weekday,
    assignedToday,
    allowOverTarget = false,
    excludedEmployeeIds = null,
  }) {
    const canAssignWithRule = (employee, ignoreWeeklyRule = false) => (
      !(excludedEmployeeIds?.has?.(employee?.id)) &&
      canAssignForDay(employee, weekday, assignedToday, allowOverTarget) &&
      (ignoreWeeklyRule || respectsWeeklyShiftSideRule(employee, weekIndex, slotTemplate.shiftType))
    );

    if (generationMode === 'manual_assist') {
      return (
        preferred.find((employee) => canAssignWithRule(employee, false))
        || preferred.find((employee) => canAssignWithRule(employee, true))
        || null
      );
    }

    const strictAvailable = activeEmployees.filter((employee) => canAssignWithRule(employee, false));
    const available = strictAvailable.length
      ? strictAvailable
      : activeEmployees.filter((employee) => canAssignWithRule(employee, true));

    available.sort((a, b) => {
      const scoreDiff = candidateScore(a, slotTemplate.shiftType) - candidateScore(b, slotTemplate.shiftType);
      if (scoreDiff !== 0) return scoreDiff;
      const rankDiff = getPreferredRank(a, preferred) - getPreferredRank(b, preferred);
      if (rankDiff !== 0) return rankDiff;
      return (a.fullName || '').localeCompare(b.fullName || '', 'el');
    });

    return available[0] || null;
  }

  function pickIntermediateCoverageEmployee(availableEmployees, weekday, assignedToday) {
    if (!availableEmployees.length) return null;

    const ranked = [...availableEmployees].sort((a, b) => {
      const designatedA = a.id === intermediate?.id;
      const designatedB = b.id === intermediate?.id;
      if (designatedA !== designatedB) return designatedA ? -1 : 1;

      const roleA = normalizeRole(a.scheduleRole || a.roleType) === 'intermediate';
      const roleB = normalizeRole(b.scheduleRole || b.roleType) === 'intermediate';
      if (roleA !== roleB) return roleA ? -1 : 1;

      const scoreDiff = candidateScore(a, 'intermediate') - candidateScore(b, 'intermediate');
      if (scoreDiff !== 0) return scoreDiff;
      return (a.fullName || '').localeCompare(b.fullName || '', 'el');
    });

    const strict = ranked.find((employee) =>
      canAssignIntermediateForPattern(employee, weekday, assignedToday, false),
    );
    if (strict) return strict;

    return (
      ranked.find((employee) => canAssignIntermediateForPattern(employee, weekday, assignedToday, true)) || null
    );
  }

  weekDays.slice(0, 6).forEach((date) => {
    const weekday = toDate(date).getDay();
    const assignedToday = new Set(
      generated
        .filter((shift) => shift.date === date && (shift.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK)
        .map((shift) => shift.employeeId),
    );
    const availableEmployees = activeEmployees.filter((employee) => !isOffDay(employee, weekday));
    const shouldUseIntermediatePattern = false;
    const shouldEnforceTwoByTwoCoverage = hasExactlyFourEmployees && availableEmployees.length === 4;

    // Coverage priority: when exactly 3 employees are available, enforce 1 morning + 1 intermediate + 1 evening.
    if (availableEmployees.length === 3) {
      const intermediateEmployee = pickIntermediateCoverageEmployee(availableEmployees, weekday, assignedToday);

      if (intermediateEmployee) {
        const insertedIntermediate = addShiftForDay({
          employee: intermediateEmployee,
          date,
          template: getPreferredIntermediateShift(intermediateEmployee, weekIndex),
          notes: 'Auto-generated 3-employee coverage',
        });
        if (insertedIntermediate) assignedToday.add(intermediateEmployee.id);
      } else {
        warnings.push(`Ακάλυπτη ενδιάμεση βάρδια στις ${formatDateGreek(date)}.`);
      }

      const excludedEmployeeIds = intermediateEmployee?.id ? new Set([intermediateEmployee.id]) : null;
      [
        { ...MORNING_SHIFT, slot: 'morning' },
        { ...EVENING_SHIFT, slot: 'evening' },
      ].forEach((slotTemplate) => {
        const preferred = slotTemplate.slot === 'morning'
          ? [morningPrimary, eveningPrimary, intermediate]
          : [eveningPrimary, morningPrimary, intermediate];

        let selected = pickSlotCandidate({
          slotTemplate,
          preferred,
          weekday,
          assignedToday,
          allowOverTarget: false,
          excludedEmployeeIds,
        });

        if (!selected) {
          selected = pickSlotCandidate({
            slotTemplate,
            preferred,
            weekday,
            assignedToday,
            allowOverTarget: true,
            excludedEmployeeIds,
          });
        }

        if (!selected && excludedEmployeeIds?.size) {
          selected = pickSlotCandidate({
            slotTemplate,
            preferred,
            weekday,
            assignedToday,
            allowOverTarget: true,
            excludedEmployeeIds: null,
          });
        }

        if (!selected) {
          warnings.push(`Ακάλυπτη ${slotTemplate.label} στις ${formatDateGreek(date)}.`);
          return;
        }

        const inserted = addShiftForDay({
          employee: selected,
          date,
          template: slotTemplate,
          notes: 'Auto-generated 3-employee coverage',
        });
        if (inserted) assignedToday.add(selected.id);
      });
      return;
    }

    // Safe fallback: when 2 employees are available, prioritize one morning and one evening shift.
    if (availableEmployees.length === 2) {
      [
        { ...MORNING_SHIFT, slot: 'morning' },
        { ...EVENING_SHIFT, slot: 'evening' },
      ].forEach((slotTemplate) => {
        const preferred = slotTemplate.slot === 'morning'
          ? [morningPrimary, eveningPrimary, intermediate]
          : [eveningPrimary, morningPrimary, intermediate];

        let selected = pickSlotCandidate({
          slotTemplate,
          preferred,
          weekday,
          assignedToday,
          allowOverTarget: false,
          excludedEmployeeIds: null,
        });
        if (!selected) {
          selected = pickSlotCandidate({
            slotTemplate,
            preferred,
            weekday,
            assignedToday,
            allowOverTarget: true,
            excludedEmployeeIds: null,
          });
        }

        if (!selected) {
          warnings.push(`Ακάλυπτη ${slotTemplate.label} στις ${formatDateGreek(date)}.`);
          return;
        }

        const inserted = addShiftForDay({
          employee: selected,
          date,
          template: slotTemplate,
          notes: 'Auto-generated 2-employee fallback coverage',
        });
        if (inserted) assignedToday.add(selected.id);
      });
      return;
    }

    const slotTemplates = shouldEnforceTwoByTwoCoverage
      ? [
          { ...MORNING_SHIFT, slot: 'morning' },
          { ...MORNING_SHIFT, slot: 'morning' },
          { ...EVENING_SHIFT, slot: 'evening' },
          { ...EVENING_SHIFT, slot: 'evening' },
        ]
      : [
          { ...MORNING_SHIFT, slot: 'morning' },
          { ...EVENING_SHIFT, slot: 'evening' },
        ];

    slotTemplates.forEach((slotTemplate) => {
      const excludedEmployeeIds =
        shouldUseIntermediatePattern && intermediate?.id ? new Set([intermediate.id]) : null;
      const preferred = slotTemplate.slot === 'morning'
        ? [morningPrimary, eveningPrimary, intermediate]
        : [eveningPrimary, morningPrimary, intermediate];

      let selected = pickSlotCandidate({
        slotTemplate,
        preferred,
        weekday,
        assignedToday,
        allowOverTarget: false,
        excludedEmployeeIds,
      });

      if (!selected && generationMode !== 'manual_assist') {
        selected = pickSlotCandidate({
          slotTemplate,
          preferred,
          weekday,
          assignedToday,
          allowOverTarget: true,
          excludedEmployeeIds,
        });
      }

      if (!selected) {
        warnings.push(`Ακάλυπτη ${slotTemplate.label} στις ${formatDateGreek(date)}.`);
        return;
      }

      const inserted = addShiftForDay({
        employee: selected,
        date,
        template: slotTemplate,
        notes: 'Auto-generated weekly coverage',
      });
      if (inserted) assignedToday.add(selected.id);
    });

    if (
      generationMode !== 'manual_assist' &&
      intermediate &&
      shouldUseIntermediatePattern &&
      canAssignIntermediateForPattern(intermediate, weekday, assignedToday, false)
    ) {
      const inserted = addShiftForDay({
        employee: intermediate,
        date,
        template: getPreferredIntermediateShift(intermediate, weekIndex),
        notes: 'Auto-generated intermediate pattern',
      });
      if (inserted) assignedToday.add(intermediate.id);
    }
  });

  if (sundayEmployee) {
    const inserted = addShiftForDay({
      employee: sundayEmployee,
      date: sundayDate,
      template: SUNDAY_SHIFT,
      notes: 'Auto-generated Sunday fairness',
    });
    if (!inserted) {
      warnings.push(`Δεν μπόρεσε να γίνει ανάθεση Κυριακής στις ${formatDateGreek(sundayDate)}.`);
    }
  }

  activeEmployees.forEach((employee) => {
    const worked = assignedCountByEmployee[employee.id] || 0;
    const restDays = 7 - worked;
    const minimumExpectedRest = employee.id === sundayEmployee?.id ? 1 : 2;
    if (restDays < minimumExpectedRest) {
      warnings.push(`Περιορισμένα ρεπό για ${employee.fullName}: ${restDays} (στόχος ${minimumExpectedRest}).`);
    }
  });

  if (generationMode === 'strict' && warnings.length) {
    warnings.unshift('Strict mode: εντοπίστηκαν αποκλίσεις από τους κανόνες.');
  }

  return {
    shifts: ensureUnique(generated),
    warnings,
  };
}

export function generateSmartMonthSchedule({
  month,
  year,
  employees,
  allShifts = [],
  existingMonthShifts = [],
  rules = {},
  roleConfig = {},
}) {
  const normalizedRules = {
    ...DEFAULT_MONTH_RULES,
    ...(rules || {}),
    fixedDaysOff: { ...DEFAULT_MONTH_RULES.fixedDaysOff, ...(rules?.fixedDaysOff || {}) },
    specialDaysByDate: { ...DEFAULT_MONTH_RULES.specialDaysByDate, ...(rules?.specialDaysByDate || {}) },
  };

  const monthInfo = getMonthDays(year, month);
  const monthDays = monthInfo.days;
  const warnings = [];

  const activeEmployees = sortEmployeesByName((employees || []).filter((employee) => employee?.isActive !== false));
  const hasExactlyFourEmployees = activeEmployees.length === 4;
  if (!activeEmployees.length) {
    return { shifts: [], warnings: ['Δεν βρέθηκαν ενεργοί υπάλληλοι.'], meta: { monthDays } };
  }

  const { coreA, coreB, intermediate } = resolveMonthlyEmployees(activeEmployees, roleConfig);
  if (!coreA || !coreB || !intermediate) {
    warnings.push('Δεν βρέθηκαν 3 εργαζόμενοι για πλήρες pattern (core A/B + intermediate). Εφαρμόστηκε best-effort fallback.');
  }

  const fixedOffById = {};
  activeEmployees.forEach((employee) => {
    let fallbackValue = null;
    if (employee.id === coreA?.id) fallbackValue = DEFAULT_FIXED_DAYS_OFF.coreA;
    if (employee.id === coreB?.id) fallbackValue = DEFAULT_FIXED_DAYS_OFF.coreB;
    if (employee.id === intermediate?.id) fallbackValue = DEFAULT_FIXED_DAYS_OFF.intermediate;

    const resolved = getFixedDayOff(employee, fallbackValue, normalizedRules);
    if (typeof resolved === 'number' && resolved >= 0 && resolved <= 6) {
      fixedOffById[employee.id] = resolved;
    }
  });

  const weekKeys = buildWeekRotationIndex(monthDays);
  const weekIndexByKey = Object.fromEntries(weekKeys.map((key, index) => [key, index]));
  const employeesById = new Map(activeEmployees.map((employee) => [employee.id, employee]));

  const manualOverridesByDate = getManualOverridesByDate(existingMonthShifts);
  const manualOverrides = (existingMonthShifts || []).filter((shift) => shift.isManualOverride);

  const generated = [];
  const historicalForSunday = [...allShifts, ...generated];
  const sundayCounts = buildSundayCountMap([...manualOverrides], monthDays);

  monthDays.forEach((date) => {
    const weekday = toDate(date).getDay();
    const shouldUseIntermediatePattern =
      hasExactlyFourEmployees && INTERMEDIATE_PRIMARY_WEEKDAYS.has(weekday);
    const shouldEnforceTwoByTwoCoverage =
      hasExactlyFourEmployees && INTERMEDIATE_EXTRA_WEEKDAYS.has(weekday);
    const weekIndex = weekIndexByKey[getWeekStartFromDate(date)] || 0;
    const manualDayEntries = manualOverridesByDate.get(date) || [];
    const hasManualForDate = normalizedRules.allowManualOverride && manualDayEntries.length > 0;
    const existingForOverlap = [...manualDayEntries, ...generated];

    const specialDay = normalizedRules.specialDaysByDate?.[date];
    if (!hasManualForDate && specialDay) {
      const applied = applySpecialDayTemplate({
        date,
        specialDay,
        employeesById,
        generated,
        existingEntries: existingForOverlap,
        warnings,
      });
      if (applied) return;
    }

    if (weekday === 0) {
      const previousSundayDate = addDays(date, -7);

      if (hasManualForDate) {
        manualDayEntries.forEach((entry) => {
          if ((entry.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK) {
            sundayCounts[entry.employeeId] = (sundayCounts[entry.employeeId] || 0) + 1;
          }
        });
        return;
      }

      const manualEmployeeIds = new Set(manualDayEntries.map((entry) => entry.employeeId));
      const sundayEligibleEmployees = activeEmployees.filter(canParticipateInSundayRotation);
      const candidates = sundayEligibleEmployees.filter((employee) => {
        if (manualEmployeeIds.has(employee.id)) return false;
        if (hasFixedDayOffOnWeekday(employee, 0, normalizedRules)) return false;
        const dayOff = fixedOffById[employee.id];
        return dayOff !== 0;
      });

      const picked = pickSundayEmployee({
        candidates: candidates.length ? candidates : sundayEligibleEmployees.length ? sundayEligibleEmployees : activeEmployees,
        previousSundayDate,
        sundayCounts,
        historicalShifts: [...historicalForSunday, ...generated],
        avoidConsecutiveSundays: normalizedRules.avoidConsecutiveSundays,
      });

      if (!picked) {
        warnings.push(`Δεν βρέθηκε υποψήφιος για Κυριακή ${formatDateGreek(date)}.`);
        return;
      }

      const sundayShift = buildShiftFromTemplate({
        employee: picked,
        date,
        template: SUNDAY_SHIFT,
        notes: 'Auto-generated Sunday fairness',
        specialDay,
      });

      if (!hasOverlap(existingForOverlap, sundayShift)) {
        generated.push(sundayShift);
        sundayCounts[picked.id] = (sundayCounts[picked.id] || 0) + 1;
      }

      return;
    }

    const coreAMorningWeek = normalizedRules.weeklyRotationEnabled
      ? weekIndex % 2 === 0
      : Boolean(normalizedRules.startWithCoreAMorning);

    const coreAShift = coreAMorningWeek ? MORNING_SHIFT : EVENING_SHIFT;
    const coreBShift = coreAMorningWeek ? EVENING_SHIFT : MORNING_SHIFT;

    const plannedTypes = [];
    const missingCoreTypes = [];

    const corePlan = [
      { employee: coreA, template: applyWeeklyShiftSideTemplate(coreA, weekIndex, coreAShift) },
      { employee: coreB, template: applyWeeklyShiftSideTemplate(coreB, weekIndex, coreBShift) },
    ];

    corePlan.forEach(({ employee, template }) => {
      if (!employee) return;
      const hasManual = manualDayEntries.some((entry) => entry.employeeId === employee.id);
      const fixedOff = fixedOffById[employee.id];
      const isOffDay =
        hasFixedDayOffOnWeekday(employee, weekday, normalizedRules) ||
        (typeof fixedOff === 'number' && fixedOff === weekday);

      if (hasManual) {
        const manualShift = manualDayEntries.find((entry) => entry.employeeId === employee.id);
        if (manualShift) {
          plannedTypes.push(inferShiftTypeFromTimes(manualShift.startTime, manualShift.endTime));
        }
        return;
      }

      if (isOffDay) {
        missingCoreTypes.push(template);
        return;
      }

      const autoShift = buildShiftFromTemplate({
        employee,
        date,
        template,
        notes: 'Auto-generated core rotation',
        specialDay,
      });

      if (!hasOverlap(existingForOverlap, autoShift)) {
        generated.push(autoShift);
        plannedTypes.push(template.shiftType);
      } else {
        warnings.push(`Overlap στον core rotation για ${employee.fullName} (${formatDateGreek(date)}).`);
      }
    });

    if (intermediate && (!hasExactlyFourEmployees || shouldUseIntermediatePattern)) {
      const intermediateHasManual = manualDayEntries.some((entry) => entry.employeeId === intermediate.id);
      const fixedOff = fixedOffById[intermediate.id];
      const isOffDay =
        hasFixedDayOffOnWeekday(intermediate, weekday, normalizedRules) ||
        (typeof fixedOff === 'number' && fixedOff === weekday);

      if (!intermediateHasManual && !isOffDay) {
        const missingTemplate = missingCoreTypes.find((item) => !plannedTypes.includes(item.shiftType));
        const intermediateTemplate = missingTemplate || getPreferredIntermediateShift(intermediate, weekIndex);
        const template = shouldUseIntermediatePattern
          ? intermediateTemplate
          : applyWeeklyShiftSideTemplate(intermediate, weekIndex, intermediateTemplate);

        const intermediateShift = buildShiftFromTemplate({
          employee: intermediate,
          date,
          template,
          notes: missingTemplate
            ? 'Auto-generated intermediate coverage for fixed day-off'
            : 'Auto-generated intermediate standard shift',
          specialDay,
        });

        if (!hasOverlap(existingForOverlap, intermediateShift)) {
          generated.push(intermediateShift);
        } else {
          warnings.push(`Overlap για ενδιάμεσο εργαζόμενο ${intermediate.fullName} (${formatDateGreek(date)}).`);
        }
      }
    }

    const scheduledEmployeeIds = new Set([
      ...manualDayEntries.map((entry) => entry.employeeId).filter(Boolean),
      ...generated.filter((entry) => entry.date === date).map((entry) => entry.employeeId).filter(Boolean),
    ]);

    const additionalEmployees = activeEmployees.filter((employee) => {
      if (!employee?.id) return false;
      if (scheduledEmployeeIds.has(employee.id)) return false;
      if (hasFixedDayOffOnWeekday(employee, weekday, normalizedRules)) return false;
      const fixedOff = fixedOffById[employee.id];
      return !(typeof fixedOff === 'number' && fixedOff === weekday);
    });

    additionalEmployees.forEach((employee, slotIndex) => {
      const existingDayEntries = [...manualDayEntries, ...generated.filter((entry) => entry.date === date)];
      const workEntries = existingDayEntries.filter((entry) => (entry.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK);

      const morningCount = workEntries.filter((entry) => {
        const shiftType = entry.shiftType || inferShiftTypeFromTimes(entry.startTime, entry.endTime);
        return shiftType === 'morning';
      }).length;
      const eveningCount = workEntries.filter((entry) => {
        const shiftType = entry.shiftType || inferShiftTypeFromTimes(entry.startTime, entry.endTime);
        return shiftType === 'evening';
      }).length;

      let template;
      if (shouldEnforceTwoByTwoCoverage) {
        if (morningCount < 2) {
          template = MORNING_SHIFT;
        } else if (eveningCount < 2) {
          template = EVENING_SHIFT;
        } else {
          template = getAdditionalEmployeeTemplate(employee, weekIndex, slotIndex);
          if (template.shiftType === 'intermediate') {
            template = (weekIndex + slotIndex) % 2 === 0 ? MORNING_SHIFT : EVENING_SHIFT;
          }
        }
      } else {
        if (morningCount === 0) {
          template = MORNING_SHIFT;
        } else if (eveningCount === 0) {
          template = EVENING_SHIFT;
        } else {
          template = getAdditionalEmployeeTemplate(employee, weekIndex, slotIndex);
        }
        if (hasExactlyFourEmployees && shouldUseIntermediatePattern && template.shiftType === 'intermediate') {
          template = morningCount <= eveningCount ? MORNING_SHIFT : EVENING_SHIFT;
        }
      }
      const preserveCoverage =
        shouldEnforceTwoByTwoCoverage &&
        ((template.shiftType === 'morning' && morningCount < 2) || (template.shiftType === 'evening' && eveningCount < 2));
      template = applyWeeklyShiftSideTemplate(employee, weekIndex, template, { preserveCoverage });
      const candidate = buildShiftFromTemplate({
        employee,
        date,
        template,
        notes: 'Auto-generated additional employee coverage',
        specialDay,
      });

      if (!hasOverlap([...manualDayEntries, ...generated], candidate)) {
        generated.push(candidate);
      } else {
        warnings.push(`Overlap για επιπλέον υπάλληλο ${employee.fullName} (${formatDateGreek(date)}).`);
      }
    });

    if (missingCoreTypes.length > 1 && !intermediate) {
      warnings.push(`Πολλαπλές κενές core βάρδιες στις ${formatDateGreek(date)} χωρίς διαθέσιμο intermediate.`);
    }

    const finalWorkEntries = [...manualDayEntries, ...generated.filter((entry) => entry.date === date)]
      .filter((entry) => (entry.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK);
    const hasMorning = finalWorkEntries.some((entry) => {
      const shiftType = entry.shiftType || inferShiftTypeFromTimes(entry.startTime, entry.endTime);
      return shiftType === 'morning';
    });
    const hasEvening = finalWorkEntries.some((entry) => {
      const shiftType = entry.shiftType || inferShiftTypeFromTimes(entry.startTime, entry.endTime);
      return shiftType === 'evening';
    });
    if (!hasMorning || !hasEvening) {
      warnings.push(
        `Ανεπαρκής κάλυψη στις ${formatDateGreek(date)}: ${!hasMorning ? 'χωρίς πρωινό' : ''}${!hasMorning && !hasEvening ? ' και ' : ''}${!hasEvening ? 'χωρίς απογευματινό' : ''}.`,
      );
    }
  });

  const uniqueGenerated = ensureUnique(generated);

  return {
    shifts: uniqueGenerated,
    warnings,
    meta: {
      monthDays,
      roleSelection: {
        coreAId: coreA?.id || '',
        coreBId: coreB?.id || '',
        intermediateId: intermediate?.id || '',
      },
      fixedOffById,
    },
  };
}

export async function evaluateSundayRuleViolation({
  employeeId,
  date,
  startTime,
  endTime,
  hasConsecutiveSundayAssignmentFn,
}) {
  const isSundayLongShift = date && startTime === SUNDAY_SHIFT.startTime && endTime === SUNDAY_SHIFT.endTime;
  if (!employeeId || !date || !isSundayLongShift || typeof hasConsecutiveSundayAssignmentFn !== 'function') {
    return { violated: false, message: '' };
  }

  const previousSundayDate = addDays(date, -7);
  const violated = await hasConsecutiveSundayAssignmentFn({ employeeId, previousSundayDate });

  if (!violated) {
    return { violated: false, message: '' };
  }

  return {
    violated: true,
    message: 'Προειδοποίηση: Ο ίδιος υπάλληλος έχει ήδη αναλάβει Κυριακή 08:00-20:00 την προηγούμενη εβδομάδα.',
  };
}

export function getWeekIdFromWeekStart(weekStart) {
  return `week_${weekStart}`;
}
