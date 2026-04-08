const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const TIME_12H_PATTERN = /^(\d{1,2}):([0-5]\d)\s*([AP]M)$/i;

export function normalizeTimeLabel(value) {
  if (!value) return '';
  const trimmed = value.trim().replace(/[\u200e\u200f]/g, '');

  const match24 = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (match24) {
    const hours = match24[1].padStart(2, '0');
    return `${hours}:${match24[2]}`;
  }

  const match12 = trimmed.match(TIME_12H_PATTERN);
  if (match12) {
    let hours = Number(match12[1]);
    const minutes = match12[2];
    const period = match12[3].toUpperCase();

    if (period === 'AM') {
      hours = hours % 12;
    } else if (hours < 12) {
      hours += 12;
    }

    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  return trimmed;
}

export function isValidTimeLabel(value) {
  return TIME_PATTERN.test(normalizeTimeLabel(value));
}

export function timeToMinutes(timeLabel) {
  const normalized = normalizeTimeLabel(timeLabel);
  if (!TIME_PATTERN.test(normalized)) {
    throw new Error(`Invalid time: ${timeLabel}`);
  }

  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToHours(minutes) {
  return Math.round((minutes / 60) * 100) / 100;
}

export function calculateShiftDurationMinutes(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (end <= start) {
    throw new Error('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.');
  }

  return end - start;
}

export function formatShiftTime(startTime, endTime) {
  return `${normalizeTimeLabel(startTime)} - ${normalizeTimeLabel(endTime)}`;
}

function parseIsoDateParts(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(`${dateString || ''}`.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function formatDateGreek(dateString) {
  const parsed = parseIsoDateParts(dateString);
  if (!parsed) return '';
  const day = `${parsed.day}`.padStart(2, '0');
  const month = `${parsed.month}`.padStart(2, '0');
  return `${day}/${month}/${parsed.year}`;
}

export function parseGreekDateInputToIso(value) {
  const normalized = `${value || ''}`.trim().replace(/\./g, '/').replace(/-/g, '/');
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(normalized);
  if (!match) return '';
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) {
    return '';
  }
  return `${year}-${`${month}`.padStart(2, '0')}-${`${day}`.padStart(2, '0')}`;
}

export function getMonday(date = new Date()) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value;
}

export function getIsoDate(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getWeekDays(startDate) {
  const monday = new Date(`${startDate}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(monday);
    value.setDate(monday.getDate() + index);
    return getIsoDate(value);
  });
}
