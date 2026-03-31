import { calculateShiftDurationMinutes, minutesToHours } from './time';

export const SHIFT_TYPES = {
  WORK: 'work',
  REST: 'rest',
  LEAVE: 'leave',
  SICK: 'sick',
};

export function getShiftTypeLabel(type) {
  switch (type) {
    case SHIFT_TYPES.REST:
      return 'Ρεπό';
    case SHIFT_TYPES.LEAVE:
      return 'Άδεια';
    case SHIFT_TYPES.SICK:
      return 'Ασθένεια';
    case SHIFT_TYPES.WORK:
    default:
      return 'Εργασία';
  }
}

export function getShiftDurationHours(shift) {
  const minutes = calculateShiftDurationMinutes(shift.startTime, shift.endTime);
  return minutesToHours(minutes);
}

export function isWorkingShift(shift) {
  return (shift?.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK;
}

export function calculateWeeklyTotals(shifts, employees, weekDays) {
  const weekSet = new Set(weekDays);
  const totalsByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = 0;
    return acc;
  }, {});

  const leaveDaysByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = {
      restDays: 0,
      leaveDays: 0,
      sickDays: 0,
    };
    return acc;
  }, {});

  let totalHours = 0;
  const totalsByType = { restDays: 0, leaveDays: 0, sickDays: 0 };

  shifts.forEach((shift) => {
    if (!weekSet.has(shift.date)) return;

    const type = shift.type || SHIFT_TYPES.WORK;
    if (type === SHIFT_TYPES.WORK) {
      const shiftHours = getShiftDurationHours(shift);
      totalsByEmployee[shift.employeeId] = (totalsByEmployee[shift.employeeId] || 0) + shiftHours;
      totalHours += shiftHours;
      return;
    }

    if (!leaveDaysByEmployee[shift.employeeId]) {
      leaveDaysByEmployee[shift.employeeId] = { restDays: 0, leaveDays: 0, sickDays: 0 };
    }

    if (type === SHIFT_TYPES.REST) {
      leaveDaysByEmployee[shift.employeeId].restDays += 1;
      totalsByType.restDays += 1;
    } else if (type === SHIFT_TYPES.LEAVE) {
      leaveDaysByEmployee[shift.employeeId].leaveDays += 1;
      totalsByType.leaveDays += 1;
    } else if (type === SHIFT_TYPES.SICK) {
      leaveDaysByEmployee[shift.employeeId].sickDays += 1;
      totalsByType.sickDays += 1;
    }
  });

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    totalsByEmployee: Object.fromEntries(
      Object.entries(totalsByEmployee).map(([employeeId, hours]) => [
        employeeId,
        Math.round(hours * 100) / 100,
      ]),
    ),
    leaveDaysByEmployee,
    totalsByType,
  };
}

export function calculatePayrollSummary(historyRows) {
  return historyRows.reduce(
    (acc, row) => {
      const type = row.type || SHIFT_TYPES.WORK;

      if (type === SHIFT_TYPES.WORK) {
        acc.totalWorkHours += Number(row.totalHours || 0);
      } else if (type === SHIFT_TYPES.REST) {
        acc.totalRestDays += 1;
      } else if (type === SHIFT_TYPES.LEAVE) {
        acc.totalLeaveDays += 1;
      } else if (type === SHIFT_TYPES.SICK) {
        acc.totalSickDays += 1;
      }

      return acc;
    },
    { totalWorkHours: 0, totalRestDays: 0, totalLeaveDays: 0, totalSickDays: 0 },
  );
}
