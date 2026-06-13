import { formatDateGreek, formatShiftTime } from './time.js';

let xlsxModulePromise;
let jsPdfModulePromise;
let docxModulePromise;
let robotoFontPromise;

export const PDF_SCHEDULE_COLUMNS = [
  { key: 'date', title: 'Ημερομηνία', widthRatio: 0.2 },
  { key: 'afm', title: 'ΑΦΜ', widthRatio: 0.15 },
  { key: 'fullName', title: 'Ονοματεπώνυμο', widthRatio: 0.29 },
  { key: 'schedule', title: 'Ωράριο', widthRatio: 0.2 },
  { key: 'workRest', title: 'Εργασία/Ανάπαυση', widthRatio: 0.16 },
];

function loadXlsx() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('@e965/xlsx');
  }
  return xlsxModulePromise;
}

function loadJsPdf() {
  if (!jsPdfModulePromise) {
    jsPdfModulePromise = import('jspdf');
  }
  return jsPdfModulePromise;
}

function loadDocx() {
  if (!docxModulePromise) {
    docxModulePromise = import('docx');
  }
  return docxModulePromise;
}

function loadRobotoFont() {
  if (!robotoFontPromise) {
    robotoFontPromise = import('../assets/fonts/robotoRegularBase64.js');
  }
  return robotoFontPromise;
}

function buildEmployeeDayMap(shifts) {
  const map = new Map();

  shifts.forEach((shift) => {
    const key = `${shift.employeeId}__${shift.date}`;
    const value = formatShiftTime(shift.startTime, shift.endTime);

    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(value);
  });

  for (const [key, values] of map.entries()) {
    map.set(
      key,
      values.sort((a, b) => a.localeCompare(b, 'el')).join('\n'),
    );
  }

  return map;
}

function buildWeeklyHeaders(weekDays, weekdayLabels) {
  return weekDays.map((day, index) => `${weekdayLabels[index]} (${formatDateGreek(day)})`);
}

function buildWeeklyMatrix({ employees, shifts, weekDays }) {
  const dayMap = buildEmployeeDayMap(shifts);

  return employees.map((employee) => {
    const dayValues = weekDays.map((day) => dayMap.get(`${employee.id}__${day}`) || '-');
    return {
      employeeName: employee.fullName,
      dayValues,
    };
  });
}

function sanitizeFilePart(value) {
  return value.replaceAll('/', '-');
}

function createFileName(prefix, weekDays, extension) {
  const from = sanitizeFilePart(formatDateGreek(weekDays[0]));
  const to = sanitizeFilePart(formatDateGreek(weekDays[weekDays.length - 1]));
  return `${prefix}_${from}_${to}.${extension}`;
}

function buildWeekRangeLabel(weekDays) {
  return `\u03A0\u03C1\u03CC\u03B3\u03C1\u03B1\u03BC\u03BC\u03B1: ${formatDateGreek(weekDays[0])} - ${formatDateGreek(weekDays[weekDays.length - 1])}`;
}

