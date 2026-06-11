import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './config';
import {
  createLocalUnsubscribe,
  EMPLOYEE_ABSENCES_COLLECTION,
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

export async function createEmployeeAbsence(payload) {
  ensureFirestoreReady();

  const docRef = await withFirestoreWrite(() =>
    addDoc(
      collection(db, EMPLOYEE_ABSENCES_COLLECTION),
      timestampedPayload(
        {
          ...payload,
          status: payload.status || 'ACTIVE',
          scope: payload.scope || 'FULL_DAY',
        },
        serverTimestamp,
      ),
    ),
  );

  return { id: docRef.id, ...payload };
}

export async function updateEmployeeAbsence(absenceId, patch) {
  ensureFirestoreReady();
  await withFirestoreWrite(() =>
    updateDoc(
      doc(db, EMPLOYEE_ABSENCES_COLLECTION, absenceId),
      timestampedPayload(
        {
          ...patch,
        },
        serverTimestamp,
        { includeCreatedAt: false },
      ),
    ),
  );
}

export async function cancelEmployeeAbsence(absenceId) {
  return updateEmployeeAbsence(absenceId, { status: 'CANCELLED' });
}

export async function removeEmployeeAbsence(absenceId) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => deleteDoc(doc(db, EMPLOYEE_ABSENCES_COLLECTION, absenceId)));
}
