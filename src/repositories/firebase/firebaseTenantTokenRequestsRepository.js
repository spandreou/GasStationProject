import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../firebase/config';
import {
  getTenantScopedCollectionPath,
  TENANT_SCOPED_COLLECTIONS,
} from '../../utils/tenantDataPaths';

const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 120;
const MAX_NOTE_LENGTH = 1000;

function assertConfigured() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Το Firebase δεν είναι ρυθμισμένο για φόρτωση token requests.');
  }
}

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return normalizeText(value, MAX_EMAIL_LENGTH).toLowerCase();
}

function toCollectionRef(tenantId) {
  return collection(db, getTenantScopedCollectionPath(tenantId, TENANT_SCOPED_COLLECTIONS.tokenRequests));
}

function fromRequestDoc(snapshot) {
  return {
    id: snapshot.id,
    ...snapshot.data(),
  };
}

function buildTokenRequestPayload(request = {}) {
  const email = normalizeEmail(request.email);
  if (!email) {
    throw new Error('Το email είναι υποχρεωτικό για αίτημα ενεργοποίησης.');
  }

  return {
    email,
    requesterName: normalizeText(request.requesterName, MAX_NAME_LENGTH),
    note: normalizeText(request.note, MAX_NOTE_LENGTH),
    status: 'PENDING',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

async function createTenantTokenRequest(tenantId, request) {
  assertConfigured();
  const result = await addDoc(toCollectionRef(tenantId), buildTokenRequestPayload(request));
  return {
    id: result.id,
    tenantId,
  };
}

async function listTenantTokenRequests(tenantId) {
  assertConfigured();
  const result = await getDocs(toCollectionRef(tenantId));
  return result.docs.map(fromRequestDoc);
}

export const firebaseTenantTokenRequestsRepository = {
  createTenantTokenRequest,
  listTenantTokenRequests,
};
