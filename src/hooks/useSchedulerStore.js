import { create } from 'zustand';
import { firebaseConfigErrorMessage, isFirebaseConfigured } from '../firebase/config';
import {
  sendAdminPasswordResetEmail,
  signInAdmin,
  signOutAdmin,
  subscribeAdminAuth,
} from '../firebase/authService';
import {
  createAnnouncement,
  createManyShifts,
  createEmployee,
  createShift,
  createShiftTemplate,
  fetchLatestWeekSnapshotByWeekId,
  fetchShiftsByDates,
  fetchAttendanceHistoryByMonth,
  fetchWeekHistoryList,
  fetchWeekTemplates,
  finalizeWeekAttendance,
  hasConsecutiveSundayAssignment,
  isWeekFinalized,
  removeAnnouncement,
  removeEmployee,
  removeShift,
  removeShiftTemplate,
  removeWeekShifts,
  removeShiftsByDates,
  removeShiftsByEmployee,
  restoreShift,
  saveWeekHistorySnapshot,
  saveWeekTemplate,
  subscribeEmployees,
  subscribeAnnouncements,
  subscribeSchedulerSettings,
  subscribeShifts,
  subscribeShiftTemplates,
  upsertSchedulerSettings,
  updateEmployee,
  updateShift,
  updateShiftTemplate,
} from '../firebase/schedulerService';
import {
  evaluateSundayRuleViolation,
  generateSmartMonthSchedule,
  generateSmartWeekSchedule,
  getWeekIdFromWeekStart,
} from '../utils/autoSchedulerService';
import { hasTimeOverlap } from '../utils/overlap';
import { calculateWeeklyTotals, getShiftDurationHours, SHIFT_TYPES } from '../utils/analytics';
import { getMonthDays, inferShiftTypeFromTimes } from '../utils/scheduleUtils';
import { getIsoDate, getMonday, getWeekDays, isValidTimeLabel, timeToMinutes } from '../utils/time';

function getCurrentWeekStart() {
  return getIsoDate(getMonday(new Date()));
}

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthDateSet(year, month) {
  const { days } = getMonthDays(year, month);
  return new Set(days);
}

function parseShiftInput(startTime, endTime) {
  if (!isValidTimeLabel(startTime) || !isValidTimeLabel(endTime)) {
    throw new Error('Η ώρα πρέπει να είναι σε μορφή ΩΩ:ΛΛ.');
  }

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    throw new Error('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.');
  }
}

function buildNormalizedShiftPayload({
  employeeId,
  date,
  startTime,
  endTime,
  label,
  shiftType,
  customLabel,
  type,
  notes,
  isHoliday,
  isSpecialDay,
  specialDayLabel,
  isManualOverride,
}) {
  const normalizedShiftType = shiftType || inferShiftTypeFromTimes(startTime, endTime);
  const normalizedLabel = label?.trim() || 'Χειροκίνητη';

  return {
    employeeId,
    date,
    startTime,
    endTime,
    type: type || SHIFT_TYPES.WORK,
    label: normalizedLabel,
    notes: notes || '',
    shiftType: normalizedShiftType,
    customLabel:
      normalizedShiftType === 'custom' ? customLabel?.trim() || normalizedLabel || 'Προσαρμοσμένη' : '',
    isHoliday: Boolean(isHoliday),
    isSpecialDay: Boolean(isSpecialDay || isHoliday),
    specialDayLabel: specialDayLabel?.trim() || '',
    isManualOverride: Boolean(isManualOverride),
  };
}

