import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './config';

const EMPLOYEES_COLLECTION = 'employees';
const SHIFTS_COLLECTION = 'shifts';
const SHIFT_TEMPLATES_COLLECTION = 'shiftTemplates';
const ATTENDANCE_HISTORY_COLLECTION = 'attendance_history';
const WEEK_LOCKS_COLLECTION = 'week_locks';
const ANNOUNCEMENTS_COLLECTION = 'announcements';
const WEEK_HISTORY_COLLECTION = 'week_history';
const WEEK_TEMPLATES_COLLECTION = 'week_templates';

const MAX_IN_QUERY_VALUES = 10;

function createLocalUnsubscribe() {
  return () => {};
}

function ensureFirestoreReady() {
  if (!db) {
    throw new Error('Το Firebase Firestore δεν είναι ρυθμισμένο. Έλεγξε τα env vars.');
  }
}

export function isUsingLocalFallback() {
  return false;
}

function handleFirestoreFailure(error) {
  if (import.meta.env.DEV) {
    console.error('Firestore request failed:', error);
  }

  if (error?.code === 'permission-denied') {
    throw new Error('Permission denied από Firestore Rules. Έλεγξε τα Rules στο Firebase Console.');
  }

  throw error;
}

async function withFirestoreWrite(operation) {
  try {
    ensureFirestoreReady();
    return await operation();
  } catch (error) {
    handleFirestoreFailure(error);
  }
}

function getMonthRange(yearMonth) {
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

function chunkValues(values, size = MAX_IN_QUERY_VALUES) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function toDataWithId(snapshot) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

function toTimestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  return 0;
}

