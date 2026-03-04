import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType } from 'docx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { ROBOTO_REGULAR_BASE64 } from '../assets/fonts/robotoRegularBase64';
import { formatDateGreek } from './time';

function buildEmployeeDayMap(shifts) {
  const map = new Map();

  shifts.forEach((shift) => {
    const key = `${shift.employeeId}__${shift.date}`;
    const value = `${shift.startTime}-${shift.endTime}`;

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

function registerGreekFont(doc) {
  const base64 = ROBOTO_REGULAR_BASE64?.trim();

  // UTF-8/ελληνικά: χρειαζόμαστε custom font, γιατί τα built-in fonts της jsPDF δεν αρκούν.
  if (base64) {
    doc.addFileToVFS('Roboto-Regular.ttf', base64);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.setFont('Roboto');
    return true;
  }

  doc.setFont('helvetica', 'normal');
  return false;
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

export function exportScheduleToPdf({ weekDays, weekdayLabels, shifts, employees }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const hasGreekFont = registerGreekFont(doc);

  const headers = buildWeeklyHeaders(weekDays, weekdayLabels);
  const matrix = buildWeeklyMatrix({ employees, shifts, weekDays });

  doc.setFontSize(14);
  doc.text(`Πρόγραμμα εβδομάδας ${formatDateGreek(weekDays[0])} - ${formatDateGreek(weekDays[6])}`, 40, 40);

  autoTable(doc, {
    startY: 60,
    head: [['Υπάλληλος', ...headers]],
    body: matrix.map((row) => [row.employeeName, ...row.dayValues]),
    styles: {
      font: hasGreekFont ? 'Roboto' : 'helvetica',
      fontSize: 9,
      cellPadding: 6,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      font: hasGreekFont ? 'Roboto' : 'helvetica',
    },
  });

  if (!hasGreekFont) {
    doc.setFontSize(9);
    doc.text('Προσοχή: πρόσθεσε custom TTF base64 για σωστή εμφάνιση ελληνικών.', 40, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(createFileName('program_pdf', weekDays, 'pdf'));
}

export function exportScheduleToExcel({ weekDays, weekdayLabels, shifts, employees }) {
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
