import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import {
  ANNOUNCEMENTS_COLLECTION,
  createLocalUnsubscribe,
  ensureFirestoreReady,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';

export function subscribeAnnouncements(onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const announcementsQuery = query(collection(db, ANNOUNCEMENTS_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    announcementsQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export async function createAnnouncement(payload) {
  ensureFirestoreReady();

  const docRef = await withFirestoreWrite(() =>
    addDoc(collection(db, ANNOUNCEMENTS_COLLECTION), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function removeAnnouncement(announcementId) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => deleteDoc(doc(db, ANNOUNCEMENTS_COLLECTION, announcementId)));
}
