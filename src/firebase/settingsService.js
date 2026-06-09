import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './config';
import {
  createLocalUnsubscribe,
  DEFAULT_SCHEDULER_SETTINGS_DOC,
  ensureFirestoreReady,
  SCHEDULER_SETTINGS_COLLECTION,
  withFirestoreWrite,
} from './firestoreCore';

export function subscribeSchedulerSettings(onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const settingsDoc = doc(db, SCHEDULER_SETTINGS_COLLECTION, DEFAULT_SCHEDULER_SETTINGS_DOC);
  return onSnapshot(
    settingsDoc,
    (snapshot) => {
      onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    onError,
  );
}

export async function upsertSchedulerSettings(payload = {}) {
  ensureFirestoreReady();

  const settingsDoc = doc(db, SCHEDULER_SETTINGS_COLLECTION, DEFAULT_SCHEDULER_SETTINGS_DOC);
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
