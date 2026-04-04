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

export function formatDateGreek(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
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
