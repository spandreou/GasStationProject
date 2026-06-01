import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const tempDir = mkdtempSync(path.join(tmpdir(), 'scheduler-engine-'));
const bundledEnginePath = path.join(tempDir, 'scheduler-engine.mjs');
const bundledAdapterPath = path.join(tempDir, 'scheduler-engine-adapter.mjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function shiftsOn(shifts, date) {
  return shifts.filter((shift) => shift.date === date);
}

function countShiftType(shifts, date, shiftType) {
  return shiftsOn(shifts, date).filter((shift) => shift.shiftType === shiftType).length;
}

function employeeShift(shifts, date, employeeId) {
  return shiftsOn(shifts, date).find((shift) => shift.employeeId === employeeId);
}

function assertNoDoubleShift(shifts) {
  const seen = new Set();
  for (const shift of shifts) {
    const key = `${shift.date}:${shift.employeeId}`;
    assert(!seen.has(key), `${shift.employeeId} has multiple shifts on ${shift.date}`);
    seen.add(key);
  }
}

function assertCoreRules(result, employees) {
  const coreA = employees.find((employee) => employee.scheduleRole === 'CORE_A');
  const coreB = employees.find((employee) => employee.scheduleRole === 'CORE_B');
  assert(coreA && coreB, 'fixture requires core employees');

  const dates = [...new Set(result.shifts.map((shift) => shift.date))];
  for (const date of dates) {
    const coreAShift = employeeShift(result.shifts, date, coreA.employeeId);
    const coreBShift = employeeShift(result.shifts, date, coreB.employeeId);
    if (!coreAShift || !coreBShift) continue;
    assert(coreAShift.shiftType !== 'INTERMEDIATE', `CORE_A is intermediate on ${date}`);
    assert(coreBShift.shiftType !== 'INTERMEDIATE', `CORE_B is intermediate on ${date}`);
    assert(coreAShift.shiftType !== coreBShift.shiftType, `CORE_A/CORE_B share ${coreAShift.shiftType} on ${date}`);
  }
}

function assertNoConsecutiveSundays(shifts) {
  const sundays = shifts
    .filter((shift) => shift.shiftType === 'SUNDAY_12H')
    .sort((a, b) => a.date.localeCompare(b.date));

  for (let index = 1; index < sundays.length; index += 1) {
    assert(
      sundays[index].employeeId !== sundays[index - 1].employeeId,
      `consecutive Sundays assigned to ${sundays[index].employeeId}`,
    );
  }
}

function basicEmployees() {
  return [
    {
      employeeId: 'core-a',
      fullName: 'Core A',
      scheduleRole: 'CORE_A',
      isEnabled: true,
      fixedDayOff: 'WEDNESDAY',
      participatesInWeeklyRotation: true,
      participatesInSundayRotation: true,
    },
    {
      employeeId: 'core-b',
      fullName: 'Core B',
      scheduleRole: 'CORE_B',
      isEnabled: true,
      fixedDayOff: 'THURSDAY',
      participatesInWeeklyRotation: true,
      participatesInSundayRotation: true,
    },
    {
      employeeId: 'flex-a',
      fullName: 'Flex A',
      scheduleRole: 'FLEX_A',
      isEnabled: true,
      fixedDayOff: 'TUESDAY',
      participatesInWeeklyRotation: true,
      participatesInSundayRotation: true,
    },
    {
      employeeId: 'flex-b',
      fullName: 'Flex B',
      scheduleRole: 'FLEX_B',
      isEnabled: true,
      fixedDayOff: 'FRIDAY',
      participatesInWeeklyRotation: true,
      participatesInSundayRotation: true,
    },
  ];
}

