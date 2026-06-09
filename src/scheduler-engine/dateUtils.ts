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
