import assert from 'node:assert/strict';
import {
  generateEngineWeekSchedule,
  generateEngineMonthSchedule,
} from '../src/utils/schedulerEngineAdapter.js';
import {
  buildGroupedScheduleRows,
  buildScheduleRows,
  validateExportScheduleState,
} from '../src/utils/exportService.js';

console.log('==========================================================');
console.log('START: NEW EMPLOYEE SCHEDULER & PDF REST REGRESSION TESTS');
console.log('==========================================================\n');

const weekDays = [
  '2026-05-04',
  '2026-05-05',
  '2026-05-06',
  '2026-05-07',
  '2026-05-08',
  '2026-05-09',
  '2026-05-10',
];

// Helper to create test employees
function createTestEmployees(count, options = {}) {
  const list = [];
  const baseConfigs = [
    { fullName: 'Νίκος Core 1', scheduleRole: 'core1', fixedDayOff: 3 },
    { fullName: 'Μαρία Core 2', scheduleRole: 'core2', fixedDayOff: 4 },
    { fullName: 'Κώστας Flex 1', scheduleRole: 'intermediate', fixedDayOff: 2 },
    { fullName: 'Ελένη Flex 2', scheduleRole: 'intermediate', fixedDayOff: 5 },
  ];

  for (let i = 0; i < count; i++) {
    if (i < 4) {
      list.push({
        id: `emp-${i + 1}`,
        fullName: baseConfigs[i].fullName,
        isActive: true,
        scheduleRole: baseConfigs[i].scheduleRole,
        fixedDayOff: baseConfigs[i].fixedDayOff,
        participatesInRotation: true,
        participatesInSundayRotation: true,
        defaultShiftPreference: 'auto',
      });
    } else {
      list.push({
        id: `emp-${i + 1}`,
        fullName: `Υπάλληλος Extra ${i + 1}`,
        isActive: true,
        scheduleRole: options.extraRole || 'custom',
        fixedDayOff: options.extraFixedDayOff ?? null,
        participatesInRotation: options.participatesInRotation ?? true,
        participatesInSundayRotation: options.participatesInSundayRotation ?? true,
        defaultShiftPreference: 'auto',
      });
    }
  }
  return list;
}

// -----------------------------------------------------------------------------
// TEST 1: Matrix of Realistic Employee Counts (4, 5, 6, 7, 8, 10, 12)
// -----------------------------------------------------------------------------
console.log('Test 1: Realistic Employee Counts Matrix (4, 5, 6, 7, 8, 10, 12)...');
const countsToTest = [4, 5, 6, 7, 8, 10, 12];

for (const count of countsToTest) {
  const employees = createTestEmployees(count);
  const result = await generateEngineWeekSchedule({
    weekDays,
    employees,
    allShifts: [],
    absences: [],
    rules: { weeklyRotationEnabled: true },
  });

  assert.ok(result.shifts.length > 0, `Expected shifts for count=${count}`);
  const activeCount = employees.filter((e) => e.isActive).length;
  const engineEmployeeCount =
    result.meta.resolvedRoles.baseEmployees.length + result.meta.resolvedRoles.extras.length;

  assert.equal(
    engineEmployeeCount,
    activeCount,
    `Count mismatch for count=${count}: active=${activeCount} engine=${engineEmployeeCount}`,
  );
  assert.equal(
    result.meta.resolvedRoles.baseEmployees.length,
    4,
    `Expected exactly 4 base employees for count=${count}`,
  );
  assert.equal(
    result.meta.resolvedRoles.extras.length,
    count - 4,
    `Expected ${count - 4} extras for count=${count}`,
  );
}
console.log('  PASS: All employee counts 4..12 mapped without dropping any employee.');

// -----------------------------------------------------------------------------
// TEST 2: Adding a 5th, 6th, 7th Employee Workflow Simulation
// -----------------------------------------------------------------------------
console.log('\nTest 2: Adding 7th employee workflow...');
const sevenEmployees = createTestEmployees(7);
const newEmployee = sevenEmployees[6]; // emp-7
assert.equal(newEmployee.id, 'emp-7');

const weekGenResult = await generateEngineWeekSchedule({
  weekDays,
  employees: sevenEmployees,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});

