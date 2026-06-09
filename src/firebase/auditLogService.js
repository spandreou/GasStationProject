import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import {
  AUDIT_LOGS_COLLECTION,
  ensureFirestoreReady,
  withFirestoreWrite,
} from './firestoreCore';

export async function writeAuditLog({
  action,
  actor = {},
  target = {},
  before = null,
  after = null,
  metadata = {},
  generationRunId = '',
}) {
  ensureFirestoreReady();
  if (!action) return null;

  const safeActor = actor && typeof actor === 'object' ? actor : {};
  const safeTarget = target && typeof target === 'object' ? target : {};
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};

  const docRef = await withFirestoreWrite(() =>
    addDoc(collection(db, AUDIT_LOGS_COLLECTION), {
      action,
      actor: {
        uid: safeActor.uid || '',
        email: safeActor.email || '',
      },
      target: {
        collection: safeTarget.collection || '',
        id: safeTarget.id || '',
        scope: safeTarget.scope || '',
      },
      before,
      after,
      metadata: safeMetadata,
      generationRunId: generationRunId || '',
      createdAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id };
}
