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
  EMPLOYEES_COLLECTION,
  ensureFirestoreReady,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';

export function subscribeEmployees(onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const employeesQuery = query(collection(db, EMPLOYEES_COLLECTION), orderBy('fullName', 'asc'));
  return onSnapshot(
    employeesQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export async function createEmployee(payload) {
  ensureFirestoreReady();

  const docRef = await withFirestoreWrite(() =>
    addDoc(collection(db, EMPLOYEES_COLLECTION), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function updateEmployee(employeeId, payload) {
  ensureFirestoreReady();

  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  await withFirestoreWrite(() =>
    updateDoc(employeeDoc, { ...payload, updatedAt: serverTimestamp() }),
  );
}

export async function removeEmployee(employeeId) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => deleteDoc(doc(db, EMPLOYEES_COLLECTION, employeeId)));
}