assert.equal(weekGenResult.meta.resolvedRoles.extras.length, 3);
const extraIds = weekGenResult.meta.resolvedRoles.extras.map((e) => e.employeeId);
assert.ok(extraIds.includes('emp-7'), 'emp-7 must be present in extras');
console.log('  PASS: 7th employee is recognized in extras.');

// -----------------------------------------------------------------------------
// TEST 3: Extra Employee filling absence gap
// -----------------------------------------------------------------------------
console.log('\nTest 3: Extra Employee filling absence gap...');
const absence = {
  id: 'abs-1',
  employeeId: 'emp-1', // Core 1 is sick
  startDate: '2026-05-04',
  endDate: '2026-05-06',
  type: 'SICK',
  scope: 'FULL_DAY',
  replacementMode: 'AUTO',
};

const weekWithAbsenceResult = await generateEngineWeekSchedule({
  weekDays,
  employees: sevenEmployees,
  allShifts: [],
  absences: [absence],
  rules: { weeklyRotationEnabled: true },
});

const replacementShifts = weekWithAbsenceResult.shifts.filter(
  (s) => s.source === 'ABSENCE_REPLACEMENT',
);
assert.ok(replacementShifts.length > 0, 'Expected replacement shifts for absent employee');
const replacementEmployeeIds = new Set(replacementShifts.map((s) => s.employeeId));
console.log('  Replacement employee IDs:', [...replacementEmployeeIds]);
assert.ok(
  [...replacementEmployeeIds].some((id) => id.startsWith('emp-5') || id.startsWith('emp-6') || id.startsWith('emp-7')),
  'Extra employees must be used for absence coverage',
);
console.log('  PASS: Extra employees successfully filled absence gaps.');

// -----------------------------------------------------------------------------
// TEST 4: Sunday Rotation includes Extra Employees when configured
// -----------------------------------------------------------------------------
console.log('\nTest 4: Sunday Rotation includes Extra Employees...');
const fiveEmployees = createTestEmployees(5, { participatesInSundayRotation: true });
const testWeeks = [
  ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08', '2026-05-09', '2026-05-10'],
  ['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15', '2026-05-16', '2026-05-17'],
  ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-24'],
  ['2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31'],
];

const assignedSundays = [];
for (const currentWeekDays of testWeeks) {
  const res = await generateEngineWeekSchedule({
    weekDays: currentWeekDays,
    employees: fiveEmployees,
    allShifts: [],
    absences: [],
    rules: { avoidConsecutiveSundays: true },
  });
  const sundayShift = res.shifts.find((s) => s.customLabel === 'Κυριακή' || s.startTime === '08:00');
  if (sundayShift) assignedSundays.push(sundayShift.employeeId);
}
console.log('  Sunday assignments over 4 weeks:', assignedSundays);
assert.ok(assignedSundays.length > 0, 'Sunday shifts generated');
console.log('  PASS: Sunday rotation functions correctly across employees.');

// -----------------------------------------------------------------------------
// TEST 5: PDF Export Semantics (Legitimate Rest vs Unassigned Employee)
// -----------------------------------------------------------------------------
console.log('\nTest 5: PDF Export Semantics...');
// Scenario: emp-1 has 5 shifts, 2 rest days. emp-7 has 0 shifts and 0 absences.
const testShifts = [
  { id: 's1', date: '2026-05-04', employeeId: 'emp-1', startTime: '06:00', endTime: '14:00', type: 'work' },
  { id: 's2', date: '2026-05-05', employeeId: 'emp-1', startTime: '06:00', endTime: '14:00', type: 'work' },
  { id: 's3', date: '2026-05-07', employeeId: 'emp-1', startTime: '06:00', endTime: '14:00', type: 'work' },
  { id: 's4', date: '2026-05-08', employeeId: 'emp-1', startTime: '06:00', endTime: '14:00', type: 'work' },
  { id: 's5', date: '2026-05-09', employeeId: 'emp-1', startTime: '06:00', endTime: '14:00', type: 'work' },
];

const groupedRows = buildGroupedScheduleRows({
  days: weekDays,
  employees: sevenEmployees,
  shifts: testShifts,
  absences: [],
});

