import assert from 'node:assert/strict';
import {
  generateEngineWeekSchedule,
  generateEngineMonthSchedule,
  validateSchedulerEmployeeCapacity,
  validateSchedulerRoleConfiguration,
  resolveEngineRoleMap,
} from '../src/utils/schedulerEngineAdapter.js';
import {
  buildGroupedScheduleRows,
  validateExportScheduleState,
  exportScheduleToPdf,
} from '../src/utils/exportService.js';

console.log('==========================================================');
console.log('START: COMPREHENSIVE FINAL ROLE-MAPPING & SCHEDULER SUITE');
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
// SECTION 1: EXACT ROLE ALIAS PRESERVATION & MAPPING
// -----------------------------------------------------------------------------
console.log('SECTION 1: Exact Role Alias Preservation & Mapping Tests...');

// 1. Exact CORE_A alias
console.log('  Test 1.1: Exact CORE_A alias -> CORE_A');
const resCoreA = resolveEngineRoleMap([
  { id: 'e1', fullName: 'Emp A', isActive: true, scheduleRole: 'CORE1' },
  { id: 'e2', fullName: 'Emp B', isActive: true, scheduleRole: 'core2' },
  { id: 'e3', fullName: 'Emp C', isActive: true, scheduleRole: 'flex1' },
  { id: 'e4', fullName: 'Emp D', isActive: true, scheduleRole: 'flex2' },
]);
assert.equal(resCoreA.roleById.get('e1'), 'CORE_A', 'CORE1 must map to CORE_A');
assert.equal(resCoreA.valid, true);

// 2. Exact CORE_B alias
console.log('  Test 1.2: Exact CORE_B alias -> CORE_B');
const resCoreB = resolveEngineRoleMap([
  { id: 'e1', fullName: 'Emp A', isActive: true, scheduleRole: 'core1' },
  { id: 'e2', fullName: 'Emp B', isActive: true, scheduleRole: 'CORE_2' },
  { id: 'e3', fullName: 'Emp C', isActive: true, scheduleRole: 'flex1' },
  { id: 'e4', fullName: 'Emp D', isActive: true, scheduleRole: 'flex2' },
]);
assert.equal(resCoreB.roleById.get('e2'), 'CORE_B', 'CORE_2 must map to CORE_B');
assert.equal(resCoreB.valid, true);

// 3. Generic CORE #1 and #2 -> CORE_A then CORE_B
console.log('  Test 1.3: Generic CORE #1 and #2 -> CORE_A then CORE_B');
const resGenCore = resolveEngineRoleMap([
  { id: 'e1', fullName: 'Alpha Core', isActive: true, scheduleRole: 'CORE' },
  { id: 'e2', fullName: 'Beta Core', isActive: true, scheduleRole: 'CORE' },
  { id: 'e3', fullName: 'Gamma Flex', isActive: true, scheduleRole: 'intermediate' },
  { id: 'e4', fullName: 'Delta Flex', isActive: true, scheduleRole: 'intermediate' },
]);
assert.equal(resGenCore.roleById.get('e1'), 'CORE_A', 'First generic CORE must map to CORE_A');
assert.equal(resGenCore.roleById.get('e2'), 'CORE_B', 'Second generic CORE must map to CORE_B');
assert.equal(resGenCore.valid, true);

// 4. Exact FLEX_A alias
console.log('  Test 1.4: Exact FLEX_A alias -> FLEX_A');
const resFlexA = resolveEngineRoleMap([
  { id: 'e1', fullName: 'Emp A', isActive: true, scheduleRole: 'core1' },
  { id: 'e2', fullName: 'Emp B', isActive: true, scheduleRole: 'core2' },
  { id: 'e3', fullName: 'Emp C', isActive: true, scheduleRole: 'FLEX_1' },
  { id: 'e4', fullName: 'Emp D', isActive: true, scheduleRole: 'FLEX_2' },
]);
assert.equal(resFlexA.roleById.get('e3'), 'FLEX_A', 'FLEX_1 must map specifically to FLEX_A');
assert.equal(resFlexA.valid, true);

