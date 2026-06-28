import {
  addDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
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

export function subscribeAnnouncements({ tenantId }, onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const announcementsQuery = query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.announcements), orderBy('createdAt', 'desc'));
  return onSnapshot(
    announcementsQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export async function createAnnouncement({ tenantId, ...payload }) {
  ensureFirestoreReady();

  const docRef = await withFirestoreWrite(() =>
    addDoc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.announcements), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function removeAnnouncement(announcementId, { tenantId } = {}) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => deleteDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.announcements, announcementId)));
}