export function subscribeEmployees(onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const employeesQuery = query(collection(db, EMPLOYEES_COLLECTION), orderBy('fullName', 'asc'));
  return onSnapshot(
    employeesQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export function subscribeShifts(onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const shiftsQuery = query(collection(db, SHIFTS_COLLECTION), orderBy('date', 'asc'));
  return onSnapshot(
    shiftsQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export function subscribeShiftTemplates(onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const templatesQuery = query(collection(db, SHIFT_TEMPLATES_COLLECTION));
  return onSnapshot(
    templatesQuery,
    (snapshot) => {
      const templates = toDataWithId(snapshot).sort((a, b) => (a.label || '').localeCompare(b.label || '', 'el'));
      onData(templates);
    },
    onError,
  );
}

export async function createShift(payload) {
  ensureFirestoreReady();

  const docRef = await withFirestoreWrite(() =>
    addDoc(collection(db, SHIFTS_COLLECTION), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function createShiftTemplate(payload) {
  ensureFirestoreReady();

  const docRef = await withFirestoreWrite(() =>
    addDoc(collection(db, SHIFT_TEMPLATES_COLLECTION), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function restoreShift(shift) {
  if (!shift?.id) {
    throw new Error('Δεν υπάρχει id βάρδιας για επαναφορά.');
  }

  ensureFirestoreReady();
  const { id, ...payload } = shift;
  await withFirestoreWrite(() =>
    setDoc(doc(db, SHIFTS_COLLECTION, id), {
      ...payload,
      updatedAt: serverTimestamp(),
    }),
  );

  return shift;
}

export async function updateShift(shiftId, payload) {
  ensureFirestoreReady();

  const shiftDoc = doc(db, SHIFTS_COLLECTION, shiftId);
  await withFirestoreWrite(() =>
    updateDoc(shiftDoc, { ...payload, updatedAt: serverTimestamp() }),
  );
}

export async function removeShift(shiftId) {
  ensureFirestoreReady();

  const shiftDocRef = doc(db, SHIFTS_COLLECTION, shiftId);
  const shiftDoc = await getDoc(shiftDocRef);
  const removedShift = shiftDoc.exists() ? { id: shiftDoc.id, ...shiftDoc.data() } : null;
  await withFirestoreWrite(() => deleteDoc(shiftDocRef));

  return removedShift;
}

export async function removeShiftsByEmployee(employeeId) {
  ensureFirestoreReady();

  const shiftsSnapshot = await getDocs(
    query(collection(db, SHIFTS_COLLECTION), where('employeeId', '==', employeeId)),
  );

  const removed = shiftsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  await Promise.all(
    shiftsSnapshot.docs.map((item) =>
      withFirestoreWrite(() => deleteDoc(doc(db, SHIFTS_COLLECTION, item.id))),
    ),
  );

  return removed;
}

export async function removeShiftsByDates(dates) {
  ensureFirestoreReady();

  const dateValues = [...new Set(dates || [])].filter(Boolean);
  if (!dateValues.length) return [];

  const matchedDocsById = new Map();

  for (const dateChunk of chunkValues(dateValues)) {
    const shiftsSnapshot = await getDocs(
      query(collection(db, SHIFTS_COLLECTION), where('date', 'in', dateChunk)),
    );

    shiftsSnapshot.docs.forEach((item) => {
      matchedDocsById.set(item.id, item);
    });
  }

  const matchedDocs = [...matchedDocsById.values()];
  const removed = matchedDocs.map((item) => ({ id: item.id, ...item.data() }));

  await Promise.all(
    matchedDocs.map((item) => withFirestoreWrite(() => deleteDoc(doc(db, SHIFTS_COLLECTION, item.id)))),
  );

  return removed;
}

export async function removeShiftTemplate(templateId) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => deleteDoc(doc(db, SHIFT_TEMPLATES_COLLECTION, templateId)));
}

export async function updateShiftTemplate(templateId, payload) {
  ensureFirestoreReady();

  const templateDoc = doc(db, SHIFT_TEMPLATES_COLLECTION, templateId);
  await withFirestoreWrite(() =>
    updateDoc(templateDoc, { ...payload, updatedAt: serverTimestamp() }),
  );
}

export async function createEmployee(payload) {
  ensureFirestoreReady();

  const docRef = await withFirestoreWrite(() =>
    addDoc(collection(db, EMPLOYEES_COLLECTION), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function updateEmployee(employeeId, payload) {
  ensureFirestoreReady();

  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  await withFirestoreWrite(() =>
    updateDoc(employeeDoc, { ...payload, updatedAt: serverTimestamp() }),
  );
}

export async function removeEmployee(employeeId) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => deleteDoc(doc(db, EMPLOYEES_COLLECTION, employeeId)));
}

export async function fetchAttendanceHistoryByMonth({ yearMonth, employeeId = '' }) {
  ensureFirestoreReady();

  const { start, end } = getMonthRange(yearMonth);
  const constraints = [where('date', '>=', start), where('date', '<', end), orderBy('date', 'asc')];
  if (employeeId) {
    constraints.unshift(where('employeeId', '==', employeeId));
  }

  const attendanceQuery = query(collection(db, ATTENDANCE_HISTORY_COLLECTION), ...constraints);
  const snapshot = await getDocs(attendanceQuery);
  return toDataWithId(snapshot);
}

export async function isWeekFinalized(weekStart) {
  if (!weekStart) return false;

  ensureFirestoreReady();
  const lockDoc = await getDoc(doc(db, WEEK_LOCKS_COLLECTION, weekStart));
  return lockDoc.exists();
}

export async function finalizeWeekAttendance({ weekStart, weekDays, entries, adminEmail = '' }) {
  ensureFirestoreReady();

  if (!weekStart || !Array.isArray(weekDays) || !weekDays.length) {
    throw new Error('Δεν βρέθηκαν δεδομένα εβδομάδας για οριστικοποίηση.');
  }

  const alreadyFinalized = await isWeekFinalized(weekStart);
  if (alreadyFinalized) {
    return { alreadyFinalized: true, created: 0 };
  }

  const validEntries = (entries || []).filter((item) => item?.employeeId && item?.date);

  for (const item of validEntries) {
    await withFirestoreWrite(() =>
      addDoc(collection(db, ATTENDANCE_HISTORY_COLLECTION), {
        ...item,
        weekStart,
        finalizedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  }

  await withFirestoreWrite(() =>
    setDoc(doc(db, WEEK_LOCKS_COLLECTION, weekStart), {
      weekStart,
      weekDays,
      finalizedBy: adminEmail || '',
      finalizedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { alreadyFinalized: false, created: validEntries.length };
}

export async function fetchShiftsOnce() {
  ensureFirestoreReady();

  const shiftsQuery = query(collection(db, SHIFTS_COLLECTION), orderBy('date', 'asc'));
  try {
    const snapshot = await getDocs(shiftsQuery);
    return toDataWithId(snapshot);
  } catch (error) {
    handleFirestoreFailure(error);
    return [];
  }
}

export function subscribeAnnouncements(onData, onError) {
  if (!db) {
    onError?.(new Error('Το Firestore δεν είναι διαθέσιμο.'));
    return createLocalUnsubscribe();
  }

  const announcementsQuery = query(collection(db, ANNOUNCEMENTS_COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    announcementsQuery,
    (snapshot) => {
      onData(toDataWithId(snapshot));
    },
    onError,
  );
}

export async function createAnnouncement(payload) {
  ensureFirestoreReady();

  const docRef = await withFirestoreWrite(() =>
    addDoc(collection(db, ANNOUNCEMENTS_COLLECTION), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return { id: docRef.id, ...payload };
}

export async function removeAnnouncement(announcementId) {
  ensureFirestoreReady();
  await withFirestoreWrite(() => deleteDoc(doc(db, ANNOUNCEMENTS_COLLECTION, announcementId)));
}

export async function fetchShiftsByDates(dates) {
  ensureFirestoreReady();

  const dateValues = [...new Set(dates || [])].filter(Boolean);
  if (!dateValues.length) return [];

  const matchedShifts = [];

  for (const dateChunk of chunkValues(dateValues)) {
    const shiftsSnapshot = await getDocs(
      query(collection(db, SHIFTS_COLLECTION), where('date', 'in', dateChunk)),
    );

    matchedShifts.push(...toDataWithId(shiftsSnapshot));
  }

  return matchedShifts.sort((a, b) => `${a.date}_${a.startTime}`.localeCompare(`${b.date}_${b.startTime}`));
}

export async function hasConsecutiveSundayAssignment({ employeeId, previousSundayDate }) {
  if (!employeeId || !previousSundayDate) return false;
  ensureFirestoreReady();

  const sundaySnapshot = await getDocs(
    query(
      collection(db, SHIFTS_COLLECTION),
      where('employeeId', '==', employeeId),
      where('date', '==', previousSundayDate),
      where('type', '==', 'work'),
    ),
  );

  return sundaySnapshot.docs.some((item) => {
    const shift = item.data();
    return shift.startTime === '08:00' && shift.endTime === '20:00';
  });
}

export async function saveWeekHistorySnapshot({
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
    addDoc(collection(db, WEEK_HISTORY_COLLECTION), {
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

export async function fetchWeekHistoryList(maxRows = 40) {
  ensureFirestoreReady();

  const safeLimit = Math.max(1, Math.min(200, Number(maxRows) || 40));
  const historySnapshot = await getDocs(
    query(collection(db, WEEK_HISTORY_COLLECTION), orderBy('createdAt', 'desc'), limit(safeLimit)),
  );

  return toDataWithId(historySnapshot);
}

export async function fetchLatestWeekSnapshotByWeekId(weekId) {
  if (!weekId) return null;
  ensureFirestoreReady();

  const historySnapshot = await getDocs(
    query(collection(db, WEEK_HISTORY_COLLECTION), where('weekId', '==', weekId)),
  );

  const entries = toDataWithId(historySnapshot);
  if (!entries.length) return null;

  entries.sort((a, b) => toTimestampMillis(b.createdAt) - toTimestampMillis(a.createdAt));
  return entries[0];
}

export async function saveWeekTemplate({ name, weekStart, shifts, createdBy = '' }) {
  if (!name?.trim()) throw new Error('Δώσε όνομα template.');
  ensureFirestoreReady();

  const payload = {
    name: name.trim(),
    weekStart,
    shifts: Array.isArray(shifts) ? shifts : [],
    createdBy,
  };

  await withFirestoreWrite(() =>
    addDoc(collection(db, WEEK_TEMPLATES_COLLECTION), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function fetchWeekTemplates() {
  ensureFirestoreReady();

  const templatesSnapshot = await getDocs(
    query(collection(db, WEEK_TEMPLATES_COLLECTION), orderBy('updatedAt', 'desc')),
  );

  return toDataWithId(templatesSnapshot);
}

export async function removeWeekShifts(weekDays) {
  ensureFirestoreReady();

  const existing = await fetchShiftsByDates(weekDays);
  await Promise.all(
    existing.map((shift) => withFirestoreWrite(() => deleteDoc(doc(db, SHIFTS_COLLECTION, shift.id)))),
  );
}

export async function createManyShifts(shifts) {
  ensureFirestoreReady();

  if (!Array.isArray(shifts) || !shifts.length) return;
  await Promise.all(
    shifts.map((shift) =>
      withFirestoreWrite(() =>
        addDoc(collection(db, SHIFTS_COLLECTION), {
          ...shift,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      ),
    ),
  );
}