function formatDateWithWeekday(dateValue) {
  const date = new Date(`${dateValue}T00:00:00`);
  const weekday = new Intl.DateTimeFormat('el-GR', { weekday: 'long' }).format(date);
  const formattedDate = new Intl.DateTimeFormat('el-GR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
  return `${weekday} (${formattedDate})`;
}

function formatMonthYearLabel(month, year, monthDays = []) {
  if (typeof month === 'number' && typeof year === 'number') {
    return new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
  }

  const fallbackDay = monthDays[0];
  if (fallbackDay) {
    const fallbackDate = new Date(`${fallbackDay}T00:00:00`);
    return new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' }).format(fallbackDate);
  }

  return new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' }).format(new Date());
}

function getScheduleWorkLabel(shiftList = []) {
  const workShifts = shiftList
    .filter((item) => (item.type || 'work') === 'work')
    .sort((a, b) => {
      const startDiff = (a.startTime || '').localeCompare(b.startTime || '');
      if (startDiff !== 0) return startDiff;
      return (a.endTime || '').localeCompare(b.endTime || '');
    });

  if (workShifts.length > 0) {
    return {
      schedule: workShifts.map((item) => formatShiftTime(item.startTime, item.endTime)).join(' | '),
      workRest: '\u0395\u03A1\u0393',
    };
  }

  return {
    schedule: '-',
    workRest: '\u0391\u039D',
  };
}

function buildScheduleRows({ days, employees, shifts }) {
  const shiftMap = new Map();
  (shifts || []).forEach((shift) => {
    const key = `${shift.date}__${shift.employeeId}`;
    if (!shiftMap.has(key)) {
      shiftMap.set(key, []);
    }
    shiftMap.get(key).push(shift);
  });

  const normalizedEmployees = [...(employees || [])].sort((a, b) =>
    (a.fullName || '').localeCompare(b.fullName || '', 'el'),
  );

  const rows = [];
  (days || []).forEach((day) => {
    const dateLabel = formatDateGreek(day);
    normalizedEmployees.forEach((employee) => {
      const key = `${day}__${employee.id}`;
      const dayShifts = shiftMap.get(key) || [];
      const { schedule, workRest } = getScheduleWorkLabel(dayShifts);
      rows.push({
        date: dateLabel,
        afm: employee.afm?.trim() || '-',
        fullName: employee.fullName || '\u0386\u03B3\u03BD\u03C9\u03C3\u03C4\u03BF\u03C2 \u03C5\u03C0\u03AC\u03BB\u03BB\u03B7\u03BB\u03BF\u03C2',
        schedule,
        workRest,
      });
    });
  });

  return rows;
}

function getEmployeeDayWorkShifts(shiftMap, day, employeeId) {
  return (shiftMap.get(`${day}__${employeeId}`) || [])
    .filter((item) => (item.type || 'work') === 'work')
    .sort((a, b) => {
      const startDiff = (a.startTime || '').localeCompare(b.startTime || '');
      if (startDiff !== 0) return startDiff;
      return (a.endTime || '').localeCompare(b.endTime || '');
    });
}

function isDateInRange(date, startDate, endDate) {
  return Boolean(date && startDate && endDate && date >= startDate && date <= endDate);
}

function normalizeShiftType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'morning' || normalized === 'morning_only') return 'MORNING';
  if (normalized === 'intermediate' || normalized === 'intermediate_only') return 'INTERMEDIATE';
  if (normalized === 'evening' || normalized === 'afternoon' || normalized === 'afternoon_only') return 'AFTERNOON';
  if (normalized === 'sunday' || normalized === 'sunday_12h' || normalized === 'sunday_12h_only') return 'SUNDAY_12H';
  return normalized.toUpperCase();
}

function absenceAffectsExportShift(absence, shift) {
  const scope = absence?.scope || 'FULL_DAY';
  if (scope === 'FULL_DAY') return true;
  const shiftType = normalizeShiftType(shift?.shiftType);
  if (scope === 'MORNING_ONLY') return shiftType === 'MORNING';
  if (scope === 'INTERMEDIATE_ONLY') return shiftType === 'INTERMEDIATE';
  if (scope === 'AFTERNOON_ONLY') return shiftType === 'AFTERNOON';
  if (scope === 'SUNDAY_12H_ONLY') return shiftType === 'SUNDAY_12H';
  return false;
}

function getActiveAbsenceForDay(absenceMap, day, employeeId) {
  const employeeAbsences = absenceMap.get(employeeId) || [];
  return employeeAbsences.find((absence) => isDateInRange(day, absence.startDate, absence.endDate));
}

function getAbsenceExportCode(absence) {
  if (!absence) return '';
  if (absence.type === 'LEAVE') return 'Άδεια';
  if (absence.type === 'SICK') return 'Ασθένεια';
  return 'Απουσία';
}

function buildAbsenceMap(absences = []) {
  const map = new Map();
  (absences || [])
    .filter((absence) => absence?.status !== 'CANCELLED')
    .filter((absence) => absence?.employeeId && absence?.startDate && absence?.endDate)
    .forEach((absence) => {
      if (!map.has(absence.employeeId)) {
        map.set(absence.employeeId, []);
      }
      map.get(absence.employeeId).push(absence);
    });

  for (const [employeeId, employeeAbsences] of map.entries()) {
    map.set(
      employeeId,
      employeeAbsences.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate)),
    );
  }

  return map;
}

