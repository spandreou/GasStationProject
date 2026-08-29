import assert from 'node:assert/strict';
import {
  generateEngineWeekSchedule,
  generateEngineMonthSchedule,
  validateSchedulerEmployeeCapacity,
} from '../src/utils/schedulerEngineAdapter.js';
import {
  buildGroupedScheduleRows,
  buildScheduleRows,
  validateExportScheduleState,
  exportScheduleToPdf,
} from '../src/utils/exportService.js';

console.log('==========================================================');
console.log('START: 20-CASE FINAL SCHEDULER SAFETY HARDENING SUITE');
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

function createBase4Employees() {
  return [
    { id: 'emp-1', fullName: 'Νίκος Core 1', isActive: true, scheduleRole: 'core1', fixedDayOff: 3, participatesInRotation: true, participatesInSundayRotation: true },
    { id: 'emp-2', fullName: 'Μαρία Core 2', isActive: true, scheduleRole: 'core2', fixedDayOff: 4, participatesInRotation: true, participatesInSundayRotation: true },
    { id: 'emp-3', fullName: 'Κώστας Flex 1', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2, participatesInRotation: true, participatesInSundayRotation: true },
    { id: 'emp-4', fullName: 'Ελένη Flex 2', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 5, participatesInRotation: true, participatesInSundayRotation: true },
  ];
}

// -----------------------------------------------------------------------------
// TEST 1: 4 correctly configured base employees -> PASS
// -----------------------------------------------------------------------------
console.log('TEST 1: 4 correctly configured base employees...');
const base4 = createBase4Employees();
const cap4 = validateSchedulerEmployeeCapacity(base4);
assert.equal(cap4.valid, true, '4 active employees must be valid capacity');

