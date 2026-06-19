import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../firebase/config';
import { isActiveTenantAdminMembership } from '../../services/tenantAuthorization';

const MEMBERSHIPS_COLLECTION = 'tenantMemberships';

function assertConfigured() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Το Firebase δεν είναι ρυθμισμένο για φόρτωση memberships.');
  }
}

function fromMembershipDoc(snapshot) {
  if (!snapshot.exists()) return null;
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

function createMembershipId(uid, tenantId) {
  return `${uid}_${tenantId}`;
}

async function getMembership(uid, tenantId) {
  if (!uid || !tenantId) return null;
  assertConfigured();
  return fromMembershipDoc(await getDoc(doc(db, MEMBERSHIPS_COLLECTION, createMembershipId(uid, tenantId))));
}

async function listActiveMembershipsForUser(uid) {
  if (!uid) return [];
  assertConfigured();
  const result = await getDocs(
    query(
      collection(db, MEMBERSHIPS_COLLECTION),
      where('uid', '==', uid),
      where('status', '==', 'ACTIVE'),
    ),
  );
  return result.docs
    .map(fromMembershipDoc)
    .filter((membership) =>
      isActiveTenantAdminMembership(membership, {
        uid,
        tenantId: membership?.tenantId,
      }),
    );
}

async function getActiveAdminMembership(uid, tenantId) {
  const membership = await getMembership(uid, tenantId);
  return isActiveTenantAdminMembership(membership, { uid, tenantId }) ? membership : null;
}

async function hasActiveMembership(uid, tenantId) {
  return Boolean(await getActiveAdminMembership(uid, tenantId));
}

export const firebaseTenantMembershipsRepository = {
  createMembershipId,
  getActiveAdminMembership,
  getMembership,
  hasActiveMembership,
  listActiveMembershipsForUser,
};
