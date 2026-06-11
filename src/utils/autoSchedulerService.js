import {
  generateEngineMonthSchedule,
  generateEngineWeekSchedule,
} from './schedulerEngineAdapter.js';

/**
 * @deprecated Compatibility facade for the old JS scheduler service.
 *
 * The scheduling source of truth is now `src/scheduler-engine/`, reached through
 * `schedulerEngineAdapter.js`. Keep this module small so old imports continue to
 * work without reintroducing duplicate scheduling algorithms.
 */

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

function stableEmployeeSort(a, b) {
  return (
    (a?.fullName || '').localeCompare(b?.fullName || '', 'el') ||
    `${a?.id || ''}`.localeCompare(`${b?.id || ''}`)
  );
}

function normalizeToken(value) {
  return `${value || ''}`
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function normalizeScheduleRole(value) {
  const token = normalizeToken(value).replace(/[\s-]+/g, '_');
  if (/(^|_)core_?1($|_)/.test(token) || token.includes('core1') || token.includes('core_a')) return 'core1';
  if (/(^|_)core_?2($|_)/.test(token) || token.includes('core2') || token.includes('core_b')) return 'core2';
  if (
    token.includes('intermediate') ||
    token.includes('coverage') ||
    token.includes('ενδια') ||
    token.includes('μεσα') ||
    token.includes('καλυψη')
  ) {
    return 'intermediate';
  }
  if (token.includes('core') || token.includes('βασ') || token.includes('σταθερ')) return 'core';
  if (token.includes('custom') || token.includes('general')) return 'custom';
  return '';
}

function canParticipateInRotation(employee) {
  return employee?.participatesInRotation !== false;
}

function findEmployeeById(employees, id) {
  if (!id) return null;
  return employees.find((employee) => employee.id === id) || null;
}

function hasExplicitEmployeeRoles(employees) {
  return employees.some((employee) =>
    ['core1', 'core2', 'core', 'intermediate'].includes(normalizeScheduleRole(employee.scheduleRole || employee.roleType)),
  );
}

function configuredIntermediateIds(roleConfig = {}) {
  return [
    roleConfig.intermediateId,
    ...(Array.isArray(roleConfig.intermediateIds) ? roleConfig.intermediateIds : []),
  ].filter(Boolean);
}

export function resolveSchedulerRoles(activeEmployees, roleConfig = {}, warnings = []) {
  const sorted = [...(activeEmployees || [])].filter(Boolean).sort(stableEmployeeSort);
  const rotationEligible = sorted.filter(canParticipateInRotation);
  const explicitRolesExist = hasExplicitEmployeeRoles(rotationEligible);

  const core1Matches = rotationEligible.filter(
    (employee) => normalizeScheduleRole(employee.scheduleRole || employee.roleType) === 'core1',
  );
  const core2Matches = rotationEligible.filter(
    (employee) => normalizeScheduleRole(employee.scheduleRole || employee.roleType) === 'core2',
  );
  const legacyCoreMatches = rotationEligible.filter(
    (employee) => normalizeScheduleRole(employee.scheduleRole || employee.roleType) === 'core',
  );
  const intermediateMatches = rotationEligible.filter(
    (employee) => normalizeScheduleRole(employee.scheduleRole || employee.roleType) === 'intermediate',
  );

  const configuredCore1 = !explicitRolesExist ? findEmployeeById(rotationEligible, roleConfig.core1Id || roleConfig.coreAId) : null;
  const configuredCore2 = !explicitRolesExist ? findEmployeeById(rotationEligible, roleConfig.core2Id || roleConfig.coreBId) : null;
  const configuredIntermediates = !explicitRolesExist
    ? configuredIntermediateIds(roleConfig)
        .map((id) => findEmployeeById(rotationEligible, id))
        .filter(Boolean)
        .filter((employee, index, list) => list.findIndex((item) => item.id === employee.id) === index)
    : [];

  if (core1Matches.length > 1) {
    warnings.push('Έχουν οριστεί πολλοί Core 1 εργαζόμενοι. Χρησιμοποιήθηκε ο πρώτος με σταθερή σειρά.');
  }
  if (core2Matches.length > 1) {
    warnings.push('Έχουν οριστεί πολλοί Core 2 εργαζόμενοι. Χρησιμοποιήθηκε ο πρώτος με σταθερή σειρά.');
  }

  const core1 =
    core1Matches[0] ||
    legacyCoreMatches[0] ||
    configuredCore1 ||
    rotationEligible[0] ||
    sorted[0] ||
    null;

  const core2 =
    core2Matches.find((employee) => employee.id !== core1?.id) ||
    legacyCoreMatches.find((employee) => employee.id !== core1?.id) ||
    (configuredCore2?.id !== core1?.id ? configuredCore2 : null) ||
    rotationEligible.find((employee) => employee.id !== core1?.id) ||
    sorted.find((employee) => employee.id !== core1?.id) ||
    null;

  const usedIds = new Set([core1?.id, core2?.id].filter(Boolean));
  const intermediates = [];
  [
    ...configuredIntermediates,
    ...intermediateMatches,
    ...rotationEligible,
    ...sorted,
  ].forEach((employee) => {
    if (!employee?.id || usedIds.has(employee.id)) return;
    if (intermediates.some((item) => item.id === employee.id)) return;
    intermediates.push(employee);
  });

  if (!core1Matches.length && !legacyCoreMatches.length && !configuredCore1) {
    warnings.push('Δεν έχει οριστεί Core 1. Χρησιμοποιήθηκε fallback.');
  }
  if (!core2Matches.length && legacyCoreMatches.length < 2 && !configuredCore2) {
    warnings.push('Δεν έχει οριστεί Core 2. Χρησιμοποιήθηκε fallback.');
  }

  return {
    core1,
    core2,
    coreA: core1,
    coreB: core2,
    intermediate: intermediates[0] || null,
    intermediates,
    configuredIntermediateIds: configuredIntermediates.map((employee) => employee.id),
  };
}

function withRoleConfigFallback(employees = [], roleConfig = {}) {
  const activeEmployees = employees.filter((employee) => employee?.isActive !== false && employee?.id);
  if (hasExplicitEmployeeRoles(activeEmployees)) return employees;

  const core1Id = roleConfig.core1Id || roleConfig.coreAId;
  const core2Id = roleConfig.core2Id || roleConfig.coreBId;
  const intermediateIds = new Set(configuredIntermediateIds(roleConfig));
  const assigned = new Set([core1Id, core2Id, ...intermediateIds].filter(Boolean));

  const remainingForIntermediate = activeEmployees
    .filter((employee) => !assigned.has(employee.id))
    .sort(stableEmployeeSort)
    .slice(0, Math.max(0, 2 - intermediateIds.size));
  remainingForIntermediate.forEach((employee) => intermediateIds.add(employee.id));

  return employees.map((employee) => {
    if (employee.id === core1Id) return { ...employee, scheduleRole: 'core1' };
    if (employee.id === core2Id) return { ...employee, scheduleRole: 'core2' };
    if (intermediateIds.has(employee.id)) return { ...employee, scheduleRole: 'intermediate' };
    return employee;
  });
}

function toRoleSelection(employees, roleConfig) {
  const roles = resolveSchedulerRoles(
    (employees || []).filter((employee) => employee?.isActive !== false),
    roleConfig,
    [],
  );
  return {
    coreAId: roles.core1?.id || '',
    coreBId: roles.core2?.id || '',
    intermediateId: roles.intermediate?.id || '',
    intermediateIds: roles.intermediates.map((employee) => employee.id),
  };
}

export async function generateSmartWeekSchedule({
  weekDays,
  employees,
  allShifts = [],
  absences = [],
  rules = {},
  roleConfig = {},
}) {
  const effectiveEmployees = withRoleConfigFallback(employees, roleConfig);
  const result = await generateEngineWeekSchedule({
    weekDays,
    employees: effectiveEmployees,
    allShifts,
    absences,
    rules,
  });

  return {
    ...result,
    meta: {
      ...(result.meta || {}),
      roleSelection: toRoleSelection(effectiveEmployees, roleConfig),
    },
  };
}

export function generateSmartMonthSchedule({
  month,
  year,
  employees,
  allShifts = [],
  existingMonthShifts = [],
  absences = [],
  rules = {},
  roleConfig = {},
}) {
  const effectiveEmployees = withRoleConfigFallback(employees, roleConfig);
  const result = generateEngineMonthSchedule({
    month,
    year,
    employees: effectiveEmployees,
    allShifts,
    existingMonthShifts,
    absences,
    rules,
  });

  return {
    ...result,
    meta: {
      ...(result.meta || {}),
      roleSelection: toRoleSelection(effectiveEmployees, roleConfig),
    },
  };
}

function addDays(isoDate, delta) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return date.toISOString().slice(0, 10);
}

