import {
  doc,
  getDoc,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../firebase/config';
import {
  getTenantScopedDocumentPath,
  TENANT_SCOPED_COLLECTIONS,
} from '../../utils/tenantDataPaths';

const DEFAULT_SUBSCRIPTION_DOC = 'current';

function assertConfigured() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Το Firebase δεν είναι ρυθμισμένο για φόρτωση subscription.');
  }
}

function fromSubscriptionDoc(snapshot) {
  if (!snapshot.exists()) return null;
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

async function getTenantSubscription(tenantId, subscriptionId = DEFAULT_SUBSCRIPTION_DOC) {
  assertConfigured();
  const path = getTenantScopedDocumentPath(
    tenantId,
    TENANT_SCOPED_COLLECTIONS.subscription,
    subscriptionId,
  );
  return fromSubscriptionDoc(await getDoc(doc(db, path)));
}

export const firebaseTenantSubscriptionRepository = {
  getTenantSubscription,
};
