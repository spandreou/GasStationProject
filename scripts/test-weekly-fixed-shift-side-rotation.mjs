import { generateSmartWeekSchedule } from '../src/utils/autoSchedulerService.js';

const weekA = ['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-11', '2026-04-12'];
const weekB = ['2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17', '2026-04-18', '2026-04-19'];

const employees = [
  { id: 'e1', fullName: 'Core A', isActive: true, scheduleRole: 'core', defaultShiftPreference: 'morning' },
  { id: 'e2', fullName: 'Core B', isActive: true, scheduleRole: 'core', defaultShiftPreference: 'evening' },
  { id: 'e3', fullName: 'Intermediate', isActive: true, scheduleRole: 'intermediate', defaultShiftPreference: 'intermediate_0900' },
  { id: 'e4', fullName: 'Helper', isActive: true, defaultShiftPreference: 'auto' },
  {
    id: 'e5',
    fullName: 'Weekly Side Rotation',
    isActive: true,
    defaultShiftPreference: 'auto',
    weeklyFixedShiftSideRotation: true,
  },
];

async function runWeek(weekDays) {
  const { shifts, warnings } = await generateSmartWeekSchedule({
    weekDays,
    employees,
    allShifts: [],
    hasConsecutiveSundayAssignmentFn: async () => false,
    rules: {},
  });

  const employeeShifts = shifts.filter(
    (shift) => shift.employeeId === 'e5' && weekDays.slice(0, 6).includes(shift.date) && (shift.type || 'work') === 'work',
  );

  const sides = new Set(employeeShifts.map((shift) => shift.shiftType));
  const onlyMorning = sides.size && [...sides].every((side) => side === 'morning');
  const onlyEvening = sides.size && [...sides].every((side) => side === 'evening');

  return {
    shifts,
    warnings,
    sides: [...sides],
    onlyMorning,
    onlyEvening,
  };
}

const weekAResult = await runWeek(weekA);
const weekBResult = await runWeek(weekB);

console.log(`Week A sides for e5: ${weekAResult.sides.join(', ') || 'none'}`);
console.log(`Week B sides for e5: ${weekBResult.sides.join(', ') || 'none'}`);

if (!weekAResult.onlyMorning && !weekAResult.onlyEvening) {
  throw new Error('Expected week A to schedule e5 only on one side (morning or evening).');
}

if (!weekBResult.onlyMorning && !weekBResult.onlyEvening) {
  throw new Error('Expected week B to schedule e5 only on one side (morning or evening).');
}

if (weekAResult.onlyMorning === weekBResult.onlyMorning) {
  throw new Error('Expected alternating sides across consecutive weeks.');
}

console.log('OK: weekly fixed shift side rotation alternates deterministically across consecutive weeks.');
