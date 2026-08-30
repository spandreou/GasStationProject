import type { Weekday } from './types.ts';
import { WEEKDAYS } from './constants.ts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function parseIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const next = parseIsoDate(date);
  next.setUTCDate(next.getUTCDate() + days);
  return toIsoDate(next);
}

export function eachDateInclusive(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  for (let current = startDate; current <= endDate; current = addDays(current, 1)) {
    dates.push(current);
  }
  return dates;
}

export function getWeekday(date: string): Weekday {
  return WEEKDAYS[parseIsoDate(date).getUTCDay()];
}

export function isDateInRange(date: string, startDate?: string, endDate?: string): boolean {
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return true;
}

export function getMondayStart(date: string): string {
  const parsed = parseIsoDate(date);
  const day = parsed.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  parsed.setUTCDate(parsed.getUTCDate() + mondayOffset);
  return toIsoDate(parsed);
}

export function getWeekIndex(rangeStartDate: string, date: string): number {
  const firstMonday = parseIsoDate(getMondayStart(rangeStartDate)).getTime();
  const currentMonday = parseIsoDate(getMondayStart(date)).getTime();
  return Math.floor((currentMonday - firstMonday) / (MS_PER_DAY * 7));
}

export function timeToMinutes(timeStr: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10) || 0);
  return h * 60 + m;
}

export function shiftToTimestampInterval(date: string, startTime: string, endTime: string, crossMidnight = false): { startMs: number; endMs: number } {
  const startD = parseIsoDate(date);
  const startM = timeToMinutes(startTime);
  startD.setUTCMinutes(startM);
  const startMs = startD.getTime();

  let endD = parseIsoDate(date);
  const endM = timeToMinutes(endTime);
  if (crossMidnight || endM <= startM) {
    endD = parseIsoDate(addDays(date, 1));
  }
  endD.setUTCMinutes(endM);
  const endMs = endD.getTime();

  return { startMs, endMs };
}

export function calculateRestHoursBetweenShifts(
  prevDate: string,
  prevStart: string,
  prevEnd: string,
  prevCrossMidnight: boolean,
  currDate: string,
  currStart: string,
  currEnd: string,
  currCrossMidnight = false,
): number {
  const prev = shiftToTimestampInterval(prevDate, prevStart, prevEnd, prevCrossMidnight);
  const curr = shiftToTimestampInterval(currDate, currStart, currEnd, currCrossMidnight);
  const restMs = curr.startMs - prev.endMs;
  return restMs / (1000 * 60 * 60);
}

export function isShiftContainedInWindow(
  shiftStart: string,
  shiftEnd: string,
  windowOpenOrWindows: string | Array<{ openTime: string; closeTime: string; crossMidnight?: boolean }>,
  windowClose?: string,
  shiftCrossMidnight = false,
  windowCrossMidnight = false,
): boolean {
  if (Array.isArray(windowOpenOrWindows)) {
    if (windowOpenOrWindows.length === 0) return false;
    return windowOpenOrWindows.some((w) =>
      isShiftContainedInWindow(shiftStart, shiftEnd, w.openTime, w.closeTime, shiftCrossMidnight, Boolean(w.crossMidnight))
    );
  }
  const refDate = '2026-01-01';
  const shift = shiftToTimestampInterval(refDate, shiftStart, shiftEnd, shiftCrossMidnight);
  const win = shiftToTimestampInterval(refDate, windowOpenOrWindows, windowClose || '24:00', windowCrossMidnight);

  if (shift.startMs >= win.startMs && shift.endMs <= win.endMs) {
    return true;
  }

  // If window crosses midnight, check if a non-cross-midnight subshift falls into the post-midnight portion
  if (windowCrossMidnight && !shiftCrossMidnight) {
    const nextDayShift = shiftToTimestampInterval(addDays(refDate, 1), shiftStart, shiftEnd, false);
    if (nextDayShift.startMs >= win.startMs && nextDayShift.endMs <= win.endMs) {
      return true;
    }
  }

  return false;
}



