import { formatDateGreek } from './time';

export function buildWhatsappSummary({ shifts, employees, weekDays, weekdayLabels }) {
  const employeeNameById = new Map(employees.map((employee) => [employee.id, employee.fullName]));

  const headerStart = formatDateGreek(weekDays[0]);
  const headerEnd = formatDateGreek(weekDays[weekDays.length - 1]);

  const lines = [`⛽ Πρόγραμμα Βαρδιών (${headerStart} - ${headerEnd})`, ''];

  weekDays.forEach((day, index) => {
    const dayShifts = shifts
      .filter((shift) => shift.date === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    lines.push(`📅 ${weekdayLabels[index]} (${formatDateGreek(day)})`);

    if (!dayShifts.length) {
      lines.push('• Δεν υπάρχουν βάρδιες');
      lines.push('');
      return;
    }

    dayShifts.forEach((shift) => {
      const employeeName = employeeNameById.get(shift.employeeId) || 'Άγνωστος υπάλληλος';
      lines.push(`• ${shift.startTime}-${shift.endTime} | ${employeeName}`);
    });

    lines.push('');
  });

  return lines.join('\n').trim();
}
