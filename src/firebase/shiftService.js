import {
  addDoc,
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
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './config';
import {
  chunkValues,
  commitBatchChunks,
  createLocalUnsubscribe,
  ensureFirestoreReady,
  handleFirestoreFailure,
  SHIFTS_COLLECTION,
  SHIFT_TEMPLATES_COLLECTION,
  timestampedPayload,
  toDataWithId,
  withFirestoreWrite,
} from './firestoreCore';

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
  await commitBatchChunks(shiftsSnapshot.docs, (batch, item) => {
    batch.delete(doc(db, SHIFTS_COLLECTION, item.id));
  });

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

  await commitBatchChunks(matchedDocs, (batch, item) => {
    batch.delete(doc(db, SHIFTS_COLLECTION, item.id));
  });

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

export async function removeWeekShifts(weekDays) {
  ensureFirestoreReady();

  await removeShiftsByDates(weekDays);
}

export async function createManyShifts(shifts) {
  ensureFirestoreReady();

  if (!Array.isArray(shifts) || !shifts.length) return;
  await commitBatchChunks(shifts, (batch, shift) => {
    batch.set(doc(collection(db, SHIFTS_COLLECTION)), timestampedPayload(shift, serverTimestamp));
  });
}

export async function replaceShiftsBatch({ shiftsToRemove = [], shiftsToCreate = [] }) {
  ensureFirestoreReady();

  const removeItems = (shiftsToRemove || []).filter((shift) => shift?.id).map((shift) => ({ operation: 'delete', shift }));
  const createItems = (shiftsToCreate || []).filter(Boolean).map((shift) => ({ operation: 'create', shift }));
  const operations = [...removeItems, ...createItems];
  const created = [];

  await commitBatchChunks(operations, (batch, item) => {
    if (item.operation === 'delete') {
      batch.delete(doc(db, SHIFTS_COLLECTION, item.shift.id));
      return;
    }

    const shiftDoc = doc(collection(db, SHIFTS_COLLECTION));
    created.push({ id: shiftDoc.id, ...item.shift });
    batch.set(shiftDoc, timestampedPayload(item.shift, serverTimestamp));
  });

  return {
    removed: removeItems.map((item) => item.shift),
    created,
  };
}
