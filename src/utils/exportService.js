import { calculatePayrollSummary, getShiftTypeLabel } from './analytics';
import { formatDateGreek, formatShiftTime } from './time';

let xlsxModulePromise;
let jsPdfModulePromise;
let html2CanvasModulePromise;
let docxModulePromise;
let robotoFontPromise;

function loadXlsx() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx');
  }
  return xlsxModulePromise;
}

function loadJsPdf() {
  if (!jsPdfModulePromise) {
    jsPdfModulePromise = import('jspdf');
  }
  return jsPdfModulePromise;
}

function loadHtml2Canvas() {
  if (!html2CanvasModulePromise) {
    html2CanvasModulePromise = import('html2canvas');
  }
  return html2CanvasModulePromise;
}

function loadDocx() {
  if (!docxModulePromise) {
    docxModulePromise = import('docx');
  }
  return docxModulePromise;
}

function loadRobotoFont() {
  if (!robotoFontPromise) {
    robotoFontPromise = import('../assets/fonts/robotoRegularBase64');
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

export async function exportScheduleToPdf({ weekDays, gridSelector = '#weekly-grid-export' }) {
  const gridElement = document.querySelector(gridSelector);
  if (!gridElement) {
    throw new Error(`WeeklyGrid container was not found: ${gridSelector}`);
  }

  const [{ default: html2canvas }, { default: jsPDFCtor }] = await Promise.all([loadHtml2Canvas(), loadJsPdf()]);

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const canvas = await html2canvas(gridElement, {
    scale: Math.max(2, window.devicePixelRatio || 1),
    useCORS: true,
    backgroundColor: null,
  });

  const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;

  let imageWidth = availableWidth;
  let imageHeight = (canvas.height * imageWidth) / canvas.width;

  if (imageHeight > availableHeight) {
    imageHeight = availableHeight;
    imageWidth = (canvas.width * imageHeight) / canvas.height;
  }

  const x = (pageWidth - imageWidth) / 2;
  const y = (pageHeight - imageHeight) / 2;

  doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, imageWidth, imageHeight, undefined, 'FAST');
  doc.save(createFileName('program_pdf', weekDays, 'pdf'));
}

export async function exportScheduleToExcel({ weekDays, weekdayLabels, shifts, employees }) {
  const XLSX = await loadXlsx();
  const headers = buildWeeklyHeaders(weekDays, weekdayLabels);
  const matrix = buildWeeklyMatrix({ employees, shifts, weekDays });

  const rows = matrix.map((row) => {
    const entry = { Υπάλληλος: row.employeeName };
    headers.forEach((header, index) => {
      entry[header] = row.dayValues[index];
    });
    return entry;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
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
            text: `Πρόγραμμα εβδομάδας ${formatDateGreek(weekDays[0])} - ${formatDateGreek(weekDays[6])}`,
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

export async function exportPayrollReportToExcel({ employeeName, yearMonth, historyRows }) {
  const XLSX = await loadXlsx();
  const summary = calculatePayrollSummary(historyRows);

  const detailRows = historyRows.map((item) => ({
    Ημερομηνία: item.date,
    Τύπος: getShiftTypeLabel(item.type),
    Ώρες: item.totalHours || 0,
    Σχόλια: item.notes || '',
  }));

  const summaryRows = [
    { Μετρική: 'Σύνολο Ωρών Εργασίας', Τιμή: summary.totalWorkHours },
    { Μετρική: 'Σύνολο Ημερών Αδείας', Τιμή: summary.totalLeaveDays },
    { Μετρική: 'Σύνολο Ρεπό', Τιμή: summary.totalRestDays },
    { Μετρική: 'Σύνολο Ημερών Ασθενείας', Τιμή: summary.totalSickDays },
  ];

  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  const detailSheet = XLSX.utils.json_to_sheet(detailRows);

  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Payroll Summary');
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Attendance Detail');

  const safeMonth = yearMonth.replace('-', '_');
  const safeEmployee = (employeeName || 'all').replaceAll(' ', '_');
  XLSX.writeFile(workbook, `payroll_report_${safeEmployee}_${safeMonth}.xlsx`, { compression: true });
}

export async function exportPayrollReportToPdf({ employeeName, yearMonth, historyRows }) {
  const { default: jsPDFCtor } = await loadJsPdf();
  const summary = calculatePayrollSummary(historyRows);
  const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  await setupGreekFont(doc);

  let y = 50;
  doc.setFontSize(15);
  doc.text('Payroll Report', 40, y);
  y += 24;

  doc.setFontSize(11);
  doc.text(`Υπάλληλος: ${employeeName || 'Όλοι'}`, 40, y);
  y += 18;
  doc.text(`Μήνας: ${yearMonth}`, 40, y);
  y += 24;

  doc.setFontSize(12);
  doc.text(`Σύνολο Ωρών Εργασίας: ${summary.totalWorkHours}`, 40, y);
  y += 18;
  doc.text(`Σύνολο Ημερών Αδείας: ${summary.totalLeaveDays}`, 40, y);
  y += 18;
  doc.text(`Σύνολο Ρεπό: ${summary.totalRestDays}`, 40, y);
  y += 18;
  doc.text(`Σύνολο Ημερών Ασθενείας: ${summary.totalSickDays}`, 40, y);
  y += 24;

  doc.setFontSize(10);
  doc.text('Ημερομηνία | Τύπος | Ώρες | Σχόλια', 40, y);
  y += 14;

  historyRows.forEach((row) => {
    const line = `${row.date} | ${getShiftTypeLabel(row.type)} | ${row.totalHours || 0} | ${row.notes || '-'}`;
    if (y > 790) {
      doc.addPage();
      y = 50;
    }
    doc.text(line, 40, y);
    y += 14;
  });

  const safeMonth = yearMonth.replace('-', '_');
  const safeEmployee = (employeeName || 'all').replaceAll(' ', '_');
  doc.save(`payroll_report_${safeEmployee}_${safeMonth}.pdf`);
}
