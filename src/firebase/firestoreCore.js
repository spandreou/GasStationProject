import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from './config';
import {
  getTenantScopedCollectionPath,
  getTenantScopedDocumentPath,
} from '../utils/tenantDataPaths';

export const EMPLOYEES_COLLECTION = 'employees';
export const SHIFTS_COLLECTION = 'shifts';
export const SHIFT_TEMPLATES_COLLECTION = 'shiftTemplates';
export const EMPLOYEE_ABSENCES_COLLECTION = 'employeeAbsences';
export const EMPLOYEE_ABSENCES_PUBLIC_COLLECTION = 'employeeAbsencesPublic';
export const ATTENDANCE_HISTORY_COLLECTION = 'attendance_history';
export const WEEK_LOCKS_COLLECTION = 'week_locks';
export const ANNOUNCEMENTS_COLLECTION = 'announcements';
export const WEEK_HISTORY_COLLECTION = 'week_history';
export const WEEK_TEMPLATES_COLLECTION = 'week_templates';
export const SCHEDULER_SETTINGS_COLLECTION = 'scheduler_settings';
export const AUDIT_LOGS_COLLECTION = 'audit_logs';
export const PUBLISHED_SCHEDULES_COLLECTION = 'published_schedules';
export const PUBLIC_SCHEDULES_COLLECTION = 'publicSchedules';
export const PUBLIC_MONTHS_COLLECTION = 'publicMonths';
export const PUBLIC_EMPLOYEES_COLLECTION = 'publicEmployees';
export const PUBLIC_ANNOUNCEMENTS_COLLECTION = 'publicAnnouncements';
export const MONTHLY_SCHEDULE_EXPORTS_COLLECTION = 'monthly_schedule_exports';
export const DEFAULT_SCHEDULER_SETTINGS_DOC = 'default';

const MAX_IN_QUERY_VALUES = 10;
const MAX_BATCH_WRITES = 450;

export function createLocalUnsubscribe() {
  return () => {};
}

export function ensureFirestoreReady() {
  if (!db) {
    throw new Error('Το Firebase Firestore δεν είναι ρυθμισμένο. Έλεγξε τα env vars.');
  }
}

export function tenantCollection(tenantId, collectionName) {
  ensureFirestoreReady();
  return collection(db, getTenantScopedCollectionPath(tenantId, collectionName));
}

export function tenantDoc(tenantId, collectionName, documentId) {
  ensureFirestoreReady();
  return doc(db, getTenantScopedDocumentPath(tenantId, collectionName, documentId));
}

export function isUsingLocalFallback() {
  return false;
}

export function handleFirestoreFailure(error) {
  if (import.meta.env.DEV) {
    console.error('Firestore request failed:', error);
  }

  if (error?.code === 'permission-denied') {
    throw new Error('Permission denied από Firestore Rules. Έλεγξε τα Rules στο Firebase Console.');
  }

  throw error;
}

export async function withFirestoreWrite(operation) {
  try {
    ensureFirestoreReady();
    return await operation();
  } catch (error) {
    handleFirestoreFailure(error);
  }
}

export function getMonthRange(yearMonth) {
  const [year, month] = (yearMonth || '').split('-').map(Number);
  if (!year || !month) {
    throw new Error('Μη έγκυρος μήνας για ιστορικό.');
  }

  const start = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const nextMonthDate = new Date(year, month, 1);
  const endYear = nextMonthDate.getFullYear();
  const endMonth = nextMonthDate.getMonth() + 1;
  const end = `${String(endYear).padStart(4, '0')}-${String(endMonth).padStart(2, '0')}-01`;
  return { start, end };
}

export function chunkValues(values, size = MAX_IN_QUERY_VALUES) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

export async function commitBatchChunks(items, applyOperation, size = MAX_BATCH_WRITES) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return;

  for (const chunk of chunkValues(values, size)) {
    const batch = writeBatch(db);
    chunk.forEach((item) => applyOperation(batch, item));
    await withFirestoreWrite(() => batch.commit());
  }
}

export function timestampedPayload(payload, serverTimestamp, { includeCreatedAt = true } = {}) {
  return {
    ...payload,
    ...(includeCreatedAt ? { createdAt: serverTimestamp() } : {}),
    updatedAt: serverTimestamp(),
  };
}

export function toDataWithId(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function toTimestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return 0;
}