// 5. Exact FLEX_B alias
console.log('  Test 1.5: Exact FLEX_B alias -> FLEX_B');
const resFlexB = resolveEngineRoleMap([
  { id: 'e1', fullName: 'Emp A', isActive: true, scheduleRole: 'core1' },
  { id: 'e2', fullName: 'Emp B', isActive: true, scheduleRole: 'core2' },
  { id: 'e3', fullName: 'Emp C', isActive: true, scheduleRole: 'FLEX_2' },
  { id: 'e4', fullName: 'Emp D', isActive: true, scheduleRole: 'intermediate' },
]);
assert.equal(resFlexB.roleById.get('e3'), 'FLEX_B', 'FLEX_2 must map specifically to FLEX_B');
assert.equal(resFlexB.roleById.get('e4'), 'FLEX_A', 'Generic intermediate fills remaining FLEX_A');
assert.equal(resFlexB.valid, true);

// 6. Generic Intermediate #1 and #2 -> FLEX_A then FLEX_B
console.log('  Test 1.6: Generic Intermediate #1 and #2 -> FLEX_A then FLEX_B');
const resGenInter = resolveEngineRoleMap([
  { id: 'e1', fullName: 'Emp A', isActive: true, scheduleRole: 'core1' },
  { id: 'e2', fullName: 'Emp B', isActive: true, scheduleRole: 'core2' },
  { id: 'e3', fullName: 'Alpha Inter', isActive: true, scheduleRole: 'INTERMEDIATE' },
  { id: 'e4', fullName: 'Beta Inter', isActive: true, scheduleRole: 'COVERAGE' },
]);
assert.equal(resGenInter.roleById.get('e3'), 'FLEX_A', 'First generic intermediate must map to FLEX_A');
assert.equal(resGenInter.roleById.get('e4'), 'FLEX_B', 'Second generic intermediate must map to FLEX_B');
assert.equal(resGenInter.valid, true);

// 7. CUSTOM and GENERAL aliases -> EXTRA_A and EXTRA_B
console.log('  Test 1.7: CUSTOM and GENERAL aliases -> EXTRA_A and EXTRA_B');
const resCustomGen = resolveEngineRoleMap([
  ...createBase4Employees(),
  { id: 'e5', fullName: 'Alpha Custom', isActive: true, scheduleRole: 'CUSTOM' },
  { id: 'e6', fullName: 'Beta General', isActive: true, scheduleRole: 'GENERAL' },
]);
assert.equal(resCustomGen.roleById.get('e5'), 'EXTRA_A', 'CUSTOM must map to EXTRA_A');
assert.equal(resCustomGen.roleById.get('e6'), 'EXTRA_B', 'GENERAL must map to EXTRA_B');
assert.equal(resCustomGen.valid, true);

// 8. Truly unconfigured legacy employees
console.log('  Test 1.8: Truly unconfigured legacy employees -> sequential slots');
const resUnconf = resolveEngineRoleMap([
  { id: 'u1', fullName: 'Ανδρέας', isActive: true },
  { id: 'u2', fullName: 'Βασίλης', isActive: true },
  { id: 'u3', fullName: 'Γιώργος', isActive: true },
  { id: 'u4', fullName: 'Δημήτρης', isActive: true },
]);
assert.equal(resUnconf.roleById.get('u1'), 'CORE_A');
assert.equal(resUnconf.roleById.get('u2'), 'CORE_B');
assert.equal(resUnconf.roleById.get('u3'), 'FLEX_A');
assert.equal(resUnconf.roleById.get('u4'), 'FLEX_B');
assert.equal(resUnconf.valid, true);
console.log('  PASS: SECTION 1 verified.\n');

// -----------------------------------------------------------------------------
// SECTION 2: MANDATORY BASE SLOTS & INVALID CONFIGURATION FAIL-CLOSED
// -----------------------------------------------------------------------------
console.log('SECTION 2: Mandatory Base Slots & Invalid Configuration Fail-Closed Tests...');

// 2.1 Missing CORE_A
console.log('  Test 2.1: Missing CORE_A -> fail-closed');
const missingCoreA = [
  { id: 'c2', fullName: 'Core 2', isActive: true, scheduleRole: 'core2' },
  { id: 'f1', fullName: 'Flex 1', isActive: true, scheduleRole: 'intermediate' },
  { id: 'f2', fullName: 'Flex 2', isActive: true, scheduleRole: 'intermediate' },
  { id: 'ex', fullName: 'Extra', isActive: true, scheduleRole: 'custom' },
];
const valMissingCoreA = validateSchedulerRoleConfiguration(missingCoreA);
assert.equal(valMissingCoreA.valid, false, 'Missing CORE_A must be invalid');
assert.ok(valMissingCoreA.message.includes('Core 1'), 'Message must indicate missing Core 1');

