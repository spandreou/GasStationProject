import {
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
  ensureFirestoreReady,
  tenantCollection,
  tenantDoc,
  timestampedPayload,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';
import { TENANT_SCOPED_COLLECTIONS } from '../utils/tenantDataPaths';

export function subscribeEmployeeAbsences({ tenantId }, onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const absencesQuery = query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.absences), orderBy('startDate', 'asc'));
  return onSnapshot(
    absencesQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export function subscribePublicEmployeeAbsences(_options, onData) {
  onData?.([]);
  return createLocalUnsubscribe();
}

export async function createEmployeeAbsence({ tenantId, ...payload }) {
  ensureFirestoreReady();
  const privateRef = doc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.absences));
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

export async function updateEmployeeAbsence(absenceId, patch, { tenantId } = {}) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => {
    const batch = writeBatch(db);
    batch.update(
      tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.absences, absenceId),
      timestampedPayload({ ...patch }, serverTimestamp, { includeCreatedAt: false }),
    );
    return batch.commit();
  });
}

export async function cancelEmployeeAbsence(absenceId, { tenantId } = {}) {
  return updateEmployeeAbsence(absenceId, { status: 'CANCELLED' }, { tenantId });
}

export async function removeEmployeeAbsence(absenceId, { tenantId } = {}) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => {
    const batch = writeBatch(db);
    batch.delete(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.absences, absenceId));
    return batch.commit();
  });
}
