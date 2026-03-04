import { create } from 'zustand';
import {
  sendAdminPasswordResetEmail,
  signInAdmin,
  signOutAdmin,
  subscribeAdminAuth,
} from '../firebase/authService';
import {
  createEmployee,
  createShift,
  removeEmployee,
  removeShift,
  removeShiftsByDates,
  removeShiftsByEmployee,
  restoreShift,
  subscribeEmployees,
  subscribeShifts,
  updateEmployee,
  updateShift,
} from '../firebase/schedulerService';
import { hasTimeOverlap } from '../utils/overlap';
import { getIsoDate, getMonday, getWeekDays, isValidTimeLabel, timeToMinutes } from '../utils/time';

function getCurrentWeekStart() {
  return getIsoDate(getMonday(new Date()));
}

function parseShiftInput(startTime, endTime) {
  // Κοινή επικύρωση για presets και χειροκίνητες βάρδιες.
  if (!isValidTimeLabel(startTime) || !isValidTimeLabel(endTime)) {
    throw new Error('Η ώρα πρέπει να είναι σε μορφή ΩΩ:ΛΛ.');
  }

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    throw new Error('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.');
  }
}

function requireAdmin(get, set) {
  if (get().isAdmin) return true;
  set({ warningMessage: 'Η ενέργεια απαιτεί σύνδεση διαχειριστή.' });
  return false;
}

function buildUndoState(actionType, message, payload) {
  return {
    visible: true,
    actionType,
    message,
    payload,
    createdAt: Date.now(),
  };
}

