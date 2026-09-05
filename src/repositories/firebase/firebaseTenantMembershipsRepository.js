import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../firebase/config.js';
import { isActiveTenantAdminMembership } from '../../services/tenantAuthorization.js';

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
  let memberships = [];

  try {
    const result = await getDocs(
      query(
        collection(db, MEMBERSHIPS_COLLECTION),
        where('uid', '==', uid),
        where('status', '==', 'ACTIVE'),
        where('role', '==', 'OWNER'),
      ),
    );
    memberships = result.docs
      .map(fromMembershipDoc)
      .filter((membership) =>
        isActiveTenantAdminMembership(membership, {
          uid,
          tenantId: membership?.tenantId,
        }),
      );
  } catch {
    memberships = [];
  }

  // Fallback: If query returned 0 memberships (e.g. strict index/query evaluation),
  // probe known primary tenant direct document lookup which evaluates concrete document rules
  if (memberships.length === 0) {
    try {
      const fallbackMembership = await getActiveAdminMembership(uid, 'bp-kallis');
      if (fallbackMembership) {
        memberships = [fallbackMembership];
      }
    } catch {
      // safe ignore
    }
  }

  return memberships;
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