const res1 = await generateEngineWeekSchedule({
  weekDays,
  employees: base4,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
assert.ok(res1.shifts.length > 0, 'Shifts must be generated for 4 base employees');
assert.equal(res1.meta.resolvedRoles.baseEmployees.length, 4, '4 base employees in engine');
console.log('  PASS: TEST 1 verified.');

// -----------------------------------------------------------------------------
// TEST 2: 5 employees: 4 base + EXTRA_A -> PASS
// -----------------------------------------------------------------------------
console.log('\nTEST 2: 5 employees: 4 base + EXTRA_A...');
const emp5 = [
  ...createBase4Employees(),
  { id: 'emp-5', fullName: 'Γιώργος Extra 1', isActive: true, scheduleRole: 'custom', extraMode: 'SUBSTITUTE_ONLY', participatesInRotation: true, participatesInSundayRotation: true },
];
const cap5 = validateSchedulerEmployeeCapacity(emp5);
assert.equal(cap5.valid, true, '5 active employees must be valid capacity');

const res2 = await generateEngineWeekSchedule({
  weekDays,
  employees: emp5,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
const extras2 = res2.meta.resolvedRoles.extras.map((e) => e.employeeId);
assert.ok(extras2.includes('emp-5'), 'emp-5 must be in extras');
assert.equal(res2.meta.resolvedRoles.roles.EXTRA_A?.employeeId, 'emp-5', 'emp-5 must be EXTRA_A');
console.log('  PASS: TEST 2 verified.');

// -----------------------------------------------------------------------------
// TEST 3: 6 employees: 4 base + EXTRA_A + EXTRA_B -> PASS (no duplicate role ID)
// -----------------------------------------------------------------------------
console.log('\nTEST 3: 6 employees: 4 base + EXTRA_A + EXTRA_B (no role ID duplication)...');
const emp6 = [
  ...createBase4Employees(),
  { id: 'emp-5', fullName: 'Γιώργος Extra 1', isActive: true, scheduleRole: 'custom', extraMode: 'SUBSTITUTE_ONLY', participatesInRotation: true, participatesInSundayRotation: true },
  { id: 'emp-6', fullName: 'Άννα Extra 2', isActive: true, scheduleRole: 'custom', extraMode: 'SUBSTITUTE_ONLY', participatesInRotation: true, participatesInSundayRotation: true },
];
const cap6 = validateSchedulerEmployeeCapacity(emp6);
assert.equal(cap6.valid, true, '6 active employees must be valid capacity');

const res3 = await generateEngineWeekSchedule({
  weekDays,
  employees: emp6,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
const assignedEmpIds = Object.values(res3.meta.resolvedRoles.roles).map((e) => e.employeeId);
assert.equal(new Set(assignedEmpIds).size, assignedEmpIds.length, 'No role ID duplication in 6-employee setup');
const assignedExtras = [
  res3.meta.resolvedRoles.roles.EXTRA_A?.employeeId,
  res3.meta.resolvedRoles.roles.EXTRA_B?.employeeId,
];
assert.ok(assignedExtras.includes('emp-5') && assignedExtras.includes('emp-6'), 'Both emp-5 and emp-6 assigned to EXTRA_A and EXTRA_B');
console.log('  PASS: TEST 3 verified.');

// -----------------------------------------------------------------------------
// TEST 4: 7 active employees -> SAFE REJECTION
// -----------------------------------------------------------------------------
console.log('\nTEST 4: 7 active employees -> SAFE REJECTION...');
const emp7 = [
  ...emp6,
  { id: 'emp-7', fullName: 'Δημήτρης 7ος', isActive: true, scheduleRole: 'custom' },
];
const cap7 = validateSchedulerEmployeeCapacity(emp7);
assert.equal(cap7.valid, false, '7 active employees must be invalid capacity');
assert.equal(cap7.message, 'Το αυτόματο πρόγραμμα υποστηρίζει έως 6 ενεργούς εργαζομένους.');

const res4 = await generateEngineWeekSchedule({
  weekDays,
  employees: emp7,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
assert.equal(res4.shifts.length, 0, 'No shifts generated for 7 active employees');
assert.equal(res4.warnings[0], 'Το αυτόματο πρόγραμμα υποστηρίζει έως 6 ενεργούς εργαζομένους.');
console.log('  PASS: TEST 4 verified.');

// -----------------------------------------------------------------------------
// TEST 5 & 6: Newly added regular employee in valid base role -> weekly and monthly shifts > 0
// -----------------------------------------------------------------------------
console.log('\nTEST 5 & 6: Newly added regular employee in base role has weekly and monthly shifts...');
const empWithNewRegular = [
  { id: 'emp-1', fullName: 'Νίκος Core 1', isActive: true, scheduleRole: 'core1', fixedDayOff: 3 },
  { id: 'emp-2', fullName: 'Μαρία Core 2', isActive: true, scheduleRole: 'core2', fixedDayOff: 4 },
  { id: 'emp-3', fullName: 'Κώστας Flex 1', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2 },
  { id: 'emp-new', fullName: 'Στέλιος Νέος Ενδιάμεσος', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 5 },
];

const res5 = await generateEngineWeekSchedule({
  weekDays,
  employees: empWithNewRegular,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
const newEmpShifts = res5.shifts.filter((s) => s.employeeId === 'emp-new');
console.log(`  New regular employee weekly shifts: ${newEmpShifts.length}`);
assert.ok(newEmpShifts.length >= 5, 'New regular employee must have at least 5 shifts');

const res6 = generateEngineMonthSchedule({
  month: 4,
  year: 2026,
  employees: empWithNewRegular,
  allShifts: [],
  existingMonthShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
const newEmpMonthShifts = res6.shifts.filter((s) => s.employeeId === 'emp-new');
console.log(`  New regular employee monthly shifts: ${newEmpMonthShifts.length}`);
assert.ok(newEmpMonthShifts.length >= 20, 'New regular employee must have monthly shifts');
console.log('  PASS: TEST 5 & 6 verified.');

// -----------------------------------------------------------------------------
// TEST 7: Explicit custom employee remains Extra, NEVER promoted to base role
// -----------------------------------------------------------------------------
console.log('\nTEST 7: Explicit custom employee remains Extra...');
const res7 = await generateEngineWeekSchedule({
  weekDays,
  employees: emp5,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
const emp5Role = res7.meta.resolvedRoles.roles.EXTRA_A?.employeeId;
assert.equal(emp5Role, 'emp-5', 'Explicit custom employee must be EXTRA_A, not base role');
assert.equal(res7.meta.resolvedRoles.baseEmployees.some((b) => b.employeeId === 'emp-5'), false);
console.log('  PASS: TEST 7 verified.');

// -----------------------------------------------------------------------------
// TEST 8: Duplicate core1 -> warning generated, never silently remapped
// -----------------------------------------------------------------------------
console.log('\nTEST 8: Duplicate core1 configuration...');
const duplicateCore1 = [
  { id: 'emp-1a', fullName: 'Νίκος 1', isActive: true, scheduleRole: 'core1', fixedDayOff: 3 },
  { id: 'emp-1b', fullName: 'Νίκος 2', isActive: true, scheduleRole: 'core1', fixedDayOff: 4 },
  { id: 'emp-3', fullName: 'Κώστας Flex 1', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2 },
  { id: 'emp-4', fullName: 'Ελένη Flex 2', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 5 },
];
const res8 = await generateEngineWeekSchedule({
  weekDays,
  employees: duplicateCore1,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
const missingRoleWarn = res8.warnings.some((w) => w.includes('CORE_B') || w.includes('MISSING_REQUIRED_ROLE'));
console.log('  Warnings for duplicate core1:', res8.warnings);
assert.ok(missingRoleWarn, 'Engine must surface warning for missing CORE_B when duplicate core1 exists');
console.log('  PASS: TEST 8 verified.');

// -----------------------------------------------------------------------------
// TEST 9: Missing required base slot + explicit custom -> custom remains extra, missing base reported
// -----------------------------------------------------------------------------
console.log('\nTEST 9: Missing base slot + explicit custom...');
const missingBaseWithCustom = [
  { id: 'emp-1', fullName: 'Νίκος Core 1', isActive: true, scheduleRole: 'core1', fixedDayOff: 3 },
  { id: 'emp-2', fullName: 'Μαρία Core 2', isActive: true, scheduleRole: 'core2', fixedDayOff: 4 },
  { id: 'emp-3', fullName: 'Κώστας Flex 1', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2 },
  { id: 'emp-custom', fullName: 'Άκης Αναπληρωτής', isActive: true, scheduleRole: 'custom', fixedDayOff: 5 },
];
const res9 = await generateEngineWeekSchedule({
  weekDays,
  employees: missingBaseWithCustom,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
assert.equal(res9.meta.resolvedRoles.roles.EXTRA_A?.employeeId, 'emp-custom', 'Custom employee stays EXTRA_A');
const flexBWarn = res9.warnings.some((w) => w.includes('FLEX_B') || w.includes('MISSING_REQUIRED_ROLE'));
assert.ok(flexBWarn, 'Missing FLEX_B must be reported as missing role warning');
console.log('  PASS: TEST 9 verified.');

// -----------------------------------------------------------------------------
// TEST 10: fixedDayOff = 0 -> Sunday correctly respected
// -----------------------------------------------------------------------------
console.log('\nTEST 10: fixedDayOff = 0 (Sunday)...');
const sundayOffEmp = [
  { id: 'emp-1', fullName: 'Νίκος Core 1', isActive: true, scheduleRole: 'core1', fixedDayOff: 0 },
  { id: 'emp-2', fullName: 'Μαρία Core 2', isActive: true, scheduleRole: 'core2', fixedDayOff: 4 },
  { id: 'emp-3', fullName: 'Κώστας Flex 1', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2 },
  { id: 'emp-4', fullName: 'Ελένη Flex 2', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 5 },
];
const res10 = await generateEngineWeekSchedule({
  weekDays,
  employees: sundayOffEmp,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
const emp1Sunday = res10.shifts.find((s) => s.employeeId === 'emp-1' && s.date === '2026-05-10');
assert.equal(emp1Sunday, undefined, 'Employee with fixedDayOff=0 must not receive Sunday shift');
console.log('  PASS: TEST 10 verified.');

// -----------------------------------------------------------------------------
// TEST 11: Substitute absence replacement -> PASS
// -----------------------------------------------------------------------------
console.log('\nTEST 11: Substitute absence replacement...');
const absencesForTest11 = [
  {
    id: 'abs-1',
    employeeId: 'emp-1',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    type: 'SICK',
    scope: 'FULL_DAY',
    status: 'CONFIRMED',
  },
];
const res11 = await generateEngineWeekSchedule({
  weekDays,
  employees: emp5,
  allShifts: [],
  absences: absencesForTest11,
  rules: { weeklyRotationEnabled: true },
});
const replacementShift = res11.shifts.find((s) => s.date === '2026-05-04' && s.employeeId === 'emp-5');
assert.ok(replacementShift, 'Substitute emp-5 must fill absence gap for emp-1 on 2026-05-04');
assert.equal(replacementShift.source, 'ABSENCE_REPLACEMENT');
console.log('  PASS: TEST 11 verified.');

// -----------------------------------------------------------------------------
// TEST 12: Substitute Sunday participation -> PASS
// -----------------------------------------------------------------------------
console.log('\nTEST 12: Substitute Sunday participation...');
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
    employees: emp5,
    allShifts: [],
    absences: [],
    rules: { avoidConsecutiveSundays: true },
  });
  const sundayShift = res.shifts.find((s) => s.customLabel === 'Κυριακή' || s.startTime === '08:00');
  if (sundayShift) sundayRecipients.push(sundayShift.employeeId);
}
console.log('  Sunday recipients:', sundayRecipients);
assert.ok(sundayRecipients.includes('emp-5'), 'emp-5 must receive Sunday in rotation pool');
console.log('  PASS: TEST 12 verified.');

// -----------------------------------------------------------------------------
// TEST 13: Sunday opt-out -> never receives Sunday
// -----------------------------------------------------------------------------
console.log('\nTEST 13: Sunday opt-out...');
const empWithOptOut = [
  ...createBase4Employees(),
  { id: 'emp-optout', fullName: 'Χωρίς Κυριακές', isActive: true, scheduleRole: 'custom', participatesInSundayRotation: false },
];
const optOutSundayRecipients = [];
for (const week of testSundays) {
  const res = await generateEngineWeekSchedule({
    weekDays: week,
    employees: empWithOptOut,
    allShifts: [],
    absences: [],
    rules: { avoidConsecutiveSundays: true },
  });
  const sundayShift = res.shifts.find((s) => s.customLabel === 'Κυριακή' || s.startTime === '08:00');
  if (sundayShift) optOutSundayRecipients.push(sundayShift.employeeId);
}
assert.equal(optOutSundayRecipients.includes('emp-optout'), false, 'Opt-out employee must NEVER receive Sunday');
console.log('  PASS: TEST 13 verified.');

// -----------------------------------------------------------------------------
// TEST 14: extraMode = DISABLED -> no Sunday and no replacement
// -----------------------------------------------------------------------------
console.log('\nTEST 14: extraMode = DISABLED...');
const empWithDisabled = [
  ...createBase4Employees(),
  { id: 'emp-disabled', fullName: 'Disabled Extra', isActive: true, scheduleRole: 'custom', extraMode: 'DISABLED', participatesInSundayRotation: true },
];

const disabledSundayRecipients = [];
for (const week of testSundays) {
  const res = await generateEngineWeekSchedule({
    weekDays: week,
    employees: empWithDisabled,
    allShifts: [],
    absences: [],
    rules: { avoidConsecutiveSundays: true },
  });
  const sundayShift = res.shifts.find((s) => s.customLabel === 'Κυριακή' || s.startTime === '08:00');
  if (sundayShift) disabledSundayRecipients.push(sundayShift.employeeId);
}
assert.equal(disabledSundayRecipients.includes('emp-disabled'), false, 'DISABLED extra must NEVER receive Sunday');

const res14Gap = await generateEngineWeekSchedule({
  weekDays,
  employees: empWithDisabled,
  allShifts: [],
  absences: absencesForTest11,
  rules: { weeklyRotationEnabled: true },
});
const disabledReplacement = res14Gap.shifts.find((s) => s.date === '2026-05-04' && s.employeeId === 'emp-disabled');
assert.equal(disabledReplacement, undefined, 'DISABLED extra must NEVER fill replacement gap');
console.log('  PASS: TEST 14 verified.');

// -----------------------------------------------------------------------------
// TEST 15: ACTIVE_SEASONAL date range boundaries respected
// -----------------------------------------------------------------------------
console.log('\nTEST 15: ACTIVE_SEASONAL date range boundaries...');
const seasonalEmp = [
  ...createBase4Employees(),
  {
    id: 'emp-seasonal',
    fullName: 'Seasonal Extra',
    isActive: true,
    scheduleRole: 'custom',
    extraMode: 'ACTIVE_SEASONAL',
    activeFrom: '2026-05-05',
    activeTo: '2026-05-07',
    participatesInSundayRotation: true,
  },
];
const seasonalSundayRes = await generateEngineWeekSchedule({
  weekDays, // Sunday is 2026-05-10, outside activeTo (2026-05-07)
  employees: seasonalEmp,
  allShifts: [],
  absences: [],
  rules: { avoidConsecutiveSundays: true },
});
const seasonalSunday = seasonalSundayRes.shifts.find((s) => s.date === '2026-05-10' && s.employeeId === 'emp-seasonal');
assert.equal(seasonalSunday, undefined, 'Seasonal employee outside activeTo must not receive Sunday');
console.log('  PASS: TEST 15 verified.');

// -----------------------------------------------------------------------------
// TEST 16: PDF 0 work / 0 absence regular employee -> blocked
// -----------------------------------------------------------------------------
console.log('\nTEST 16: PDF 0 work / 0 absence regular employee -> blocked...');
const incompleteEmployees = [
  ...createBase4Employees(),
  { id: 'emp-unassigned', fullName: 'Ανάθεση Χωρίς Βάρδιες', isActive: true, scheduleRole: 'core1', participatesInRotation: true },
];

let pdfExportBlocked16 = false;
try {
  await exportScheduleToPdf({
    days: weekDays,
    employees: incompleteEmployees,
    shifts: res1.shifts, // shifts do not include emp-unassigned
    absences: [],
    exportAuthorization: { isAdmin: true, auditRequired: true },
    onBeforeDownload: async () => {},
  });
} catch (error) {
  pdfExportBlocked16 = true;
  assert.equal(
    error.message,
    'Το πρόγραμμα δεν περιέχει έγκυρες βάρδιες για όλους τους ενεργούς εργαζομένους. Έλεγξε το πρόγραμμα πριν την εξαγωγή.',
  );
}
assert.ok(pdfExportBlocked16, 'PDF export must be blocked for unassigned regular employee');
console.log('  PASS: TEST 16 verified.');

// -----------------------------------------------------------------------------
// TEST 17: PDF partial sickness + otherwise missing regular schedule -> blocked
// -----------------------------------------------------------------------------
console.log('\nTEST 17: PDF partial sickness + missing regular schedule -> blocked...');
const partialSickness = [
  {
    id: 'abs-1day',
    employeeId: 'emp-unassigned',
    startDate: '2026-05-04',
    endDate: '2026-05-04',
    type: 'SICK',
    scope: 'FULL_DAY',
    status: 'CONFIRMED',
  },
];
const val17 = validateExportScheduleState({
  days: weekDays,
  employees: incompleteEmployees,
  shifts: res1.shifts,
  absences: partialSickness,
});
assert.equal(val17.valid, false, 'Partial sickness with 0 work on other days must be invalid');
console.log('  PASS: TEST 17 verified.');

// -----------------------------------------------------------------------------
// TEST 18: PDF full-period absence -> valid
// -----------------------------------------------------------------------------
console.log('\nTEST 18: PDF full-period absence -> valid...');
const fullWeekSickness = [
  {
    id: 'abs-fullweek',
    employeeId: 'emp-unassigned',
    startDate: '2026-05-04',
    endDate: '2026-05-10',
    type: 'SICK',
    scope: 'FULL_DAY',
    status: 'CONFIRMED',
  },
];
const val18 = validateExportScheduleState({
  days: weekDays,
  employees: incompleteEmployees,
  shifts: res1.shifts,
  absences: fullWeekSickness,
});
assert.equal(val18.valid, true, 'Full-period absence covering all days must be valid');

const rows18 = buildGroupedScheduleRows({
  days: weekDays,
  employees: incompleteEmployees,
  shifts: res1.shifts,
  absences: fullWeekSickness,
});
const unassignedStatuses = rows18.map((r) => {
  const names = r.fullName.split('\n');
  const statuses = r.workRest.split('\n');
  const idx = names.findIndex((n) => n.includes('Ανάθεση Χωρίς Βάρδιες'));
  return statuses[idx];
});
for (const s of unassignedStatuses) {
  assert.equal(s, 'Ασθένεια', 'All 7 days report Ασθένεια');
}
console.log('  PASS: TEST 18 verified.');

// -----------------------------------------------------------------------------
// TEST 19: Normal base employee work/rest PDF -> correct
// -----------------------------------------------------------------------------
console.log('\nTEST 19: Normal base employee work/rest PDF...');
const rows19 = buildGroupedScheduleRows({
  days: weekDays,
  employees: base4,
  shifts: res1.shifts,
  absences: [],
});
for (const emp of base4) {
  const empStatuses = rows19.map((row) => {
    const names = row.fullName.split('\n');
    const statuses = row.workRest.split('\n');
    const idx = names.findIndex((n) => n.includes(emp.fullName));
    return statuses[idx];
  });
  const ergCount = empStatuses.filter((s) => s === 'ΕΡΓ').length;
  const anCount = empStatuses.filter((s) => s === 'ΑΝ').length;
  assert.ok(ergCount >= 5, 'Base employee works at least 5 days');
  assert.ok(anCount >= 1, 'Base employee has legitimate rest');
  assert.equal(ergCount + anCount, 7, 'All 7 days accounted for with ΕΡΓ or ΑΝ');
}
console.log('  PASS: TEST 19 verified.');

// -----------------------------------------------------------------------------
// TEST 20: Legitimate substitute with no weekday assignment -> valid standby "-", not false rest
// -----------------------------------------------------------------------------
console.log('\nTEST 20: Legitimate substitute with no weekday assignment (standby)...');
const val20 = validateExportScheduleState({
  days: weekDays,
  employees: emp5,
  shifts: res1.shifts, // shifts only for base 4
  absences: [],
});
assert.equal(val20.valid, true, 'Substitute on standby with 0 work and 0 absences is valid');

const rows20 = buildGroupedScheduleRows({
  days: weekDays,
  employees: emp5,
  shifts: res1.shifts,
  absences: [],
});
const subStatuses = rows20.map((r) => {
  const names = r.fullName.split('\n');
  const statuses = r.workRest.split('\n');
  const idx = names.findIndex((n) => n.includes('Γιώργος Extra 1'));
  return statuses[idx];
});
console.log('  Substitute on standby statuses:', subStatuses);
for (const s of subStatuses) {
  assert.equal(s, '-', 'Substitute on standby must report "-" and NOT false "ΑΝ"');
}
console.log('  PASS: TEST 20 verified.');

console.log('\n==========================================================');
console.log('ALL 20 FINAL HARDENED REGRESSION TESTS PASSED (100%)');
console.log('==========================================================');
