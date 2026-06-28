import {
  addDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './config';
import {
  createLocalUnsubscribe,
  ensureFirestoreReady,
  tenantCollection,
  tenantDoc,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';
import { TENANT_SCOPED_COLLECTIONS } from '../utils/tenantDataPaths';

export function subscribeEmployees({ tenantId }, onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const employeesQuery = query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.employees), orderBy('fullName', 'asc'));
  return onSnapshot(
    employeesQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export async function createEmployee({ tenantId, ...payload }) {
  ensureFirestoreReady();

  const docRef = await withFirestoreWrite(() =>
    addDoc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.employees), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function updateEmployee(employeeId, payload, { tenantId } = {}) {
  ensureFirestoreReady();

  const employeeDoc = tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.employees, employeeId);
  await withFirestoreWrite(() =>
    updateDoc(employeeDoc, { ...payload, updatedAt: serverTimestamp() }),
  );
}

export async function removeEmployee(employeeId, { tenantId } = {}) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => deleteDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.employees, employeeId)));
}
