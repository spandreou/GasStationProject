import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './config';
import {
  commitBatchChunks,
  createLocalUnsubscribe,
  ensureFirestoreReady,
  PUBLISHED_SCHEDULES_COLLECTION,
  PUBLIC_ANNOUNCEMENTS_COLLECTION,
  PUBLIC_EMPLOYEES_COLLECTION,
  PUBLIC_MONTHS_COLLECTION,
  PUBLIC_SCHEDULES_COLLECTION,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';

const DEFAULT_TENANT_ID = 'bp-kallis';

function normalizeTenantId(tenantId) {
  return String(tenantId || DEFAULT_TENANT_ID).trim() || DEFAULT_TENANT_ID;
}

function tenantCollection(tenantId, collectionName) {
  return collection(db, 'tenants', normalizeTenantId(tenantId), collectionName);
}

function tenantDoc(tenantId, collectionName, documentId) {
  return doc(db, 'tenants', normalizeTenantId(tenantId), collectionName, documentId);
}

function sortByDateAndTime(a, b) {
  return `${a.date}_${a.startTime}_${a.employeeName}`.localeCompare(
    `${b.date}_${b.startTime}_${b.employeeName}`,
    'el',
  );
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createPublicShiftId(shift, employeeName) {
  return [
    safeText(shift?.date),
    safeText(shift?.startTime),
    safeText(shift?.endTime),
    employeeName,
    safeText(shift?.type || 'work'),
  ].join('_');
}

function sanitizePublishedShift(shift, employeeById) {
  const employeeName = safeText(employeeById.get(shift?.employeeId)?.fullName || shift?.employeeName);
  return {
    id: createPublicShiftId(shift, employeeName),
    employeeId: '',
    employeeName,
    date: safeText(shift?.date),
    startTime: safeText(shift?.startTime),
    endTime: safeText(shift?.endTime),
    type: safeText(shift?.type) || 'work',
    label: safeText(shift?.label || shift?.customLabel),
    shiftType: safeText(shift?.shiftType),
  };
}

function sanitizePublishedSchedule({ tenantId, weekStart, weekDays, shifts = [], employees = [] }) {
  const days = Array.isArray(weekDays) && weekDays.length ? weekDays.filter(Boolean) : [];
  const weekDaySet = new Set(days);
  const employeeById = new Map((employees || []).map((employee) => [employee.id, employee]));
  const publicShifts = (shifts || [])
    .filter((shift) => shift?.date && (!weekDaySet.size || weekDaySet.has(shift.date)))
    .map((shift) => sanitizePublishedShift(shift, employeeById))
    .sort(sortByDateAndTime);

  return {
    tenantId: normalizeTenantId(tenantId),
    weekStart,
    weekEnd: days[6] || days[days.length - 1] || weekStart,
    shiftCount: publicShifts.length,
    shifts: publicShifts,
  };
}

function sanitizePublishedMonth({
  tenantId,
  yearMonth,
  monthStart,
  monthEnd,
  monthDays = [],
  weekStarts = [],
  shifts = [],
  employees = [],
}) {
  const monthDaySet = new Set((monthDays || []).filter(Boolean));
  const employeeById = new Map((employees || []).map((employee) => [employee.id, employee]));
  const publicShifts = (shifts || [])
    .filter((shift) => shift?.date && (!monthDaySet.size || monthDaySet.has(shift.date)))
    .map((shift) => sanitizePublishedShift(shift, employeeById))
    .sort(sortByDateAndTime);

  return {
    tenantId: normalizeTenantId(tenantId),
    yearMonth,
    monthStart,
    monthEnd,
    monthDays: [...monthDaySet].sort(),
    weekStarts: [...new Set(weekStarts || [])].filter(Boolean).sort(),
    shiftCount: publicShifts.length,
    shifts: publicShifts,
  };
}

function sanitizePublicEmployee(employee, tenantId) {
  return {
    tenantId: normalizeTenantId(tenantId),
    fullName: safeText(employee?.fullName || employee?.name),
    role: safeText(employee?.role),
    color: safeText(employee?.color),
    isActive: employee?.isActive !== false,
  };
}

function sanitizePublicAnnouncement(announcement, tenantId) {
  return {
    tenantId: normalizeTenantId(tenantId),
    title: safeText(announcement?.title),
    body: safeText(announcement?.body),
  };
}

async function readLegacyPublishedSchedule(weekStart) {
  const legacySnapshot = await getDoc(doc(db, PUBLISHED_SCHEDULES_COLLECTION, weekStart));
  return legacySnapshot.exists() ? { id: legacySnapshot.id, ...legacySnapshot.data() } : null;
}

export function subscribePublishedSchedule(input, onData, onError) {
  const weekStart = typeof input === 'string' ? input : input?.weekStart;
  const tenantId = typeof input === 'string' ? DEFAULT_TENANT_ID : input?.tenantId;
  if (!db || !weekStart) {
    onData?.(null);
    return createLocalUnsubscribe();
  }

  return onSnapshot(
    tenantDoc(tenantId, PUBLIC_SCHEDULES_COLLECTION, weekStart),
    async (snapshot) => {
      if (snapshot.exists()) {
        onData({ id: snapshot.id, ...snapshot.data() });
        return;
      }

      try {
        onData(await readLegacyPublishedSchedule(weekStart));
      } catch (error) {
        onError?.(error);
      }
    },
    onError,
  );
}

export function subscribePublishedMonth({ tenantId, yearMonth }, onData, onError) {
  if (!db || !yearMonth) {
    onData?.(null);
    return createLocalUnsubscribe();
  }

  return onSnapshot(
    tenantDoc(tenantId, PUBLIC_MONTHS_COLLECTION, yearMonth),
    (snapshot) => {
      onData(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    },
    onError,
  );
}

export function subscribePublicEmployees({ tenantId }, onData, onError) {
  if (!db) {
    onData?.([]);
    return createLocalUnsubscribe();
  }

  return onSnapshot(
    query(tenantCollection(tenantId, PUBLIC_EMPLOYEES_COLLECTION), orderBy('fullName', 'asc')),
    (snapshot) => onData(toDataWithId(snapshot)),
    onError,
  );
}

export function subscribePublicAnnouncements({ tenantId }, onData, onError) {
  if (!db) {
    onData?.([]);
    return createLocalUnsubscribe();
  }

  return onSnapshot(
    query(tenantCollection(tenantId, PUBLIC_ANNOUNCEMENTS_COLLECTION), orderBy('createdAt', 'desc')),
    (snapshot) => onData(toDataWithId(snapshot)),
    onError,
  );
}

export async function publishWeekSchedule({ tenantId, weekStart, weekDays, shifts = [], employees = [] }) {
  ensureFirestoreReady();
  if (!weekStart) throw new Error('Λείπει εβδομάδα για δημόσια προβολή προγράμματος.');

  const payload = sanitizePublishedSchedule({ tenantId, weekStart, weekDays, shifts, employees });
  await withFirestoreWrite(() =>
    setDoc(tenantDoc(tenantId, PUBLIC_SCHEDULES_COLLECTION, weekStart), {
      ...payload,
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return payload;
}

export async function publishMonthSchedule({
  tenantId,
  yearMonth,
  monthStart,
  monthEnd,
  monthDays = [],
  weekStarts = [],
  shifts = [],
  employees = [],
}) {
  ensureFirestoreReady();
  if (!yearMonth) throw new Error('Λείπει μήνας για δημόσια προβολή προγράμματος.');

  const payload = sanitizePublishedMonth({
    tenantId,
    yearMonth,
    monthStart,
    monthEnd,
    monthDays,
    weekStarts,
    shifts,
    employees,
  });
  await withFirestoreWrite(() =>
    setDoc(tenantDoc(tenantId, PUBLIC_MONTHS_COLLECTION, yearMonth), {
      ...payload,
      publishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return payload;
}

export async function publishPublicEmployees({ tenantId, employees = [] }) {
  ensureFirestoreReady();
  const safeEmployees = (employees || []).filter((employee) => employee?.id);
  const existingSnapshot = await getDocs(tenantCollection(tenantId, PUBLIC_EMPLOYEES_COLLECTION));
  const nextIds = new Set(safeEmployees.map((employee) => employee.id));

  const operations = [
    ...safeEmployees.map((employee) => ({
      type: 'set',
      id: employee.id,
      payload: sanitizePublicEmployee(employee, tenantId),
    })),
    ...existingSnapshot.docs
      .filter((snapshot) => !nextIds.has(snapshot.id))
      .map((snapshot) => ({ type: 'delete', id: snapshot.id })),
  ];

  await commitBatchChunks(operations, (batch, operation) => {
    const ref = tenantDoc(tenantId, PUBLIC_EMPLOYEES_COLLECTION, operation.id);
    if (operation.type === 'delete') {
      batch.delete(ref);
      return;
    }

    batch.set(ref, {
      ...operation.payload,
      updatedAt: serverTimestamp(),
    });
  });

  return safeEmployees.length;
}

export async function publishPublicAnnouncement({ tenantId, announcement }) {
  ensureFirestoreReady();
  if (!announcement?.id) throw new Error('Λείπει ανακοίνωση για δημόσια προβολή.');

  const payload = sanitizePublicAnnouncement(announcement, tenantId);
  await withFirestoreWrite(() =>
    setDoc(tenantDoc(tenantId, PUBLIC_ANNOUNCEMENTS_COLLECTION, announcement.id), {
      ...payload,
      createdAt: announcement.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return payload;
}

export async function deletePublicAnnouncement({ tenantId, announcementId }) {
  ensureFirestoreReady();
  if (!announcementId) return false;
  await withFirestoreWrite(() =>
    deleteDoc(tenantDoc(tenantId, PUBLIC_ANNOUNCEMENTS_COLLECTION, announcementId)),
  );
  return true;
}

export async function deletePublishedSchedulesByWeekStarts(input = []) {
  ensureFirestoreReady();
  const weekStarts = Array.isArray(input) ? input : input?.weekStarts;
  const tenantId = Array.isArray(input) ? DEFAULT_TENANT_ID : input?.tenantId;
  const uniqueWeekStarts = [...new Set(weekStarts || [])].filter(Boolean);
  if (!uniqueWeekStarts.length) return 0;

  await commitBatchChunks(uniqueWeekStarts, (batch, weekStart) => {
    batch.delete(tenantDoc(tenantId, PUBLIC_SCHEDULES_COLLECTION, weekStart));
    batch.delete(doc(db, PUBLISHED_SCHEDULES_COLLECTION, weekStart));
  });

  return uniqueWeekStarts.length;
}

export async function deletePublishedMonth({ tenantId, yearMonth }) {
  ensureFirestoreReady();
  if (!yearMonth) return false;
  await withFirestoreWrite(() =>
    deleteDoc(tenantDoc(tenantId, PUBLIC_MONTHS_COLLECTION, yearMonth)),
  );
  return true;
}
