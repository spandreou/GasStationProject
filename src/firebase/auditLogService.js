import { addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import {
  ensureFirestoreReady,
  tenantCollection,
  withFirestoreWrite,
} from './firestoreCore';
import { TENANT_SCOPED_COLLECTIONS } from '../utils/tenantDataPaths';

export async function writeAuditLog({
  tenantId,
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
    addDoc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.auditLogs), {
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
