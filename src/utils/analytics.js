import { calculateShiftDurationMinutes, minutesToHours } from './time';

export function getShiftDurationHours(shift) {
  const minutes = calculateShiftDurationMinutes(shift.startTime, shift.endTime);
  return minutesToHours(minutes);
}

export function calculateWeeklyTotals(shifts, employees, weekDays) {
  const weekSet = new Set(weekDays);
  const totalsByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = 0;
    return acc;
  }, {});

  let totalHours = 0;
  shifts.forEach((shift) => {
    if (!weekSet.has(shift.date)) return;
    const shiftHours = getShiftDurationHours(shift);
    totalsByEmployee[shift.employeeId] = (totalsByEmployee[shift.employeeId] || 0) + shiftHours;
    totalHours += shiftHours;
  });

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    totalsByEmployee: Object.fromEntries(
      Object.entries(totalsByEmployee).map(([employeeId, hours]) => [
        employeeId,
        Math.round(hours * 100) / 100,
      ]),
    ),
  };
}