try {
  await build({
    entryPoints: [path.join(rootDir, 'src/scheduler-engine/index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: bundledEnginePath,
    logLevel: 'silent',
  });

  const {
    DEFAULT_SHIFT_DEFINITIONS,
    generateSchedule,
    resolveScheduleRoles,
  } = await import(pathToFileURL(bundledEnginePath).href);

  assert(DEFAULT_SHIFT_DEFINITIONS.MORNING.startTime === '06:00', 'default morning starts at 06:00');

  const fourEmployees = basicEmployees();
  const resolved = resolveScheduleRoles(fourEmployees);
  assert(resolved.roles.CORE_A?.employeeId === 'core-a', 'CORE_A resolved');
  assert(resolved.roles.CORE_B?.employeeId === 'core-b', 'CORE_B resolved');
  assert(resolved.roles.FLEX_A?.employeeId === 'flex-a', 'FLEX_A resolved');
  assert(resolved.roles.FLEX_B?.employeeId === 'flex-b', 'FLEX_B resolved');
  assert(!resolved.warnings.length, 'complete role fixture should not warn');

  const basicWeek = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    employees: fourEmployees,
    absences: [],
  });
  assert(basicWeek.validation.valid, 'basic week is valid');
  assert(countShiftType(basicWeek.shifts, '2026-06-01', 'MORNING') === 2, 'Monday has 2 morning');
  assert(countShiftType(basicWeek.shifts, '2026-06-01', 'AFTERNOON') === 2, 'Monday has 2 afternoon');
  assert(countShiftType(basicWeek.shifts, '2026-06-01', 'INTERMEDIATE') === 0, 'Monday has 0 intermediate');
  assert(countShiftType(basicWeek.shifts, '2026-06-02', 'MORNING') === 1, 'Tuesday has 1 morning');
  assert(countShiftType(basicWeek.shifts, '2026-06-02', 'INTERMEDIATE') === 1, 'Tuesday has 1 intermediate');
  assert(countShiftType(basicWeek.shifts, '2026-06-02', 'AFTERNOON') === 1, 'Tuesday has 1 afternoon');
  assert(countShiftType(basicWeek.shifts, '2026-06-06', 'MORNING') === 2, 'Saturday has 2 morning');
  assert(countShiftType(basicWeek.shifts, '2026-06-06', 'AFTERNOON') === 2, 'Saturday has 2 afternoon');
  assert(countShiftType(basicWeek.shifts, '2026-06-07', 'SUNDAY_12H') === 1, 'Sunday has one 12h shift');
  assert(shiftsOn(basicWeek.shifts, '2026-06-07')[0].startTime === '08:00', 'Sunday starts 08:00');
  assertNoDoubleShift(basicWeek.shifts);
  assertCoreRules(basicWeek, fourEmployees);

  const basicMonth = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    employees: fourEmployees,
    absences: [],
  });
  assert(basicMonth.validation.valid, 'basic full month is valid');
  assertNoConsecutiveSundays(basicMonth.shifts);
  assertNoDoubleShift(basicMonth.shifts);
  assertCoreRules(basicMonth, fourEmployees);

  const extraEmployees = [
    ...fourEmployees,
    {
      employeeId: 'extra-a',
      fullName: 'Extra A',
      scheduleRole: 'EXTRA_A',
      isEnabled: true,
      participatesInWeeklyRotation: false,
      participatesInSundayRotation: false,
      extraMode: 'SUBSTITUTE_ONLY',
      canCoverLeaves: true,
      canWorkMorning: true,
      canWorkIntermediate: true,
      canWorkAfternoon: true,
      canWorkSunday: false,
    },
    {
      employeeId: 'extra-b',
      fullName: 'Extra B',
      scheduleRole: 'EXTRA_B',
      isEnabled: true,
      participatesInWeeklyRotation: false,
      participatesInSundayRotation: true,
      extraMode: 'DISABLED',
      canWorkMorning: true,
      canWorkIntermediate: true,
      canWorkAfternoon: true,
      canWorkSunday: true,
    },
  ];

  const absenceWeek = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    employees: extraEmployees,
    absences: [
      {
        id: 'leave-core-a',
        employeeId: 'core-a',
        type: 'LEAVE',
        startDate: '2026-06-01',
        endDate: '2026-06-01',
        scope: 'FULL_DAY',
        replacementMode: 'AUTO',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ],
  });
  assert(!employeeShift(absenceWeek.shifts, '2026-06-01', 'core-a'), 'absence removes employee from shift');
  assert(employeeShift(absenceWeek.shifts, '2026-06-01', 'extra-a'), 'substitute extra fills absence gap');
  assert(!absenceWeek.unresolvedGaps.length, 'filled absence has no unresolved gap');
  assert(
    absenceWeek.shifts.some((shift) => shift.source === 'ABSENCE_REPLACEMENT' && shift.replacedEmployeeId === 'core-a'),
    'replacement shift is marked as absence replacement',
  );
  assert(!absenceWeek.shifts.some((shift) => shift.employeeId === 'extra-b'), 'disabled extra never works');

  const seasonalEmployees = [
    ...fourEmployees,
    {
      employeeId: 'seasonal-extra',
      fullName: 'Seasonal Extra',
      scheduleRole: 'EXTRA_A',
      isEnabled: true,
      participatesInWeeklyRotation: false,
      participatesInSundayRotation: false,
      extraMode: 'ACTIVE_SEASONAL',
      activeFrom: '2026-07-01',
      activeTo: '2026-07-31',
      canCoverLeaves: true,
      canWorkMorning: true,
      canWorkIntermediate: true,
      canWorkAfternoon: true,
      canWorkSunday: false,
    },
  ];
  const seasonalBeforeRange = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    employees: seasonalEmployees,
    absences: [
      {
        id: 'leave-core-a-june',
        employeeId: 'core-a',
        type: 'SICK',
        startDate: '2026-06-01',
        endDate: '2026-06-01',
        scope: 'FULL_DAY',
        replacementMode: 'AUTO',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ],
  });
  assert(
    !seasonalBeforeRange.shifts.some((shift) => shift.employeeId === 'seasonal-extra'),
    'seasonal extra does not work outside active range',
  );

  const noReplacement = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    employees: fourEmployees,
    absences: [
      {
        id: 'leave-core-a-no-replacement',
        employeeId: 'core-a',
        type: 'LEAVE',
        startDate: '2026-06-01',
        endDate: '2026-06-01',
        scope: 'FULL_DAY',
        replacementMode: 'NO_REPLACEMENT',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ],
  });
  assert(noReplacement.unresolvedGaps.length === 1, 'NO_REPLACEMENT leaves an unresolved gap');
  assert(noReplacement.warnings.some((warning) => warning.code === 'UNRESOLVED_GAP'), 'unresolved gap creates warning');

  await build({
    entryPoints: [path.join(rootDir, 'src/utils/schedulerEngineAdapter.js')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: bundledAdapterPath,
    logLevel: 'silent',
  });
  const { generateEngineMonthSchedule, generateEngineWeekSchedule } = await import(pathToFileURL(bundledAdapterPath).href);
  const legacyEmployees = [
    { id: 'loulakakis', fullName: 'Λουλακάκης Κώστας', isActive: true, scheduleRole: 'core1', fixedDayOff: 4 },
    { id: 'spourlis', fullName: 'Σπουρλής Αντώνης', isActive: true, scheduleRole: 'core2', fixedDayOff: 3 },
    { id: 'roka', fullName: 'Ρόκα Κωνσταντίνα', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2 },
    { id: 'drossi', fullName: 'Δρόση Βασιλική', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 5 },
  ];
  const adapterWeek = await generateEngineWeekSchedule({
    weekDays: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
    employees: legacyEmployees,
    allShifts: [],
    rules: {},
  });
  assert(adapterWeek.shifts.every((shift) => shift.type === 'work'), 'adapter emits app work shifts');
  assert(countShiftType(adapterWeek.shifts, '2026-06-01', 'morning') === 2, 'adapter Monday has 2 app morning shifts');
  assert(countShiftType(adapterWeek.shifts, '2026-06-02', 'intermediate') === 1, 'adapter Tuesday has 1 app intermediate shift');
  assert(!adapterWeek.warnings.some((message) => String(message).includes('MISSING_REQUIRED_ROLE')), 'legacy roles map to required engine roles');

  const adapterMonth = generateEngineMonthSchedule({
    month: 5,
    year: 2026,
    employees: legacyEmployees,
    allShifts: [],
    existingMonthShifts: [],
    rules: {},
  });
  assert(adapterMonth.meta.monthDays.length === 30, 'adapter month includes monthDays metadata');
  assert(countShiftType(adapterMonth.shifts, '2026-06-01', 'morning') === 2, 'adapter month uses engine base pattern');
  assert(!adapterMonth.shifts.some((shift) => shift.employeeId === 'loulakakis' && shift.date === '2026-06-04'), 'adapter respects fixed day off');

  console.log('Scheduler engine stress QA passed');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
