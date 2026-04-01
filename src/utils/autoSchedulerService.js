import { SHIFT_TYPES } from './analytics';
import { getIsoDate } from './time';

const MORNING_SHIFT = { startTime: '06:00', endTime: '14:00', label: 'Πρωινή' };
const EVENING_SHIFT = { startTime: '14:00', endTime: '22:00', label: 'Απογευματινή' };
const SUNDAY_SHIFT = { startTime: '08:00', endTime: '20:00', label: 'Κυριακή' };

function shiftKey(shift) {
  return `${shift.date}_${shift.employeeId}_${shift.startTime}_${shift.endTime}_${shift.type || SHIFT_TYPES.WORK}`;
}

function toDate(value) {
  return new Date(`${value}T00:00:00`);
}

function addDays(isoDate, delta) {
  const value = toDate(isoDate);
  value.setDate(value.getDate() + delta);
  return getIsoDate(value);
}

function getPreviousWeekDays(weekDays) {
  return weekDays.map((day) => addDays(day, -7));
}

function getSundayDate(weekDays) {
  return weekDays[6] || '';
}

function getPreviousSundayDate(weekDays) {
  const sunday = getSundayDate(weekDays);
  if (!sunday) return '';
  return addDays(sunday, -7);
}

function isMorningShift(shift) {
  return shift?.startTime === MORNING_SHIFT.startTime && shift?.endTime === MORNING_SHIFT.endTime;
}

function isEveningShift(shift) {
  return shift?.startTime === EVENING_SHIFT.startTime && shift?.endTime === EVENING_SHIFT.endTime;
}

function getStaticSchedule(employee) {
  const startTime = employee?.fixedStartTime || employee?.staticStartTime || '';
  const endTime = employee?.fixedEndTime || employee?.staticEndTime || '';
  const enabled = Boolean(startTime && endTime);
  return { enabled, startTime, endTime };
}

function buildRotationMap(previousWeekShifts) {
  const map = new Map();
  previousWeekShifts.forEach((shift) => {
    const key = `${shift.employeeId}_${shift.date}`;
    map.set(key, shift);
  });
  return map;
}

function getAlternatingShift(previousShift) {
  if (isMorningShift(previousShift)) return EVENING_SHIFT;
  if (isEveningShift(previousShift)) return MORNING_SHIFT;
  return MORNING_SHIFT;
}

function ensureUnique(shifts) {
  const seen = new Set();
  return shifts.filter((shift) => {
    const key = shiftKey(shift);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function generateSmartWeekSchedule({
  weekDays,
  employees,
  allShifts,
  hasConsecutiveSundayAssignmentFn,
}) {
  if (!Array.isArray(weekDays) || weekDays.length !== 7) {
    throw new Error('Μη έγκυρες ημέρες εβδομάδας για Magic Wand.');
  }

  const activeEmployees = (employees || []).filter((employee) => employee?.isActive !== false);
  if (!activeEmployees.length) {
    return { shifts: [], warnings: ['Δεν βρέθηκαν ενεργοί υπάλληλοι.'] };
  }

  const previousWeekDays = getPreviousWeekDays(weekDays);
  const previousWeekSet = new Set(previousWeekDays);
  const previousWeekShifts = (allShifts || []).filter((shift) => previousWeekSet.has(shift.date));
  const rotationMap = buildRotationMap(previousWeekShifts);

  const generated = [];
  const warnings = [];

  weekDays.slice(0, 6).forEach((date, dayIndex) => {
    const previousDate = previousWeekDays[dayIndex];

    activeEmployees.forEach((employee) => {
      const staticSchedule = getStaticSchedule(employee);
      if (staticSchedule.enabled) {
        generated.push({
          employeeId: employee.id,
          date,
          startTime: staticSchedule.startTime,
          endTime: staticSchedule.endTime,
          label: 'Σταθερό Ωράριο',
          notes: 'Auto-generated static role',
          type: SHIFT_TYPES.WORK,
        });
        return;
      }

      const prevShift = rotationMap.get(`${employee.id}_${previousDate}`);
      const rotationShift = getAlternatingShift(prevShift);

      generated.push({
        employeeId: employee.id,
        date,
        startTime: rotationShift.startTime,
        endTime: rotationShift.endTime,
        label: rotationShift.label,
        notes: 'Auto-generated with rotation',
        type: SHIFT_TYPES.WORK,
      });
    });
  });

  const sundayDate = getSundayDate(weekDays);
  const previousSundayDate = getPreviousSundayDate(weekDays);

  let sundayCandidates = [...activeEmployees];
  if (typeof hasConsecutiveSundayAssignmentFn === 'function') {
    const checks = await Promise.all(
      sundayCandidates.map(async (employee) => ({
        employee,
        blocked: await hasConsecutiveSundayAssignmentFn({
          employeeId: employee.id,
          previousSundayDate,
        }),
      })),
    );

    const available = checks.filter((item) => !item.blocked).map((item) => item.employee);
    if (available.length) {
      sundayCandidates = available;
    } else {
      warnings.push('Δεν βρέθηκε διαθέσιμος υπάλληλος για Κυριακή χωρίς συνεχόμενη ανάθεση.');
    }
  }

  sundayCandidates.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'el'));
  const sundayEmployee = sundayCandidates[0] || activeEmployees[0];

  if (sundayEmployee) {
    generated.push({
      employeeId: sundayEmployee.id,
      date: sundayDate,
      startTime: SUNDAY_SHIFT.startTime,
      endTime: SUNDAY_SHIFT.endTime,
      label: SUNDAY_SHIFT.label,
      notes: 'Auto-generated Sunday coverage',
      type: SHIFT_TYPES.WORK,
    });
  }

  return {
    shifts: ensureUnique(generated),
    warnings,
  };
}

export async function evaluateSundayRuleViolation({
  employeeId,
  date,
  startTime,
  endTime,
  hasConsecutiveSundayAssignmentFn,
}) {
  const isSundayLongShift = date && startTime === SUNDAY_SHIFT.startTime && endTime === SUNDAY_SHIFT.endTime;
  if (!employeeId || !date || !isSundayLongShift || typeof hasConsecutiveSundayAssignmentFn !== 'function') {
    return { violated: false, message: '' };
  }

  const previousSundayDate = addDays(date, -7);
  const violated = await hasConsecutiveSundayAssignmentFn({ employeeId, previousSundayDate });

  if (!violated) {
    return { violated: false, message: '' };
  }

  return {
    violated: true,
    message: 'Προειδοποίηση: Ο ίδιος υπάλληλος έχει ήδη αναλάβει Κυριακή 08:00-20:00 την προηγούμενη εβδομάδα.',
  };
}

export function getWeekIdFromWeekStart(weekStart) {
  return `week_${weekStart}`;
}
