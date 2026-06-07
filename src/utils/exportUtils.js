import { Document, Packer, Paragraph, Table, TableCell, TableRow, WidthType } from 'docx';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from '@e965/xlsx';
import { formatDateGreek, formatShiftTime } from './time.js';

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

export async function exportScheduleToPdf({ weekDays, gridSelector = '#weekly-grid-export' }) {
  const gridElement = document.querySelector(gridSelector);
  if (!gridElement) {
    throw new Error(`WeeklyGrid container was not found: ${gridSelector}`);
  }

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const canvas = await html2canvas(gridElement, {
    scale: Math.max(2, window.devicePixelRatio || 1),
    useCORS: true,
    backgroundColor: null,
  });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
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
