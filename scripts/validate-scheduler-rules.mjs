import { generateSmartWeekSchedule } from '../src/utils/autoSchedulerService.js';
import { buildGroupedScheduleRows, PDF_SCHEDULE_COLUMNS } from '../src/utils/exportService.js';

const SHIFT_TYPES = {
  WORK: 'work',
};

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
  { id: 'coreA', fullName: 'Core A', afm: '111', isActive: true, scheduleRole: 'core', fixedDayOff: 3 },
  { id: 'coreB', fullName: 'Core B', afm: '222', isActive: true, scheduleRole: 'core', fixedDayOff: 4 },
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
    scheduleRole: 'coverage',
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

for (const [label, date] of [
  ['Tuesday', '2026-04-07'],
  ['Wednesday', '2026-04-08'],
  ['Thursday', '2026-04-09'],
]) {
  assertDayPattern(shifts, date, { total: 3, morning: 1, intermediate: 1, evening: 1 }, label);
}

const saturdayShifts = getWorkShifts(shifts, '2026-04-11');
assert(countType(saturdayShifts, 'intermediate') === 0, 'Saturday should not create unnecessary intermediate shifts');

const sundayShifts = getWorkShifts(shifts, '2026-04-12');
assert(sundayShifts.length === 1, `Sunday should have exactly 1 shift, got ${sundayShifts.length}`);
assert(sundayShifts[0].startTime === '08:00' && sundayShifts[0].endTime === '20:00', 'Sunday should be 08:00-20:00');

assertNoOverlap(shifts);

const groupedRows = buildGroupedScheduleRows({ days: weekDays, employees, shifts });
assert(groupedRows.length === weekDays.length, `Expected ${weekDays.length} grouped PDF rows, got ${groupedRows.length}`);
assert(groupedRows[0].fullName.split('\n').length === employees.length, 'Grouped PDF row should contain multiline names');
assert(groupedRows[0].date === '06/04/2026', `Grouped PDF row should show one date label, got ${groupedRows[0].date}`);
assert(groupedRows[0].workRest.includes('ΕΡΓ'), 'Grouped PDF row should contain ΕΡΓ values');
assert(groupedRows[0].workRest.includes('\n'), 'Grouped PDF row should contain multiline work/rest values');

const workRestColumn = PDF_SCHEDULE_COLUMNS.find((column) => column.key === 'workRest');
assert(workRestColumn?.title === 'Εργασία/Ανάπαυση', 'PDF work/rest column should be Εργασία/Ανάπαυση');

console.log('Scheduler QA passed');
