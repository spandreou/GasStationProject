const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeLabel(value) {
  return TIME_PATTERN.test(value);
}

export function timeToMinutes(timeLabel) {
  if (!isValidTimeLabel(timeLabel)) {
    throw new Error(`Μη έγκυρη ώρα: ${timeLabel}`);
  }

  const [hours, minutes] = timeLabel.split(':').map(Number);
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
  return `${startTime} - ${endTime}`;
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