export const useSchedulerStore = create((set, get) => ({
  employees: [],
  shifts: [],
  isLoading: true,
  isAuthLoading: true,
  errorMessage: '',
  warningMessage: '',
  weekStart: getCurrentWeekStart(),
  isAdmin: false,
  adminUser: null,
  isLoginModalOpen: false,
  undoState: { visible: false, actionType: '', message: '', payload: null, createdAt: 0 },
  _unsubscribeEmployees: null,
  _unsubscribeShifts: null,
  _unsubscribeAuth: null,

  initializeData: () => {
    const unsubscribeEmployees = subscribeEmployees(
      (employees) => set({ employees, isLoading: false }),
      () => set({ errorMessage: 'Αποτυχία φόρτωσης υπαλλήλων.', isLoading: false }),
    );

    const unsubscribeShifts = subscribeShifts(
      (shifts) => set({ shifts, isLoading: false }),
      () => set({ errorMessage: 'Αποτυχία φόρτωσης βαρδιών.', isLoading: false }),
    );

    const unsubscribeAuth = subscribeAdminAuth(
      (user) =>
        set({
          adminUser: user,
          isAdmin: Boolean(user),
          isAuthLoading: false,
          isLoginModalOpen: false,
        }),
      () => set({ warningMessage: 'Αποτυχία ελέγχου σύνδεσης διαχειριστή.', isAuthLoading: false }),
    );

    set({
      _unsubscribeEmployees: unsubscribeEmployees,
      _unsubscribeShifts: unsubscribeShifts,
      _unsubscribeAuth: unsubscribeAuth,
    });
  },

  cleanupData: () => {
    const { _unsubscribeEmployees, _unsubscribeShifts, _unsubscribeAuth } = get();
    _unsubscribeEmployees?.();
    _unsubscribeShifts?.();
    _unsubscribeAuth?.();
  },

  openLoginModal: () => set({ isLoginModalOpen: true }),
  closeLoginModal: () => set({ isLoginModalOpen: false }),

  loginAsAdmin: async ({ email, password }) => {
    try {
      await signInAdmin({ email, password });
      set({ warningMessage: 'Σύνδεση διαχειριστή επιτυχής.' });
      return true;
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία σύνδεσης διαχειριστή.' });
      return false;
    }
  },

  logoutAdmin: async () => {
    await signOutAdmin();
    set({ warningMessage: 'Έγινε αποσύνδεση διαχειριστή.' });
  },

  requestPasswordReset: async (email) => {
    try {
      await sendAdminPasswordResetEmail(email);
      set({ warningMessage: 'Στάλθηκε email επαναφοράς κωδικού.' });
      return true;
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία αποστολής email επαναφοράς.' });
      return false;
    }
  },

  setWeekStart: (weekStart) => set({ weekStart }),

  goToPreviousWeek: () => {
    const current = new Date(`${get().weekStart}T00:00:00`);
    current.setDate(current.getDate() - 7);
    set({ weekStart: getIsoDate(current) });
  },

  goToNextWeek: () => {
    const current = new Date(`${get().weekStart}T00:00:00`);
    current.setDate(current.getDate() + 7);
    set({ weekStart: getIsoDate(current) });
  },

  goToCurrentWeek: () => {
    set({ weekStart: getCurrentWeekStart() });
  },

  setWarningMessage: (warningMessage) => set({ warningMessage }),
  clearMessages: () => set({ warningMessage: '', errorMessage: '' }),

  dismissUndo: () => set({ undoState: { visible: false, actionType: '', message: '', payload: null, createdAt: 0 } }),

  undoLastAction: async () => {
    if (!requireAdmin(get, set)) return;

    const undoState = get().undoState;
    if (!undoState.visible) return;

    try {
      switch (undoState.actionType) {
        case 'delete_shift': {
          await restoreShift(undoState.payload.shift);
          break;
        }
        case 'move_shift': {
          const { shiftId, previousValues } = undoState.payload;
          await updateShift(shiftId, previousValues);
          break;
        }
        case 'clear_week': {
          const shiftsToRestore = undoState.payload.shifts || [];
          await Promise.all(shiftsToRestore.map((shift) => restoreShift(shift)));
          break;
        }
        default:
          break;
      }

      set({
        warningMessage: 'Η ενέργεια αναιρέθηκε επιτυχώς.',
        undoState: { visible: false, actionType: '', message: '', payload: null, createdAt: 0 },
      });
    } catch {
      set({ warningMessage: 'Αποτυχία αναίρεσης ενέργειας.' });
    }
  },

  addEmployee: async ({ fullName, role, color, afm, phone, email, hireDate }) => {
    if (!requireAdmin(get, set)) return;
    if (!fullName?.trim()) {
      set({ warningMessage: 'Το όνομα υπαλλήλου είναι υποχρεωτικό.' });
      return;
    }

    await createEmployee({
      fullName: fullName.trim(),
      role: role?.trim() || 'Προσωπικό',
      color: color || '#1D4ED8',
      afm: afm?.trim() || '',
      phone: phone?.trim() || '',
      email: email?.trim() || '',
      hireDate: hireDate || '',
      isActive: true,
    });
  },

  editEmployee: async ({ id, fullName, role, color, afm, phone, email, hireDate }) => {
    if (!requireAdmin(get, set)) return;
    if (!id || !fullName?.trim()) {
      set({ warningMessage: 'Ανεπαρκή δεδομένα για ενημέρωση υπαλλήλου.' });
      return;
    }

    await updateEmployee(id, {
      fullName: fullName.trim(),
      role: role?.trim() || '',
      color: color || '#1D4ED8',
      afm: afm?.trim() || '',
      phone: phone?.trim() || '',
      email: email?.trim() || '',
      hireDate: hireDate || '',
    });
  },

  deleteEmployee: async (employeeId) => {
    if (!requireAdmin(get, set)) return;
    await removeShiftsByEmployee(employeeId);
    await removeEmployee(employeeId);
  },

  addShift: async ({ employeeId, date, startTime, endTime, label, notes = '' }) => {
    if (!requireAdmin(get, set)) return;

    try {
      parseShiftInput(startTime, endTime);
      const conflict = hasTimeOverlap(get().shifts, { employeeId, date, startTime, endTime });

      await createShift({
        employeeId,
        date,
        startTime,
        endTime,
        label: label || 'Χειροκίνητη',
        notes,
      });

      if (conflict) {
        set({
          warningMessage:
            'Προειδοποίηση: Ο υπάλληλος έχει ήδη άλλη βάρδια που επικαλύπτεται την ίδια ημέρα.',
        });
      }
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία δημιουργίας βάρδιας.' });
    }
  },

  moveShift: async ({ shiftId, date, startTime, endTime, label }) => {
    if (!requireAdmin(get, set)) return;

    const currentShift = get().shifts.find((shift) => shift.id === shiftId);
    if (!currentShift) return;

    await updateShift(shiftId, { date, startTime, endTime, label });

    set({
      undoState: buildUndoState('move_shift', 'Η βάρδια μετακινήθηκε.', {
        shiftId,
        previousValues: {
          date: currentShift.date,
          startTime: currentShift.startTime,
          endTime: currentShift.endTime,
          label: currentShift.label,
        },
      }),
    });
  },

  deleteShift: async (shiftId) => {
    if (!requireAdmin(get, set)) return;
    const removedShift = await removeShift(shiftId);
    if (!removedShift) return;

    set({
      undoState: buildUndoState('delete_shift', 'Η βάρδια διαγράφηκε.', { shift: removedShift }),
    });
  },

  clearWeekShifts: async () => {
    if (!requireAdmin(get, set)) return;
    const weekDays = getWeekDays(get().weekStart);
    const removedShifts = await removeShiftsByDates(weekDays);

    set({
      warningMessage: 'Οι βάρδιες της εβδομάδας διαγράφηκαν.',
      undoState: buildUndoState('clear_week', 'Καθαρίστηκε η εβδομάδα.', { shifts: removedShifts }),
    });
  },
}));
