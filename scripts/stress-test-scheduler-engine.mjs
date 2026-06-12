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

function assertNoEmployeeShiftInRange(shifts, employeeId, startDate, endDate, message) {
  assert(
    !shifts.some((shift) => shift.employeeId === employeeId && shift.date >= startDate && shift.date <= endDate),
    message,
  );
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

function sundayAssignments(shifts) {
  return shifts
    .filter((shift) => shift.shiftType === 'SUNDAY_12H')
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((shift) => ({ date: shift.date, employeeId: shift.employeeId }));
}

function assertSundayRotationUsesAllEligible(shifts, expectedCount, label) {
  const assignedEmployees = new Set(sundayAssignments(shifts).map((shift) => shift.employeeId));
  assert(
    assignedEmployees.size === expectedCount,
    `${label}: expected ${expectedCount} Sunday employees, got ${assignedEmployees.size}`,
  );
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
    validateSchedule,
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

  const coreBMorningWeek = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    employees: fourEmployees,
    absences: [],
    rules: { startWithCoreAMorning: false },
  });
  assert(employeeShift(coreBMorningWeek.shifts, '2026-06-01', 'core-a')?.shiftType === 'AFTERNOON', 'startWithCoreAMorning=false puts CORE_A afternoon');
  assert(employeeShift(coreBMorningWeek.shifts, '2026-06-01', 'core-b')?.shiftType === 'MORNING', 'startWithCoreAMorning=false puts CORE_B morning');

  const noWeeklyRotation = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-14',
    employees: fourEmployees,
    absences: [],
    rules: { weeklyRotationEnabled: false, startWithCoreAMorning: true },
  });
  assert(employeeShift(noWeeklyRotation.shifts, '2026-06-01', 'core-a')?.shiftType === 'MORNING', 'rotation disabled week A CORE_A morning');
  assert(employeeShift(noWeeklyRotation.shifts, '2026-06-08', 'core-a')?.shiftType === 'MORNING', 'rotation disabled week B CORE_A still morning');

  const intermediate0900Employees = fourEmployees.map((employee) =>
    employee.employeeId === 'flex-b' ? { ...employee, defaultShiftPreference: 'INTERMEDIATE_0900' } : employee,
  );
  const intermediate0900Week = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    employees: intermediate0900Employees,
    absences: [],
  });
  const flexBTuesday = employeeShift(intermediate0900Week.shifts, '2026-06-02', 'flex-b');
  assert(flexBTuesday?.shiftType === 'INTERMEDIATE', 'flex-b is Tuesday intermediate');
  assert(flexBTuesday?.startTime === '09:00' && flexBTuesday?.endTime === '17:00', 'intermediate_0900 preference sets 09:00-17:00');

  const noFridayOffEmployees = fourEmployees.map((employee) => ({ ...employee, fixedDayOff: 'SUNDAY' }));
  const fullCoverageFriday = generateSchedule({
    startDate: '2026-06-05',
    endDate: '2026-06-05',
    employees: noFridayOffEmployees,
    absences: [],
  });
  assert(countShiftType(fullCoverageFriday.shifts, '2026-06-05', 'MORNING') === 2, 'Friday with 4 available has 2 morning');
  assert(countShiftType(fullCoverageFriday.shifts, '2026-06-05', 'AFTERNOON') === 2, 'Friday with 4 available has 2 afternoon');
  assert(countShiftType(fullCoverageFriday.shifts, '2026-06-05', 'INTERMEDIATE') === 0, 'Friday with 4 available has 0 intermediate');
  assert(fullCoverageFriday.validation.valid, 'Friday full coverage validates');

  const noWeeklyParticipantEmployees = fourEmployees.map((employee) =>
    employee.employeeId === 'flex-b' ? { ...employee, participatesInWeeklyRotation: false } : employee,
  );
  const noWeeklyParticipant = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-07',
    employees: noWeeklyParticipantEmployees,
    absences: [],
  });
  assert(
    !noWeeklyParticipant.shifts.some((shift) => shift.employeeId === 'flex-b' && shift.shiftType !== 'SUNDAY_12H'),
    'participatesInWeeklyRotation=false excludes employee from weekday generated shifts',
  );
  assert(
    noWeeklyParticipant.warnings.some((warning) => warning.code === 'MISSING_REQUIRED_ROLE'),
    'missing weekly participant role creates warning',
  );

  const basicMonth = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    employees: fourEmployees,
    absences: [],
  });
  assert(basicMonth.validation.valid, 'basic full month is valid');
  assertNoConsecutiveSundays(basicMonth.shifts);
  assertSundayRotationUsesAllEligible(basicMonth.shifts, 4, 'June 2026 Sunday rotation');
  assertNoDoubleShift(basicMonth.shifts);
  assertCoreRules(basicMonth, fourEmployees);

  const mayMonth = generateSchedule({
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    employees: fourEmployees,
    absences: [],
  });
  const maySundays = sundayAssignments(mayMonth.shifts);
  const juneSundays = sundayAssignments(basicMonth.shifts);
  assert(maySundays.length === 5, 'May 2026 has five generated Sundays');
  assert(juneSundays.length === 4, 'June 2026 has four generated Sundays');
  assert(
    maySundays[maySundays.length - 1].employeeId !== juneSundays[0].employeeId,
    'Sunday rotation continues across separate month generation',
  );
  assert(
    new Set([...maySundays.slice(-3), juneSundays[0]].map((shift) => shift.employeeId)).size === 4,
    'Sunday rotation does not restart at the next month boundary',
  );

  const sundayExcludedEmployees = fourEmployees.map((employee) =>
    employee.employeeId === 'core-a' ? { ...employee, participatesInSundayRotation: false } : employee,
  );
  const sundayExcludedMonth = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    employees: sundayExcludedEmployees,
    absences: [],
  });
  assert(
    !sundayExcludedMonth.shifts.some((shift) => shift.shiftType === 'SUNDAY_12H' && shift.employeeId === 'core-a'),
    'participatesInSundayRotation=false excludes employee from Sunday shifts',
  );

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

  const autoWithoutReplacement = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    employees: fourEmployees,
    absences: [
      {
        id: 'leave-core-a-auto-no-substitute',
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
  assert(!employeeShift(autoWithoutReplacement.shifts, '2026-06-01', 'core-a'), 'AUTO absence removes absent employee even without replacement');
  assert(autoWithoutReplacement.unresolvedGaps.length === 1, 'AUTO without available replacement leaves unresolved gap');
  assert(autoWithoutReplacement.warnings.some((warning) => warning.code === 'UNRESOLVED_GAP'), 'AUTO without replacement creates warning');

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
  assert(
    !noReplacement.shifts.some((shift) => shift.source === 'ABSENCE_REPLACEMENT'),
    'NO_REPLACEMENT does not assign arbitrary replacement employee',
  );

  const manualReplacementDirect = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    employees: [
      ...fourEmployees,
      {
        employeeId: 'extra-manual-direct',
        fullName: 'Extra Manual Direct',
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
        employeeId: 'extra-other-direct',
        fullName: 'Extra Other Direct',
        scheduleRole: 'EXTRA_B',
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
    ],
    absences: [
      {
        id: 'leave-core-a-manual-direct',
        employeeId: 'core-a',
        type: 'LEAVE',
        startDate: '2026-06-01',
        endDate: '2026-06-01',
        scope: 'FULL_DAY',
        replacementMode: 'MANUAL',
        manualReplacementEmployeeId: 'extra-manual-direct',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ],
  });
  assert(employeeShift(manualReplacementDirect.shifts, '2026-06-01', 'extra-manual-direct'), 'MANUAL replacement uses selected replacement');
  assert(!employeeShift(manualReplacementDirect.shifts, '2026-06-01', 'extra-other-direct'), 'MANUAL replacement does not choose a different available replacement');
  assert(!manualReplacementDirect.unresolvedGaps.length, 'available MANUAL replacement resolves gap');

  const manualReplacementUnavailable = generateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    employees: extraEmployees,
    absences: [
      {
        id: 'leave-core-a-manual-disabled',
        employeeId: 'core-a',
        type: 'LEAVE',
        startDate: '2026-06-01',
        endDate: '2026-06-01',
        scope: 'FULL_DAY',
        replacementMode: 'MANUAL',
        manualReplacementEmployeeId: 'extra-b',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ],
  });
  assert(manualReplacementUnavailable.unresolvedGaps.length === 1, 'unavailable MANUAL replacement leaves unresolved gap');
  assert(manualReplacementUnavailable.warnings.some((warning) => warning.code === 'UNRESOLVED_GAP'), 'unavailable MANUAL replacement creates warning');
  assert(!employeeShift(manualReplacementUnavailable.shifts, '2026-06-01', 'extra-a'), 'unavailable MANUAL replacement does not fall back to another employee');

  const sundayBaseline = generateSchedule({
    startDate: '2026-06-07',
    endDate: '2026-06-07',
    employees: fourEmployees,
    absences: [],
  });
  const baselineSundayEmployeeId = shiftsOn(sundayBaseline.shifts, '2026-06-07')[0]?.employeeId;
  assert(baselineSundayEmployeeId, 'baseline Sunday fixture must assign one employee');
  const sundayAbsence = generateSchedule({
    startDate: '2026-06-07',
    endDate: '2026-06-07',
    employees: fourEmployees,
    absences: [
      {
        id: 'sunday-leave',
        employeeId: baselineSundayEmployeeId,
        type: 'LEAVE',
        startDate: '2026-06-07',
        endDate: '2026-06-07',
        scope: 'FULL_DAY',
        replacementMode: 'AUTO',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ],
  });
  assert(countShiftType(sundayAbsence.shifts, '2026-06-07', 'SUNDAY_12H') === 1, 'Sunday absence still leaves exactly one Sunday shift');
  assert(!employeeShift(sundayAbsence.shifts, '2026-06-07', baselineSundayEmployeeId), 'employee with Sunday absence is not assigned 08:00-20:00');

  const invalidAbsentScheduleValidation = validateSchedule({
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    employees: fourEmployees,
    absences: [
      {
        id: 'validation-leave-core-a',
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
    shifts: [
      {
        id: 'invalid-absent-core-a',
        date: '2026-06-01',
        employeeId: 'core-a',
        employeeName: 'Core A',
        scheduleRole: 'CORE_A',
        shiftType: 'MORNING',
        startTime: '06:00',
        endTime: '14:00',
        source: 'BASE',
      },
    ],
    unresolvedGaps: [],
    warnings: [],
  });
  assert(
    invalidAbsentScheduleValidation.violations.some((violation) => violation.code === 'ABSENT_EMPLOYEE_WORKED'),
    'validation fails when absent employee appears in generated shift',
  );

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

  const adapterStoredAbsenceWeek = await generateEngineWeekSchedule({
    weekDays: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
    employees: legacyEmployees,
    allShifts: [],
    absences: [
      {
        id: 'stored-leave-loulakakis',
        employeeId: 'loulakakis',
        type: 'LEAVE',
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        scope: 'FULL_DAY',
        replacementMode: 'NO_REPLACEMENT',
        status: 'ACTIVE',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ],
    rules: {},
  });
  assert(
    !adapterStoredAbsenceWeek.shifts.some((shift) => shift.employeeId === 'loulakakis' && shift.date >= '2026-06-01' && shift.date <= '2026-06-03'),
    'stored multi-day absence prevents employee shifts for every absence date',
  );
  assertNoEmployeeShiftInRange(
    adapterStoredAbsenceWeek.shifts,
    'loulakakis',
    '2026-06-01',
    '2026-06-03',
    'stored current-month multi-day absence excludes every date in range',
  );
  assert(adapterStoredAbsenceWeek.warnings.some((message) => String(message).includes('χωρίς αντικατάσταση')), 'stored NO_REPLACEMENT absence creates warning');

  const adapterManualReplacementWeek = await generateEngineWeekSchedule({
    weekDays: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
    employees: [
      ...legacyEmployees,
      {
        id: 'extra-manual',
        fullName: 'Extra Manual',
        isActive: true,
        scheduleRole: 'custom',
        extraMode: 'SUBSTITUTE_ONLY',
        canCoverLeaves: true,
      },
    ],
    allShifts: [],
    absences: [
      {
        id: 'stored-manual-leave-core',
        employeeId: 'loulakakis',
        type: 'SICK',
        startDate: '2026-06-01',
        endDate: '2026-06-01',
        scope: 'FULL_DAY',
        replacementMode: 'MANUAL',
        manualReplacementEmployeeId: 'extra-manual',
        status: 'ACTIVE',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ],
    rules: {},
  });
  assert(
    adapterManualReplacementWeek.shifts.some((shift) => shift.employeeId === 'extra-manual' && shift.date === '2026-06-01'),
    'stored MANUAL absence uses selected replacement when available',
  );

  const adapterPublicAbsenceSafetyWeek = await generateEngineWeekSchedule({
    weekDays: ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
    employees: legacyEmployees,
    allShifts: [],
    absences: [
      {
        id: 'public-absence-doc',
        employeeName: 'Λουλακάκης Κώστας',
        typeLabel: 'Άδεια',
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        totalDays: 3,
        status: 'ACTIVE',
      },
    ],
    rules: {},
  });
  assert(
    adapterPublicAbsenceSafetyWeek.shifts.some((shift) => shift.employeeId === 'loulakakis' && shift.date === '2026-06-01'),
    'sanitized public absence docs without employeeId are ignored by generator',
  );
  assert(
    !adapterPublicAbsenceSafetyWeek.warnings.some((message) => String(message).includes('public-absence-doc')),
    'sanitized public absence docs do not enter generator warnings',
  );

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

  const adapterFutureLeaveMonth = generateEngineMonthSchedule({
    month: 7,
    year: 2026,
    employees: legacyEmployees,
    allShifts: [],
    existingMonthShifts: [],
    absences: [
      {
        id: 'future-leave-drossi',
        employeeId: 'drossi',
        type: 'LEAVE',
        startDate: '2026-08-05',
        endDate: '2026-08-15',
        scope: 'FULL_DAY',
        replacementMode: 'AUTO',
        status: 'ACTIVE',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
      },
    ],
    rules: {},
  });
  assert(
    !adapterFutureLeaveMonth.shifts.some((shift) => shift.employeeId === 'drossi' && shift.date >= '2026-08-05' && shift.date <= '2026-08-15'),
    'future stored absence is applied when that month is generated',
  );
  assertNoEmployeeShiftInRange(
    adapterFutureLeaveMonth.shifts,
    'drossi',
    '2026-08-05',
    '2026-08-15',
    'future month multi-day absence excludes every generated date in range',
  );

  console.log('Scheduler engine stress QA passed');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
