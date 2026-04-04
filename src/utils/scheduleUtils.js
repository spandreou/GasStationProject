import { SHIFT_TYPE_OPTIONS } from '../data/constants';
import { getIsoDate } from './time';

/**
 * @typedef {'morning' | 'intermediate' | 'evening' | 'custom' | 'off'} ShiftType
 */

/**
 * @typedef {Object} ShiftEntry
 * @property {string} id
 * @property {string} employeeId
 * @property {string} [employeeName]
 * @property {string} date
 * @property {ShiftType | 'night'} [shiftType]
 * @property {string} startTime
 * @property {string} endTime
 * @property {string} [notes]
 * @property {boolean} [isHoliday]
 * @property {boolean} [isSpecialDay]
 * @property {boolean} [isManualOverride]
 * @property {string} [customLabel]
 * @property {string} [specialDayLabel]
 */

export const SHIFT_TYPE_ORDER = {
  morning: 0,
  intermediate: 1,
  evening: 2,
  custom: 3,
  off: 4,
};

export function toCanonicalShiftType(value) {
  if (value === 'night') return 'evening';
  if (SHIFT_TYPE_ORDER[value] !== undefined) return value;
  return 'custom';
}

export function getShiftTypeLabel(shiftType) {
  const normalized = toCanonicalShiftType(shiftType);
  return SHIFT_TYPE_OPTIONS.find((item) => item.value === normalized)?.label || 'Προσαρμοσμένη';
}

export function inferShiftType(entry) {
  const normalized = toCanonicalShiftType(entry?.shiftType);
  if (normalized !== 'custom' || entry?.shiftType === 'custom') {
    return normalized;
  }

  const start = entry?.startTime || '';
  if (start >= '05:00' && start < '09:00') return 'morning';
  if (start >= '09:00' && start < '14:00') return 'intermediate';
  if (start >= '14:00' && start <= '23:59') return 'evening';
  return 'custom';
}

export function inferShiftTypeFromTimes(startTime, endTime) {
  return inferShiftType({ startTime, endTime });
}

export function compareShiftsByScheduleOrder(a, b) {
  const typeA = inferShiftType(a);
  const typeB = inferShiftType(b);
  const orderA = SHIFT_TYPE_ORDER[typeA] ?? SHIFT_TYPE_ORDER.custom;
  const orderB = SHIFT_TYPE_ORDER[typeB] ?? SHIFT_TYPE_ORDER.custom;

  if (orderA !== orderB) return orderA - orderB;

  const timeCompare = (a.startTime || '').localeCompare(b.startTime || '');
  if (timeCompare !== 0) return timeCompare;

  return (a.employeeName || '').localeCompare(b.employeeName || '', 'el');
}

export function sortShiftsByScheduleOrder(shifts) {
  return [...(shifts || [])].sort(compareShiftsByScheduleOrder);
}

export function getWeekDaysFromDate(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(date);
    current.setDate(date.getDate() + index);
    return getIsoDate(current);
  });
}

export function getWeekStartFromDate(dateValue) {
  return getWeekDaysFromDate(dateValue)[0] || '';
}

export function getDateWeekKey(dateValue) {
  return `week_${getWeekStartFromDate(dateValue)}`;
}

export function getMonthDays(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const days = [];

  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(getIsoDate(new Date(year, monthIndex, day)));
  }

  return {
    firstDate: getIsoDate(first),
    lastDate: getIsoDate(last),
    days,
  };
}

export function formatGreekDate(dateValue) {
  return new Intl.DateTimeFormat('el-GR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${dateValue}T00:00:00`));
}

export function groupShiftsByDay(shifts) {
  return (shifts || []).reduce((acc, shift) => {
    if (!acc[shift.date]) acc[shift.date] = [];
    acc[shift.date].push(shift);
    return acc;
  }, {});
}

export function groupAndSortShiftsByDay(shifts) {
  const grouped = groupShiftsByDay(shifts);
  Object.keys(grouped).forEach((date) => {
    grouped[date] = sortShiftsByScheduleOrder(grouped[date]);
  });
  return grouped;
}

export function getDurationLabel(startTime, endTime) {
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  const minutes = Math.max(0, end - start);
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return remain ? `${hours}ω ${remain}λ` : `${hours}ω`;
}
