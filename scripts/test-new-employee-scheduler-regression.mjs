import assert from 'node:assert/strict';
import {
  generateEngineWeekSchedule,
  generateEngineMonthSchedule,
} from '../src/utils/schedulerEngineAdapter.js';
import {
  buildGroupedScheduleRows,
  buildScheduleRows,
  validateExportScheduleState,
  exportScheduleToPdf,
} from '../src/utils/exportService.js';

console.log('==========================================================');
console.log('START: COMPREHENSIVE NEW EMPLOYEE SCHEDULER REGRESSION SUITE');
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
        isActive: options.isActive ?? true,
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
// CASE 1: New regular employee receives expected generated schedule
// -----------------------------------------------------------------------------
console.log('CASE 1: New regular employee receives expected generated schedule...');
const employeesWithNewRegular = [
  { id: 'emp-1', fullName: 'Νίκος Core 1', isActive: true, scheduleRole: 'core1', fixedDayOff: 3 },
  { id: 'emp-2', fullName: 'Μαρία Core 2', isActive: true, scheduleRole: 'core2', fixedDayOff: 4 },
  { id: 'emp-3', fullName: 'Κώστας Flex 1', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2 },
  { id: 'emp-new', fullName: 'Στέλιος Νέος Ενδιάμεσος', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 5 },
];

const case1Week = await generateEngineWeekSchedule({
  weekDays,
  employees: employeesWithNewRegular,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});

const case1NewEmpShifts = case1Week.shifts.filter((s) => s.employeeId === 'emp-new');
console.log(`  New regular employee generated shifts count: ${case1NewEmpShifts.length}`);
assert.ok(case1NewEmpShifts.length > 0, 'New regular employee must have generated shifts');
assert.ok(
  case1NewEmpShifts.some((s) => s.shiftType === 'morning' || s.shiftType === 'intermediate' || s.shiftType === 'evening'),
  'New regular employee has valid shift types',
);

