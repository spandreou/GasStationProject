import { generateSmartMonthSchedule } from '../src/utils/autoSchedulerService.js';

const employees = [
  { id: 'e1', fullName: 'Core A', isActive: true, scheduleRole: 'core', defaultShiftPreference: 'morning' },
  { id: 'e2', fullName: 'Core B', isActive: true, scheduleRole: 'core', defaultShiftPreference: 'evening' },
  { id: 'e3', fullName: 'Intermediate', isActive: true, scheduleRole: 'intermediate', defaultShiftPreference: 'intermediate_0900' },
  { id: 'e4', fullName: 'Extra', isActive: true, defaultShiftPreference: 'auto' },
];

const roleConfig = { coreAId: 'e1', coreBId: 'e2', intermediateId: 'e3' };
const result = generateSmartMonthSchedule({
  month: 3,
  year: 2026,
  employees,
  allShifts: [],
  existingMonthShifts: [],
  roleConfig,
  rules: {},
});

const targets = [
  ['Monday', '2026-04-06'],
  ['Tuesday', '2026-04-07'],
  ['Wednesday', '2026-04-08'],
  ['Thursday', '2026-04-09'],
  ['Friday', '2026-04-10'],
  ['Saturday', '2026-04-11'],
];

for (const [dayName, date] of targets) {
  const dayShifts = result.shifts.filter((s) => s.date === date && (s.type || 'work') === 'work');
  const morning = dayShifts.filter((s) => s.shiftType === 'morning').length;
  const evening = dayShifts.filter((s) => s.shiftType === 'evening').length;
  const intermediate = dayShifts.filter((s) => s.shiftType === 'intermediate').length;
  const worker = dayShifts.find((s) => s.employeeId === 'e3');
  console.log(
    `${dayName} ${date} => morning=${morning}, evening=${evening}, intermediate=${intermediate}, intermediateEmployee=${worker ? `${worker.startTime}-${worker.endTime}/${worker.shiftType}` : 'none'}`,
  );
}
