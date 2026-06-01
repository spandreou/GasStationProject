import {
  generateSmartMonthSchedule,
  generateSmartWeekSchedule,
  normalizeScheduleRole,
} from '../src/utils/autoSchedulerService.js';
import { readFileSync } from 'node:fs';

const WORK = 'work';
const REAL_EMPLOYEES = [
  {
    id: 'loulakakis',
    fullName: 'Λουλακάκης Κώστας',
    isActive: true,
    scheduleRole: 'core1',
    fixedDayOff: 4,
    defaultShiftPreference: 'auto',
    weeklyFixedShiftSideRotation: true,
  },
  {
    id: 'spourlis',
    fullName: 'Σπουρλής Αντώνης',
    isActive: true,
    scheduleRole: 'core2',
    fixedDayOff: 3,
    defaultShiftPreference: 'morning',
    weeklyFixedShiftSideRotation: true,
  },
  {
    id: 'roka',
    fullName: 'Ρόκα Κωνσταντίνα',
    isActive: true,
    scheduleRole: 'intermediate',
    fixedDayOff: 2,
    defaultShiftPreference: 'auto',
  },
  {
    id: 'drossi',
    fullName: 'Δρόση Βασιλική',
    isActive: true,
    scheduleRole: 'intermediate',
    fixedDayOff: 5,
    defaultShiftPreference: 'auto',
  },
];

