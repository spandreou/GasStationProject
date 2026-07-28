import {
  generateSmartMonthSchedule,
  generateSmartWeekSchedule,
  resolveSchedulerRoles,
} from '../src/utils/autoSchedulerService.js';
import { buildGroupedScheduleRows, PDF_SCHEDULE_COLUMNS } from '../src/utils/exportService.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SHIFT_TYPES = {
  WORK: 'work',
};

const repositoryRoot = process.cwd();

const weekDays = [
  '2026-04-06',
  '2026-04-07',
  '2026-04-08',
  '2026-04-09',
  '2026-04-10',
  '2026-04-11',
  '2026-04-12',
];

const employees = [
  { id: 'coreA', fullName: 'Core A', afm: '111', isActive: true, scheduleRole: 'core1', fixedDayOff: 3 },
  { id: 'coreB', fullName: 'Core B', afm: '222', isActive: true, scheduleRole: 'core2', fixedDayOff: 4 },
  {
    id: 'intermediateA',
    fullName: 'Intermediate A',
    afm: '333',
    isActive: true,
    scheduleRole: 'intermediate',
    fixedDayOff: 2,
    defaultShiftPreference: 'intermediate_0900',
  },
  {
    id: 'intermediateB',
    fullName: 'Intermediate B',
    afm: '444',
    isActive: true,
    scheduleRole: 'intermediate',
    fixedDayOff: 0,
    defaultShiftPreference: 'intermediate_1000',
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getWorkShifts(shifts, date) {
  return shifts.filter((shift) => shift.date === date && (shift.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK);
}

function countType(shifts, shiftType) {
  return shifts.filter((shift) => shift.shiftType === shiftType).length;
}

function assertDayPattern(shifts, date, expected, label) {
  const dayShifts = getWorkShifts(shifts, date);
  assert(dayShifts.length === expected.total, `${label}: expected ${expected.total} work shifts, got ${dayShifts.length}`);
  assert(countType(dayShifts, 'morning') === expected.morning, `${label}: expected ${expected.morning} morning shifts`);
  assert(
    countType(dayShifts, 'intermediate') === expected.intermediate,
    `${label}: expected ${expected.intermediate} intermediate shifts`,
  );
  assert(countType(dayShifts, 'evening') === expected.evening, `${label}: expected ${expected.evening} evening shifts`);
}

function assertNoDuplicateSlotsForThree(shifts, date, label) {
  const dayShifts = getWorkShifts(shifts, date);
  const slots = dayShifts.map((shift) => shift.shiftType).sort();
  assert(new Set(slots).size === 3, `${label}: expected no duplicate shift slots, got ${slots.join(', ')}`);
}

function minutes(value) {
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

function assertNoOverlap(shifts) {
  const byEmployeeDate = new Map();
  for (const shift of shifts) {
    if ((shift.type || SHIFT_TYPES.WORK) !== SHIFT_TYPES.WORK) continue;
    const key = `${shift.employeeId}__${shift.date}`;
    if (!byEmployeeDate.has(key)) byEmployeeDate.set(key, []);
    byEmployeeDate.get(key).push(shift);
  }

  for (const [key, entries] of byEmployeeDate.entries()) {
    const sorted = entries.sort((a, b) => minutes(a.startTime) - minutes(b.startTime));
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      assert(minutes(previous.endTime) <= minutes(current.startTime), `Overlap found for ${key}`);
    }
  }
}

function assertCoreOpposition(shifts, label) {
  assertCoreOppositionByIds(shifts, weekDays, 'coreA', 'coreB', label);
}

function assertCoreOppositionByIds(shifts, dates, core1Id, core2Id, label) {
  for (const date of dates) {
    const dayShifts = getWorkShifts(shifts, date);
    const core1Shift = dayShifts.find((shift) => shift.employeeId === core1Id);
    const core2Shift = dayShifts.find((shift) => shift.employeeId === core2Id);
    if (!core1Shift || !core2Shift) continue;
    const pair = [core1Shift.shiftType, core2Shift.shiftType].sort().join('/');
    assert(pair === 'evening/morning', `${label} ${date}: Core 1/Core 2 must be opposite morning/evening, got ${pair}`);
  }
}

function assertNoMissingCoreWarnings(warnings, label) {
  const missingCoreWarning = (warnings || []).find((message) => (
    String(message).includes('Core 1') || String(message).includes('Core 2')
  ) && String(message).toLowerCase().includes('fallback'));
  assert(!missingCoreWarning, `${label}: unexpected missing core fallback warning: ${missingCoreWarning || ''}`);
}

function weekdayFromDate(date) {
  return new Date(`${date}T00:00:00`).getDay();
}

function effectiveFixedDayOff(employee, employeesForMonth) {
  if (typeof employee.fixedDayOff === 'number') return employee.fixedDayOff;
  const role = employee.scheduleRole || employee.roleType;
  if (role === 'core1') return 3;
  if (role === 'core2') return 4;
  if (role === 'intermediate') {
    const intermediates = employeesForMonth
      .filter((item) => (item.scheduleRole || item.roleType) === 'intermediate')
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'el') || a.id.localeCompare(b.id));
    return intermediates.findIndex((item) => item.id === employee.id) === 0 ? 2 : 5;
  }
  return null;
}

function countMonthAvailability(employeesForMonth, weekday) {
  return employeesForMonth.filter((employee) => effectiveFixedDayOff(employee, employeesForMonth) !== weekday).length;
}

function assertMonthInvariants({
  label,
  result,
  employeesForMonth,
  core1Id,
  core2Id,
  expectFixedDaysOff = true,
}) {
  const monthDays = result.meta?.monthDays || [];
  assert(monthDays.length > 0, `${label}: expected monthDays metadata`);
  assertNoMissingCoreWarnings(result.warnings, label);

  for (const date of monthDays) {
    const weekday = weekdayFromDate(date);
    const dayShifts = getWorkShifts(result.shifts, date);

    if (weekday === 0) {
      assert(dayShifts.length === 1, `${label} ${date}: Sunday should have exactly 1 shift, got ${dayShifts.length}`);
      assert(
        dayShifts[0].startTime === '08:00' && dayShifts[0].endTime === '20:00',
        `${label} ${date}: Sunday should be 08:00-20:00`,
      );
      continue;
    }

    const availableCount = countMonthAvailability(employeesForMonth, weekday);
    const morningCount = countType(dayShifts, 'morning');
    const intermediateCount = countType(dayShifts, 'intermediate');
    const eveningCount = countType(dayShifts, 'evening');

    if (availableCount === 3 || (!expectFixedDaysOff && [2, 3, 4].includes(weekday) && dayShifts.length === 3)) {
      assert(
        dayShifts.length === 3 && morningCount === 1 && intermediateCount === 1 && eveningCount === 1,
        `${label} ${date}: expected 1 morning + 1 intermediate + 1 evening, got ${morningCount}/${intermediateCount}/${eveningCount}`,
      );
      assertNoDuplicateSlotsForThree(result.shifts, date, `${label} ${date}`);
    }

    if (availableCount === 4 && [1, 5, 6].includes(weekday)) {
      assert(
        dayShifts.length === 4 && morningCount === 2 && intermediateCount === 0 && eveningCount === 2,
        `${label} ${date}: expected 2 morning + 2 evening + 0 intermediate, got ${morningCount}/${intermediateCount}/${eveningCount}`,
      );
    }

    const core1Shift = dayShifts.find((shift) => shift.employeeId === core1Id);
    const core2Shift = dayShifts.find((shift) => shift.employeeId === core2Id);
    if (core1Shift && core2Shift) {
      const pair = [core1Shift.shiftType, core2Shift.shiftType].sort().join('/');
      assert(pair === 'evening/morning', `${label} ${date}: Core 1/Core 2 must be opposite, got ${pair}`);
    }
  }

  assertNoOverlap(result.shifts);
}

function assertFullYearMonthlyInvariants({
  label,
  year,
  employeesForMonth,
  roleConfig = {},
  core1Id,
  core2Id,
  expectFixedDaysOff = true,
}) {
  for (let month = 0; month < 12; month += 1) {
    const result = generateSmartMonthSchedule({
      month,
      year,
      employees: employeesForMonth,
      allShifts: [],
      existingMonthShifts: [],
      rules: {},
      roleConfig,
    });
    assertMonthInvariants({
      label: `${label} ${year}-${String(month + 1).padStart(2, '0')}`,
      result,
      employeesForMonth,
      core1Id,
      core2Id,
      expectFixedDaysOff,
    });
  }
}

const roleWarnings = [];
const resolvedRoles = resolveSchedulerRoles(employees, {}, roleWarnings);
assert(resolvedRoles.core1?.id === 'coreA', 'Core 1 should resolve from scheduleRole core1');
assert(resolvedRoles.core2?.id === 'coreB', 'Core 2 should resolve from scheduleRole core2');
assert(resolvedRoles.intermediates.length === 2, `Expected 2 intermediates, got ${resolvedRoles.intermediates.length}`);
assert(resolvedRoles.intermediates.some((employee) => employee.id === 'intermediateA'), 'Intermediate A should resolve');
assert(resolvedRoles.intermediates.some((employee) => employee.id === 'intermediateB'), 'Intermediate B should resolve');

const customRoleEmployees = employees.map((employee) => ({ ...employee, scheduleRole: 'custom' }));
const overrideWarnings = [];
const overrideRoles = resolveSchedulerRoles(customRoleEmployees, {
  coreAId: 'coreA',
  coreBId: 'coreB',
  intermediateId: 'intermediateA',
  intermediateIds: ['intermediateA', 'intermediateB'],
}, overrideWarnings);
assert(overrideRoles.core1?.id === 'coreA', 'Monthly coreAId should map to Core 1 when employee roles are custom');
assert(overrideRoles.core2?.id === 'coreB', 'Monthly coreBId should map to Core 2 when employee roles are custom');
assert(
  !overrideWarnings.some((message) => message.includes('Δεν έχει οριστεί Core 1') || message.includes('Δεν έχει οριστεί Core 2')),
  'Monthly roleConfig should not emit missing Core 1/Core 2 fallback warnings',
);

const { shifts, warnings } = await generateSmartWeekSchedule({
  weekDays,
  employees,
  allShifts: [],
  hasConsecutiveSundayAssignmentFn: async () => false,
  rules: {},
});

assert(Array.isArray(warnings), 'Generator should return warnings array');

assertDayPattern(shifts, '2026-04-06', { total: 4, morning: 2, intermediate: 0, evening: 2 }, 'Monday');
assertDayPattern(shifts, '2026-04-10', { total: 4, morning: 2, intermediate: 0, evening: 2 }, 'Friday');
assertDayPattern(shifts, '2026-04-11', { total: 4, morning: 2, intermediate: 0, evening: 2 }, 'Saturday');

for (const [label, date] of [
  ['Tuesday', '2026-04-07'],
  ['Wednesday', '2026-04-08'],
  ['Thursday', '2026-04-09'],
]) {
  assertDayPattern(shifts, date, { total: 3, morning: 1, intermediate: 1, evening: 1 }, label);
  assertNoDuplicateSlotsForThree(shifts, date, label);
}

assertCoreOpposition(shifts, 'Weekly');

const sundayShifts = getWorkShifts(shifts, '2026-04-12');
assert(sundayShifts.length === 1, `Sunday should have exactly 1 shift, got ${sundayShifts.length}`);
assert(sundayShifts[0].startTime === '08:00' && sundayShifts[0].endTime === '20:00', 'Sunday should be 08:00-20:00');

assertNoOverlap(shifts);

const monthResult = generateSmartMonthSchedule({
  month: 3,
  year: 2026,
  employees,
  allShifts: [],
  existingMonthShifts: [],
  rules: {},
  roleConfig: {},
});
assertDayPattern(monthResult.shifts, '2026-04-06', { total: 4, morning: 2, intermediate: 0, evening: 2 }, 'Monthly Monday');
assertDayPattern(monthResult.shifts, '2026-04-07', { total: 3, morning: 1, intermediate: 1, evening: 1 }, 'Monthly Tuesday');
assertNoDuplicateSlotsForThree(monthResult.shifts, '2026-04-07', 'Monthly Tuesday');

const monthOverrideResult = generateSmartMonthSchedule({
  month: 3,
  year: 2026,
  employees: customRoleEmployees,
  allShifts: [],
  existingMonthShifts: [],
  rules: {},
  roleConfig: {
    coreAId: 'coreA',
    coreBId: 'coreB',
    intermediateId: 'intermediateA',
    intermediateIds: ['intermediateA', 'intermediateB'],
  },
});
assertDayPattern(monthOverrideResult.shifts, '2026-04-07', { total: 3, morning: 1, intermediate: 1, evening: 1 }, 'Monthly override Tuesday');
assertNoDuplicateSlotsForThree(monthOverrideResult.shifts, '2026-04-07', 'Monthly override Tuesday');
assert(
  !monthOverrideResult.warnings.some((message) => message.includes('Δεν έχει οριστεί Core 1') || message.includes('Δεν έχει οριστεί Core 2')),
  'Monthly generation with roleConfig should not show missing Core 1/Core 2 warnings',
);

const screenshotWeekDays = [
  '2026-05-25',
  '2026-05-26',
  '2026-05-27',
  '2026-05-28',
  '2026-05-29',
  '2026-05-30',
  '2026-05-31',
];

const screenshotEmployees = [
  {
    id: 'drossi',
    fullName: 'Drossi Vasiliki',
    isActive: true,
    scheduleRole: 'intermediate',
    fixedDayOff: 5,
    defaultShiftPreference: 'auto',
    weeklyFixedShiftSideRotation: false,
  },
  {
    id: 'loulakakis',
    fullName: 'Loulakakis Kostas',
    isActive: true,
    scheduleRole: 'core1',
    fixedDayOff: 4,
    defaultShiftPreference: 'auto',
    weeklyFixedShiftSideRotation: true,
  },
  {
    id: 'roka',
    fullName: 'Roka Konstantina',
    isActive: true,
    scheduleRole: 'intermediate',
    fixedDayOff: 2,
    defaultShiftPreference: 'auto',
    weeklyFixedShiftSideRotation: false,
  },
  {
    id: 'spourlis',
    fullName: 'Spourlis Antonis',
    isActive: true,
    scheduleRole: 'core2',
    fixedDayOff: 3,
    defaultShiftPreference: 'morning',
    weeklyFixedShiftSideRotation: true,
  },
];

const screenshotWeekResult = await generateSmartWeekSchedule({
  weekDays: screenshotWeekDays,
  employees: screenshotEmployees,
  allShifts: [],
  hasConsecutiveSundayAssignmentFn: async () => false,
  rules: {},
});

assertNoMissingCoreWarnings(screenshotWeekResult.warnings, 'Screenshot weekly scenario');
assertDayPattern(screenshotWeekResult.shifts, '2026-05-25', { total: 4, morning: 2, intermediate: 0, evening: 2 }, 'Screenshot Monday');
assertDayPattern(screenshotWeekResult.shifts, '2026-05-30', { total: 4, morning: 2, intermediate: 0, evening: 2 }, 'Screenshot Saturday');
for (const [label, date] of [
  ['Screenshot Tuesday', '2026-05-26'],
  ['Screenshot Wednesday', '2026-05-27'],
  ['Screenshot Thursday', '2026-05-28'],
  ['Screenshot Friday', '2026-05-29'],
]) {
  assertDayPattern(screenshotWeekResult.shifts, date, { total: 3, morning: 1, intermediate: 1, evening: 1 }, label);
  assertNoDuplicateSlotsForThree(screenshotWeekResult.shifts, date, label);
}
assertCoreOppositionByIds(screenshotWeekResult.shifts, screenshotWeekDays, 'loulakakis', 'spourlis', 'Screenshot weekly');
assertNoOverlap(screenshotWeekResult.shifts);

const screenshotMonthResult = generateSmartMonthSchedule({
  month: 4,
  year: 2026,
  employees: screenshotEmployees,
  allShifts: [],
  existingMonthShifts: [],
  rules: {},
  roleConfig: {},
});

assertNoMissingCoreWarnings(screenshotMonthResult.warnings, 'Screenshot monthly scenario');
assertDayPattern(screenshotMonthResult.shifts, '2026-05-25', { total: 4, morning: 2, intermediate: 0, evening: 2 }, 'Screenshot monthly Monday');
assertDayPattern(screenshotMonthResult.shifts, '2026-05-30', { total: 4, morning: 2, intermediate: 0, evening: 2 }, 'Screenshot monthly Saturday');
for (const [label, date] of [
  ['Screenshot monthly Tuesday', '2026-05-26'],
  ['Screenshot monthly Wednesday', '2026-05-27'],
  ['Screenshot monthly Thursday', '2026-05-28'],
  ['Screenshot monthly Friday', '2026-05-29'],
]) {
  assertDayPattern(screenshotMonthResult.shifts, date, { total: 3, morning: 1, intermediate: 1, evening: 1 }, label);
  assertNoDuplicateSlotsForThree(screenshotMonthResult.shifts, date, label);
}
assertCoreOppositionByIds(screenshotMonthResult.shifts, screenshotWeekDays, 'loulakakis', 'spourlis', 'Screenshot monthly');
assertNoOverlap(screenshotMonthResult.shifts);

assertFullYearMonthlyInvariants({
  label: 'Screenshot full-year monthly employee-role generation',
  year: 2026,
  employeesForMonth: screenshotEmployees,
  core1Id: 'loulakakis',
  core2Id: 'spourlis',
});

assertFullYearMonthlyInvariants({
  label: 'Screenshot full-year monthly roleConfig override generation',
  year: 2026,
  employeesForMonth: screenshotEmployees.map((employee) => ({ ...employee, scheduleRole: 'custom' })),
  roleConfig: {
    coreAId: 'loulakakis',
    coreBId: 'spourlis',
    intermediateId: 'roka',
    intermediateIds: ['roka', 'drossi'],
  },
  core1Id: 'loulakakis',
  core2Id: 'spourlis',
});

assertFullYearMonthlyInvariants({
  label: 'Screenshot full-year monthly employee-role generation next year',
  year: 2027,
  employeesForMonth: screenshotEmployees,
  core1Id: 'loulakakis',
  core2Id: 'spourlis',
});

const noExplicitOffEmployees = [
  {
    id: 'autoCore1',
    fullName: 'Auto Core 1',
    isActive: true,
    scheduleRole: 'core1',
    defaultShiftPreference: 'auto',
  },
  {
    id: 'autoCore2',
    fullName: 'Auto Core 2',
    isActive: true,
    scheduleRole: 'core2',
    defaultShiftPreference: 'auto',
  },
  {
    id: 'autoIntermediateA',
    fullName: 'Auto Intermediate A',
    isActive: true,
    scheduleRole: 'intermediate',
    defaultShiftPreference: 'intermediate_0900',
  },
  {
    id: 'autoIntermediateB',
    fullName: 'Auto Intermediate B',
    isActive: true,
    scheduleRole: 'intermediate',
    defaultShiftPreference: 'intermediate_1000',
  },
];

assertFullYearMonthlyInvariants({
  label: 'Full-year monthly generation without explicit fixed days off',
  year: 2026,
  employeesForMonth: noExplicitOffEmployees,
  core1Id: 'autoCore1',
  core2Id: 'autoCore2',
  expectFixedDaysOff: false,
});

const groupedRows = buildGroupedScheduleRows({ days: weekDays, employees, shifts });
assert(groupedRows.length === weekDays.length, `Expected ${weekDays.length} grouped PDF rows, got ${groupedRows.length}`);
assert(groupedRows[0].fullName.split('\n').length === employees.length, 'Grouped PDF row should contain multiline names');
assert(groupedRows[0].date === '06/04/2026', `Grouped PDF row should show one date label, got ${groupedRows[0].date}`);
assert(groupedRows[0].workRest.includes('ΕΡΓ'), 'Grouped PDF row should contain ΕΡΓ values');
assert(groupedRows[0].workRest.includes('\n'), 'Grouped PDF row should contain multiline work/rest values');

const absencePdfRows = buildGroupedScheduleRows({
  days: ['2026-04-07'],
  employees,
  shifts: [
    ...shifts,
    {
      id: 'stale-absence-work-shift',
      employeeId: 'intermediateA',
      date: '2026-04-07',
      type: 'work',
      shiftType: 'intermediate',
      startTime: '09:00',
      endTime: '17:00',
    },
  ],
  absences: [
    {
      id: 'leave-intermediate-a',
      employeeId: 'intermediateA',
      type: 'LEAVE',
      startDate: '2026-04-07',
      endDate: '2026-04-07',
      scope: 'FULL_DAY',
      replacementMode: 'AUTO',
      status: 'ACTIVE',
    },
  ],
});
const absencePdfRow = absencePdfRows[0];
const absenceNames = absencePdfRow.fullName.split('\n');
const absenceSchedules = absencePdfRow.schedule.split('\n');
const absenceWorkRest = absencePdfRow.workRest.split('\n');
const absentEmployeeIndex = absenceNames.findIndex((name) => name === 'Intermediate A');
assert(absentEmployeeIndex >= 0, 'PDF absence regression should include absent employee');
assert(
  absenceSchedules[absentEmployeeIndex] === '-',
  `PDF absence regression should suppress stale work schedule, got ${absenceSchedules[absentEmployeeIndex]}`,
);
assert(
  absenceWorkRest[absentEmployeeIndex] === 'Άδεια',
  `PDF absence regression should mark leave as Άδεια, got ${absenceWorkRest[absentEmployeeIndex]}`,
);

const workRestColumn = PDF_SCHEDULE_COLUMNS.find((column) => column.key === 'workRest');
assert(workRestColumn?.title === 'Εργασία/Ανάπαυση', 'PDF work/rest column should be Εργασία/Ανάπαυση');

const schedulerStoreSource = readFileSync(resolve(repositoryRoot, 'src/hooks/useSchedulerStore.js'), 'utf8');
const legacySchedulerSource = readFileSync(resolve(repositoryRoot, 'src/utils/autoSchedulerService.js'), 'utf8');
assert(
  legacySchedulerSource.includes('schedulerEngineAdapter'),
  'Legacy autoSchedulerService must delegate generation to schedulerEngineAdapter',
);
assert(
  !legacySchedulerSource.includes('function assignThreeAvailableSlots') &&
    !legacySchedulerSource.includes('function validateGeneratedSchedule'),
  'Legacy autoSchedulerService must not contain duplicated scheduling engine logic',
);
assert(
  schedulerStoreSource.includes('const savedMonthShifts = await fetchShiftsByDates(meta?.monthDays || [...monthDateSet], getTenantArgs());'),
  'Monthly magic generation must refetch saved month shifts after writing to persistence',
);
assert(
  schedulerStoreSource.includes('...state.shifts.filter((shift) => !monthDateSet.has(shift.date))') &&
    schedulerStoreSource.includes('...savedMonthShifts'),
  'Monthly magic generation must replace local month state with freshly saved generated shifts',
);
assert(
  schedulerStoreSource.includes('const savedWeekShifts = await fetchShiftsByDates(weekDays, getTenantArgs());') &&
    schedulerStoreSource.includes('...savedWeekShifts'),
  'Weekly magic generation must replace local week state with freshly saved generated shifts',
);

console.log('Scheduler QA passed');
