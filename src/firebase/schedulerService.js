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
import { buildSampleShifts, sampleEmployees } from '../data/mockData';
import { db, isFirebaseConfigured } from './config';

const EMPLOYEES_COLLECTION = 'employees';
const SHIFTS_COLLECTION = 'shifts';
const SHIFT_TEMPLATES_COLLECTION = 'shiftTemplates';
const ATTENDANCE_HISTORY_COLLECTION = 'attendance_history';
const WEEK_LOCKS_COLLECTION = 'week_locks';

const LOCAL_EMPLOYEES_KEY = 'gas-station-employees';
const LOCAL_SHIFTS_KEY = 'gas-station-shifts';
const LOCAL_SHIFT_TEMPLATES_KEY = 'gas-station-shift-templates';
const LOCAL_ATTENDANCE_HISTORY_KEY = 'gas-station-attendance-history';
const LOCAL_WEEK_LOCKS_KEY = 'gas-station-week-locks';

export function isUsingLocalFallback() {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return !isFirebaseConfigured || !db || isOffline;
}

function ensureLocalSeed() {
  if (!localStorage.getItem(LOCAL_EMPLOYEES_KEY)) {
    localStorage.setItem(LOCAL_EMPLOYEES_KEY, JSON.stringify(sampleEmployees));
  }

  if (!localStorage.getItem(LOCAL_SHIFTS_KEY)) {
    localStorage.setItem(LOCAL_SHIFTS_KEY, JSON.stringify(buildSampleShifts()));
  }

  if (!localStorage.getItem(LOCAL_SHIFT_TEMPLATES_KEY)) {
    localStorage.setItem(LOCAL_SHIFT_TEMPLATES_KEY, JSON.stringify([]));
  }

  if (!localStorage.getItem(LOCAL_ATTENDANCE_HISTORY_KEY)) {
    localStorage.setItem(LOCAL_ATTENDANCE_HISTORY_KEY, JSON.stringify([]));
  }

  if (!localStorage.getItem(LOCAL_WEEK_LOCKS_KEY)) {
    localStorage.setItem(LOCAL_WEEK_LOCKS_KEY, JSON.stringify([]));
  }

  // Repair old mojibake in demo employee names/roles stored in localStorage.
  try {
    const employees = JSON.parse(localStorage.getItem(LOCAL_EMPLOYEES_KEY) || '[]');
    if (!Array.isArray(employees) || !employees.length) return;

    const fallbackById = new Map(sampleEmployees.map((employee) => [employee.id, employee]));
    let changed = false;

    const repaired = employees.map((employee) => {
      const hasMojibake =
        typeof employee?.fullName === 'string' &&
        employee.fullName.includes('Ξ') &&
        fallbackById.has(employee.id);

      if (!hasMojibake) return employee;

      changed = true;
      const fallback = fallbackById.get(employee.id);
      return {
        ...employee,
        fullName: fallback.fullName,
        role: fallback.role,
      };
    });

    if (changed) {
      localStorage.setItem(LOCAL_EMPLOYEES_KEY, JSON.stringify(repaired));
    }
  } catch {
    // Ignore migration errors and keep current local data intact.
  }
}

function readLocalItems(key) {
  ensureLocalSeed();
  return JSON.parse(localStorage.getItem(key) || '[]');
}