const case1Month = generateEngineMonthSchedule({
  month: 4, // May
  year: 2026,
  employees: employeesWithNewRegular,
  allShifts: [],
  existingMonthShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
const case1NewEmpMonthShifts = case1Month.shifts.filter((s) => s.employeeId === 'emp-new');
console.log(`  New regular employee generated monthly shifts count: ${case1NewEmpMonthShifts.length}`);
assert.ok(case1NewEmpMonthShifts.length > 0, 'New regular employee must have monthly generated shifts');
console.log('  PASS: CASE 1 verified.');

// -----------------------------------------------------------------------------
// CASE 2: New substitute-only employee is intentionally not in regular weekday schedule
// -----------------------------------------------------------------------------
console.log('\nCASE 2: New substitute-only employee intentionally not in regular weekday schedule...');
const fiveEmployeesWithSubstitute = createTestEmployees(5, { extraRole: 'custom' });
const case2Week = await generateEngineWeekSchedule({
  weekDays,
  employees: fiveEmployeesWithSubstitute,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});

const extrasInMeta = case2Week.meta.resolvedRoles.extras.map((e) => e.employeeId);
assert.ok(extrasInMeta.includes('emp-5'), 'emp-5 is in extras');

const emp5WeekdayShifts = case2Week.shifts.filter((s) => s.employeeId === 'emp-5' && s.date !== '2026-05-10');
assert.equal(emp5WeekdayShifts.length, 0, 'Substitute employee gets no unneeded weekday base shifts');
console.log('  PASS: CASE 2 verified.');

// -----------------------------------------------------------------------------
// CASE 3: Inactive employee is excluded
// -----------------------------------------------------------------------------
console.log('\nCASE 3: Inactive employee is excluded from generation...');
const employeesWithInactive = [
  ...createTestEmployees(4),
  { id: 'emp-inactive', fullName: 'Ανενεργός', isActive: false, scheduleRole: 'intermediate' },
];

const case3Week = await generateEngineWeekSchedule({
  weekDays,
  employees: employeesWithInactive,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});

assert.equal(
  case3Week.shifts.filter((s) => s.employeeId === 'emp-inactive').length,
  0,
  'Inactive employee must not receive shifts',
);
console.log('  PASS: CASE 3 verified.');

// -----------------------------------------------------------------------------
// CASE 4: participatesInRotation = false is excluded from weekday rotation
// -----------------------------------------------------------------------------
console.log('\nCASE 4: participatesInRotation = false is excluded from weekday rotation...');
const employeesWithNoRotation = [
  { id: 'emp-1', fullName: 'Νίκος Core 1', isActive: true, scheduleRole: 'core1', fixedDayOff: 3 },
  { id: 'emp-2', fullName: 'Μαρία Core 2', isActive: true, scheduleRole: 'core2', fixedDayOff: 4 },
  { id: 'emp-3', fullName: 'Κώστας Flex 1', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2 },
  { id: 'emp-4', fullName: 'Ελένη Flex 2', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 5 },
  { id: 'emp-no-rot', fullName: 'Μόνο Κυριακές', isActive: true, scheduleRole: 'custom', participatesInRotation: false, participatesInSundayRotation: true },
];

const case4Week = await generateEngineWeekSchedule({
  weekDays,
  employees: employeesWithNoRotation,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});

const noRotWeekdayShifts = case4Week.shifts.filter((s) => s.employeeId === 'emp-no-rot' && s.date !== '2026-05-10');
assert.equal(noRotWeekdayShifts.length, 0, 'Employee with participatesInRotation=false gets no weekday shifts');
console.log('  PASS: CASE 4 verified.');

// -----------------------------------------------------------------------------
// CASE 5: fixedDayOff = 0 maps to Sunday correctly
// -----------------------------------------------------------------------------
console.log('\nCASE 5: fixedDayOff = 0 maps to Sunday correctly...');
const employeesWithSundayFixedOff = [
  { id: 'emp-1', fullName: 'Νίκος Core 1', isActive: true, scheduleRole: 'core1', fixedDayOff: 0 },
  { id: 'emp-2', fullName: 'Μαρία Core 2', isActive: true, scheduleRole: 'core2', fixedDayOff: 4 },
  { id: 'emp-3', fullName: 'Κώστας Flex 1', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2 },
  { id: 'emp-4', fullName: 'Ελένη Flex 2', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 5 },
];

const case5Week = await generateEngineWeekSchedule({
  weekDays,
  employees: employeesWithSundayFixedOff,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});

const emp1SundayShift = case5Week.shifts.find((s) => s.employeeId === 'emp-1' && s.date === '2026-05-10');
assert.equal(emp1SundayShift, undefined, 'Employee with fixedDayOff=0 (Sunday) must not be assigned Sunday shift');
console.log('  PASS: CASE 5 verified.');

// -----------------------------------------------------------------------------
// CASE 6: Legitimate 5-work / 2-rest exports 5 ΕΡΓ + 2 ΑΝ
// -----------------------------------------------------------------------------
console.log('\nCASE 6: Legitimate 5-work / 2-rest exports 5 ΕΡΓ + 2 ΑΝ...');
const fourEmployees = createTestEmployees(4);
const case6Week = await generateEngineWeekSchedule({
  weekDays,
  employees: fourEmployees,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});

const case6Rows = buildGroupedScheduleRows({
  days: weekDays,
  employees: fourEmployees,
  shifts: case6Week.shifts,
  absences: [],
});

for (const emp of fourEmployees) {
  const empStatuses = case6Rows.map((row) => {
    const names = row.fullName.split('\n');
    const statuses = row.workRest.split('\n');
    const idx = names.findIndex((n) => n.includes(emp.fullName));
    return statuses[idx];
  });
  const ergCount = empStatuses.filter((s) => s === 'ΕΡΓ').length;
  const anCount = empStatuses.filter((s) => s === 'ΑΝ').length;
  console.log(`  ${emp.fullName}: ${ergCount} ΕΡΓ, ${anCount} ΑΝ`);
  assert.ok(ergCount >= 5, 'Employee works at least 5 days');
  assert.ok(anCount >= 1, 'Employee has legitimate rest days');
  assert.equal(ergCount + anCount, 7, 'All 7 days accounted for with ΕΡΓ or ΑΝ');
}
console.log('  PASS: CASE 6 verified.');

// -----------------------------------------------------------------------------
// CASE 7: 0 work / 0 absence blocks PDF export with safe Greek error
// -----------------------------------------------------------------------------
console.log('\nCASE 7: 0 work / 0 absence blocks PDF export with safe Greek error...');
const incompleteEmployees = [
  ...fourEmployees,
  { id: 'emp-unassigned', fullName: 'Ανάθεση Χωρίς Βάρδιες', isActive: true, scheduleRole: 'core1', participatesInRotation: true },
];

let pdfExportBlocked = false;
try {
  await exportScheduleToPdf({
    days: weekDays,
    employees: incompleteEmployees,
    shifts: case6Week.shifts, // shifts do not include emp-unassigned
    absences: [],
    exportAuthorization: { isAdmin: true, auditRequired: true },
    onBeforeDownload: async () => {},
  });
} catch (error) {
  pdfExportBlocked = true;
  console.log('  Caught expected export error:', error.message);
  assert.equal(
    error.message,
    'Το πρόγραμμα δεν περιέχει έγκυρες βάρδιες για όλους τους ενεργούς εργαζομένους. Έλεγξε το πρόγραμμα πριν την εξαγωγή.',
  );
}
assert.ok(pdfExportBlocked, 'exportScheduleToPdf must throw when an active participating employee has 0 shifts and 0 absences');
console.log('  PASS: CASE 7 verified.');

// -----------------------------------------------------------------------------
// CASE 8: 0 work / 1-day sickness in a week blocks PDF export as incomplete
// -----------------------------------------------------------------------------
console.log('\nCASE 8: 0 work / 1-day sickness in a week blocks PDF export as incomplete...');
const partialSickness = [
  {
    id: 'abs-1day',
    employeeId: 'emp-unassigned',
    startDate: '2026-05-04',
    endDate: '2026-05-04', // only 1 day out of 7
    type: 'SICK',
    scope: 'FULL_DAY',
    status: 'CONFIRMED',
  },
];

const case8Validation = validateExportScheduleState({
  days: weekDays,
  employees: incompleteEmployees,
  shifts: case6Week.shifts,
  absences: partialSickness,
});
assert.equal(case8Validation.valid, false, '1-day sickness with 0 work on other 6 days must be invalid/incomplete');
console.log('  PASS: CASE 8 verified.');

// -----------------------------------------------------------------------------
// CASE 9: Full-period absence exports correctly and is valid
// -----------------------------------------------------------------------------
console.log('\nCASE 9: Full-period absence exports correctly and is valid...');
const fullWeekSickness = [
  {
    id: 'abs-fullweek',
    employeeId: 'emp-unassigned',
    startDate: '2026-05-04',
    endDate: '2026-05-10', // covers all 7 days
    type: 'SICK',
    scope: 'FULL_DAY',
    status: 'CONFIRMED',
  },
];

const case9Validation = validateExportScheduleState({
  days: weekDays,
  employees: incompleteEmployees,
  shifts: case6Week.shifts,
  absences: fullWeekSickness,
});
assert.equal(case9Validation.valid, true, 'Full-period sickness covering all days is valid');

const case9Rows = buildGroupedScheduleRows({
  days: weekDays,
  employees: incompleteEmployees,
  shifts: case6Week.shifts,
  absences: fullWeekSickness,
});

const empUnassignedStatuses = case9Rows.map((row) => {
  const names = row.fullName.split('\n');
  const statuses = row.workRest.split('\n');
  const idx = names.findIndex((n) => n.includes('Ανάθεση Χωρίς Βάρδιες'));
  return statuses[idx];
});
console.log('  Full-week sickness employee statuses:', empUnassignedStatuses);
for (const status of empUnassignedStatuses) {
  assert.equal(status, 'Ασθένεια', 'All 7 days must report Ασθένεια');
}
console.log('  PASS: CASE 9 verified.');

// -----------------------------------------------------------------------------
// CASE 10: Extra Sunday participant actually receives Sunday in deterministic rotation
// -----------------------------------------------------------------------------
console.log('\nCASE 10: Extra Sunday participant actually receives Sunday in rotation...');
const fiveWithSunday = [
  { id: 'emp-1', fullName: 'Νίκος Core 1', isActive: true, scheduleRole: 'core1', fixedDayOff: 3, participatesInSundayRotation: true },
  { id: 'emp-2', fullName: 'Μαρία Core 2', isActive: true, scheduleRole: 'core2', fixedDayOff: 4, participatesInSundayRotation: true },
  { id: 'emp-3', fullName: 'Κώστας Flex 1', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2, participatesInSundayRotation: true },
  { id: 'emp-4', fullName: 'Ελένη Flex 2', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 5, participatesInSundayRotation: true },
  { id: 'emp-5', fullName: 'Γιώργος Extra', isActive: true, scheduleRole: 'custom', participatesInSundayRotation: true, extraMode: 'SUBSTITUTE_ONLY' },
];

const testSundays = [
  ['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08', '2026-05-09', '2026-05-10'],
  ['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15', '2026-05-16', '2026-05-17'],
  ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-24'],
  ['2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31'],
  ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'],
];

const sundayRecipients = [];
for (const week of testSundays) {
  const res = await generateEngineWeekSchedule({
    weekDays: week,
    employees: fiveWithSunday,
    allShifts: [],
    absences: [],
    rules: { avoidConsecutiveSundays: true },
  });
  const sundayShift = res.shifts.find((s) => s.customLabel === 'Κυριακή' || s.startTime === '08:00');
  if (sundayShift) sundayRecipients.push(sundayShift.employeeId);
}
console.log('  Sunday recipients across 5 weeks:', sundayRecipients);
assert.ok(
  sundayRecipients.includes('emp-5'),
  `Extra employee emp-5 must receive Sunday in rotation pool (got ${sundayRecipients.join(', ')})`,
);
console.log('  PASS: CASE 10 verified.');

// -----------------------------------------------------------------------------
// CASE 11: Sunday opt-out never receives Sunday
// -----------------------------------------------------------------------------
console.log('\nCASE 11: Sunday opt-out never receives Sunday...');
const fiveWithOptOut = [
  ...fourEmployees,
  { id: 'emp-5-optout', fullName: 'Γιώργος Χωρίς Κυριακές', isActive: true, scheduleRole: 'custom', participatesInSundayRotation: false },
];

const optOutSundayRecipients = [];
for (const week of testSundays) {
  const res = await generateEngineWeekSchedule({
    weekDays: week,
    employees: fiveWithOptOut,
    allShifts: [],
    absences: [],
    rules: { avoidConsecutiveSundays: true },
  });
  const sundayShift = res.shifts.find((s) => s.customLabel === 'Κυριακή' || s.startTime === '08:00');
  if (sundayShift) optOutSundayRecipients.push(sundayShift.employeeId);
}
console.log('  Sunday recipients with opt-out:', optOutSundayRecipients);
assert.equal(
  optOutSundayRecipients.includes('emp-5-optout'),
  false,
  'Opt-out employee must NEVER receive Sunday shift',
);
console.log('  PASS: CASE 11 verified.');

// -----------------------------------------------------------------------------
// CASE 12: No active participating employee silently disappears
// -----------------------------------------------------------------------------
console.log('\nCASE 12: No active participating employee silently disappears...');
const sixEmployees = createTestEmployees(6);
const case12Week = await generateEngineWeekSchedule({
  weekDays,
  employees: sixEmployees,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});

const allEngineIds = [
  ...case12Week.meta.resolvedRoles.baseEmployees.map((e) => e.employeeId),
  ...case12Week.meta.resolvedRoles.extras.map((e) => e.employeeId),
];

for (const emp of sixEmployees) {
  assert.ok(
    allEngineIds.includes(emp.id),
    `Employee ${emp.id} must be present in engine roles`,
  );
}
assert.equal(allEngineIds.length, 6, 'All 6 active employees present');
console.log('  PASS: CASE 12 verified.');

console.log('\n==========================================================');
console.log('ALL 12 REGRESSION CASES PASSED (100%)');
console.log('==========================================================');