function isShiftInWeekRange(shift, weekDays) {
  if (!shift?.date || !Array.isArray(weekDays)) return false;
  return weekDays.includes(shift.date);
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

function sortShiftsByDateAndStart(shifts = []) {
  return [...shifts].sort((a, b) =>
    `${a.date || ''}_${a.startTime || ''}_${a.employeeId || ''}`.localeCompare(
      `${b.date || ''}_${b.startTime || ''}_${b.employeeId || ''}`,
    ),
  );
}

function hasWeekShiftData(shifts = [], weekDays = []) {
  if (!Array.isArray(shifts) || !Array.isArray(weekDays) || !weekDays.length) return false;
  const weekSet = new Set(weekDays);
  return shifts.some((shift) => shift?.date && weekSet.has(shift.date));
}

function isWeekEditingLocked(state, weekDays = getWeekDays(state.weekStart)) {
  return Boolean(state.isWeekLocked && hasWeekShiftData(state.shifts, weekDays));
}

const emptyUndoState = { visible: false, actionType: '', message: '', payload: null, createdAt: 0 };
const defaultGeneratorRules = {
  weeklyRotationEnabled: true,
  avoidConsecutiveSundays: true,
  allowManualOverride: true,
  startWithCoreAMorning: true,
  generationMode: 'balanced',
};

function normalizeGeneratorRules(value = {}) {
  const mode = value?.generationMode;
  const generationMode = mode === 'strict' || mode === 'manual_assist' || mode === 'balanced'
    ? mode
    : defaultGeneratorRules.generationMode;
  return {
    ...defaultGeneratorRules,
    ...(value || {}),
    generationMode,
  };
}

export const useSchedulerStore = create((set, get) => ({
  employees: [],
  shifts: [],
  shiftTemplates: [],
  announcements: [],
  attendanceHistory: [],
  weekHistory: [],
  weekTemplates: [],
  generatorRules: { ...defaultGeneratorRules },
  specialDaysByDate: {},
  selectedHistoryWeekId: '',
  selectedTemplateId: '',
  sundayRuleViolations: {},
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
  weekStart: getCurrentWeekStart(),
  isAdmin: false,
  adminUser: null,
  isLoginModalOpen: false,
  undoState: emptyUndoState,
  _unsubscribeEmployees: null,
  _unsubscribeShifts: null,
  _unsubscribeTemplates: null,
  _unsubscribeAnnouncements: null,
  _unsubscribeSchedulerSettings: null,
  _unsubscribeAuth: null,

  initializeData: () => {
    if (!isFirebaseConfigured) {
      set({
        errorMessage: firebaseConfigErrorMessage || 'Το Firebase δεν είναι ρυθμισμένο. Συμπλήρωσε τα env vars για Firestore/Auth.',
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

    const unsubscribeAnnouncements = subscribeAnnouncements(
      (announcements) => set({ announcements }),
      () => set({ errorMessage: 'Αποτυχία φόρτωσης ανακοινώσεων.' }),
    );

    const unsubscribeSchedulerSettings = subscribeSchedulerSettings(
      (settingsDoc) => {
        const generatorRules = normalizeGeneratorRules(settingsDoc?.generatorRules);
        const specialDaysByDate =
          settingsDoc?.specialDaysByDate && typeof settingsDoc.specialDaysByDate === 'object'
            ? settingsDoc.specialDaysByDate
            : {};
        set({ generatorRules, specialDaysByDate });
      },
      () => set({ warningMessage: 'Αποτυχία φόρτωσης ρυθμίσεων προγραμματισμού.' }),
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
          await get().loadWeekHistory();
          await get().loadWeekTemplates();
        } else {
          set({ attendanceHistory: [], weekHistory: [], weekTemplates: [] });
        }
      },
      () => set({ warningMessage: 'Αποτυχία ελέγχου σύνδεσης διαχειριστή.', isAuthLoading: false }),
    );

    set({
      _unsubscribeEmployees: unsubscribeEmployees,
      _unsubscribeShifts: unsubscribeShifts,
      _unsubscribeTemplates: unsubscribeTemplates,
      _unsubscribeAnnouncements: unsubscribeAnnouncements,
      _unsubscribeSchedulerSettings: unsubscribeSchedulerSettings,
      _unsubscribeAuth: unsubscribeAuth,
    });
  },

  cleanupData: () => {
    const {
      _unsubscribeEmployees,
      _unsubscribeShifts,
      _unsubscribeTemplates,
      _unsubscribeAnnouncements,
      _unsubscribeSchedulerSettings,
      _unsubscribeAuth,
    } = get();
    _unsubscribeEmployees?.();
    _unsubscribeShifts?.();
    _unsubscribeTemplates?.();
    _unsubscribeAnnouncements?.();
    _unsubscribeSchedulerSettings?.();
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

  setWeekFromDate: async (dateValue) => {
    if (!dateValue) return;
    const monday = getMonday(new Date(`${dateValue}T00:00:00`));
    set({ weekStart: getIsoDate(monday) });
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
    const weekStart = get().weekStart;
    const weekDays = getWeekDays(weekStart);
    const finalizedInFirestore = await isWeekFinalized(weekStart);
    const hasWeekData = hasWeekShiftData(get().shifts, weekDays);
    set({ isWeekLocked: finalizedInFirestore && hasWeekData });
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

  saveGeneratorRules: async (partialRules = {}) => {
    if (!requireAdmin(get, set)) return false;
    const nextRules = normalizeGeneratorRules({ ...get().generatorRules, ...(partialRules || {}) });
    set({ generatorRules: nextRules });
    await upsertSchedulerSettings({ generatorRules: nextRules });
    set({ warningMessage: 'Οι ρυθμίσεις generator αποθηκεύτηκαν.' });
    return true;
  },

  upsertSpecialDay: async ({ date, isHoliday, isSpecialDay, label, operatingStartTime, operatingEndTime }) => {
    if (!requireAdmin(get, set)) return false;
    if (!date) {
      set({ warningMessage: 'Επίλεξε ημερομηνία για ειδική ημέρα.' });
      return false;
    }
    if (
      operatingStartTime &&
      operatingEndTime &&
      timeToMinutes(operatingStartTime) >= timeToMinutes(operatingEndTime)
    ) {
      set({ warningMessage: 'Το ωράριο ειδικής ημέρας δεν είναι έγκυρο.' });
      return false;
    }

    const nextSpecialDays = {
      ...(get().specialDaysByDate || {}),
      [date]: {
        isHoliday: Boolean(isHoliday),
        isSpecialDay: Boolean(isSpecialDay || isHoliday),
        label: (label || '').trim(),
        operatingStartTime: operatingStartTime || '',
        operatingEndTime: operatingEndTime || '',
      },
    };

    set({ specialDaysByDate: nextSpecialDays });
    await upsertSchedulerSettings({ specialDaysByDate: nextSpecialDays });
    set({ warningMessage: 'Η ειδική ημέρα αποθηκεύτηκε.' });
    return true;
  },

  removeSpecialDay: async (date) => {
    if (!requireAdmin(get, set)) return false;
    if (!date) return false;

    const nextSpecialDays = { ...(get().specialDaysByDate || {}) };
    delete nextSpecialDays[date];

    set({ specialDaysByDate: nextSpecialDays });
    await upsertSchedulerSettings({ specialDaysByDate: nextSpecialDays });
    set({ warningMessage: 'Η ειδική ημέρα αφαιρέθηκε.' });
    return true;
  },

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
    if (!requireAdmin(get, set)) return false;
    if (!fullName?.trim()) {
      set({ warningMessage: 'Το όνομα υπαλλήλου είναι υποχρεωτικό.' });
      return false;
    }

    try {
      await createEmployee({
        fullName: fullName.trim(),
        role: role?.trim() || 'Προσωπικό',
        color: color || '#1D4ED8',
        afm: afm?.trim() || '',
        phone: phone?.trim() || '',
        email: email?.trim() || '',
        hireDate: hireDate || '',
        isActive: true,
        scheduleRole: 'general',
        fixedDayOff: null,
        participatesInRotation: true,
        participatesInSundayRotation: true,
        defaultShiftPreference: 'auto',
      });
      set({ warningMessage: 'Ο υπάλληλος προστέθηκε.' });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία προσθήκης υπαλλήλου.' });
      return false;
    }
  },

  editEmployee: async ({ id, fullName, role, color, afm, phone, email, hireDate }) => {
    if (!requireAdmin(get, set)) return false;
    if (!id || !fullName?.trim()) {
      set({ warningMessage: 'Ανεπαρκή δεδομένα για ενημέρωση υπαλλήλου.' });
      return false;
    }

    try {
      await updateEmployee(id, {
        fullName: fullName.trim(),
        role: role?.trim() || '',
        color: color || '#1D4ED8',
        afm: afm?.trim() || '',
        phone: phone?.trim() || '',
        email: email?.trim() || '',
        hireDate: hireDate || '',
      });
      set({ warningMessage: 'Το προφίλ ενημερώθηκε.' });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία ενημέρωσης προφίλ.' });
      return false;
    }
  },

  saveEmployeeSchedulingRules: async ({
    employeeId,
    scheduleRole,
    fixedDayOff,
    participatesInRotation,
    participatesInSundayRotation,
    defaultShiftPreference,
  }) => {
    if (!requireAdmin(get, set)) return false;
    if (!employeeId) return false;

    const parsedFixedDayOff =
      fixedDayOff === '' || fixedDayOff === null || typeof fixedDayOff === 'undefined'
        ? null
        : Number(fixedDayOff);

    await updateEmployee(employeeId, {
      scheduleRole: scheduleRole || 'general',
      fixedDayOff: Number.isInteger(parsedFixedDayOff) ? parsedFixedDayOff : null,
      participatesInRotation: Boolean(participatesInRotation),
      participatesInSundayRotation: participatesInSundayRotation !== false,
      defaultShiftPreference: defaultShiftPreference || 'auto',
    });

    set({ warningMessage: 'Οι κανόνες εργαζομένου ενημερώθηκαν.' });
    return true;
  },

  deleteEmployee: async (employeeId) => {
    if (!requireAdmin(get, set)) return false;
    if (!employeeId) return false;
    try {
      await removeShiftsByEmployee(employeeId);
      await removeEmployee(employeeId);
      set({ warningMessage: 'Ο υπάλληλος διαγράφηκε.' });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία διαγραφής υπαλλήλου.' });
      return false;
    }
  },

  addShiftTemplate: async ({ label, date, startTime, endTime }) => {
    if (!requireAdmin(get, set)) return false;
    if (!label?.trim()) {
      set({ warningMessage: 'Το όνομα custom βάρδιας είναι υποχρεωτικό.' });
      return false;
    }
    if (!date) {
      set({ warningMessage: 'Επίλεξε ημερομηνία για την κάρτα βάρδιας.' });
      return false;
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
      set({ warningMessage: 'Η custom κάρτα βάρδιας δημιουργήθηκε.' });
      return true;
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία δημιουργίας custom βάρδιας.' });
      return false;
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
    if (!requireAdmin(get, set)) return false;
    if (!templateId) return false;
    set({ isSaving: true });
    try {
      await removeShiftTemplate(templateId);
      set({
        shiftTemplates: get().shiftTemplates.filter((item) => item.id !== templateId),
      });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Failed to update shift.' });
      return false;
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
    shiftType = '',
    customLabel = '',
    type = SHIFT_TYPES.WORK,
    notes = '',
    isHoliday = false,
    isSpecialDay = false,
    specialDayLabel = '',
    isManualOverride = true,
    trackUndo = false,
  }) => {
    if (!requireAdmin(get, set)) return null;
    if (!employeeId || !date) {
      set({ warningMessage: 'Select employee and date for the shift.' });
      return null;
    }

    const weekDays = getWeekDays(get().weekStart);
    if (get().isWeekLocked && !hasWeekShiftData(get().shifts, weekDays)) {
      set({ isWeekLocked: false });
    }
    if (isWeekEditingLocked(get(), weekDays) && isDateInWeek(date, weekDays)) {
      set({ warningMessage: 'This week is locked after finalize.' });
      return null;
    }

    try {
      parseShiftInput(startTime, endTime);
      const sundayViolation = await evaluateSundayRuleViolation({
        employeeId,
        date,
        startTime,
        endTime,
        hasConsecutiveSundayAssignmentFn: hasConsecutiveSundayAssignment,
      });

      const isWork = type === SHIFT_TYPES.WORK;
      const conflict = isWork ? hasTimeOverlap(get().shifts, { employeeId, date, startTime, endTime }) : false;
      if (conflict) {
        set({
          warningMessage: 'Save failed: overlapping shift for the same employee.',
        });
        return null;
      }

      set({ isSaving: true });
      const normalizedShiftType = shiftType || inferShiftTypeFromTimes(startTime, endTime);
      const createdShift = await createShift({
        employeeId,
        date,
        startTime,
        endTime,
        type,
        label: label || 'Manual',
        notes,
        shiftType: normalizedShiftType,
        customLabel: normalizedShiftType === 'custom' ? customLabel || label || 'Custom' : '',
        isHoliday: Boolean(isHoliday),
        isSpecialDay: Boolean(isSpecialDay || isHoliday),
        specialDayLabel: specialDayLabel?.trim() || '',
        isManualOverride: Boolean(isManualOverride),
      });

      if (createdShift?.id) {
        set((state) => ({
          shifts: sortShiftsByDateAndStart([...state.shifts, createdShift]),
        }));
      }

      if (trackUndo && createdShift?.id) {
        set({
          undoState: buildUndoState('add_shift', 'Shift assigned.', { shiftId: createdShift.id }),
        });
      }

      let snapshotWarning = '';
      try {
        await get().saveCurrentWeekSnapshot('manual_save');
        await get().loadWeekHistory();
      } catch {
        snapshotWarning = 'Shift was saved, but history refresh failed.';
      }

      if (sundayViolation.violated && createdShift?.id) {
        set((state) => ({
          sundayRuleViolations: {
            ...state.sundayRuleViolations,
            [createdShift.id]: sundayViolation.message,
          },
          warningMessage: sundayViolation.message,
        }));
      } else if (snapshotWarning) {
        set({ warningMessage: snapshotWarning });
      }

      return createdShift;
    } catch (error) {
      set({ warningMessage: error.message || 'Failed to create shift.' });
      return null;
    } finally {
      set({ isSaving: false });
    }
  },

  updateShiftDetails: async ({
    shiftId,
    employeeId,
    date,
    startTime,
    endTime,
    label,
    shiftType = '',
    customLabel = '',
    type = SHIFT_TYPES.WORK,
    notes = '',
    isHoliday = false,
    isSpecialDay = false,
    specialDayLabel = '',
    isManualOverride = true,
  }) => {
    if (!requireAdmin(get, set)) return false;
    if (!shiftId || !employeeId || !date) return false;

    const currentShift = get().shifts.find((shift) => shift.id === shiftId);
    if (!currentShift) return false;

    const weekDays = getWeekDays(get().weekStart);
    if (
      isWeekEditingLocked(get(), weekDays) &&
      (isShiftInWeekRange(currentShift, weekDays) || isDateInWeek(date, weekDays))
    ) {
      set({ warningMessage: 'This week is locked after finalize.' });
      return false;
    }

    try {
      parseShiftInput(startTime, endTime);

      const isWork = type === SHIFT_TYPES.WORK;
      const conflict = isWork
        ? hasTimeOverlap(get().shifts, { id: shiftId, employeeId, date, startTime, endTime })
        : false;
      if (conflict) {
        set({
          warningMessage:
            'Update failed: overlapping shift for the same employee.',
        });
        return false;
      }

      const sundayViolation = await evaluateSundayRuleViolation({
        employeeId,
        date,
        startTime,
        endTime,
        hasConsecutiveSundayAssignmentFn: hasConsecutiveSundayAssignment,
      });

      const payload = buildNormalizedShiftPayload({
        employeeId,
        date,
        startTime,
        endTime,
        label,
        shiftType,
        customLabel,
        type,
        notes,
        isHoliday,
        isSpecialDay,
        specialDayLabel,
        isManualOverride,
      });

      set({ isSaving: true });
      await updateShift(shiftId, payload);
      set((state) => ({
        shifts: sortShiftsByDateAndStart(
          state.shifts.map((shift) => (shift.id === shiftId ? { ...shift, ...payload } : shift)),
        ),
      }));

      let snapshotWarning = '';
      try {
        await get().saveCurrentWeekSnapshot('manual_save');
        await get().loadWeekHistory();
      } catch {
        snapshotWarning = 'Shift was updated, but history refresh failed.';
      }

      set((state) => {
        const nextViolations = { ...state.sundayRuleViolations };
        delete nextViolations[shiftId];
        if (sundayViolation.violated) {
          nextViolations[shiftId] = sundayViolation.message;
        }

        return {
          sundayRuleViolations: nextViolations,
          warningMessage: sundayViolation.violated
            ? sundayViolation.message
            : snapshotWarning || 'Shift updated.',
        };
      });

      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Failed to delete custom template card.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  moveShift: async ({ shiftId, date, startTime, endTime, label }) => {
    if (!requireAdmin(get, set)) return;

    const currentShift = get().shifts.find((shift) => shift.id === shiftId);
    if (!currentShift) return;

    const weekDays = getWeekDays(get().weekStart);
    if (isWeekEditingLocked(get(), weekDays) && (isDateInWeek(currentShift.date, weekDays) || isDateInWeek(date, weekDays))) {
      set({ warningMessage: 'Η εβδομάδα είναι κλειδωμένη μετά από οριστικοποίηση.' });
      return;
    }

    set({ isSaving: true });
    try {
      parseShiftInput(startTime, endTime);
      const isWork = (currentShift.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK;
      if (isWork) {
        const conflict = hasTimeOverlap(get().shifts, {
          id: shiftId,
          employeeId: currentShift.employeeId,
          date,
          startTime,
          endTime,
        });
        if (conflict) {
          set({ warningMessage: 'Αποτυχία μετακίνησης: εντοπίστηκε επικάλυψη βάρδιας.' });
          return;
        }
      }
      await updateShift(shiftId, {
        date,
        startTime,
        endTime,
        label,
        shiftType: currentShift.shiftType || inferShiftTypeFromTimes(startTime, endTime),
        isManualOverride: true,
      });
      await get().saveCurrentWeekSnapshot('manual_save');
      await get().loadWeekHistory();
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

  toggleShiftManualOverride: async ({ shiftId, value }) => {
    if (!requireAdmin(get, set)) return false;
    if (!shiftId) return false;

    const currentShift = get().shifts.find((shift) => shift.id === shiftId);
    if (!currentShift) return false;

    const nextValue = typeof value === 'boolean' ? value : !Boolean(currentShift.isManualOverride);
    const weekDays = getWeekDays(get().weekStart);
    if (isWeekEditingLocked(get(), weekDays) && isDateInWeek(currentShift.date, weekDays)) {
      set({ warningMessage: 'Η εβδομάδα είναι κλειδωμένη. Δεν επιτρέπεται αλλαγή override.' });
      return false;
    }

    set({ isSaving: true });
    try {
      await updateShift(shiftId, { isManualOverride: nextValue });
      set((state) => ({
        shifts: state.shifts.map((shift) =>
          shift.id === shiftId ? { ...shift, isManualOverride: nextValue } : shift,
        ),
      }));
      await get().saveCurrentWeekSnapshot('manual_save');
      await get().loadWeekHistory();
      set({
        warningMessage: nextValue
          ? 'Η βάρδια επισημάνθηκε ως manual override.'
          : 'Η βάρδια επέστρεψε σε auto-managed κατάσταση.',
      });
      return true;
    } finally {
      set({ isSaving: false });
    }
  },

  deleteShift: async (shiftId) => {
    if (!requireAdmin(get, set)) return false;
    const existingShift = get().shifts.find((item) => item.id === shiftId);
    if (!existingShift) return false;

    const weekDays = getWeekDays(get().weekStart);
    if (isWeekEditingLocked(get(), weekDays) && isDateInWeek(existingShift.date, weekDays)) {
      set({ warningMessage: 'Η εβδομάδα είναι κλειδωμένη μετά από οριστικοποίηση.' });
      return false;
    }

    set({ isSaving: true });
    let removedShift = null;
    try {
      removedShift = await removeShift(shiftId);
    } finally {
      set({ isSaving: false });
    }
    if (!removedShift) return false;

    set((state) => ({
      shifts: state.shifts.filter((item) => item.id !== shiftId),
      undoState: buildUndoState('delete_shift', 'Η βάρδια διαγράφηκε.', { shift: removedShift }),
    }));
    await get().saveCurrentWeekSnapshot('manual_save');
    await get().loadWeekHistory();
    return true;
  },

  finalizeCurrentWeek: async () => {
    if (!requireAdmin(get, set)) return;

    const weekStart = get().weekStart;
    if (!weekStart) return;

    if (isWeekEditingLocked(get(), getWeekDays(weekStart))) {
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

    let snapshotSaved = true;
    try {
      await get().saveCurrentWeekSnapshot('finalize');
      await get().loadWeekHistory();
    } catch {
      snapshotSaved = false;
    }

    set({
      warningMessage: snapshotSaved
        ? `Η εβδομάδα οριστικοποιήθηκε. Αρχειοθετήθηκαν ${response.created} εγγραφές και αποθηκεύτηκε snapshot ιστορικού.`
        : `Η εβδομάδα οριστικοποιήθηκε. Αρχειοθετήθηκαν ${response.created} εγγραφές, αλλά το snapshot ιστορικού απέτυχε.`,
      isWeekLocked: true,
    });
    await get().loadAttendanceHistory();
  },

  clearWeekShifts: async () => {
    if (!requireAdmin(get, set)) return false;
    if (isWeekEditingLocked(get(), getWeekDays(get().weekStart))) {
      set({ warningMessage: 'This week is locked after finalize.' });
      return false;
    }

    const weekDays = getWeekDays(get().weekStart);
    const weekSet = new Set(weekDays);
    set({ isSaving: true });
    const removedById = new Map();

    try {
      const removedShifts = await removeShiftsByDates(weekDays);
      removedShifts.forEach((shift) => {
        if (shift?.id) removedById.set(shift.id, shift);
      });

      let remainingWeekShifts = await fetchShiftsByDates(weekDays);
      let pass = 0;

      while (remainingWeekShifts.length > 0 && pass < 3) {
        await Promise.all(
          remainingWeekShifts.map(async (shift) => {
            if (!shift?.id) return;
            try {
              const removed = await removeShift(shift.id);
              if (removed?.id) removedById.set(removed.id, removed);
            } catch {
              // Retry in next pass
            }
          }),
        );

        remainingWeekShifts = await fetchShiftsByDates(weekDays);
        pass += 1;
      }

      if (remainingWeekShifts.length > 0) {
        set({
          warningMessage: 'Week clear failed: residual shifts remain. Try again.',
        });
        return false;
      }
    } catch (error) {
      set({ warningMessage: error?.message || 'Failed to clear week.' });
      return false;
    } finally {
      set({ isSaving: false });
    }

    set((state) => ({
      shifts: state.shifts.filter((shift) => !weekSet.has(shift.date)),
      warningMessage: 'Week shifts were cleared.',
      undoState: buildUndoState('clear_week', 'Week cleared.', { shifts: [...removedById.values()] }),
    }));

    await get().refreshWeekLockStatus();
    try {
      await get().saveCurrentWeekSnapshot('manual_save');
      await get().loadWeekHistory();
    } catch {
      set({ warningMessage: 'Week cleared, but history refresh failed.' });
    }

    return true;
  },

  addAnnouncement: async ({ title, body }) => {
    if (!requireAdmin(get, set)) return false;
    if (!title?.trim() || !body?.trim()) {
      set({ warningMessage: 'Συμπλήρωσε τίτλο και περιεχόμενο ανακοίνωσης.' });
      return false;
    }

    set({ isSaving: true });
    try {
      await createAnnouncement({
        title: title.trim(),
        body: body.trim(),
        authorEmail: get().adminUser?.email || '',
      });
      set({ warningMessage: 'Η ανακοίνωση δημοσιεύτηκε.' });
      return true;
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία δημοσίευσης ανακοίνωσης.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  loadWeekHistory: async () => {
    if (!get().isAdmin) return;
    try {
      const weekHistory = await fetchWeekHistoryList(60);
      set({ weekHistory });
    } catch {
      set({ warningMessage: 'Αποτυχία φόρτωσης ιστορικού εβδομάδων.' });
    }
  },

  loadWeekTemplates: async () => {
    if (!get().isAdmin) return;
    try {
      const weekTemplates = await fetchWeekTemplates();
      set({ weekTemplates });
    } catch {
      set({ warningMessage: 'Αποτυχία φόρτωσης templates.' });
    }
  },

  setSelectedHistoryWeekId: (selectedHistoryWeekId) => set({ selectedHistoryWeekId }),
  setSelectedTemplateId: (selectedTemplateId) => set({ selectedTemplateId }),

  saveCurrentWeekManually: async () => {
    if (!requireAdmin(get, set)) return false;

    set({ isSaving: true });
    try {
      await get().saveCurrentWeekSnapshot('manual_save_button');
      await get().loadWeekHistory();
      set({ warningMessage: 'Η εβδομάδα αποθηκεύτηκε στο ιστορικό.' });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία αποθήκευσης ιστορικού εβδομάδας.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  saveCurrentWeekSnapshot: async (source = 'manual_save') => {
    if (!get().isAdmin) return;
    const weekStart = get().weekStart;
    if (!weekStart) return;

    const weekDays = getWeekDays(weekStart);
    const weekSet = new Set(weekDays);
    let weekShifts = get().shifts.filter((shift) => weekSet.has(shift.date));

    try {
      const firestoreWeekShifts = await fetchShiftsByDates(weekDays);
      weekShifts = (firestoreWeekShifts || []).filter((shift) => weekSet.has(shift.date));
    } catch {
      // Fallback to local state snapshot if Firestore read fails.
    }

    const normalizedShifts = weekShifts.map((shift) => ({
      employeeId: shift.employeeId,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      label: shift.label || '',
      type: shift.type || SHIFT_TYPES.WORK,
      notes: shift.notes || '',
      shiftType: shift.shiftType || inferShiftTypeFromTimes(shift.startTime, shift.endTime),
      customLabel: shift.customLabel || '',
      isHoliday: Boolean(shift.isHoliday),
      isSpecialDay: Boolean(shift.isSpecialDay),
      specialDayLabel: shift.specialDayLabel || '',
      isManualOverride: Boolean(shift.isManualOverride),
    }));

    const employees = get().employees || [];
    const analytics = calculateWeeklyTotals(normalizedShifts, employees, weekDays);
    const employeeSummaries = employees.map((employee) => {
      const leave = analytics.leaveDaysByEmployee?.[employee.id] || {};
      const breakdown = analytics.workBreakdownByEmployee?.[employee.id] || {};
      return {
        employeeId: employee.id,
        employeeName: employee.fullName || '',
        totalHours: analytics.totalsByEmployee?.[employee.id] || 0,
        shiftsCount: analytics.shiftsCountByEmployee?.[employee.id] || 0,
        morning: breakdown.morning || 0,
        intermediate: breakdown.intermediate || 0,
        evening: breakdown.evening || 0,
        custom: breakdown.custom || 0,
        restDays: leave.restDays || 0,
        leaveDays: leave.leaveDays || 0,
        sickDays: leave.sickDays || 0,
        nonWorkingSundays: leave.nonWorkingSundays || 0,
        inferredRestDays: leave.inferredRestDays || 0,
      };
    });

    await saveWeekHistorySnapshot({
      weekId: getWeekIdFromWeekStart(weekStart),
      weekStart: weekDays[0],
      weekEnd: weekDays[6],
      source,
      shifts: normalizedShifts,
      createdBy: get().adminUser?.email || '',
      metadata: {
        totalShifts: normalizedShifts.length,
        totalWorkHours: analytics.totalHours,
        totalsByType: analytics.totalsByType,
        employeeSummaries,
      },
    });
  },

  loadSelectedHistoryWeekToGrid: async () => {
    if (!requireAdmin(get, set)) return false;
    const selectedWeekId = get().selectedHistoryWeekId;
    if (!selectedWeekId) return false;

    let snapshot = null;
    try {
      snapshot = await fetchLatestWeekSnapshotByWeekId(selectedWeekId);
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία ανάκτησης ιστορικής εβδομάδας.' });
      return false;
    }
    if (!snapshot?.weekStart || !Array.isArray(snapshot.shifts)) {
      set({ warningMessage: 'Δεν βρέθηκε αποθηκευμένη εβδομάδα για φόρτωση.' });
      return false;
    }

    const weekDays = getWeekDays(snapshot.weekStart);
    set({ isSaving: true, weekStart: snapshot.weekStart });
    try {
      await removeWeekShifts(weekDays);
      await createManyShifts(snapshot.shifts);
      const weekSet = new Set(weekDays);
      set((state) => ({
        shifts: sortShiftsByDateAndStart([
          ...state.shifts.filter((shift) => !weekSet.has(shift.date)),
          ...snapshot.shifts,
        ]),
      }));
      set({ warningMessage: 'Η εβδομάδα φορτώθηκε από το ιστορικό.' });
      await get().refreshWeekLockStatus();
      await get().saveCurrentWeekSnapshot('history_load');
      await get().loadWeekHistory();
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία φόρτωσης ιστορικής εβδομάδας.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  saveCurrentWeekAsTemplate: async (name) => {
    if (!requireAdmin(get, set)) return false;
    const templateName = (name || '').trim();
    if (!templateName) {
      set({ warningMessage: 'Δώσε όνομα template.' });
      return false;
    }

    const weekDays = getWeekDays(get().weekStart);
    const weekSet = new Set(weekDays);
    const weekShifts = get().shifts
      .filter((shift) => weekSet.has(shift.date))
      .map((shift) => ({
        employeeId: shift.employeeId,
        dateOffset: weekDays.indexOf(shift.date),
        startTime: shift.startTime,
        endTime: shift.endTime,
        label: shift.label || '',
        type: shift.type || SHIFT_TYPES.WORK,
        notes: shift.notes || '',
        shiftType: shift.shiftType || inferShiftTypeFromTimes(shift.startTime, shift.endTime),
        customLabel: shift.customLabel || '',
        isHoliday: Boolean(shift.isHoliday),
        isSpecialDay: Boolean(shift.isSpecialDay),
        specialDayLabel: shift.specialDayLabel || '',
      }))
      .filter((shift) => shift.dateOffset >= 0);

    try {
      await saveWeekTemplate({
        name: templateName,
        weekStart: get().weekStart,
        shifts: weekShifts,
        createdBy: get().adminUser?.email || '',
      });
      set({ warningMessage: 'Το template αποθηκεύτηκε.' });
      await get().loadWeekTemplates();
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία αποθήκευσης template.' });
      return false;
    }
  },

  loadSelectedTemplateIntoCurrentWeek: async () => {
    if (!requireAdmin(get, set)) return false;
    const templateId = get().selectedTemplateId;
    if (!templateId) return false;

    const template = get().weekTemplates.find((item) => item.id === templateId);
    if (!template) {
      set({ warningMessage: 'Δεν βρέθηκε template.' });
      return false;
    }

    const weekDays = getWeekDays(get().weekStart);
    const shiftsToCreate = (template.shifts || []).map((shift) => ({
      employeeId: shift.employeeId,
      date: weekDays[shift.dateOffset] || weekDays[0],
      startTime: shift.startTime,
      endTime: shift.endTime,
      label: shift.label || 'Template',
      type: shift.type || SHIFT_TYPES.WORK,
      notes: shift.notes || '',
      shiftType: shift.shiftType || inferShiftTypeFromTimes(shift.startTime, shift.endTime),
      customLabel: shift.customLabel || '',
      isHoliday: Boolean(shift.isHoliday),
      isSpecialDay: Boolean(shift.isSpecialDay),
      specialDayLabel: shift.specialDayLabel || '',
      isManualOverride: true,
    }));

    set({ isSaving: true });
    try {
      await removeWeekShifts(weekDays);
      await createManyShifts(shiftsToCreate);
      const weekSet = new Set(weekDays);
      set((state) => ({
        shifts: sortShiftsByDateAndStart([
          ...state.shifts.filter((shift) => !weekSet.has(shift.date)),
          ...shiftsToCreate,
        ]),
      }));
      set({ warningMessage: 'Το template εφαρμόστηκε στην εβδομάδα.' });
      await get().saveCurrentWeekSnapshot('template_load');
      await get().loadWeekHistory();
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία φόρτωσης template.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  deleteAnnouncement: async (announcementId) => {
    if (!requireAdmin(get, set)) return false;
    if (!announcementId) return false;

    set({ isSaving: true });
    try {
      await removeAnnouncement(announcementId);
      set({ warningMessage: 'Η ανακοίνωση διαγράφηκε.' });
      return true;
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία διαγραφής ανακοίνωσης.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  generateMagicWeek: async () => {
    if (!requireAdmin(get, set)) return;
    if (isWeekEditingLocked(get(), getWeekDays(get().weekStart))) {
      set({ warningMessage: 'Η εβδομάδα είναι κλειδωμένη μετά από οριστικοποίηση.' });
      return;
    }

    const weekDays = getWeekDays(get().weekStart);
    const weekSet = new Set(weekDays);
    const weekExistingShifts = get().shifts.filter((shift) => weekSet.has(shift.date));
    const weeklyRules = normalizeGeneratorRules(get().generatorRules);
    const preserveManualOverrides = weeklyRules.allowManualOverride !== false;
    const manualWeekShifts = preserveManualOverrides
      ? weekExistingShifts.filter((shift) => shift.isManualOverride)
      : [];
    const autoWeekShifts = preserveManualOverrides
      ? weekExistingShifts.filter((shift) => !shift.isManualOverride)
      : weekExistingShifts;

    set({ isSaving: true });
    try {
      const { shifts: generatedShifts, warnings } = await generateSmartWeekSchedule({
        weekDays,
        employees: get().employees,
        allShifts: get().shifts,
        hasConsecutiveSundayAssignmentFn: hasConsecutiveSundayAssignment,
        rules: weeklyRules,
      });

      const manualKey = new Set(manualWeekShifts.map((shift) => `${shift.employeeId}_${shift.date}`));
      const safeGeneratedShifts = generatedShifts.filter((shift) => {
        if (manualKey.has(`${shift.employeeId}_${shift.date}`)) return false;
        return !hasTimeOverlap(manualWeekShifts, shift);
      });

      await Promise.all(autoWeekShifts.map((shift) => removeShift(shift.id)));
      await createManyShifts(safeGeneratedShifts);
      await get().saveCurrentWeekSnapshot('magic_wand');
      await get().loadWeekHistory();

      if (warnings.length) {
        set({ warningMessage: warnings.join(' | ') });
      } else {
        set({
          warningMessage: preserveManualOverrides
            ? `Η εβδομάδα δημιουργήθηκε αυτόματα με Magic Wand. Διατηρήθηκαν ${manualWeekShifts.length} manual entries.`
            : 'Η εβδομάδα δημιουργήθηκε αυτόματα με Magic Wand και έγινε πλήρης ανανέωση auto schedule.',
        });
      }
    } finally {
      set({ isSaving: false });
    }
  },

  generateMagicMonth: async ({
    year,
    month,
    roleConfig = {},
    rules = {},
  }) => {
    if (!requireAdmin(get, set)) return;
    if (typeof year !== 'number' || typeof month !== 'number') {
      set({ warningMessage: 'Μη έγκυρα στοιχεία μήνα για αυτόματη δημιουργία.' });
      return;
    }

    const monthDateSet = getMonthDateSet(year, month);
    const monthShifts = get().shifts.filter((shift) => monthDateSet.has(shift.date));
    const manualOverrides = monthShifts.filter((shift) => shift.isManualOverride);
    const autoGenerated = monthShifts.filter((shift) => !shift.isManualOverride);
    const baseRules = normalizeGeneratorRules(get().generatorRules);
    const mergedRules = {
      ...baseRules,
      ...(rules || {}),
      fixedDaysOff: { ...(rules?.fixedDaysOff || {}) },
      specialDaysByDate: {
        ...(get().specialDaysByDate || {}),
        ...(rules?.specialDaysByDate || {}),
      },
    };

    set({ isSaving: true });
    try {
      const { shifts: generatedShifts, warnings, meta } = generateSmartMonthSchedule({
        month,
        year,
        employees: get().employees,
        allShifts: get().shifts,
        existingMonthShifts: monthShifts,
        rules: mergedRules,
        roleConfig,
      });

      await Promise.all(autoGenerated.map((shift) => removeShift(shift.id)));
      await createManyShifts(generatedShifts);

      const warningMessages = [];
      if (warnings?.length) warningMessages.push(...warnings);
      warningMessages.push(
        `Ολοκληρώθηκε αυτόματη δημιουργία μήνα. Auto entries: ${generatedShifts.length}, Manual overrides: ${manualOverrides.length}.`,
      );

      set({
        warningMessage: warningMessages.join(' | '),
      });

      if (meta?.monthDays?.length) {
        const firstDay = meta.monthDays[0];
        if (firstDay) {
          const monday = getMonday(new Date(`${firstDay}T00:00:00`));
          set({ weekStart: getIsoDate(monday) });
          await get().refreshWeekLockStatus();
        }
      }
    } catch (error) {
      set({
        warningMessage:
          error?.message || 'Αποτυχία αυτόματης δημιουργίας μηνιαίου προγράμματος.',
      });
    } finally {
      set({ isSaving: false });
    }
  },

  clearDayShifts: async (date) => {
    if (!requireAdmin(get, set)) return false;
    if (!date) return false;

    const weekDays = getWeekDays(get().weekStart);
    if (isWeekEditingLocked(get(), weekDays) && isDateInWeek(date, weekDays)) {
      set({ warningMessage: 'Η εβδομάδα είναι κλειδωμένη μετά από οριστικοποίηση.' });
      return false;
    }

    set({ isSaving: true });
    try {
      await removeShiftsByDates([date]);
      const templatesToRemove = get().shiftTemplates.filter((template) => template.isPlaced && template.date === date);
      await Promise.all(templatesToRemove.map((template) => removeShiftTemplate(template.id)));

      set((state) => ({
        shifts: state.shifts.filter((shift) => shift.date !== date),
        warningMessage: `Καθαρίστηκαν οι βάρδιες για ${date}.`,
        shiftTemplates: state.shiftTemplates.filter((template) => !(template.isPlaced && template.date === date)),
      }));
      await get().saveCurrentWeekSnapshot('manual_save');
      await get().loadWeekHistory();
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία καθαρισμού ημέρας.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },
}));