// 2.2 Missing CORE_B
console.log('  Test 2.2: Missing CORE_B -> fail-closed');
const missingCoreB = [
  { id: 'c1', fullName: 'Core 1', isActive: true, scheduleRole: 'core1' },
  { id: 'f1', fullName: 'Flex 1', isActive: true, scheduleRole: 'intermediate' },
  { id: 'f2', fullName: 'Flex 2', isActive: true, scheduleRole: 'intermediate' },
  { id: 'ex', fullName: 'Extra', isActive: true, scheduleRole: 'custom' },
];
const valMissingCoreB = validateSchedulerRoleConfiguration(missingCoreB);
assert.equal(valMissingCoreB.valid, false, 'Missing CORE_B must be invalid');
assert.ok(valMissingCoreB.message.includes('Core 2'), 'Message must indicate missing Core 2');

// 2.3 Missing FLEX_A / FLEX_B
console.log('  Test 2.3: Missing Flex slot -> fail-closed');
const missingFlex = [
  { id: 'c1', fullName: 'Core 1', isActive: true, scheduleRole: 'core1' },
  { id: 'c2', fullName: 'Core 2', isActive: true, scheduleRole: 'core2' },
  { id: 'f1', fullName: 'Flex 1', isActive: true, scheduleRole: 'flex1' },
  { id: 'ex', fullName: 'Extra', isActive: true, scheduleRole: 'custom' },
];
const valMissingFlex = validateSchedulerRoleConfiguration(missingFlex);
assert.equal(valMissingFlex.valid, false, 'Missing Flex slot must be invalid');
assert.ok(valMissingFlex.message.includes('Intermediate'), 'Message must indicate missing Intermediate / Coverage');

// 2.4 Missing base slot + explicit Custom -> Custom stays Extra, base reported missing, 0 shifts
console.log('  Test 2.4: Missing base slot + explicit Custom -> Custom stays Extra, 0 shifts');
const missingBaseWithCustom = [
  { id: 'emp-1', fullName: 'Νίκος Core 1', isActive: true, scheduleRole: 'core1', fixedDayOff: 3 },
  { id: 'emp-2', fullName: 'Μαρία Core 2', isActive: true, scheduleRole: 'core2', fixedDayOff: 4 },
  { id: 'emp-3', fullName: 'Κώστας Flex 1', isActive: true, scheduleRole: 'intermediate', fixedDayOff: 2 },
  { id: 'emp-custom', fullName: 'Άκης Αναπληρωτής', isActive: true, scheduleRole: 'custom', fixedDayOff: 5 },
];
const resMissingBaseMap = resolveEngineRoleMap(missingBaseWithCustom);
assert.equal(resMissingBaseMap.roleById.get('emp-custom'), 'EXTRA_A', 'Custom employee stays EXTRA_A');
assert.equal(resMissingBaseMap.roleById.get('emp-custom') !== 'FLEX_B', true, 'Custom employee NEVER becomes FLEX_B');
assert.equal(resMissingBaseMap.valid, false, 'Missing FLEX_B marks config invalid');

