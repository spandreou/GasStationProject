import { inferShiftType } from './scheduleUtils';
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
      return 'Ξ΅ΞµΟ€Ο';
    case SHIFT_TYPES.LEAVE:
      return 'Ξ†Ξ΄ΞµΞΉΞ±';
    case SHIFT_TYPES.SICK:
      return 'Ξ‘ΟƒΞΈΞ­Ξ½ΞµΞΉΞ±';
    case SHIFT_TYPES.WORK:
    default:
      return 'Ξ•ΟΞ³Ξ±ΟƒΞ―Ξ±';
  }
}

export function getShiftDurationHours(shift) {
  const minutes = calculateShiftDurationMinutes(shift.startTime, shift.endTime);
  return minutesToHours(minutes);
}

export function isWorkingShift(shift) {
  return (shift?.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK;
}

function isSundayDate(dateValue) {
  if (!dateValue) return false;
  const parsed = new Date(`${dateValue}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.getDay() === 0;
}

function getDefaultDayStatus() {
  return {
    hasWork: false,
    hasRest: false,
    hasLeave: false,
    hasSick: false,
  };
}

export function calculateWeeklyTotals(shifts, employees, weekDays) {
  const visibleDays = [...new Set((weekDays || []).filter(Boolean))];
  const visibleSet = new Set(visibleDays);
  const isWeeklyRange = visibleDays.length === 7;

  const totalsByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = 0;
    return acc;
  }, {});

  const shiftsCountByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = 0;
    return acc;
  }, {});

  const workBreakdownByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = {
      morning: 0,
      intermediate: 0,
      evening: 0,
      custom: 0,
    };
    return acc;
  }, {});

  const leaveDaysByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = {
      restDays: 0,
      leaveDays: 0,
      sickDays: 0,
      nonWorkingSundays: 0,
      inferredRestDays: 0,
    };
    return acc;
  }, {});

  const dayStatusByEmployee = employees.reduce((acc, employee) => {
    acc[employee.id] = {};
    return acc;
  }, {});

  let totalHours = 0;
  const totalsByType = { restDays: 0, leaveDays: 0, sickDays: 0, nonWorkingSundays: 0 };

  (shifts || []).forEach((shift) => {
    if (!visibleSet.has(shift.date)) return;

    const employeeId = shift.employeeId;
    if (!employeeId || !Object.prototype.hasOwnProperty.call(totalsByEmployee, employeeId)) return;

    const type = shift.type || SHIFT_TYPES.WORK;
    const employeeDayStatus = dayStatusByEmployee[employeeId] || {};
    const dayStatus = employeeDayStatus[shift.date] || getDefaultDayStatus();

    if (type === SHIFT_TYPES.WORK) {
      const shiftHours = getShiftDurationHours(shift);
      totalsByEmployee[employeeId] = (totalsByEmployee[employeeId] || 0) + shiftHours;
      shiftsCountByEmployee[employeeId] = (shiftsCountByEmployee[employeeId] || 0) + 1;

      const scheduleType = inferShiftType(shift);
      if (!workBreakdownByEmployee[employeeId]) {
        workBreakdownByEmployee[employeeId] = { morning: 0, intermediate: 0, evening: 0, custom: 0 };
      }
      workBreakdownByEmployee[employeeId][scheduleType] =
        (workBreakdownByEmployee[employeeId][scheduleType] || 0) + 1;

      dayStatus.hasWork = true;
      employeeDayStatus[shift.date] = dayStatus;
      dayStatusByEmployee[employeeId] = employeeDayStatus;

      totalHours += shiftHours;
      return;
    }

    if (type === SHIFT_TYPES.REST) {
      dayStatus.hasRest = true;
    } else if (type === SHIFT_TYPES.LEAVE) {
      dayStatus.hasLeave = true;
    } else if (type === SHIFT_TYPES.SICK) {
      dayStatus.hasSick = true;
    }

    employeeDayStatus[shift.date] = dayStatus;
    dayStatusByEmployee[employeeId] = employeeDayStatus;
  });

  employees.forEach((employee) => {
    const employeeId = employee.id;
    const employeeDayStatus = dayStatusByEmployee[employeeId] || {};

    let explicitRestNonSunday = 0;
    let leaveDays = 0;
    let sickDays = 0;
    let nonWorkingSundays = 0;

    visibleDays.forEach((date) => {
      const dayStatus = employeeDayStatus[date] || getDefaultDayStatus();
      const hasWork = Boolean(dayStatus.hasWork);

      // Priority for non-working categories: sick > leave > rest.
      if (!hasWork) {
        if (dayStatus.hasSick) {
          sickDays += 1;
        } else if (dayStatus.hasLeave) {
          leaveDays += 1;
        } else if (dayStatus.hasRest) {
          if (!isSundayDate(date)) {
            explicitRestNonSunday += 1;
          }
        }
      }

      if (isSundayDate(date) && !hasWork) {
        nonWorkingSundays += 1;
      }
    });

    let inferredRestDays = 0;
    if (isWeeklyRange && explicitRestNonSunday < 1) {
      inferredRestDays = 1 - explicitRestNonSunday;
    }

    // Weekly business rule:
    // - 1 regular rest day inside the week (explicit or inferred)
    // - +1 additional rest if employee does not work on Sunday.
    const restDays = explicitRestNonSunday + inferredRestDays + nonWorkingSundays;

    leaveDaysByEmployee[employeeId] = {
      restDays,
      leaveDays,
      sickDays,
      nonWorkingSundays,
      inferredRestDays,
    };

    totalsByType.restDays += restDays;
    totalsByType.leaveDays += leaveDays;
    totalsByType.sickDays += sickDays;
    totalsByType.nonWorkingSundays += nonWorkingSundays;
  });

  return {
    totalHours: Math.round(totalHours * 100) / 100,
    totalsByEmployee: Object.fromEntries(
      Object.entries(totalsByEmployee).map(([employeeId, hours]) => [
        employeeId,
        Math.round(hours * 100) / 100,
      ]),
    ),
    shiftsCountByEmployee,
    workBreakdownByEmployee,
    leaveDaysByEmployee,
    totalsByType,
  };
}