function writeLocalItems(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function createLocalUnsubscribe() {
  return () => {};
}

function handleFirestoreFailure(error) {
  console.error('❌ Firestore Update Failed:', error);
  if (error?.code === 'permission-denied') {
    throw new Error('Permission denied από Firestore Rules. Έλεγξε τα Rules στο Firebase Console.');
  }
  throw error;
}

async function withFirestoreWrite(operation) {
  try {
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

export function subscribeEmployees(onData, onError) {
  if (isUsingLocalFallback()) {
    try {
      onData(readLocalItems(LOCAL_EMPLOYEES_KEY));
    } catch (error) {
      onError?.(error);
    }
    return createLocalUnsubscribe();
  }

  const employeesQuery = query(collection(db, EMPLOYEES_COLLECTION), orderBy('fullName', 'asc'));
  return onSnapshot(
    employeesQuery,
    (snapshot) => {
      const employees = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      onData(employees);
    },
    onError,
  );
}

export function subscribeShifts(onData, onError) {
  if (isUsingLocalFallback()) {
    try {
      onData(readLocalItems(LOCAL_SHIFTS_KEY));
    } catch (error) {
      onError?.(error);
    }
    return createLocalUnsubscribe();
  }

  const shiftsQuery = query(collection(db, SHIFTS_COLLECTION), orderBy('date', 'asc'));
  return onSnapshot(
    shiftsQuery,
    (snapshot) => {
      const shifts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      onData(shifts);
    },
    onError,
  );
}

export function subscribeShiftTemplates(onData, onError) {
  if (isUsingLocalFallback()) {
    try {
      onData(readLocalItems(LOCAL_SHIFT_TEMPLATES_KEY));
    } catch (error) {
      onError?.(error);
    }
    return createLocalUnsubscribe();
  }

  const templatesQuery = query(collection(db, SHIFT_TEMPLATES_COLLECTION));
  return onSnapshot(
    templatesQuery,
    (snapshot) => {
      const templates = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'el'));
      onData(templates);
    },
    onError,
  );
}

export async function createShift(payload) {
  if (isUsingLocalFallback()) {
    const shifts = readLocalItems(LOCAL_SHIFTS_KEY);
    const createdShift = { ...payload, id: crypto.randomUUID() };
    writeLocalItems(LOCAL_SHIFTS_KEY, [...shifts, createdShift]);
    return createdShift;
  }

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
  if (isUsingLocalFallback()) {
    const templates = readLocalItems(LOCAL_SHIFT_TEMPLATES_KEY);
    const createdTemplate = { ...payload, id: crypto.randomUUID() };
    writeLocalItems(LOCAL_SHIFT_TEMPLATES_KEY, [...templates, createdTemplate]);
    return createdTemplate;
  }

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

  if (isUsingLocalFallback()) {
    const shifts = readLocalItems(LOCAL_SHIFTS_KEY);
    const filtered = shifts.filter((item) => item.id !== shift.id);
    writeLocalItems(LOCAL_SHIFTS_KEY, [...filtered, shift]);
    return shift;
  }

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
  if (isUsingLocalFallback()) {
    const shifts = readLocalItems(LOCAL_SHIFTS_KEY).map((shift) =>
      shift.id === shiftId ? { ...shift, ...payload } : shift,
    );
    writeLocalItems(LOCAL_SHIFTS_KEY, shifts);
    return;
  }

  const shiftDoc = doc(db, SHIFTS_COLLECTION, shiftId);
  await withFirestoreWrite(() =>
    updateDoc(shiftDoc, { ...payload, updatedAt: serverTimestamp() }),
  );
}

export async function removeShift(shiftId) {
  if (isUsingLocalFallback()) {
    const shifts = readLocalItems(LOCAL_SHIFTS_KEY);
    const removedShift = shifts.find((shift) => shift.id === shiftId) || null;
    writeLocalItems(
      LOCAL_SHIFTS_KEY,
      shifts.filter((shift) => shift.id !== shiftId),
    );
    return removedShift;
  }

  const shiftDocRef = doc(db, SHIFTS_COLLECTION, shiftId);
  const shiftDoc = await getDoc(shiftDocRef);
  const removedShift = shiftDoc.exists() ? { id: shiftDoc.id, ...shiftDoc.data() } : null;
  await withFirestoreWrite(() => deleteDoc(shiftDocRef));
  return removedShift;
}

export async function removeShiftsByEmployee(employeeId) {
  if (isUsingLocalFallback()) {
    const shifts = readLocalItems(LOCAL_SHIFTS_KEY);
    const removed = shifts.filter((shift) => shift.employeeId === employeeId);
    writeLocalItems(
      LOCAL_SHIFTS_KEY,
      shifts.filter((shift) => shift.employeeId !== employeeId),
    );
    return removed;
  }

  const shiftsSnapshot = await getDocs(query(collection(db, SHIFTS_COLLECTION)));
  const matched = shiftsSnapshot.docs.filter((item) => item.data().employeeId === employeeId);
  const removed = matched.map((item) => ({ id: item.id, ...item.data() }));
  await Promise.all(
    matched.map((item) =>
      withFirestoreWrite(() => deleteDoc(doc(db, SHIFTS_COLLECTION, item.id))),
    ),
  );
  return removed;
}

export async function removeShiftsByDates(dates) {
  const dateSet = new Set(dates);

  if (isUsingLocalFallback()) {
    const shifts = readLocalItems(LOCAL_SHIFTS_KEY);
    const removed = shifts.filter((shift) => dateSet.has(shift.date));
    writeLocalItems(
      LOCAL_SHIFTS_KEY,
      shifts.filter((shift) => !dateSet.has(shift.date)),
    );
    return removed;
  }

  const shiftsSnapshot = await getDocs(query(collection(db, SHIFTS_COLLECTION)));
  const matched = shiftsSnapshot.docs.filter((item) => dateSet.has(item.data().date));
  const removed = matched.map((item) => ({ id: item.id, ...item.data() }));
  await Promise.all(
    matched.map((item) =>
      withFirestoreWrite(() => deleteDoc(doc(db, SHIFTS_COLLECTION, item.id))),
    ),
  );
  return removed;
}

export async function removeShiftTemplate(templateId) {
  if (isUsingLocalFallback()) {
    const templates = readLocalItems(LOCAL_SHIFT_TEMPLATES_KEY).filter((template) => template.id !== templateId);
    writeLocalItems(LOCAL_SHIFT_TEMPLATES_KEY, templates);
    return;
  }

  await withFirestoreWrite(() => deleteDoc(doc(db, SHIFT_TEMPLATES_COLLECTION, templateId)));
}

export async function updateShiftTemplate(templateId, payload) {
  if (isUsingLocalFallback()) {
    const templates = readLocalItems(LOCAL_SHIFT_TEMPLATES_KEY).map((template) =>
      template.id === templateId ? { ...template, ...payload } : template,
    );
    writeLocalItems(LOCAL_SHIFT_TEMPLATES_KEY, templates);
    return;
  }

  const templateDoc = doc(db, SHIFT_TEMPLATES_COLLECTION, templateId);
  await withFirestoreWrite(() =>
    updateDoc(templateDoc, { ...payload, updatedAt: serverTimestamp() }),
  );
}

export async function createEmployee(payload) {
  if (isUsingLocalFallback()) {
    const employees = readLocalItems(LOCAL_EMPLOYEES_KEY);
    const employee = { ...payload, id: crypto.randomUUID() };
    writeLocalItems(LOCAL_EMPLOYEES_KEY, [...employees, employee]);
    return employee;
  }

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
  if (isUsingLocalFallback()) {
    const employees = readLocalItems(LOCAL_EMPLOYEES_KEY).map((employee) =>
      employee.id === employeeId ? { ...employee, ...payload } : employee,
    );
    writeLocalItems(LOCAL_EMPLOYEES_KEY, employees);
    return;
  }

  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  await withFirestoreWrite(() =>
    updateDoc(employeeDoc, { ...payload, updatedAt: serverTimestamp() }),
  );
}

export async function removeEmployee(employeeId) {
  if (isUsingLocalFallback()) {
    const employees = readLocalItems(LOCAL_EMPLOYEES_KEY).filter((employee) => employee.id !== employeeId);
    writeLocalItems(LOCAL_EMPLOYEES_KEY, employees);
    return;
  }

  await withFirestoreWrite(() => deleteDoc(doc(db, EMPLOYEES_COLLECTION, employeeId)));
}

export async function fetchAttendanceHistoryByMonth({ yearMonth, employeeId = '' }) {
  const { start, end } = getMonthRange(yearMonth);

  if (isUsingLocalFallback()) {
    const history = readLocalItems(LOCAL_ATTENDANCE_HISTORY_KEY)
      .filter((item) => item.date >= start && item.date < end)
      .filter((item) => (employeeId ? item.employeeId === employeeId : true))
      .sort((a, b) => a.date.localeCompare(b.date));
    return history;
  }

  const constraints = [where('date', '>=', start), where('date', '<', end), orderBy('date', 'asc')];
  if (employeeId) {
    constraints.unshift(where('employeeId', '==', employeeId));
  }

  const attendanceQuery = query(collection(db, ATTENDANCE_HISTORY_COLLECTION), ...constraints);
  const snapshot = await getDocs(attendanceQuery);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function isWeekFinalized(weekStart) {
  if (!weekStart) return false;

  if (isUsingLocalFallback()) {
    const locks = readLocalItems(LOCAL_WEEK_LOCKS_KEY);
    return locks.some((item) => item.weekStart === weekStart);
  }

  const lockDoc = await getDoc(doc(db, WEEK_LOCKS_COLLECTION, weekStart));
  return lockDoc.exists();
}

export async function finalizeWeekAttendance({ weekStart, weekDays, entries, adminEmail = '' }) {
  if (!weekStart || !Array.isArray(weekDays) || !weekDays.length) {
    throw new Error('Δεν βρέθηκαν δεδομένα εβδομάδας για οριστικοποίηση.');
  }

  const alreadyFinalized = await isWeekFinalized(weekStart);
  if (alreadyFinalized) {
    return { alreadyFinalized: true, created: 0 };
  }

  const validEntries = (entries || []).filter((item) => item?.employeeId && item?.date);

  if (isUsingLocalFallback()) {
    const history = readLocalItems(LOCAL_ATTENDANCE_HISTORY_KEY);
    const finalizedAt = new Date().toISOString();
    const payload = validEntries.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      weekStart,
      finalizedAt,
      createdAt: finalizedAt,
      updatedAt: finalizedAt,
    }));

    writeLocalItems(LOCAL_ATTENDANCE_HISTORY_KEY, [...history, ...payload]);

    const locks = readLocalItems(LOCAL_WEEK_LOCKS_KEY);
    writeLocalItems(LOCAL_WEEK_LOCKS_KEY, [
      ...locks,
      {
        id: weekStart,
        weekStart,
        weekDays,
        finalizedAt,
        finalizedBy: adminEmail || '',
      },
    ]);

    return { alreadyFinalized: false, created: payload.length };
  }

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
  if (isUsingLocalFallback()) {
    return readLocalItems(LOCAL_SHIFTS_KEY);
  }

  const shiftsQuery = query(collection(db, SHIFTS_COLLECTION), orderBy('date', 'asc'));
  try {
    const snapshot = await getDocs(shiftsQuery);
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    handleFirestoreFailure(error);
  }
}