export async function evaluateSundayRuleViolation({
  employeeId,
  date,
  startTime,
  endTime,
  hasConsecutiveSundayAssignmentFn,
}) {
  const isSundayLongShift = date && startTime === '08:00' && endTime === '20:00';
  if (!employeeId || !date || !isSundayLongShift || typeof hasConsecutiveSundayAssignmentFn !== 'function') {
    return { violated: false, message: '' };
  }

  const previousSundayDate = addDays(date, -7);
  const violated = await hasConsecutiveSundayAssignmentFn({ employeeId, previousSundayDate });
  return violated
    ? {
        violated: true,
        message: 'Προειδοποίηση: Ο ίδιος υπάλληλος έχει ήδη αναλάβει Κυριακή 08:00-20:00 την προηγούμενη εβδομάδα.',
      }
    : { violated: false, message: '' };
}

export function getWeekIdFromWeekStart(weekStart) {
  return `week_${weekStart}`;
}

export function normalizeDayIndex(value) {
  if (value === '' || value === null || typeof value === 'undefined') return null;
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
  const token = normalizeToken(value);
  if (/^\d+$/.test(token)) {
    const numeric = Number(token);
    return Number.isInteger(numeric) && numeric >= 0 && numeric <= 6 ? numeric : null;
  }
  return WEEKDAY_NAME_TO_INDEX.get(token) ?? null;
}
