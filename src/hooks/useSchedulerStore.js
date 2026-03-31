import { create } from 'zustand';
import { isFirebaseConfigured } from '../firebase/config';
import {
  sendAdminPasswordResetEmail,
  signInAdmin,
  signOutAdmin,
  subscribeAdminAuth,
} from '../firebase/authService';
import {
  createEmployee,
  createShift,
  createShiftTemplate,
  fetchAttendanceHistoryByMonth,
  finalizeWeekAttendance,
  isWeekFinalized,
  removeEmployee,
  removeShift,
  removeShiftTemplate,
  removeShiftsByDates,
  removeShiftsByEmployee,
  restoreShift,
  subscribeEmployees,
  subscribeShifts,
  subscribeShiftTemplates,
  updateEmployee,
  updateShift,
  updateShiftTemplate,
} from '../firebase/schedulerService';
import { hasTimeOverlap } from '../utils/overlap';
import { getShiftDurationHours, SHIFT_TYPES } from '../utils/analytics';
import { getIsoDate, getMonday, getWeekDays, isValidTimeLabel, timeToMinutes } from '../utils/time';

function getCurrentWeekStart() {
  return getIsoDate(getMonday(new Date()));
}

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseShiftInput(startTime, endTime) {
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

function isDateInWeek(date, weekDays) {
  return new Set(weekDays).has(date);
}

const emptyUndoState = { visible: false, actionType: '', message: '', payload: null, createdAt: 0 };

export const useSchedulerStore = create((set, get) => ({
  employees: [],
  shifts: [],
  shiftTemplates: [],
  attendanceHistory: [],
  historyFilters: {
    employeeId: '',
    yearMonth: getCurrentYearMonth(),
  },
  isHistoryLoading: false,
  isWeekLocked: false,
  isLoading: true,
  isAuthLoading: true,
  isSaving: false,
  errorMessage: '',
  warningMessage: '',
  firebaseMode: 'production',
  weekStart: getCurrentWeekStart(),
  isAdmin: false,
  adminUser: null,
  isLoginModalOpen: false,
  undoState: emptyUndoState,
  _unsubscribeEmployees: null,
  _unsubscribeShifts: null,
  _unsubscribeTemplates: null,
  _unsubscribeAuth: null,

  initializeData: () => {
    if (!isFirebaseConfigured) {
      set({
        errorMessage: 'Το Firebase δεν είναι ρυθμισμένο. Συμπλήρωσε τα env vars για Firestore/Auth.',
        isLoading: false,
        isAuthLoading: false,
      });
      return;
    }

    const unsubscribeEmployees = subscribeEmployees(
      (employees) => set({ employees, isLoading: false }),
      () => set({ errorMessage: 'Αποτυχία φόρτωσης υπαλλήλων.', isLoading: false }),
    );

    const unsubscribeShifts = subscribeShifts(
      (shifts) => set({ shifts, isLoading: false }),
      () => set({ errorMessage: 'Αποτυχία φόρτωσης βαρδιών.', isLoading: false }),
    );

    const unsubscribeTemplates = subscribeShiftTemplates(
      (shiftTemplates) => set({ shiftTemplates }),
      () => set({ errorMessage: 'Αποτυχία φόρτωσης custom βαρδιών.' }),
    );

    const unsubscribeAuth = subscribeAdminAuth(
      async (user) => {
        set({
          adminUser: user,
          isAdmin: Boolean(user),
          isAuthLoading: false,
          isLoginModalOpen: false,
        });

        if (user) {
          await get().refreshWeekLockStatus();
          await get().loadAttendanceHistory();
        } else {
          set({ attendanceHistory: [] });
        }
      },
      () => set({ warningMessage: 'Αποτυχία ελέγχου σύνδεσης διαχειριστή.', isAuthLoading: false }),
    );

    set({
      _unsubscribeEmployees: unsubscribeEmployees,
      _unsubscribeShifts: unsubscribeShifts,
      _unsubscribeTemplates: unsubscribeTemplates,
      _unsubscribeAuth: unsubscribeAuth,
    });
  },

  cleanupData: () => {
    const { _unsubscribeEmployees, _unsubscribeShifts, _unsubscribeTemplates, _unsubscribeAuth } = get();
    _unsubscribeEmployees?.();
    _unsubscribeShifts?.();
    _unsubscribeTemplates?.();
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
      throw error;
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

  setWeekStart: async (weekStart) => {
    set({ weekStart });
    await get().refreshWeekLockStatus();
  },

  goToPreviousWeek: async () => {
    const current = new Date(`${get().weekStart}T00:00:00`);
    current.setDate(current.getDate() - 7);
    set({ weekStart: getIsoDate(current) });
    await get().refreshWeekLockStatus();
  },

  goToNextWeek: async () => {
    const current = new Date(`${get().weekStart}T00:00:00`);
    current.setDate(current.getDate() + 7);
    set({ weekStart: getIsoDate(current) });
    await get().refreshWeekLockStatus();
  },

  goToCurrentWeek: async () => {
    set({ weekStart: getCurrentWeekStart() });
    await get().refreshWeekLockStatus();
  },

  refreshWeekLockStatus: async () => {
    const locked = await isWeekFinalized(get().weekStart);
    set({ isWeekLocked: locked });
  },

  setHistoryFilters: async (partial) => {
    const nextFilters = { ...get().historyFilters, ...partial };
    set({ historyFilters: nextFilters });
    await get().loadAttendanceHistory();
  },

  loadAttendanceHistory: async () => {
    if (!get().isAdmin) return;

    const { employeeId, yearMonth } = get().historyFilters;
    set({ isHistoryLoading: true });

    try {
      const attendanceHistory = await fetchAttendanceHistoryByMonth({
        yearMonth,
        employeeId,
      });
      set({ attendanceHistory, isHistoryLoading: false });
    } catch {
      set({ warningMessage: 'Αποτυχία φόρτωσης ιστορικού.', isHistoryLoading: false });
    }
  },

  setWarningMessage: (warningMessage) => set({ warningMessage }),
  clearMessages: () => set({ warningMessage: '', errorMessage: '' }),

  dismissUndo: () => set({ undoState: emptyUndoState }),

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
        case 'add_shift': {
          const { shiftId } = undoState.payload || {};
          if (shiftId) {
            await removeShift(shiftId);
          }
          break;
        }
        default:
          break;
      }

      set({
        warningMessage: 'Η ενέργεια αναιρέθηκε επιτυχώς.',
        undoState: emptyUndoState,
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

  addShiftTemplate: async ({ label, date, startTime, endTime }) => {
    if (!requireAdmin(get, set)) return;
    if (!label?.trim()) {
      set({ warningMessage: 'Το όνομα custom βάρδιας είναι υποχρεωτικό.' });
      return;
    }
    if (!date) {
      set({ warningMessage: 'Επίλεξε ημερομηνία για την κάρτα βάρδιας.' });
      return;
    }

    try {
      parseShiftInput(startTime, endTime);
      await createShiftTemplate({
        label: label.trim(),
        date,
        startTime,
        endTime,
        isPlaced: false,
        type: SHIFT_TYPES.WORK,
      });
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία δημιουργίας custom βάρδιας.' });
    }
  },

  placeShiftTemplate: async ({ templateId, date }) => {
    if (!requireAdmin(get, set)) return;
    if (!templateId || !date) return;

    const template = get().shiftTemplates.find((item) => item.id === templateId);
    if (!template) return;

    set({ isSaving: true });
    try {
      await updateShiftTemplate(templateId, { isPlaced: true, date });
      set({
        shiftTemplates: get().shiftTemplates.map((item) =>
          item.id === templateId ? { ...item, isPlaced: true, date } : item,
        ),
      });
    } finally {
      set({ isSaving: false });
    }
  },

  assignShiftFromTemplate: async ({ templateId, employeeId }) => {
    if (!requireAdmin(get, set)) return;
    if (!templateId || !employeeId) return;

    const template = get().shiftTemplates.find((item) => item.id === templateId);
    if (!template) return;

    set({ isSaving: true });
    try {
      const createdShift = await get().addShift({
        employeeId,
        date: template.date,
        startTime: template.startTime,
        endTime: template.endTime,
        label: template.label,
        trackUndo: true,
        type: template.type || SHIFT_TYPES.WORK,
      });

      if (!createdShift?.id) return;
      await removeShiftTemplate(templateId);
      set({
        shiftTemplates: get().shiftTemplates.filter((item) => item.id !== templateId),
      });
    } finally {
      set({ isSaving: false });
    }
  },

  deleteShiftTemplate: async (templateId) => {
    if (!requireAdmin(get, set)) return;
    set({ isSaving: true });
    try {
      await removeShiftTemplate(templateId);
      set({
        shiftTemplates: get().shiftTemplates.filter((item) => item.id !== templateId),
      });
    } finally {
      set({ isSaving: false });
    }
  },

  addShift: async ({
    employeeId,
    date,
    startTime,
    endTime,
    label,
    type = SHIFT_TYPES.WORK,
    notes = '',
    trackUndo = false,
  }) => {
    if (!requireAdmin(get, set)) return null;
    if (!employeeId || !date) {
      set({ warningMessage: 'Επίλεξε υπάλληλο και ημερομηνία για τη βάρδια.' });
      return null;
    }

    const weekDays = getWeekDays(get().weekStart);
    if (get().isWeekLocked && isDateInWeek(date, weekDays)) {
      set({ warningMessage: 'Η εβδομάδα είναι κλειδωμένη μετά από οριστικοποίηση.' });
      return null;
    }

    try {
      parseShiftInput(startTime, endTime);
      const isWork = type === SHIFT_TYPES.WORK;
      const conflict = isWork ? hasTimeOverlap(get().shifts, { employeeId, date, startTime, endTime }) : false;

      set({ isSaving: true });
      const createdShift = await createShift({
        employeeId,
        date,
        startTime,
        endTime,
        type,
        label: label || 'Χειροκίνητη',
        notes,
      });

      if (trackUndo && createdShift?.id) {
        set({
          undoState: buildUndoState('add_shift', 'Η βάρδια ανατέθηκε.', { shiftId: createdShift.id }),
        });
      }

      if (conflict) {
        set({
          warningMessage: 'Προειδοποίηση: Υπάρχει χρονική επικάλυψη με άλλη βάρδια του ίδιου υπαλλήλου.',
        });
      }

      return createdShift;
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία δημιουργίας βάρδιας.' });
      return null;
    } finally {
      set({ isSaving: false });
    }
  },

  moveShift: async ({ shiftId, date, startTime, endTime, label }) => {
    if (!requireAdmin(get, set)) return;

    const currentShift = get().shifts.find((shift) => shift.id === shiftId);
    if (!currentShift) return;

    const weekDays = getWeekDays(get().weekStart);
    if (get().isWeekLocked && (isDateInWeek(currentShift.date, weekDays) || isDateInWeek(date, weekDays))) {
      set({ warningMessage: 'Η εβδομάδα είναι κλειδωμένη μετά από οριστικοποίηση.' });
      return;
    }

    set({ isSaving: true });
    try {
      await updateShift(shiftId, { date, startTime, endTime, label });
    } finally {
      set({ isSaving: false });
    }

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
    const existingShift = get().shifts.find((item) => item.id === shiftId);
    if (!existingShift) return;

    const weekDays = getWeekDays(get().weekStart);
    if (get().isWeekLocked && isDateInWeek(existingShift.date, weekDays)) {
      set({ warningMessage: 'Η εβδομάδα είναι κλειδωμένη μετά από οριστικοποίηση.' });
      return;
    }

    set({ isSaving: true });
    let removedShift = null;
    try {
      removedShift = await removeShift(shiftId);
    } finally {
      set({ isSaving: false });
    }
    if (!removedShift) return;

    set({
      undoState: buildUndoState('delete_shift', 'Η βάρδια διαγράφηκε.', { shift: removedShift }),
    });
  },

  finalizeCurrentWeek: async () => {
    if (!requireAdmin(get, set)) return;

    const weekStart = get().weekStart;
    if (!weekStart) return;

    if (get().isWeekLocked) {
      set({ warningMessage: 'Η εβδομάδα έχει ήδη οριστικοποιηθεί.' });
      return;
    }

    const weekDays = getWeekDays(weekStart);
    const weekSet = new Set(weekDays);
    const weekShifts = get().shifts.filter((shift) => weekSet.has(shift.date));

    const entries = weekShifts.map((shift) => ({
      employeeId: shift.employeeId,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      totalHours: (shift.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK ? getShiftDurationHours(shift) : 0,
      type: shift.type || SHIFT_TYPES.WORK,
      label: shift.label || '',
      notes: shift.notes || '',
    }));

    const response = await finalizeWeekAttendance({
      weekStart,
      weekDays,
      entries,
      adminEmail: get().adminUser?.email || '',
    });

    if (response.alreadyFinalized) {
      set({ warningMessage: 'Η εβδομάδα έχει ήδη οριστικοποιηθεί.' });
      await get().refreshWeekLockStatus();
      return;
    }

    set({
      warningMessage: `Η εβδομάδα οριστικοποιήθηκε. Αρχειοθετήθηκαν ${response.created} εγγραφές.`,
      isWeekLocked: true,
    });
    await get().loadAttendanceHistory();
  },

  clearWeekShifts: async () => {
    if (!requireAdmin(get, set)) return;
    if (get().isWeekLocked) {
      set({ warningMessage: 'Η εβδομάδα είναι κλειδωμένη μετά από οριστικοποίηση.' });
      return;
    }

    const weekDays = getWeekDays(get().weekStart);
    const weekSet = new Set(weekDays);
    set({ isSaving: true });
    let removedShifts = [];
    try {
      removedShifts = await removeShiftsByDates(weekDays);
    } finally {
      set({ isSaving: false });
    }

    set({
      warningMessage: 'Οι βάρδιες της εβδομάδας διαγράφηκαν.',
      undoState: buildUndoState('clear_week', 'Καθαρίστηκε η εβδομάδα.', { shifts: removedShifts }),
    });

  },

  clearDayShifts: async (date) => {
    if (!requireAdmin(get, set)) return;
    if (!date) return;

    const weekDays = getWeekDays(get().weekStart);
    if (get().isWeekLocked && isDateInWeek(date, weekDays)) {
      set({ warningMessage: 'Η εβδομάδα είναι κλειδωμένη μετά από οριστικοποίηση.' });
      return;
    }

    set({ isSaving: true });
    try {
      await removeShiftsByDates([date]);
      const templatesToRemove = get().shiftTemplates.filter((template) => template.isPlaced && template.date === date);
      await Promise.all(templatesToRemove.map((template) => removeShiftTemplate(template.id)));

      set({
        warningMessage: `Καθαρίστηκαν οι βάρδιες για ${date}.`,
        shiftTemplates: get().shiftTemplates.filter((template) => !(template.isPlaced && template.date === date)),
      });
    } finally {
      set({ isSaving: false });
    }
  },
}));