const weekMissingBase = await generateEngineWeekSchedule({
  weekDays,
  employees: missingBaseWithCustom,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
assert.equal(weekMissingBase.shifts.length, 0, 'No shifts generated when base slot is missing');
assert.ok(weekMissingBase.warnings[0].includes('Intermediate'), 'Warning identifies missing base slot');

const monthMissingBase = generateEngineMonthSchedule({
  month: 4,
  year: 2026,
  employees: missingBaseWithCustom,
  allShifts: [],
  existingMonthShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
assert.equal(monthMissingBase.shifts.length, 0, 'No monthly shifts generated when base slot is missing');
assert.equal(monthMissingBase.validation.valid, false);

// 2.5 Duplicate Core 1
console.log('  Test 2.5: Duplicate Core 1 -> fail-closed, no silent reassignment');
const dupCore1Emps = [
  { id: 'c1a', fullName: 'Core 1 First', isActive: true, scheduleRole: 'core1' },
  { id: 'c1b', fullName: 'Core 1 Second', isActive: true, scheduleRole: 'core1' },
  { id: 'f1', fullName: 'Flex 1', isActive: true, scheduleRole: 'intermediate' },
  { id: 'f2', fullName: 'Flex 2', isActive: true, scheduleRole: 'intermediate' },
];
const resDupCore1 = resolveEngineRoleMap(dupCore1Emps);
assert.equal(resDupCore1.valid, false, 'Duplicate core1 must mark configuration as invalid');
assert.equal(resDupCore1.errors[0], 'Υπάρχει διπλότυπος ρόλος Core 1 στους εργαζομένους.');
assert.equal(resDupCore1.roleById.get('c1b'), undefined, 'Second core1 must NOT be assigned any role');

const weekDupCore1 = await generateEngineWeekSchedule({
  weekDays,
  employees: dupCore1Emps,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
assert.equal(weekDupCore1.shifts.length, 0, 'No shifts generated when duplicate core1 exists');

// 2.6 Duplicate Core 2
console.log('  Test 2.6: Duplicate Core 2 -> fail-closed, no silent reassignment');
const dupCore2Emps = [
  { id: 'c1', fullName: 'Core 1', isActive: true, scheduleRole: 'core1' },
  { id: 'c2a', fullName: 'Core 2 First', isActive: true, scheduleRole: 'core2' },
  { id: 'c2b', fullName: 'Core 2 Second', isActive: true, scheduleRole: 'core2' },
  { id: 'f1', fullName: 'Flex 1', isActive: true, scheduleRole: 'intermediate' },
];
const resDupCore2 = resolveEngineRoleMap(dupCore2Emps);
assert.equal(resDupCore2.valid, false, 'Duplicate core2 must mark configuration as invalid');
assert.equal(resDupCore2.errors[0], 'Υπάρχει διπλότυπος ρόλος Core 2 στους εργαζομένους.');
assert.equal(resDupCore2.roleById.get('c2b'), undefined, 'Second core2 must NOT be silently reassigned');

// 2.7 Third Intermediate
console.log('  Test 2.7: Third Intermediate -> fail-closed, no silent Extra promotion');
const thirdInterEmps = [
  { id: 'c1', fullName: 'Core 1', isActive: true, scheduleRole: 'core1' },
  { id: 'c2', fullName: 'Core 2', isActive: true, scheduleRole: 'core2' },
  { id: 'i1', fullName: 'Inter 1', isActive: true, scheduleRole: 'intermediate' },
  { id: 'i2', fullName: 'Inter 2', isActive: true, scheduleRole: 'intermediate' },
  { id: 'i3', fullName: 'Inter 3', isActive: true, scheduleRole: 'intermediate' },
];
const resThirdInter = resolveEngineRoleMap(thirdInterEmps);
assert.equal(resThirdInter.valid, false, 'Third intermediate must be invalid');
assert.equal(resThirdInter.errors[0], 'Υπάρχουν πάνω από 2 εργαζόμενοι με ρόλο Intermediate / Coverage.');
assert.equal(resThirdInter.roleById.get('i3'), undefined, 'Third intermediate must NOT be promoted to EXTRA_A');

// 2.8 Third Custom
console.log('  Test 2.8: Third Custom -> fail-closed, no slot duplicate');
const thirdCustomEmps = [
  { id: 'c1', fullName: 'Core 1', isActive: true, scheduleRole: 'core1' },
  { id: 'c2', fullName: 'Core 2', isActive: true, scheduleRole: 'core2' },
  { id: 'i1', fullName: 'Inter 1', isActive: true, scheduleRole: 'intermediate' },
  { id: 'x1', fullName: 'Custom 1', isActive: true, scheduleRole: 'custom' },
  { id: 'x2', fullName: 'Custom 2', isActive: true, scheduleRole: 'custom' },
  { id: 'x3', fullName: 'Custom 3', isActive: true, scheduleRole: 'custom' },
];
const resThirdCustom = resolveEngineRoleMap(thirdCustomEmps);
assert.equal(resThirdCustom.valid, false, 'Third custom must be invalid');
assert.equal(resThirdCustom.errors[0], 'Υπάρχουν πάνω από 2 εργαζόμενοι με ρόλο Extra / Substitute.');
assert.equal(resThirdCustom.roleById.get('x3'), undefined, 'Third custom must NOT duplicate EXTRA slots');

console.log('  PASS: SECTION 2 verified.\n');

// -----------------------------------------------------------------------------
// SECTION 3: CAPACITY & BOUNDED AUTOSCHEDULER ENFORCEMENT
// -----------------------------------------------------------------------------
console.log('SECTION 3: Capacity & Bounded Autoscheduler Enforcement Tests...');

// 3.1 4 Employees (4 Base)
console.log('  Test 3.1: 4 Employees (4 Base) -> valid');
const base4 = createBase4Employees();
assert.equal(validateSchedulerEmployeeCapacity(base4).valid, true);

// 3.2 5 Employees (4 Base + 1 Extra)
console.log('  Test 3.2: 5 Employees (4 Base + 1 Extra) -> valid');
const emp5 = [
  ...base4,
  { id: 'emp-5', fullName: 'Γιώργος Extra 1', isActive: true, scheduleRole: 'custom', extraMode: 'SUBSTITUTE_ONLY', participatesInRotation: true, participatesInSundayRotation: true },
];
assert.equal(validateSchedulerEmployeeCapacity(emp5).valid, true);

// 3.3 6 Employees (4 Base + 2 Extras)
console.log('  Test 3.3: 6 Employees (4 Base + 2 Extras) -> valid');
const emp6 = [
  ...emp5,
  { id: 'emp-6', fullName: 'Άννα Extra 2', isActive: true, scheduleRole: 'custom', extraMode: 'SUBSTITUTE_ONLY', participatesInRotation: true, participatesInSundayRotation: true },
];
assert.equal(validateSchedulerEmployeeCapacity(emp6).valid, true);

// 3.4 7 Employees -> Safe rejection
console.log('  Test 3.4: 7 Employees -> safe rejection');
const emp7 = [
  ...emp6,
  { id: 'emp-7', fullName: 'Δημήτρης 7ος', isActive: true, scheduleRole: 'custom' },
];
const cap7 = validateSchedulerEmployeeCapacity(emp7);
assert.equal(cap7.valid, false);
assert.equal(cap7.message, 'Το αυτόματο πρόγραμμα υποστηρίζει έως 6 ενεργούς εργαζομένους.');

const weekRes7 = await generateEngineWeekSchedule({
  weekDays,
  employees: emp7,
  allShifts: [],
  absences: [],
  rules: { weeklyRotationEnabled: true },
});
assert.equal(weekRes7.shifts.length, 0);
assert.equal(weekRes7.warnings[0], 'Το αυτόματο πρόγραμμα υποστηρίζει έως 6 ενεργούς εργαζομένους.');
console.log('  PASS: SECTION 3 verified.\n');

// -----------------------------------------------------------------------------
// SECTION 4: USER BUG FIX & REGULAR EMPLOYEE SCHEDULE VERIFICATION
// -----------------------------------------------------------------------------
console.log('SECTION 4: User Bug Fix & Regular Employee Schedule Verification...');

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
console.log('  PASS: SECTION 4 verified.\n');

// -----------------------------------------------------------------------------
// SECTION 5: EXTRA / SUBSTITUTE BEHAVIOR & EVIDENCE GAPS
// -----------------------------------------------------------------------------
console.log('SECTION 5: Extra / Substitute Behavior & Evidence Gaps...');

// 5.1 Substitute Absence Replacement
console.log('  Test 5.1: Substitute absence replacement');
const absencesForSub = [
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
const resSubGap = await generateEngineWeekSchedule({
  weekDays,
  employees: emp5,
  allShifts: [],
  absences: absencesForSub,
  rules: { weeklyRotationEnabled: true },
});
const replacementShift = resSubGap.shifts.find((s) => s.date === '2026-05-04' && s.employeeId === 'emp-5');
assert.ok(replacementShift, 'Substitute emp-5 must fill absence gap on 2026-05-04');
assert.equal(replacementShift.source, 'ABSENCE_REPLACEMENT');

// 5.2 Direct Assertion: DISABLED Extra never replaces absence
console.log('  Test 5.2: Direct assertion - DISABLED Extra never replaces absence');
const empWithDisabled = [
  ...base4,
  { id: 'emp-disabled', fullName: 'Disabled Extra', isActive: true, scheduleRole: 'custom', extraMode: 'DISABLED', participatesInSundayRotation: true },
];
const resDisabledGap = await generateEngineWeekSchedule({
  weekDays,
  employees: empWithDisabled,
  allShifts: [],
  absences: absencesForSub,
  rules: { weeklyRotationEnabled: true },
});
const disabledReplacements = resDisabledGap.shifts.filter((s) => s.employeeId === 'emp-disabled');
assert.equal(disabledReplacements.length, 0, 'DISABLED Extra must receive 0 replacement shifts');

// 5.3 Substitute Sunday Participation
console.log('  Test 5.3: Substitute Sunday participation in rotation pool');
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
assert.ok(sundayRecipients.includes('emp-5'), 'emp-5 must receive Sunday in rotation');

// 5.4 Sunday Opt-out
console.log('  Test 5.4: Sunday opt-out');
const empWithOptOut = [
  ...base4,
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

// 5.5 DISABLED Extra Sunday exclusion
console.log('  Test 5.5: DISABLED Extra Sunday exclusion');
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

// 5.6 ACTIVE_SEASONAL in-range and out-of-range direct assertions
console.log('  Test 5.6: ACTIVE_SEASONAL in-range vs out-of-range direct assertions');
const seasonalEmp = [
  ...base4,
  {
    id: 'emp-seasonal',
    fullName: 'Seasonal Extra',
    isActive: true,
    scheduleRole: 'custom',
    extraMode: 'ACTIVE_SEASONAL',
    activeFrom: '2026-05-04',
    activeTo: '2026-05-08',
    participatesInSundayRotation: true,
  },
];

// In-range replacement (2026-05-05 is within activeFrom..activeTo)
const inRangeAbsence = [
  {
    id: 'abs-in-range',
    employeeId: 'emp-1',
    startDate: '2026-05-05',
    endDate: '2026-05-05',
    type: 'SICK',
    scope: 'FULL_DAY',
    status: 'CONFIRMED',
  },
];
const resSeasonalInRange = await generateEngineWeekSchedule({
  weekDays,
  employees: seasonalEmp,
  allShifts: [],
  absences: inRangeAbsence,
  rules: { weeklyRotationEnabled: true },
});
const seasonalInRangeShift = resSeasonalInRange.shifts.find((s) => s.date === '2026-05-05' && s.employeeId === 'emp-seasonal');
assert.ok(seasonalInRangeShift, 'Seasonal employee must fill gap on in-range date (2026-05-05)');
assert.equal(seasonalInRangeShift.source, 'ABSENCE_REPLACEMENT');

// Out-of-range Sunday (2026-05-10 is outside activeTo: 2026-05-08)
const seasonalSundayRes = await generateEngineWeekSchedule({
  weekDays,
  employees: seasonalEmp,
  allShifts: [],
  absences: [],
  rules: { avoidConsecutiveSundays: true },
});
const seasonalSunday = seasonalSundayRes.shifts.find((s) => s.date === '2026-05-10' && s.employeeId === 'emp-seasonal');
assert.equal(seasonalSunday, undefined, 'Seasonal employee outside activeTo must NOT receive Sunday shift');

console.log('  PASS: SECTION 5 verified.\n');

// -----------------------------------------------------------------------------
// SECTION 6: PDF EXPORT GUARD & STANDBY SEMANTICS
// -----------------------------------------------------------------------------
console.log('SECTION 6: PDF Export Guard & Standby Semantics...');

// 6.1 Unassigned regular employee blocked
console.log('  Test 6.1: PDF 0 work / 0 absence regular employee -> blocked');
const incompleteEmployees = [
  ...base4,
  { id: 'emp-unassigned', fullName: 'Ανάθεση Χωρίς Βάρδιες', isActive: true, scheduleRole: 'core1', participatesInRotation: true },
];
let pdfBlocked = false;
try {
  await exportScheduleToPdf({
    days: weekDays,
    employees: incompleteEmployees,
    shifts: res1Shifts(base4),
    absences: [],
    exportAuthorization: { isAdmin: true, auditRequired: true },
    onBeforeDownload: async () => {},
  });
} catch (error) {
  pdfBlocked = true;
  assert.equal(
    error.message,
    'Το πρόγραμμα δεν περιέχει έγκυρες βάρδιες για όλους τους ενεργούς εργαζομένους. Έλεγξε το πρόγραμμα πριν την εξαγωγή.',
  );
}
assert.ok(pdfBlocked, 'PDF export must be blocked for unassigned regular employee');

// 6.2 Partial absence regular employee blocked
console.log('  Test 6.2: PDF partial absence regular employee -> blocked');
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
const valPartial = validateExportScheduleState({
  days: weekDays,
  employees: incompleteEmployees,
  shifts: res1Shifts(base4),
  absences: partialSickness,
});
assert.equal(valPartial.valid, false, 'Partial sickness with 0 work on other days must be invalid');

// 6.3 Full-period absence valid
console.log('  Test 6.3: PDF full-period absence -> valid');
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
const valFull = validateExportScheduleState({
  days: weekDays,
  employees: incompleteEmployees,
  shifts: res1Shifts(base4),
  absences: fullWeekSickness,
});
assert.equal(valFull.valid, true, 'Full-period absence covering all days must be valid');

// 6.4 Substitute standby renders "-" not false "ΑΝ"
console.log('  Test 6.4: Substitute standby renders "-" not false "ΑΝ"');
const valSubStandby = validateExportScheduleState({
  days: weekDays,
  employees: emp5,
  shifts: res1Shifts(base4),
  absences: [],
});
assert.equal(valSubStandby.valid, true, 'Substitute on standby is valid for export');

const rowsSub = buildGroupedScheduleRows({
  days: weekDays,
  employees: emp5,
  shifts: res1Shifts(base4),
  absences: [],
});
const subStatuses = rowsSub.map((r) => {
  const names = r.fullName.split('\n');
  const statuses = r.workRest.split('\n');
  const idx = names.findIndex((n) => n.includes('Γιώργος Extra 1'));
  return statuses[idx];
});
for (const s of subStatuses) {
  assert.equal(s, '-', 'Substitute on standby must report "-" and NOT false "ΑΝ"');
}
console.log('  PASS: SECTION 6 verified.\n');

// Helper
function res1Shifts(employees) {
  return [
    { id: 's1', employeeId: 'emp-1', date: '2026-05-04', shiftType: 'MORNING' },
    { id: 's2', employeeId: 'emp-1', date: '2026-05-05', shiftType: 'MORNING' },
    { id: 's3', employeeId: 'emp-1', date: '2026-05-06', shiftType: 'MORNING' },
    { id: 's4', employeeId: 'emp-1', date: '2026-05-08', shiftType: 'MORNING' },
    { id: 's5', employeeId: 'emp-1', date: '2026-05-09', shiftType: 'MORNING' },
    { id: 's6', employeeId: 'emp-2', date: '2026-05-04', shiftType: 'AFTERNOON' },
    { id: 's7', employeeId: 'emp-2', date: '2026-05-05', shiftType: 'AFTERNOON' },
    { id: 's8', employeeId: 'emp-2', date: '2026-05-06', shiftType: 'AFTERNOON' },
    { id: 's9', employeeId: 'emp-2', date: '2026-05-07', shiftType: 'AFTERNOON' },
    { id: 's10', employeeId: 'emp-2', date: '2026-05-09', shiftType: 'AFTERNOON' },
    { id: 's11', employeeId: 'emp-3', date: '2026-05-04', shiftType: 'INTERMEDIATE' },
    { id: 's12', employeeId: 'emp-3', date: '2026-05-05', shiftType: 'INTERMEDIATE' },
    { id: 's13', employeeId: 'emp-3', date: '2026-05-07', shiftType: 'INTERMEDIATE' },
    { id: 's14', employeeId: 'emp-3', date: '2026-05-08', shiftType: 'INTERMEDIATE' },
    { id: 's15', employeeId: 'emp-3', date: '2026-05-09', shiftType: 'INTERMEDIATE' },
    { id: 's16', employeeId: 'emp-4', date: '2026-05-04', shiftType: 'INTERMEDIATE' },
    { id: 's17', employeeId: 'emp-4', date: '2026-05-06', shiftType: 'INTERMEDIATE' },
    { id: 's18', employeeId: 'emp-4', date: '2026-05-07', shiftType: 'INTERMEDIATE' },
    { id: 's19', employeeId: 'emp-4', date: '2026-05-08', shiftType: 'INTERMEDIATE' },
    { id: 's20', employeeId: 'emp-4', date: '2026-05-09', shiftType: 'INTERMEDIATE' },
  ];
}

console.log('==========================================================');
console.log('ALL COMPREHENSIVE REGRESSION & ROLE SAFETY TESTS PASSED (100%)');
console.log('==========================================================');
