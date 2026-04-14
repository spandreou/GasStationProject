import { calculateWeeklyTotals, SHIFT_TYPES } from '../src/utils/analytics.js';

const employees = [
  { id: 'e1', fullName: 'Employee One' },
  { id: 'e2', fullName: 'Employee Two' },
];

const weekDays = ['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-11', '2026-04-12'];
const monthDays = [
  ...weekDays,
  '2026-04-13',
  '2026-04-14',
  '2026-04-15',
  '2026-04-16',
  '2026-04-17',
  '2026-04-18',
  '2026-04-19',
];

const shifts = [
  // e1 weekly: one explicit rest + one leave + one sick + work days
  { employeeId: 'e1', date: '2026-04-06', startTime: '06:00', endTime: '14:00', type: SHIFT_TYPES.WORK },
  { employeeId: 'e1', date: '2026-04-07', startTime: '00:00', endTime: '00:00', type: SHIFT_TYPES.REST },
  { employeeId: 'e1', date: '2026-04-08', startTime: '00:00', endTime: '00:00', type: SHIFT_TYPES.LEAVE },
  { employeeId: 'e1', date: '2026-04-09', startTime: '00:00', endTime: '00:00', type: SHIFT_TYPES.SICK },
  { employeeId: 'e1', date: '2026-04-10', startTime: '14:00', endTime: '22:00', type: SHIFT_TYPES.WORK },
  // no entry on 2026-04-11, 2026-04-12

  // e1 extra month entries
  { employeeId: 'e1', date: '2026-04-14', startTime: '00:00', endTime: '00:00', type: SHIFT_TYPES.REST },
  { employeeId: 'e1', date: '2026-04-16', startTime: '00:00', endTime: '00:00', type: SHIFT_TYPES.LEAVE },

  // e2 weekly: only work + leave, no explicit rest
  { employeeId: 'e2', date: '2026-04-06', startTime: '14:00', endTime: '22:00', type: SHIFT_TYPES.WORK },
  { employeeId: 'e2', date: '2026-04-07', startTime: '06:00', endTime: '14:00', type: SHIFT_TYPES.WORK },
  { employeeId: 'e2', date: '2026-04-08', startTime: '00:00', endTime: '00:00', type: SHIFT_TYPES.LEAVE },
  { employeeId: 'e2', date: '2026-04-10', startTime: '14:00', endTime: '22:00', type: SHIFT_TYPES.WORK },
  // e2 extra month entries
  { employeeId: 'e2', date: '2026-04-15', startTime: '00:00', endTime: '00:00', type: SHIFT_TYPES.REST },
];

const weekly = calculateWeeklyTotals(shifts, employees, weekDays);
const monthly = calculateWeeklyTotals(shifts, employees, monthDays);

if (weekly.leaveDaysByEmployee.e1.restDays !== 1) {
  throw new Error(`Expected weekly e1 restDays=1, got ${weekly.leaveDaysByEmployee.e1.restDays}`);
}
if (weekly.leaveDaysByEmployee.e1.leaveDays !== 1) {
  throw new Error(`Expected weekly e1 leaveDays=1, got ${weekly.leaveDaysByEmployee.e1.leaveDays}`);
}
if (weekly.leaveDaysByEmployee.e1.sickDays !== 1) {
  throw new Error(`Expected weekly e1 sickDays=1, got ${weekly.leaveDaysByEmployee.e1.sickDays}`);
}
if (weekly.leaveDaysByEmployee.e2.restDays !== 1) {
  throw new Error(`Expected weekly e2 restDays=1, got ${weekly.leaveDaysByEmployee.e2.restDays}`);
}
if (weekly.leaveDaysByEmployee.e2.leaveDays !== 1) {
  throw new Error(`Expected weekly e2 leaveDays=1, got ${weekly.leaveDaysByEmployee.e2.leaveDays}`);
}

if (monthly.leaveDaysByEmployee.e1.restDays !== 3) {
  throw new Error(`Expected monthly e1 restDays=3, got ${monthly.leaveDaysByEmployee.e1.restDays}`);
}
if (monthly.leaveDaysByEmployee.e2.restDays !== 4) {
  throw new Error(`Expected monthly e2 restDays=4, got ${monthly.leaveDaysByEmployee.e2.restDays}`);
}

const sundayOnly = calculateWeeklyTotals(
  [
    { employeeId: 'e3', date: '2026-04-06', startTime: '06:00', endTime: '14:00', type: SHIFT_TYPES.WORK },
    { employeeId: 'e3', date: '2026-04-07', startTime: '06:00', endTime: '14:00', type: SHIFT_TYPES.WORK },
    { employeeId: 'e3', date: '2026-04-08', startTime: '06:00', endTime: '14:00', type: SHIFT_TYPES.WORK },
    { employeeId: 'e3', date: '2026-04-09', startTime: '06:00', endTime: '14:00', type: SHIFT_TYPES.WORK },
    { employeeId: 'e3', date: '2026-04-10', startTime: '06:00', endTime: '14:00', type: SHIFT_TYPES.WORK },
    { employeeId: 'e3', date: '2026-04-11', startTime: '06:00', endTime: '14:00', type: SHIFT_TYPES.WORK },
  ],
  [{ id: 'e3', fullName: 'Employee Three' }],
  weekDays,
);

if (sundayOnly.leaveDaysByEmployee.e3.restDays !== 1) {
  throw new Error(`Expected sunday-only fallback restDays=1, got ${sundayOnly.leaveDaysByEmployee.e3.restDays}`);
}

console.log('OK: rest-day counting is scoped and includes explicit/inferred rest with Sunday fallback.');
