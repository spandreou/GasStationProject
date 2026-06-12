import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './config';
import {
  createLocalUnsubscribe,
  EMPLOYEE_ABSENCES_COLLECTION,
  EMPLOYEE_ABSENCES_PUBLIC_COLLECTION,
  ensureFirestoreReady,
  timestampedPayload,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';

const ABSENCE_TYPE_LABELS = {
  LEAVE: 'Άδεια',
  SICK: 'Ασθένεια',
  OTHER: 'Άλλη απουσία',
};

function countInclusiveDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function publicAbsenceFromPrivate(absence, id) {
  const startDate = absence.startDate || '';
  const endDate = absence.endDate || startDate;
  const payload = {
    id,
    employeeName: absence.employeeName || '',
    typeLabel: ABSENCE_TYPE_LABELS[absence.type] || ABSENCE_TYPE_LABELS.OTHER,
    startDate,
    endDate,
    totalDays: countInclusiveDays(startDate, endDate),
    status: absence.status || 'ACTIVE',
  };

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function publicAbsencePatchFromPrivatePatch(patch, id) {
  const payload = { id };
  if ('employeeName' in patch) payload.employeeName = patch.employeeName || '';
  if ('type' in patch) payload.typeLabel = ABSENCE_TYPE_LABELS[patch.type] || ABSENCE_TYPE_LABELS.OTHER;
  if ('startDate' in patch) payload.startDate = patch.startDate || '';
  if ('endDate' in patch) payload.endDate = patch.endDate || patch.startDate || '';
  if ('status' in patch) payload.status = patch.status || 'ACTIVE';
  if ('startDate' in patch || 'endDate' in patch) {
    const startDate = patch.startDate || '';
    const endDate = patch.endDate || startDate;
    payload.totalDays = countInclusiveDays(startDate, endDate);
  }
  return payload;
}

export function subscribeEmployeeAbsences(onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const absencesQuery = query(collection(db, EMPLOYEE_ABSENCES_COLLECTION), orderBy('startDate', 'asc'));
  return onSnapshot(
    absencesQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export function subscribePublicEmployeeAbsences(onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const absencesQuery = query(collection(db, EMPLOYEE_ABSENCES_PUBLIC_COLLECTION), orderBy('startDate', 'asc'));
  return onSnapshot(
    absencesQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export async function createEmployeeAbsence(payload) {
  ensureFirestoreReady();
  const privateRef = doc(collection(db, EMPLOYEE_ABSENCES_COLLECTION));
  const privatePayload = {
    ...payload,
    status: payload.status || 'ACTIVE',
    scope: payload.scope || 'FULL_DAY',
  };

  await withFirestoreWrite(() => {
    const batch = writeBatch(db);
    batch.set(privateRef, timestampedPayload(privatePayload, serverTimestamp));
    batch.set(
      doc(db, EMPLOYEE_ABSENCES_PUBLIC_COLLECTION, privateRef.id),
      publicAbsenceFromPrivate(privatePayload, privateRef.id),
    );
    return batch.commit();
  });

  return { id: privateRef.id, ...privatePayload };
}

export async function updateEmployeeAbsence(absenceId, patch) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => {
    const batch = writeBatch(db);
    batch.update(
      doc(db, EMPLOYEE_ABSENCES_COLLECTION, absenceId),
      timestampedPayload({ ...patch }, serverTimestamp, { includeCreatedAt: false }),
    );
    batch.set(
      doc(db, EMPLOYEE_ABSENCES_PUBLIC_COLLECTION, absenceId),
      publicAbsencePatchFromPrivatePatch(patch, absenceId),
      { merge: true },
    );
    return batch.commit();
  });
}

export async function cancelEmployeeAbsence(absenceId) {
  return updateEmployeeAbsence(absenceId, { status: 'CANCELLED' });
}

export async function removeEmployeeAbsence(absenceId) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => {
    const batch = writeBatch(db);
    batch.delete(doc(db, EMPLOYEE_ABSENCES_COLLECTION, absenceId));
    batch.delete(doc(db, EMPLOYEE_ABSENCES_PUBLIC_COLLECTION, absenceId));
    return batch.commit();
  });
}
