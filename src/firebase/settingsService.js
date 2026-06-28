import { onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './config';
import {
  createLocalUnsubscribe,
  ensureFirestoreReady,
  tenantDoc,
  withFirestoreWrite,
} from './firestoreCore';
import { TENANT_SCOPED_COLLECTIONS } from '../utils/tenantDataPaths';

const TENANT_SCHEDULER_SETTINGS_DOC = 'scheduler';

export function subscribeSchedulerSettings({ tenantId }, onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const settingsDoc = tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.settings, TENANT_SCHEDULER_SETTINGS_DOC);
  return onSnapshot(
    settingsDoc,
    (snapshot) => {
      onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    onError,
  );
}

export async function upsertSchedulerSettings({ tenantId, ...payload } = {}) {
  ensureFirestoreReady();

  const settingsDoc = tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.settings, TENANT_SCHEDULER_SETTINGS_DOC);
  await withFirestoreWrite(() =>
    setDoc(
      settingsDoc,
      {
        ...payload,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
  );
}
