import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './config';
import {
  commitBatchChunks,
  createLocalUnsubscribe,
  ensureFirestoreReady,
  PUBLISHED_SCHEDULES_COLLECTION,
  withFirestoreWrite,
} from './firestoreCore';

function sanitizePublishedShift(shift, employeeById) {
  const employeeName = employeeById.get(shift?.employeeId)?.fullName || shift?.employeeName || '';
  return {
    id: shift?.id || `${shift?.date || ''}_${shift?.employeeId || ''}_${shift?.startTime || ''}`,
    employeeId: shift?.employeeId || '',
    employeeName,
    date: shift?.date || '',
    startTime: shift?.startTime || '',
    endTime: shift?.endTime || '',
    type: shift?.type || 'work',
    label: shift?.label || shift?.customLabel || '',
    shiftType: shift?.shiftType || '',
  };
}

function sanitizePublishedSchedule({ weekStart, weekDays, shifts = [], employees = [] }) {
  const days = Array.isArray(weekDays) && weekDays.length ? weekDays : [];
  const weekDaySet = new Set(days);
  const employeeById = new Map((employees || []).map((employee) => [employee.id, employee]));
  const publicShifts = (shifts || [])
    .filter((shift) => shift?.date && (!weekDaySet.size || weekDaySet.has(shift.date)))
    .map((shift) => sanitizePublishedShift(shift, employeeById))
    .sort((a, b) => `${a.date}_${a.startTime}_${a.employeeName}`.localeCompare(`${b.date}_${b.startTime}_${b.employeeName}`, 'el'));

  return {
    weekStart,
    weekEnd: days[6] || weekStart,
    shiftCount: publicShifts.length,
    shifts: publicShifts,
  };
}

export function subscribePublishedSchedule(weekStart, onData, onError) {
  if (!db || !weekStart) {
    onData?.(null);
    return createLocalUnsubscribe();
  }

  return onSnapshot(
    doc(db, PUBLISHED_SCHEDULES_COLLECTION, weekStart),
    (snapshot) => {
      onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    onError,
  );
}

export async function publishWeekSchedule({ weekStart, weekDays, shifts = [], employees = [] }) {
  ensureFirestoreReady();
  if (!weekStart) throw new Error('Λείπει εβδομάδα για δημοσίευση προγράμματος.');

  const payload = sanitizePublishedSchedule({ weekStart, weekDays, shifts, employees });
  await withFirestoreWrite(() =>
    setDoc(doc(db, PUBLISHED_SCHEDULES_COLLECTION, weekStart), {
      ...payload,
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return payload;
}

export async function deletePublishedSchedulesByWeekStarts(weekStarts = []) {
  ensureFirestoreReady();
  const uniqueWeekStarts = [...new Set(weekStarts || [])].filter(Boolean);
  if (!uniqueWeekStarts.length) return 0;

  await commitBatchChunks(uniqueWeekStarts, (batch, weekStart) => {
    batch.delete(doc(db, PUBLISHED_SCHEDULES_COLLECTION, weekStart));
  });

  return uniqueWeekStarts.length;
}