export function buildGroupedScheduleRows({ days, employees, shifts, absences = [] }) {
  const shiftMap = new Map();
  (shifts || []).forEach((shift) => {
    const key = `${shift.date}__${shift.employeeId}`;
    if (!shiftMap.has(key)) {
      shiftMap.set(key, []);
    }
    shiftMap.get(key).push(shift);
  });

  const normalizedEmployees = [...(employees || [])].sort((a, b) =>
    (a.fullName || '').localeCompare(b.fullName || '', 'el'),
  );
  const absenceMap = buildAbsenceMap(absences);

  return (days || []).map((day) => {
    const orderedEmployees = normalizedEmployees
      .map((employee) => {
        const absence = getActiveAbsenceForDay(absenceMap, day, employee.id);
        const rawWorkShifts = getEmployeeDayWorkShifts(shiftMap, day, employee.id);
        const workShifts = absence
          ? rawWorkShifts.filter((shift) => !absenceAffectsExportShift(absence, shift))
          : rawWorkShifts;
        return {
          employee,
          absence: absence && !workShifts.length ? absence : null,
          workShifts,
          firstStart: workShifts[0]?.startTime || '',
        };
      })
      .sort((a, b) => {
        const aWorks = a.workShifts.length > 0;
        const bWorks = b.workShifts.length > 0;
        if (aWorks !== bWorks) return aWorks ? -1 : 1;
        if (aWorks && bWorks) {
          const startDiff = a.firstStart.localeCompare(b.firstStart);
          if (startDiff !== 0) return startDiff;
        }
        return (a.employee.fullName || '').localeCompare(b.employee.fullName || '', 'el');
      });

    return {
      date: formatDateGreek(day),
      afm: orderedEmployees.map(({ employee }) => employee.afm?.trim() || '-').join('\n'),
      fullName: orderedEmployees
        .map(({ employee }) => employee.fullName || 'Άγνωστος υπάλληλος')
        .join('\n'),
      schedule: orderedEmployees
        .map(({ workShifts }) =>
          workShifts.length
            ? workShifts.map((item) => formatShiftTime(item.startTime, item.endTime)).join(' | ')
            : '-',
        )
        .join('\n'),
      workRest: orderedEmployees
        .map(({ absence, workShifts }) => {
          if (workShifts.length) return 'ΕΡΓ';
          return getAbsenceExportCode(absence) || 'ΑΝ';
        })
        .join('\n'),
    };
  });
}

