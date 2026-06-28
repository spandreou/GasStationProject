import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db } from './config';
import {
  commitBatchChunks,
  ensureFirestoreReady,
  getMonthRange,
  tenantCollection,
  tenantDoc,
  toDataWithId,
  toTimestampMillis,
  withFirestoreWrite,
} from './firestoreCore';
import { TENANT_SCOPED_COLLECTIONS } from '../utils/tenantDataPaths';

export async function fetchAttendanceHistoryByMonth({ tenantId, yearMonth, employeeId = '' }) {
  ensureFirestoreReady();

  const { start, end } = getMonthRange(yearMonth);
  const constraints = [where('date', '>=', start), where('date', '<', end), orderBy('date', 'asc')];
  if (employeeId) {
    constraints.unshift(where('employeeId', '==', employeeId));
  }

  const attendanceQuery = query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.attendanceHistory), ...constraints);
  const snapshot = await getDocs(attendanceQuery);
  return toDataWithId(snapshot);
}

export async function isWeekFinalized(weekStart, { tenantId } = {}) {
  if (!weekStart) return false;

  ensureFirestoreReady();
  const lockDoc = await getDoc(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.weekLocks, weekStart));
  return lockDoc.exists();
}

export async function finalizeWeekAttendance({ tenantId, weekStart, weekDays, entries, adminEmail = '' }) {
  ensureFirestoreReady();

  if (!weekStart || !Array.isArray(weekDays) || !weekDays.length) {
    throw new Error('Δεν βρέθηκαν δεδομένα εβδομάδας για οριστικοποίηση.');
  }

  const alreadyFinalized = await isWeekFinalized(weekStart, { tenantId });
  if (alreadyFinalized) {
    return { alreadyFinalized: true, created: 0 };
  }

  const validEntries = (entries || []).filter((item) => item?.employeeId && item?.date);
  const operations = [
    ...validEntries.map((item) => ({ type: 'attendance', item })),
    { type: 'week_lock' },
  ];

  await commitBatchChunks(operations, (batch, operation) => {
    if (operation.type === 'attendance') {
      batch.set(doc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.attendanceHistory)), {
        ...operation.item,
        weekStart,
        finalizedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    batch.set(tenantDoc(tenantId, TENANT_SCOPED_COLLECTIONS.weekLocks, weekStart), {
      weekStart,
      weekDays,
      finalizedBy: adminEmail || '',
      finalizedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  return { alreadyFinalized: false, created: validEntries.length };
}

export async function saveWeekHistorySnapshot({
  tenantId,
  weekId,
  weekStart,
  weekEnd,
  source,
  shifts,
  createdBy = '',
  metadata = {},
}) {
  if (!weekId) throw new Error('Λείπει weekId για αποθήκευση ιστορικού.');
  ensureFirestoreReady();

  const safeShifts = Array.isArray(shifts) ? shifts : [];
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};

  await withFirestoreWrite(() =>
    addDoc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.weekHistory), {
      weekId,
      weekStart,
      weekEnd,
      source: source || 'manual',
      shifts: safeShifts,
      shiftCount: Number.isFinite(safeMetadata.totalShifts) ? safeMetadata.totalShifts : safeShifts.length,
      createdBy,
      savedBy: createdBy,
      savedAt: serverTimestamp(),
      metadata: {
        snapshotVersion: 1,
        saveAction: source || 'manual',
        ...safeMetadata,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function fetchWeekHistoryList(maxRows = 40, { tenantId } = {}) {
  ensureFirestoreReady();

  const safeLimit = Math.max(1, Math.min(200, Number(maxRows) || 40));
  const historySnapshot = await getDocs(
    query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.weekHistory), orderBy('createdAt', 'desc'), limit(safeLimit)),
  );

  return toDataWithId(historySnapshot);
}

export async function fetchLatestWeekSnapshotByWeekId(weekId, { tenantId } = {}) {
  if (!weekId) return null;
  ensureFirestoreReady();

  const historySnapshot = await getDocs(
    query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.weekHistory), where('weekId', '==', weekId)),
  );

  const entries = toDataWithId(historySnapshot);
  if (!entries.length) return null;

  entries.sort((a, b) => toTimestampMillis(b.createdAt) - toTimestampMillis(a.createdAt));
  return entries[0];
}

export async function saveWeekTemplate({ tenantId, name, weekStart, shifts, createdBy = '' }) {
  if (!name?.trim()) throw new Error('Δώσε όνομα template.');
  ensureFirestoreReady();

  const payload = {
    name: name.trim(),
    weekStart,
    shifts: Array.isArray(shifts) ? shifts : [],
    createdBy,
  };

  await withFirestoreWrite(() =>
    addDoc(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.weekTemplates), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function fetchWeekTemplates({ tenantId } = {}) {
  ensureFirestoreReady();

  const templatesSnapshot = await getDocs(
    query(tenantCollection(tenantId, TENANT_SCOPED_COLLECTIONS.weekTemplates), orderBy('updatedAt', 'desc')),
  );

  return toDataWithId(templatesSnapshot);
}