const MAY_2026_WEEK_DAYS = [
  '2026-05-11',
  '2026-05-12',
  '2026-05-13',
  '2026-05-14',
  '2026-05-15',
  '2026-05-16',
  '2026-05-17',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function weekday(date) {
  return new Date(`${date}T00:00:00`).getDay();
}

function workShifts(shifts, date) {
  return shifts.filter((shift) => shift.date === date && (shift.type || WORK) === WORK);
}

function countType(shifts, type) {
  return shifts.filter((shift) => shift.shiftType === type).length;
}

function employeeById(employees, employeeId) {
  return employees.find((employee) => employee.id === employeeId);
}

function isIntermediateEmployee(employee) {
  return normalizeScheduleRole(employee?.scheduleRole || employee?.roleType) === 'intermediate';
}

function assertStrictInvariants({ label, employees, shifts, days }) {
  for (const date of days) {
    const dayShifts = workShifts(shifts, date);
    const day = weekday(date);

    const byEmployee = new Map(dayShifts.map((shift) => [shift.employeeId, shift]));
    const core1 = employees.find((employee) => normalizeScheduleRole(employee.scheduleRole || employee.roleType) === 'core1');
    const core2 = employees.find((employee) => normalizeScheduleRole(employee.scheduleRole || employee.roleType) === 'core2');
    const core1Shift = core1 ? byEmployee.get(core1.id) : null;
    const core2Shift = core2 ? byEmployee.get(core2.id) : null;

    if (core1Shift && core2Shift) {
      assert(
        core1Shift.shiftType !== core2Shift.shiftType,
        `${label} ${date}: Core 1/Core 2 share shiftType ${core1Shift.shiftType}`,
      );
      assert(
        ['morning', 'evening'].includes(core1Shift.shiftType) &&
          ['morning', 'evening'].includes(core2Shift.shiftType),
        `${label} ${date}: Core 1/Core 2 must only be morning/evening`,
      );
    }

    [core1Shift, core2Shift].filter(Boolean).forEach((shift) => {
      assert(shift.shiftType !== 'intermediate', `${label} ${date}: core employee is intermediate`);
    });

    dayShifts
      .filter((shift) => shift.shiftType === 'intermediate')
      .forEach((shift) => {
        const employee = employeeById(employees, shift.employeeId);
        assert(isIntermediateEmployee(employee), `${label} ${date}: intermediate slot assigned to non-intermediate ${employee?.fullName}`);
      });

    employees.forEach((employee) => {
      if (employee.fixedDayOff === day) {
        assert(!byEmployee.has(employee.id), `${label} ${date}: ${employee.fullName} works on fixed day off`);
      }
    });

    if (day === 0) {
      assert(dayShifts.length === 1, `${label} ${date}: Sunday must have exactly one shift`);
      assert(dayShifts[0].startTime === '08:00' && dayShifts[0].endTime === '20:00', `${label} ${date}: Sunday hours invalid`);
      continue;
    }

    const availableCount = employees.filter((employee) => employee.fixedDayOff !== day).length;
    const morning = countType(dayShifts, 'morning');
    const intermediate = countType(dayShifts, 'intermediate');
    const evening = countType(dayShifts, 'evening');

    if (availableCount === 3) {
      assert(
        dayShifts.length === 3 && morning === 1 && intermediate === 1 && evening === 1,
        `${label} ${date}: expected 1/1/1 with 3 available, got ${morning}/${intermediate}/${evening}`,
      );
    }

    if (availableCount === 4 && [1, 5, 6].includes(day)) {
      assert(
        dayShifts.length === 4 && morning === 2 && intermediate === 0 && evening === 2,
        `${label} ${date}: expected 2/0/2 full coverage, got ${morning}/${intermediate}/${evening}`,
      );
    }
  }
}

const weeklyResult = await generateSmartWeekSchedule({
  weekDays: MAY_2026_WEEK_DAYS,
  employees: REAL_EMPLOYEES,
  allShifts: [],
  hasConsecutiveSundayAssignmentFn: async () => false,
  rules: {},
});
assertStrictInvariants({
  label: 'weekly real May 2026',
  employees: REAL_EMPLOYEES,
  shifts: weeklyResult.shifts,
  days: MAY_2026_WEEK_DAYS,
});

const monthlyResult = generateSmartMonthSchedule({
  month: 4,
  year: 2026,
  employees: REAL_EMPLOYEES,
  allShifts: [],
  existingMonthShifts: [],
  rules: {},
  roleConfig: {},
});
assertStrictInvariants({
  label: 'monthly real May 2026',
  employees: REAL_EMPLOYEES,
  shifts: monthlyResult.shifts,
  days: monthlyResult.meta.monthDays,
});

const loulakakisMay12 = workShifts(monthlyResult.shifts, '2026-05-12').find((shift) => shift.employeeId === 'loulakakis');
assert(loulakakisMay12?.shiftType !== 'intermediate', '12/05/2026: Λουλακάκης must not be intermediate');
assert(!workShifts(monthlyResult.shifts, '2026-05-14').some((shift) => shift.employeeId === 'loulakakis'), '14/05/2026: Λουλακάκης must not work on Thursday');
const may18 = workShifts(monthlyResult.shifts, '2026-05-18');
assert(
  may18.find((shift) => shift.employeeId === 'loulakakis')?.shiftType !==
    may18.find((shift) => shift.employeeId === 'spourlis')?.shiftType,
  '18/05/2026: Core 1/Core 2 must not share shiftType',
);
assert(!workShifts(monthlyResult.shifts, '2026-05-21').some((shift) => shift.employeeId === 'loulakakis'), '21/05/2026: Λουλακάκης must not work on Thursday');

const conflictingMonthlyRoleConfigResult = generateSmartMonthSchedule({
  month: 4,
  year: 2026,
  employees: REAL_EMPLOYEES,
  allShifts: [],
  existingMonthShifts: [],
  rules: {},
  roleConfig: {
    coreAId: 'drossi',
    coreBId: 'loulakakis',
    intermediateId: 'roka',
  },
});
assertStrictInvariants({
  label: 'monthly role config must not override explicit employee roles',
  employees: REAL_EMPLOYEES,
  shifts: conflictingMonthlyRoleConfigResult.shifts,
  days: conflictingMonthlyRoleConfigResult.meta.monthDays,
});
assert(
  conflictingMonthlyRoleConfigResult.meta.roleSelection.coreAId === 'loulakakis',
  'Conflicting monthly roleConfig must not override Core 1 employee role',
);
assert(
  conflictingMonthlyRoleConfigResult.meta.roleSelection.coreBId === 'spourlis',
  'Conflicting monthly roleConfig must not override Core 2 employee role',
);
assert(
  conflictingMonthlyRoleConfigResult.meta.roleSelection.intermediateIds.includes('roka') &&
    conflictingMonthlyRoleConfigResult.meta.roleSelection.intermediateIds.includes('drossi'),
  'Conflicting monthly roleConfig must keep both explicit intermediate employees',
);
assert(
  !conflictingMonthlyRoleConfigResult.warnings.some((warning) =>
    String(warning).includes('Δεν υπήρχε διαθέσιμος Intermediate / Coverage'),
  ),
  'Conflicting monthly roleConfig must not create fake missing intermediate warnings',
);

const weeklyGridSource = readFileSync(new URL('../src/components/scheduler/WeeklyGrid.jsx', import.meta.url), 'utf8');
assert(
  weeklyGridSource.includes('Ρόλοι από κανόνες εργαζομένων'),
  'Monthly panel must show employee-role summary when explicit employee roles exist',
);
assert(
  !weeklyGridSource.includes('value={monthlyRoleConfig?.coreAId || \'\'}'),
  'Monthly panel must not expose always-on Core 1 selector that can conflict with employee roles',
);

const schedulerStoreSource = readFileSync(new URL('../src/hooks/useSchedulerStore.js', import.meta.url), 'utf8');
assert(
  schedulerStoreSource.includes('employees: state.employees.map((employee) =>') &&
    schedulerStoreSource.includes('employee.id === employeeId ? { ...employee, ...nextRules } : employee'),
  'Saving employee scheduling rules must update local employees state before Firestore snapshots return',
);

const impossibleIntermediateEmployees = [
  { id: 'core1', fullName: 'Core 1', isActive: true, scheduleRole: 'core1' },
  { id: 'core2', fullName: 'Core 2', isActive: true, scheduleRole: 'core2' },
  { id: 'custom', fullName: 'Custom Worker', isActive: true, scheduleRole: 'custom' },
];
const impossibleIntermediateWeek = await generateSmartWeekSchedule({
  weekDays: MAY_2026_WEEK_DAYS,
  employees: impossibleIntermediateEmployees,
  allShifts: [],
  hasConsecutiveSundayAssignmentFn: async () => false,
  rules: {},
});
impossibleIntermediateWeek.shifts
  .filter((shift) => shift.shiftType === 'intermediate')
  .forEach((shift) => {
    const employee = employeeById(impossibleIntermediateEmployees, shift.employeeId);
    assert(isIntermediateEmployee(employee), `Impossible intermediate week assigned intermediate to ${employee?.scheduleRole}`);
  });

const intermediateWithMorningPreference = [
  { id: 'core1', fullName: 'Core 1', isActive: true, scheduleRole: 'core1', fixedDayOff: 4 },
  { id: 'core2', fullName: 'Core 2', isActive: true, scheduleRole: 'core2', fixedDayOff: 3 },
  { id: 'ia', fullName: 'Intermediate A', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2, defaultShiftPreference: 'morning' },
  { id: 'ib', fullName: 'Intermediate B', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 5, defaultShiftPreference: 'evening' },
];
const preferenceMonth = generateSmartMonthSchedule({
  month: 4,
  year: 2026,
  employees: intermediateWithMorningPreference,
  allShifts: [],
  existingMonthShifts: [],
  rules: {},
  roleConfig: {},
});
assertStrictInvariants({
  label: 'monthly intermediate preference coercion',
  employees: intermediateWithMorningPreference,
  shifts: preferenceMonth.shifts,
  days: preferenceMonth.meta.monthDays,
});

console.log('Scheduler stress QA passed');
