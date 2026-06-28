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

export function subscribePublicEmployeeAbsences(onData) {
  onData?.([]);
  return createLocalUnsubscribe();
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
