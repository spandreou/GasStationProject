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
} from 'firebase/firestore';
import { buildSampleShifts, sampleEmployees } from '../data/mockData';
import { db, isFirebaseConfigured } from './config';

const EMPLOYEES_COLLECTION = 'employees';
const SHIFTS_COLLECTION = 'shifts';
const SHIFT_TEMPLATES_COLLECTION = 'shiftTemplates';

const LOCAL_EMPLOYEES_KEY = 'gas-station-employees';
const LOCAL_SHIFTS_KEY = 'gas-station-shifts';
const LOCAL_SHIFT_TEMPLATES_KEY = 'gas-station-shift-templates';

function useLocalFallback() {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return !isFirebaseConfigured || !db || isOffline;
}

function ensureLocalSeed() {
  // Demo mode: αρχικοποιούμε τοπικά δεδομένα αν λείπει το Firebase config.
  if (!localStorage.getItem(LOCAL_EMPLOYEES_KEY)) {
    localStorage.setItem(LOCAL_EMPLOYEES_KEY, JSON.stringify(sampleEmployees));
  }

  if (!localStorage.getItem(LOCAL_SHIFTS_KEY)) {
    localStorage.setItem(LOCAL_SHIFTS_KEY, JSON.stringify(buildSampleShifts()));
  }

  if (!localStorage.getItem(LOCAL_SHIFT_TEMPLATES_KEY)) {
    localStorage.setItem(LOCAL_SHIFT_TEMPLATES_KEY, JSON.stringify([]));
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

export function subscribeEmployees(onData, onError) {
  if (useLocalFallback()) {
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
  if (useLocalFallback()) {
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
  if (useLocalFallback()) {
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
  if (useLocalFallback()) {
    const shifts = readLocalItems(LOCAL_SHIFTS_KEY);
    const createdShift = { ...payload, id: crypto.randomUUID() };
    writeLocalItems(LOCAL_SHIFTS_KEY, [...shifts, createdShift]);
    return createdShift;
  }

  const docRef = await addDoc(collection(db, SHIFTS_COLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: docRef.id, ...payload };
}

export async function createShiftTemplate(payload) {
  if (useLocalFallback()) {
    const templates = readLocalItems(LOCAL_SHIFT_TEMPLATES_KEY);
    const createdTemplate = { ...payload, id: crypto.randomUUID() };
    writeLocalItems(LOCAL_SHIFT_TEMPLATES_KEY, [...templates, createdTemplate]);
    return createdTemplate;
  }

  const docRef = await addDoc(collection(db, SHIFT_TEMPLATES_COLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: docRef.id, ...payload };
}

export async function restoreShift(shift) {
  if (!shift?.id) {
    throw new Error('Δεν υπάρχει id βάρδιας για επαναφορά.');
  }

  if (useLocalFallback()) {
    const shifts = readLocalItems(LOCAL_SHIFTS_KEY);
    const filtered = shifts.filter((item) => item.id !== shift.id);
    writeLocalItems(LOCAL_SHIFTS_KEY, [...filtered, shift]);
    return shift;
  }

  const { id, ...payload } = shift;
  await setDoc(doc(db, SHIFTS_COLLECTION, id), {
    ...payload,
    updatedAt: serverTimestamp(),
  });
  return shift;
}

export async function updateShift(shiftId, payload) {
  if (useLocalFallback()) {
    const shifts = readLocalItems(LOCAL_SHIFTS_KEY).map((shift) =>
      shift.id === shiftId ? { ...shift, ...payload } : shift,
    );
    writeLocalItems(LOCAL_SHIFTS_KEY, shifts);
    return;
  }

  const shiftDoc = doc(db, SHIFTS_COLLECTION, shiftId);
  await updateDoc(shiftDoc, { ...payload, updatedAt: serverTimestamp() });
}

export async function removeShift(shiftId) {
  if (useLocalFallback()) {
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
  await deleteDoc(shiftDocRef);
  return removedShift;
}

export async function removeShiftsByEmployee(employeeId) {
  if (useLocalFallback()) {
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
  await Promise.all(matched.map((item) => deleteDoc(doc(db, SHIFTS_COLLECTION, item.id))));
  return removed;
}

export async function removeShiftsByDates(dates) {
  const dateSet = new Set(dates);

  if (useLocalFallback()) {
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
  await Promise.all(matched.map((item) => deleteDoc(doc(db, SHIFTS_COLLECTION, item.id))));
  return removed;
}

export async function removeShiftTemplate(templateId) {
  if (useLocalFallback()) {
    const templates = readLocalItems(LOCAL_SHIFT_TEMPLATES_KEY).filter((template) => template.id !== templateId);
    writeLocalItems(LOCAL_SHIFT_TEMPLATES_KEY, templates);
    return;
  }

  await deleteDoc(doc(db, SHIFT_TEMPLATES_COLLECTION, templateId));
}

export async function createEmployee(payload) {
  if (useLocalFallback()) {
    const employees = readLocalItems(LOCAL_EMPLOYEES_KEY);
    const employee = { ...payload, id: crypto.randomUUID() };
    writeLocalItems(LOCAL_EMPLOYEES_KEY, [...employees, employee]);
    return employee;
  }

  const docRef = await addDoc(collection(db, EMPLOYEES_COLLECTION), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: docRef.id, ...payload };
}

export async function updateEmployee(employeeId, payload) {
  if (useLocalFallback()) {
    const employees = readLocalItems(LOCAL_EMPLOYEES_KEY).map((employee) =>
      employee.id === employeeId ? { ...employee, ...payload } : employee,
    );
    writeLocalItems(LOCAL_EMPLOYEES_KEY, employees);
    return;
  }

  const employeeDoc = doc(db, EMPLOYEES_COLLECTION, employeeId);
  await updateDoc(employeeDoc, { ...payload, updatedAt: serverTimestamp() });
}

export async function removeEmployee(employeeId) {
  if (useLocalFallback()) {
    const employees = readLocalItems(LOCAL_EMPLOYEES_KEY).filter((employee) => employee.id !== employeeId);
    writeLocalItems(LOCAL_EMPLOYEES_KEY, employees);
    return;
  }

  await deleteDoc(doc(db, EMPLOYEES_COLLECTION, employeeId));
}
