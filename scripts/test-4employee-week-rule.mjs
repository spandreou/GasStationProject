import { generateSmartWeekSchedule } from '../src/utils/autoSchedulerService.js';

const weekDays = ['2026-04-06','2026-04-07','2026-04-08','2026-04-09','2026-04-10','2026-04-11','2026-04-12'];
const employees = [
  { id: 'e1', fullName: 'Core A', isActive: true, scheduleRole: 'core', defaultShiftPreference: 'morning' },
  { id: 'e2', fullName: 'Core B', isActive: true, scheduleRole: 'core', defaultShiftPreference: 'evening' },
  { id: 'e3', fullName: 'Intermediate', isActive: true, scheduleRole: 'intermediate', defaultShiftPreference: 'intermediate_0900' },
  { id: 'e4', fullName: 'Extra', isActive: true, defaultShiftPreference: 'auto' },
];

const { shifts } = await generateSmartWeekSchedule({
  weekDays,
  employees,
  allShifts: [],
  hasConsecutiveSundayAssignmentFn: async () => false,
  rules: {},
});

for (const date of weekDays.slice(0, 6)) {
  const dayShifts = shifts.filter((s) => s.date === date && (s.type || 'work') === 'work');
  const morning = dayShifts.filter((s) => s.shiftType === 'morning').length;
  const evening = dayShifts.filter((s) => s.shiftType === 'evening').length;
  const intermediate = dayShifts.filter((s) => s.shiftType === 'intermediate').length;
  const iShift = dayShifts.find((s) => s.employeeId === 'e3');
  console.log(`${date} => morning=${morning}, evening=${evening}, intermediate=${intermediate}, i=${iShift ? `${iShift.startTime}-${iShift.endTime}/${iShift.shiftType}` : 'none'}`);
}