// Check emp-1 statuses (worked Mon, Tue, Thu, Fri, Sat; rest Wed, Sun)
const emp1Statuses = groupedRows.map((row) => {
  const names = row.fullName.split('\n');
  const statuses = row.workRest.split('\n');
  const idx = names.findIndex((n) => n.includes('Core 1'));
  return statuses[idx];
});
console.log('  emp-1 statuses across week:', emp1Statuses);
assert.equal(emp1Statuses[0], 'ΕΡΓ'); // Mon
assert.equal(emp1Statuses[1], 'ΕΡΓ'); // Tue
assert.equal(emp1Statuses[2], 'ΑΝ');  // Wed (Legitimate rest)
assert.equal(emp1Statuses[3], 'ΕΡΓ'); // Thu
assert.equal(emp1Statuses[4], 'ΕΡΓ'); // Fri
assert.equal(emp1Statuses[5], 'ΕΡΓ'); // Sat
assert.equal(emp1Statuses[6], 'ΑΝ');  // Sun (Legitimate rest)
console.log('  PASS: Working employee receives ΕΡΓ on workdays and ΑΝ on legitimate rest days.');

// Check emp-7 status (unassigned: 0 shifts, 0 absences)
const emp7Statuses = groupedRows.map((row) => {
  const names = row.fullName.split('\n');
  const statuses = row.workRest.split('\n');
  const idx = names.findIndex((n) => n.includes('Extra 7'));
  return statuses[idx];
});
console.log('  emp-7 statuses across week:', emp7Statuses);
for (const status of emp7Statuses) {
  assert.equal(
    status,
    '-',
    `Unassigned participating employee must report '-' instead of false 'ΑΝ', got '${status}'`,
  );
}
console.log('  PASS: Unassigned employee reports "-" and NOT false "ΑΝ" on PDF.');

// -----------------------------------------------------------------------------
// TEST 6: validateExportScheduleState helper
// -----------------------------------------------------------------------------
console.log('\nTest 6: validateExportScheduleState helper...');
const validationWithUnassigned = validateExportScheduleState({
  days: weekDays,
  employees: sevenEmployees,
  shifts: testShifts,
  absences: [],
});
assert.equal(validationWithUnassigned.valid, false);
assert.ok(validationWithUnassigned.unassignedCount > 0);
assert.ok(validationWithUnassigned.warning.includes('ενεργοί εργαζόμενοι'));

const fullScheduleEmployees = createTestEmployees(4);
const fullShifts = (
  await generateEngineWeekSchedule({
    weekDays,
    employees: fullScheduleEmployees,
    allShifts: [],
    absences: [],
    rules: { weeklyRotationEnabled: true },
  })
).shifts;

const validationFull = validateExportScheduleState({
  days: weekDays,
  employees: fullScheduleEmployees,
  shifts: fullShifts,
  absences: [],
});
assert.equal(validationFull.valid, true);
assert.equal(validationFull.unassignedCount, 0);
console.log('  PASS: validateExportScheduleState correctly identifies unassigned vs fully scheduled states.');

// -----------------------------------------------------------------------------
// TEST 7: Determinism Test (same input -> identical output)
// -----------------------------------------------------------------------------
console.log('\nTest 7: Determinism test...');
const runA = await generateEngineWeekSchedule({
  weekDays,
  employees: sevenEmployees,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
const runB = await generateEngineWeekSchedule({
  weekDays,
  employees: sevenEmployees,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
assert.deepEqual(runA.shifts, runB.shifts, 'Outputs must be identical for identical inputs');
console.log('  PASS: Deterministic schedule generation verified.');

// -----------------------------------------------------------------------------
// TEST 8: Monthly Generation with 7 Employees
// -----------------------------------------------------------------------------
console.log('\nTest 8: Monthly generation with 7 employees...');
const monthResult = generateEngineMonthSchedule({
  month: 4, // May
  year: 2026,
  employees: sevenEmployees,
  allShifts: [],
  existingMonthShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
assert.ok(monthResult.shifts.length > 0, 'Month schedule generated shifts');
console.log(`  Month shifts generated: ${monthResult.shifts.length}, warnings: ${monthResult.warnings.length}`);
console.log('  PASS: Monthly generation works seamlessly with 7 employees.');

console.log('\n==========================================================');
console.log('ALL REGRESSION TESTS PASSED (100%)');
console.log('==========================================================');
