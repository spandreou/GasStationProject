import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../firebase/config';

const TENANTS_COLLECTION = 'tenants';

function assertConfigured() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Το Firebase δεν είναι ρυθμισμένο για φόρτωση tenant.');
  }
}

function fromTenantDoc(snapshot) {
  if (!snapshot.exists()) return null;
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

async function getTenantById(tenantId) {
  if (!tenantId) return null;
  assertConfigured();
  return fromTenantDoc(await getDoc(doc(db, TENANTS_COLLECTION, tenantId)));
}

async function getTenantBySlug(slug) {
  if (!slug) return null;
  assertConfigured();
  const result = await getDocs(
    query(collection(db, TENANTS_COLLECTION), where('slug', '==', slug), limit(1)),
  );
  return result.empty ? null : fromTenantDoc(result.docs[0]);
}

async function getTenantByDomain(domain) {
  if (!domain) return null;
  assertConfigured();
  const result = await getDocs(
    query(collection(db, TENANTS_COLLECTION), where('domain', '==', domain), limit(1)),
  );
  return result.empty ? null : fromTenantDoc(result.docs[0]);
}

export const firebaseTenantsRepository = {
  getTenantById,
  getTenantBySlug,
  getTenantByDomain,
};