function drawPdfTable({
  doc,
  startX,
  startY,
  pageWidth,
  pageHeight,
  margin,
  rows,
}) {
  const columnDefs = PDF_SCHEDULE_COLUMNS;

  const tableWidth = pageWidth - margin * 2;
  const columnWidths = columnDefs.map((column) => tableWidth * column.widthRatio);
  const lineHeight = 12;
  const minRowHeight = 22;
  const cellPaddingX = 6;
  const cellPaddingY = 5;
  const headerHeight = 24;

  const drawHeader = (y) => {
    doc.setFont('Roboto-Regular', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(248, 250, 252);
    doc.setDrawColor(30, 41, 59);

    let x = startX;
    columnDefs.forEach((column, index) => {
      const width = columnWidths[index];
      doc.setFillColor(30, 41, 59);
      doc.rect(x, y, width, headerHeight, 'FD');
      doc.text(String(column.title), x + cellPaddingX, y + 15);
      x += width;
    });
  };

  let cursorY = startY;
  drawHeader(cursorY);
  cursorY += headerHeight;

  doc.setFontSize(10.5);
  doc.setTextColor(30, 41, 59);

  rows.forEach((row) => {
    const cellLines = columnDefs.map((column, index) =>
      doc.splitTextToSize(String(row[column.key] || ''), columnWidths[index] - cellPaddingX * 2),
    );

    const maxLines = Math.max(...cellLines.map((lines) => lines.length), 1);
    const rowHeight = Math.max(minRowHeight, maxLines * lineHeight + cellPaddingY * 2);

    if (cursorY + rowHeight > pageHeight - margin) {
      doc.addPage('a4', 'landscape');
      cursorY = margin;
      drawHeader(cursorY);
      cursorY += headerHeight;
      doc.setFontSize(10.5);
      doc.setTextColor(30, 41, 59);
    }

    let x = startX;
    cellLines.forEach((lines, index) => {
      const width = columnWidths[index];
      doc.rect(x, cursorY, width, rowHeight);
      doc.text(lines, x + cellPaddingX, cursorY + cellPaddingY + 9);
      x += width;
    });

    cursorY += rowHeight;
  });
}

function buildPdfFileName({ mode, days, month, year }) {
  if (mode === 'month') {
    const resolvedYear =
      typeof year === 'number' ? year : days[0] ? Number(days[0].slice(0, 4)) : new Date().getFullYear();
    const resolvedMonth =
      typeof month === 'number' ? String(month + 1).padStart(2, '0') : days[0] ? days[0].slice(5, 7) : '01';
    return `program_month_${resolvedYear}-${resolvedMonth}.pdf`;
  }

  return createFileName('program_week_pdf', days, 'pdf');
}

function buildPdfTitle({ mode, days, month, year }) {
  if (mode === 'month') {
    return `\u03A0\u03C1\u03CC\u03B3\u03C1\u03B1\u03BC\u03BC\u03B1 \u039C\u03AE\u03BD\u03B1: ${formatMonthYearLabel(month, year, days)}`;
  }
  return `\u03A0\u03C1\u03CC\u03B3\u03C1\u03B1\u03BC\u03BC\u03B1 \u0395\u03B2\u03B4\u03BF\u03BC\u03AC\u03B4\u03B1\u03C2: ${formatDateGreek(days[0])} - ${formatDateGreek(days[days.length - 1])}`;
}

function buildPdfSubtitle(days) {
  return `\u03A3\u03CD\u03BD\u03BF\u03BB\u03BF \u03B7\u03BC\u03B5\u03C1\u03CE\u03BD: ${days.length}`;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function setupGreekFont(doc) {
  const { ROBOTO_REGULAR_BASE64 } = await loadRobotoFont();
  if (!ROBOTO_REGULAR_BASE64) return;
  doc.addFileToVFS('Roboto-Regular.ttf', ROBOTO_REGULAR_BASE64);
  doc.addFont('Roboto-Regular.ttf', 'Roboto-Regular', 'normal');
  doc.setFont('Roboto-Regular', 'normal');
}

export async function exportScheduleToPdf({
  mode = 'week',
  days = [],
  weekDays = [],
  employees = [],
  shifts = [],
  absences = [],
  month,
  year,
} = {}) {
  const targetDays = Array.isArray(days) && days.length ? days : weekDays;

  if (!targetDays.length) {
    throw new Error('\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B1\u03BD \u03B7\u03BC\u03AD\u03C1\u03B5\u03C2 \u03B3\u03B9\u03B1 \u03B5\u03BE\u03B1\u03B3\u03C9\u03B3\u03AE PDF.');
  }
  if (!employees.length) {
    throw new Error('\u0394\u03B5\u03BD \u03B2\u03C1\u03AD\u03B8\u03B7\u03BA\u03B1\u03BD \u03C5\u03C0\u03AC\u03BB\u03BB\u03B7\u03BB\u03BF\u03B9 \u03B3\u03B9\u03B1 \u03B5\u03BE\u03B1\u03B3\u03C9\u03B3\u03AE PDF.');
  }

  const rows = buildGroupedScheduleRows({ days: targetDays, employees, shifts, absences });
  const { default: jsPDFCtor } = await loadJsPdf();
  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  await setupGreekFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 28;

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.text(buildPdfTitle({ mode, days: targetDays, month, year }), margin, margin);
  doc.setFontSize(10);
  doc.text(buildPdfSubtitle(targetDays), margin, margin + 16);

  drawPdfTable({
    doc,
    startX: margin,
    startY: margin + 28,
    pageWidth,
    pageHeight,
    margin,
    rows,
  });

  doc.save(buildPdfFileName({ mode, days: targetDays, month, year }));
}

export async function exportScheduleToExcel({ weekDays, weekdayLabels, shifts, employees }) {
  const XLSX = await loadXlsx();
  const headers = buildWeeklyHeaders(weekDays, weekdayLabels);
  const matrix = buildWeeklyMatrix({ employees, shifts, weekDays });
  const weekRangeLabel = buildWeekRangeLabel(weekDays);

  const rows = matrix.map((row) => {
    const entry = { Employee: row.employeeName };
    headers.forEach((header, index) => {
      entry[header] = row.dayValues[index];
    });
    return entry;
  });

  const worksheet = XLSX.utils.json_to_sheet([]);
  XLSX.utils.sheet_add_aoa(worksheet, [[weekRangeLabel], []], { origin: 'A1' });
  XLSX.utils.sheet_add_json(worksheet, rows, { origin: 'A3' });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Πρόγραμμα');
  XLSX.writeFile(workbook, createFileName('program_excel', weekDays, 'xlsx'), { compression: true });
}

export async function exportScheduleToWord({ weekDays, weekdayLabels, shifts, employees }) {
  const { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType } = await loadDocx();
  const headers = buildWeeklyHeaders(weekDays, weekdayLabels);
  const matrix = buildWeeklyMatrix({ employees, shifts, weekDays });

  const headerRow = new TableRow({
    children: [
      new TableCell({
        width: { size: 18, type: WidthType.PERCENTAGE },
        children: [new Paragraph('Υπάλληλος')],
      }),
      ...headers.map(
        (header) =>
          new TableCell({
            width: { size: 11, type: WidthType.PERCENTAGE },
            children: [new Paragraph(header)],
          }),
      ),
    ],
  });

  const bodyRows = matrix.map(
    (row) =>
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph(row.employeeName)] }),
          ...row.dayValues.map((value) => new TableCell({ children: [new Paragraph(value)] })),
        ],
      }),
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: buildWeekRangeLabel(weekDays),
          }),
          new Paragraph(''),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...bodyRows],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, createFileName('program_word', weekDays, 'docx'));
}
