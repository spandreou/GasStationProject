import { SHIFT_TYPES } from './analytics';
import { getMonthDays, getWeekStartFromDate, inferShiftTypeFromTimes } from './scheduleUtils';
import { getIsoDate } from './time';

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
const CORE_FIXED_OFF_WEEKDAYS = { coreA: 2, coreB: 3, intermediate: 4 }; // Tue/Wed/Thu
const PRIMARY_ROLE_OFF_WEEKDAYS = new Set([2, 3, 4]); // Tue/Wed/Thu only

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

function getFixedDayOff(employee, fallbackValue, rules) {
  const explicit = rules.fixedDaysOff?.[employee?.id];
  const employeeLevel = employee?.fixedDayOff;
  if (typeof explicit === 'number') return explicit;
  if (typeof employeeLevel === 'number') return employeeLevel;
  return fallbackValue;
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
      warnings.push(`Η ειδική ημέρα ${date} περιέχει άγνωστο υπάλληλο (${item.employeeId}).`);
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
      warnings.push(`Παράλειψη ειδικής βάρδιας ${date} λόγω overlap για ${employee.fullName}.`);
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
  const roleDefaultOffById = new Map();
  if (coreA?.id) roleDefaultOffById.set(coreA.id, CORE_FIXED_OFF_WEEKDAYS.coreA);
  if (coreB?.id) roleDefaultOffById.set(coreB.id, CORE_FIXED_OFF_WEEKDAYS.coreB);
  if (intermediate?.id) roleDefaultOffById.set(intermediate.id, CORE_FIXED_OFF_WEEKDAYS.intermediate);
  activeEmployees.forEach((employee) => {
    const roleFallback = roleDefaultOffById.has(employee.id) ? roleDefaultOffById.get(employee.id) : null;
    let resolved = getFixedDayOff(employee, roleFallback, normalizedRules);

    if (
      roleDefaultOffById.has(employee.id) &&
      typeof resolved === 'number' &&
      !PRIMARY_ROLE_OFF_WEEKDAYS.has(resolved)
    ) {
      resolved = roleFallback;
      warnings.push(
        `Το ρεπό για ${employee.fullName} ευθυγραμμίστηκε σε Τρίτη/Τετάρτη/Πέμπτη για το weekly auto mode.`,
      );
    }

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
  const sundayEmployee = sundayCandidates[0] || activeEmployees[0];
  if (sundayEmployee && fixedOffById[sundayEmployee.id] === 0) {
    // Keep Sunday assignment valid when a Sunday fixed-off is accidentally configured.
    delete fixedOffById[sundayEmployee.id];
  }

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
  }) {
    if (generationMode === 'manual_assist') {
      return preferred.find((employee) => canAssignForDay(employee, weekday, assignedToday, allowOverTarget)) || null;
    }

    const available = activeEmployees.filter((employee) =>
      canAssignForDay(employee, weekday, assignedToday, allowOverTarget),
    );

    available.sort((a, b) => {
      const scoreDiff = candidateScore(a, slotTemplate.shiftType) - candidateScore(b, slotTemplate.shiftType);
      if (scoreDiff !== 0) return scoreDiff;
      const rankDiff = getPreferredRank(a, preferred) - getPreferredRank(b, preferred);
      if (rankDiff !== 0) return rankDiff;
      return (a.fullName || '').localeCompare(b.fullName || '', 'el');
    });

    return available[0] || null;
  }

  weekDays.slice(0, 6).forEach((date) => {
    const weekday = toDate(date).getDay();
    const assignedToday = new Set(
      generated
        .filter((shift) => shift.date === date && (shift.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK)
        .map((shift) => shift.employeeId),
    );

    const slotTemplates = [
      { ...MORNING_SHIFT, slot: 'morning' },
      { ...EVENING_SHIFT, slot: 'evening' },
    ];

    slotTemplates.forEach((slotTemplate) => {
      const preferred = slotTemplate.slot === 'morning'
        ? [morningPrimary, eveningPrimary, intermediate]
        : [eveningPrimary, morningPrimary, intermediate];

      let selected = pickSlotCandidate({
        slotTemplate,
        preferred,
        weekday,
        assignedToday,
        allowOverTarget: false,
      });

      if (!selected && generationMode !== 'manual_assist') {
        selected = pickSlotCandidate({
          slotTemplate,
          preferred,
          weekday,
          assignedToday,
          allowOverTarget: true,
        });
      }

      if (!selected) {
        warnings.push(`Ακάλυπτη ${slotTemplate.label} στις ${date}.`);
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
      INTERMEDIATE_EXTRA_WEEKDAYS.has(weekday) &&
      canAssignForDay(intermediate, weekday, assignedToday, false)
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
      warnings.push(`Δεν μπόρεσε να γίνει ανάθεση Κυριακής στις ${sundayDate}.`);
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
        warnings.push(`Δεν βρέθηκε υποψήφιος για Κυριακή ${date}.`);
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
      { employee: coreA, template: coreAShift },
      { employee: coreB, template: coreBShift },
    ];

    corePlan.forEach(({ employee, template }) => {
      if (!employee) return;
      const hasManual = manualDayEntries.some((entry) => entry.employeeId === employee.id);
      const fixedOff = fixedOffById[employee.id];
      const isOffDay = typeof fixedOff === 'number' && fixedOff === weekday;

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
        warnings.push(`Overlap στον core rotation για ${employee.fullName} (${date}).`);
      }
    });

    if (intermediate) {
      const intermediateHasManual = manualDayEntries.some((entry) => entry.employeeId === intermediate.id);
      const fixedOff = fixedOffById[intermediate.id];
      const isOffDay = typeof fixedOff === 'number' && fixedOff === weekday;

      if (!intermediateHasManual && !isOffDay) {
        const missingTemplate = missingCoreTypes.find((item) => !plannedTypes.includes(item.shiftType));
        const template = missingTemplate || getPreferredIntermediateShift(intermediate, weekIndex);

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
          warnings.push(`Overlap για ενδιάμεσο εργαζόμενο ${intermediate.fullName} (${date}).`);
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
      const fixedOff = fixedOffById[employee.id];
      return !(typeof fixedOff === 'number' && fixedOff === weekday);
    });

    additionalEmployees.forEach((employee, slotIndex) => {
      const template = getAdditionalEmployeeTemplate(employee, weekIndex, slotIndex);
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
        warnings.push(`Overlap για επιπλέον υπάλληλο ${employee.fullName} (${date}).`);
      }
    });

    if (missingCoreTypes.length > 1 && !intermediate) {
      warnings.push(`Πολλαπλές κενές core βάρδιες στις ${date} χωρίς διαθέσιμο intermediate.`);
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
