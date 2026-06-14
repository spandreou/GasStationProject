import { AlertTriangle, Info, PanelLeft, Plus, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WEEKDAY_LABELS } from '../../data/constants';
import { useSchedulerStore } from '../../hooks/useSchedulerStore';
import useResizableLayout from '../../hooks/useResizableLayout';
import useToastQueue from '../../hooks/useToastQueue';
import { runtimeEnvironmentRepository } from '../../repositories';
import { calculateWeeklyTotals, getShiftTypeLabel, SHIFT_TYPES } from '../../utils/analytics';
import { getMonthDays } from '../../utils/scheduleUtils';
import { formatDateGreek, getWeekDays } from '../../utils/time';
import { buildWhatsappSummary } from '../../utils/whatsappExport';
import AnnouncementBoard from './AnnouncementBoard';
import AnalyticsPanel from './AnalyticsPanel';
import HistoryView from './HistoryView';
import SchedulingRulesPanel from './SchedulingRulesPanel';
import SchedulerSidebar from './SchedulerSidebar';
import SpecialDaysPanel from './SpecialDaysPanel';
import UndoSnackbar from './UndoSnackbar';
import WeekToolbar from './WeekToolbar';
import WeeklyGrid from './WeeklyGrid';
import ToastStack from '../feedback/ToastStack';

const AdminLoginModal = lazy(() => import('./AdminLoginModal'));
const AdminDndShell = lazy(() => import('./AdminDndShell'));
const EmployeeProfileModal = lazy(() => import('./EmployeeProfileModal'));
const WeekHistoryViewer = lazy(() => import('./WeekHistoryViewer'));

const isFirebaseConfigured = runtimeEnvironmentRepository.isPersistenceConfigured();
const firebaseConfigErrorMessage = runtimeEnvironmentRepository.getPersistenceErrorMessage();
const adminEmail = runtimeEnvironmentRepository.getConfiguredAdminEmail();
const isDemoMode = runtimeEnvironmentRepository.isDemoMode();

const SHELL_WIDTH_MODE_OPTIONS = [
  { value: 'narrow', label: 'Στενό' },
  { value: 'normal', label: 'Κανονικό' },
  { value: 'wide', label: 'Φαρδύ' },
];

let exportServicePromise;

function loadExportService() {
  if (!exportServicePromise) {
    exportServicePromise = import('../../utils/exportService');
  }
  return exportServicePromise;
}

function createWeekFingerprint(weekShifts = []) {
  return (weekShifts || [])
    .map(
      (shift) =>
        [
          shift.id || '',
          shift.employeeId || '',
          shift.date || '',
          shift.startTime || '',
          shift.endTime || '',
          shift.type || '',
          shift.shiftType || '',
          shift.label || '',
        ].join('|'),
    )
    .join('||');
}

function humanizeStoreMessage(rawMessage) {
  const message = String(rawMessage || '').trim();
  if (!message) return '';
  const normalized = message.toLowerCase();

  if (normalized.includes('failed to clear week')) {
    return 'Δεν ολοκληρώθηκε ο καθαρισμός εβδομάδας. Μπορεί να έμειναν βάρδιες. Δοκίμασε ξανά.';
  }
  if (normalized.includes('failed to clear month')) {
    return 'Δεν ολοκληρώθηκε ο καθαρισμός μήνα. Μπορεί να έμειναν βάρδιες. Δοκίμασε ξανά.';
  }
  if (normalized.includes('failed to create shift')) {
    return 'Η βάρδια δεν αποθηκεύτηκε. Έλεγξε τα στοιχεία και δοκίμασε ξανά.';
  }
  if (normalized.includes('overlapping shift')) {
    return 'Υπάρχει επικάλυψη βάρδιας για τον ίδιο υπάλληλο. Διόρθωσε τις ώρες και ξαναπροσπάθησε.';
  }
  if (normalized.includes('this week is locked')) {
    return 'Η εβδομάδα είναι κλειδωμένη μετά την οριστικοποίηση. Δεν επιτρέπονται αλλαγές.';
  }
  if (normalized.includes('template') || normalized.includes('custom βαρδι')) {
    return 'Δεν μπορέσαμε να φορτώσουμε τις custom βάρδιες. Οι κάρτες templates μπορεί να λείπουν προσωρινά, οπότε δεν θα μπορείς να τις αναθέσεις. Δοκίμασε ξανά φόρτωση ή ανανέωσε τη σελίδα.';
  }
  if (normalized.includes('history')) {
    return 'Δεν ενημερώθηκε πλήρως το ιστορικό. Οι τελευταίες αλλαγές μπορεί να μην εμφανίζονται άμεσα.';
  }
  if (normalized.includes('clipboard')) {
    return 'Δεν ήταν δυνατή η αντιγραφή στο clipboard. Έλεγξε τα δικαιώματα του browser και δοκίμασε ξανά.';
  }
  if (normalized.includes('pdf') || normalized.includes('excel') || normalized.includes('word')) {
    return 'Η εξαγωγή αρχείου απέτυχε. Δοκίμασε ξανά ή άλλαξε τύπο εξαγωγής.';
  }

  return message;
}

function splitStoreMessages(message) {
  return String(message || '')
    .split(/\s+\|\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatToastMessage(message, maxItems = 5) {
  const parts = splitStoreMessages(message);
  if (parts.length <= 1) return message;
  const visible = parts.slice(0, maxItems);
  const hiddenCount = parts.length - visible.length;
  return [
    ...visible.map((item) => `• ${item}`),
    ...(hiddenCount > 0 ? [`+${hiddenCount} ακόμη προειδοποιήσεις`] : []),
  ].join('\n');
}

function normalizeDashboardScheduleRole(value) {
  const token = `${value || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (token.includes('core1') || token.includes('core 1') || token.includes('core_a')) return 'core1';
  if (token.includes('core2') || token.includes('core 2') || token.includes('core_b')) return 'core2';
  if (token.includes('intermediate') || token.includes('coverage') || token.includes('ενδιαμεσ') || token.includes('καλυψ')) {
    return 'intermediate';
  }
  if (token.includes('core') || token.includes('βασ') || token.includes('σταθερ')) return 'core';
  return '';
}

function toActionError(error, fallbackMessage) {
  const rawMessage = error?.message || fallbackMessage;
  return humanizeStoreMessage(rawMessage) || fallbackMessage;
}

function classifyStoreFeedback(message) {
  const normalized = String(message || '').toLowerCase();
  if (!normalized) return 'info';

  const successSignals = ['αποθηκε', 'οριστικ', 'ολοκληρ', 'δημοσι', 'φορτώθηκε', 'αντιγράφηκε'];
  const errorSignals = ['αποτυχ', 'failed', 'error', 'cannot', 'unable'];
  const warningSignals = ['δεν ', 'επικάλυψη', 'κλειδω', 'προσοχή', 'μερικ'];

  if (errorSignals.some((keyword) => normalized.includes(keyword))) return 'error';
  if (warningSignals.some((keyword) => normalized.includes(keyword))) return 'warning';
  if (successSignals.some((keyword) => normalized.includes(keyword))) return 'success';
  return 'info';
}

function MessageBanner({
  icon: Icon = Info,
  tone = 'info',
  title,
  message,
  impact,
  nextAction,
  actionLabel,
  onAction,
}) {
  const toneClasses = {
    warning: 'border-amber-300/70 text-amber-900 dark:text-amber-100',
    danger: 'border-red-300/70 text-red-800 dark:text-red-200',
    info: 'border-slate-300/70 text-slate-800 dark:text-slate-100',
  };

  return (
    <div className={`glass-soft rounded-xl border p-3 ${toneClasses[tone] || toneClasses.info}`}>
      <div className="flex items-start gap-2">
        <Icon size={18} className="mt-0.5 shrink-0" />
        <div className="space-y-1.5">
          {title ? <p className="text-sm font-semibold">{title}</p> : null}
          <p className="text-sm">{message}</p>
          {impact ? <p className="text-xs opacity-90">{impact}</p> : null}
          {nextAction ? <p className="text-xs opacity-90">{nextAction}</p> : null}
          {actionLabel && typeof onAction === 'function' ? (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center gap-1 rounded-md border border-current/40 px-2 py-1 text-xs font-semibold hover:bg-white/35 dark:hover:bg-slate-900/45"
            >
              <RefreshCw size={12} />
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function MainDashboard() {
  const [activeDragItem, setActiveDragItem] = useState(null);
  const [profileEmployee, setProfileEmployee] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mobileSidebarSection, setMobileSidebarSection] = useState('employees');
  const [scheduleMode, setScheduleMode] = useState('week');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthlyRoleConfig, setMonthlyRoleConfig] = useState({
    coreAId: '',
    coreBId: '',
    intermediateId: '',
  });
  const [quickAssignDraft, setQuickAssignDraft] = useState({
    open: false,
    employeeId: '',
    employeeName: '',
    date: '',
    startTime: '06:00',
    endTime: '14:00',
    type: SHIFT_TYPES.WORK,
  });
  const {
    sidebarWidth,
    sidebarMinWidth,
    sidebarMaxWidth,
    isResizingSidebar,
    mainPanelRef,
    scheduleDensity,
    shellWidthMode,
    shellWidthClass,
    setShellWidthMode,
    handleSidebarResizeStart,
    handleSidebarResizeKeyDown,
  } = useResizableLayout();
  const [actionLoading, setActionLoading] = useState({});
  const [syncStatusOverride, setSyncStatusOverride] = useState({ status: 'saved', label: '' });
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAdminTransitioning, setIsAdminTransitioning] = useState(false);
  const previousWeekFingerprintRef = useRef('');
  const skipNextUnsavedRef = useRef(false);

  const { toasts, pushToast, dismissToast } = useToastQueue({ maxVisible: 3 });

  const {
    employees,
    shifts,
    shiftTemplates,
    absences,
    weekHistory,
    weekTemplates,
    publishedSchedule,
    publishedSchedulesByWeek,
    generatorRules,
    specialDaysByDate,
    selectedHistoryWeekId,
    selectedTemplateId,
    sundayRuleViolations,
    announcements,
    attendanceHistory,
    historyFilters,
    isHistoryLoading,
    isAbsencesLoading,
    absencesWarningMessage,
    isWeekLocked,
    weekStart,
    isLoading,
    isAuthLoading,
    isSaving,
    warningMessage,
    errorMessage,
    isAdmin,
    isLoginModalOpen,
    undoState,
    initializeData,
    cleanupData,
    addEmployee,
    editEmployee,
    deleteEmployee,
    createAbsence,
    updateAbsence,
    cancelAbsence,
    deleteAbsence,
    addShift,
    updateShiftDetails,
    deleteShift,
    clearDayShifts,
    clearWeekShifts,
    clearMonthShifts,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    setWeekFromDate,
    setWarningMessage,
    clearMessages,
    saveGeneratorRules,
    saveEmployeeSchedulingRules,
    upsertSpecialDay,
    removeSpecialDay,
    openLoginModal,
    closeLoginModal,
    loginAsAdmin,
    requestPasswordReset,
    logoutAdmin,
    undoLastAction,
    dismissUndo,
    addShiftTemplate,
    addAnnouncement,
    placeShiftTemplate,
    assignShiftFromTemplate,
    deleteAnnouncement,
    deleteShiftTemplate,
    setHistoryFilters,
    setSelectedHistoryWeekId,
    setSelectedTemplateId,
    loadSelectedHistoryWeekToGrid,
    saveCurrentWeekManually,
    saveCurrentWeekAsTemplate,
    loadSelectedTemplateIntoCurrentWeek,
    generateMagicWeek,
    generateMagicMonth,
    toggleShiftManualOverride,
    finalizeCurrentWeek,
  } = useSchedulerStore();

  useEffect(() => {
    initializeData();
    return () => cleanupData();
  }, [initializeData, cleanupData]);

  useEffect(() => {
    if (!undoState.visible) return;
    const timeoutId = setTimeout(() => dismissUndo(), 6000);
    return () => clearTimeout(timeoutId);
  }, [undoState.visible, dismissUndo]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekSet = useMemo(() => new Set(weekDays), [weekDays]);
  const monthInfo = useMemo(() => getMonthDays(selectedYear, selectedMonth), [selectedMonth, selectedYear]);
  const monthDays = monthInfo.days;
  const monthSet = useMemo(() => new Set(monthDays), [monthDays]);

  const weekShifts = useMemo(
    () => shifts.filter((shift) => weekSet.has(shift.date)).sort((a, b) => a.date.localeCompare(b.date)),
    [shifts, weekSet],
  );
  const activePublishedSchedule = useMemo(() => {
    if (publishedSchedule?.weekStart === weekStart) return publishedSchedule;
    return publishedSchedulesByWeek?.[weekStart] || null;
  }, [publishedSchedule, publishedSchedulesByWeek, weekStart]);
  const publishedWeekShifts = useMemo(
    () =>
      (activePublishedSchedule?.shifts || [])
        .filter((shift) => weekSet.has(shift.date))
        .sort((a, b) => `${a.date}_${a.startTime}`.localeCompare(`${b.date}_${b.startTime}`)),
    [activePublishedSchedule, weekSet],
  );
  const weekFingerprint = useMemo(() => createWeekFingerprint(weekShifts), [weekShifts]);
  const isWeekEffectivelyLocked = isWeekLocked && weekShifts.length > 0;
  const monthShifts = useMemo(
    () => shifts.filter((shift) => monthSet.has(shift.date)).sort((a, b) => a.date.localeCompare(b.date)),
    [shifts, monthSet],
  );
  const publicMonthShifts = useMemo(
    () => publishedWeekShifts.filter((shift) => monthSet.has(shift.date)),
    [monthSet, publishedWeekShifts],
  );
  const publicEmployees = useMemo(() => {
    const employeeById = new Map();
    publishedWeekShifts.forEach((shift) => {
      if (!shift.employeeId || employeeById.has(shift.employeeId)) return;
      employeeById.set(shift.employeeId, {
        id: shift.employeeId,
        fullName: shift.employeeName || 'Άγνωστος',
        role: 'Δημοσιευμένο πρόγραμμα',
        isActive: true,
      });
    });
    return [...employeeById.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'el'));
  }, [publishedWeekShifts]);
  const displayEmployees = isAdmin ? employees : publicEmployees;
  const displayWeekShifts = isAdmin ? weekShifts : publishedWeekShifts;
  const displayMonthShifts = isAdmin ? monthShifts : publicMonthShifts;
  const visibleDays = scheduleMode === 'month' ? monthDays : weekDays;
  const visibleShifts = scheduleMode === 'month' ? displayMonthShifts : displayWeekShifts;

  useEffect(() => {
    previousWeekFingerprintRef.current = weekFingerprint;
    setHasUnsavedChanges(false);
    setSyncStatusOverride((prev) => ({ ...prev, status: 'saved', label: '' }));
  }, [weekStart]);

  useEffect(() => {
    const previousFingerprint = previousWeekFingerprintRef.current;
    if (!previousFingerprint) {
      previousWeekFingerprintRef.current = weekFingerprint;
      return;
    }
    if (previousFingerprint === weekFingerprint) return;

    previousWeekFingerprintRef.current = weekFingerprint;
    if (!isAdmin) return;
    if (skipNextUnsavedRef.current) {
      skipNextUnsavedRef.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [isAdmin, weekFingerprint]);

  useEffect(() => {
    if (isAdmin) {
      setIsAdminTransitioning(false);
    }
  }, [isAdmin]);

  const weeklyAnalytics = useMemo(
    () => calculateWeeklyTotals(displayWeekShifts, displayEmployees, weekDays),
    [displayEmployees, displayWeekShifts, weekDays],
  );
  const monthlyAnalytics = useMemo(
    () => calculateWeeklyTotals(displayMonthShifts, displayEmployees, monthDays),
    [displayEmployees, displayMonthShifts, monthDays],
  );
  const analytics = scheduleMode === 'month' ? monthlyAnalytics : weeklyAnalytics;
  const hasExplicitEmployeeScheduleRoles = useMemo(
    () =>
      employees.some((employee) =>
        ['core1', 'core2', 'core', 'intermediate'].includes(
          normalizeDashboardScheduleRole(employee.scheduleRole || employee.roleType),
        ),
      ),
    [employees],
  );

  useEffect(() => {
    const activeEmployees = employees
      .filter((employee) => employee?.isActive !== false)
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'el'));

    setMonthlyRoleConfig((prev) => {
      const validPrevCoreA = activeEmployees.some((item) => item.id === prev.coreAId) ? prev.coreAId : '';
      const coreAId = validPrevCoreA || activeEmployees[0]?.id || '';

      const validPrevCoreB =
        activeEmployees.some((item) => item.id === prev.coreBId) && prev.coreBId !== coreAId ? prev.coreBId : '';
      const coreBId = validPrevCoreB || activeEmployees.find((item) => item.id !== coreAId)?.id || '';

      const validPrevIntermediate =
        activeEmployees.some((item) => item.id === prev.intermediateId) &&
        prev.intermediateId !== coreAId &&
        prev.intermediateId !== coreBId
          ? prev.intermediateId
          : '';
      const intermediateId =
        validPrevIntermediate ||
        activeEmployees.find((item) => item.id !== coreAId && item.id !== coreBId)?.id ||
        '';

      if (coreAId === prev.coreAId && coreBId === prev.coreBId && intermediateId === prev.intermediateId) {
        return prev;
      }

      return { coreAId, coreBId, intermediateId };
    });
  }, [employees]);

  const handleToggleManualOverride = useCallback(
    (shiftId, value) => toggleShiftManualOverride({ shiftId, value }),
    [toggleShiftManualOverride],
  );

  const handleCloseProfileModal = useCallback(() => setProfileEmployee(null), []);

  const handleOpenAdminLogin = useCallback(() => {
    setIsAdminTransitioning(false);
    openLoginModal();
  }, [openLoginModal]);

  const handleCloseAdminLogin = useCallback(() => {
    setIsAdminTransitioning(false);
    closeLoginModal();
  }, [closeLoginModal]);

  const handleAdminLogin = useCallback(
    async (credentials) => {
      const success = await loginAsAdmin(credentials);
      if (success) {
        setIsAdminTransitioning(true);
      }
      return success;
    },
    [loginAsAdmin],
  );

  const handleLogoutAdmin = useCallback(async () => {
    setIsAdminTransitioning(false);
    await logoutAdmin();
  }, [logoutAdmin]);

  const setActionBusy = useCallback((actionKey, isBusy) => {
    setActionLoading((current) => ({ ...current, [actionKey]: isBusy }));
  }, []);

  const markSynced = useCallback(() => {
    skipNextUnsavedRef.current = true;
    previousWeekFingerprintRef.current = weekFingerprint;
    setHasUnsavedChanges(false);
    setLastSavedAt(new Date());
    setSyncStatusOverride({ status: 'saved', label: 'Αποθηκευμένο' });
  }, [weekFingerprint]);

  async function runActionWithFeedback({
    actionKey,
    execute,
    successMessage,
    errorMessageFallback,
    pendingMessage = 'Εκτέλεση ενέργειας...',
    markAsSynced = false,
    retryAction,
  }) {
    setActionBusy(actionKey, true);
    setSyncStatusOverride({ status: 'saving', label: pendingMessage });

    try {
      const result = await execute();
      if (result === false || result === null) {
        const failureMessage = humanizeStoreMessage(errorMessageFallback);
        setSyncStatusOverride({ status: 'error', label: 'Η ενέργεια απέτυχε' });
        pushToast({
          type: 'error',
          title: 'Αποτυχία',
          message: failureMessage,
          actionLabel: retryAction ? 'Δοκίμασε ξανά' : '',
          onAction: retryAction,
        });
        return false;
      }

      if (markAsSynced) {
        markSynced();
      } else {
        setSyncStatusOverride({ status: 'saved', label: '' });
      }

      const resolvedSuccessMessage =
        typeof successMessage === 'function' ? successMessage(result) : successMessage;
      if (resolvedSuccessMessage) {
        pushToast({ type: 'success', title: 'Έγινε', message: resolvedSuccessMessage });
      }
      return true;
    } catch (error) {
      const failureMessage = toActionError(error, errorMessageFallback);
      setSyncStatusOverride({ status: 'error', label: 'Η ενέργεια απέτυχε' });
      pushToast({
        type: 'error',
        title: 'Αποτυχία',
        message: failureMessage,
        actionLabel: retryAction ? 'Δοκίμασε ξανά' : '',
        onAction: retryAction,
      });
      return false;
    } finally {
      setActionBusy(actionKey, false);
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDragItem(null);

    if (!isAdmin || !active || !over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'employee' && overData?.type === 'day-box') {
      const employeeId = activeData.employee?.id;
      const employeeName = activeData.employee?.fullName || '';
      const date = overData.day?.date || '';
      if (!employeeId || !date) return;

      setQuickAssignDraft({
        open: true,
        employeeId,
        employeeName,
        date,
        startTime: '06:00',
        endTime: '14:00',
        type: SHIFT_TYPES.WORK,
      });
      return;
    }

    if (activeData?.type === 'employee' && overData?.type === 'template-assignment') {
      await assignShiftFromTemplate({
        templateId: overData.template?.id,
        employeeId: activeData.employee?.id,
      });
      return;
    }

    if (activeData?.type === 'shift-template' && overData?.type === 'day-box') {
      const template = activeData.template;
      const date = overData.day?.date;
      if (!template || !date) return;

      await placeShiftTemplate({ templateId: template.id, date });
    }
  }

  function handleDragStart(event) {
    if (!isAdmin) return;
    const activeData = event.active.data.current;

    if (activeData?.type === 'employee') {
      setActiveDragItem({ type: 'employee', label: activeData.employee.fullName });
      return;
    }

    if (activeData?.type === 'shift-template') {
      const template = activeData.template;
      setActiveDragItem({
        type: 'shift-template',
        label: `${template.label} (${template.startTime}-${template.endTime})`,
      });
    }
  }

  async function handleCopyWhatsapp() {
    await runActionWithFeedback({
      actionKey: 'copyWhatsapp',
      execute: async () => {
        const text = buildWhatsappSummary({
          shifts: displayWeekShifts,
          employees: displayEmployees,
          weekDays,
          weekdayLabels: WEEKDAY_LABELS,
        });
        await navigator.clipboard.writeText(text);
        return true;
      },
      successMessage: 'Το πρόγραμμα αντιγράφηκε στο clipboard για WhatsApp.',
      errorMessageFallback: 'Δεν ήταν δυνατή η αντιγραφή στο clipboard.',
      pendingMessage: 'Αντιγραφή προγράμματος...',
      retryAction: handleCopyWhatsapp,
    });
  }

  async function handleSaveProfile(profilePayload) {
    return editEmployee(profilePayload);
  }

  async function handleQuickAssignSave(event) {
    event.preventDefault();
    const { employeeId, date, startTime, endTime, type } = quickAssignDraft;
    if (!employeeId || !date) return;
    if (isWeekEffectivelyLocked) {
      setWarningMessage('Η εβδομάδα είναι κλειδωμένη. Δεν επιτρέπεται νέα ανάθεση.');
      return;
    }

    const shiftData = {
      employeeId,
      date,
      startTime,
      endTime,
      type,
      label: getShiftTypeLabel(type),
      trackUndo: true,
    };

    try {
      const saved = await addShift(shiftData);
      if (!saved) return;
      setQuickAssignDraft((prev) => ({ ...prev, open: false }));
    } catch (error) {
      setWarningMessage(error?.message || 'Αποτυχία αποθήκευσης ανάθεσης.');
    }
  }

  function getExportPayload() {
    return {
      weekDays,
      weekdayLabels: WEEKDAY_LABELS,
      shifts: displayWeekShifts,
      employees: displayEmployees,
    };
  }

  async function handleExportWeekPdf() {
    await runActionWithFeedback({
      actionKey: 'exportWeekPdf',
      execute: async () => {
        const { exportScheduleToPdf } = await loadExportService();
        await exportScheduleToPdf({
          mode: 'week',
          days: weekDays,
          shifts: displayWeekShifts,
          employees: displayEmployees,
        });
        return true;
      },
      successMessage: 'Ολοκληρώθηκε η εξαγωγή PDF εβδομάδας.',
      errorMessageFallback: 'Αποτυχία εξαγωγής PDF εβδομάδας.',
      pendingMessage: 'Εξαγωγή PDF εβδομάδας...',
      retryAction: handleExportWeekPdf,
    });
  }

  async function handleExportMonthPdf() {
    await runActionWithFeedback({
      actionKey: 'exportMonthPdf',
      execute: async () => {
        const { exportScheduleToPdf } = await loadExportService();
        await exportScheduleToPdf({
          mode: 'month',
          days: monthDays,
          shifts: displayMonthShifts,
          employees: displayEmployees,
          month: selectedMonth,
          year: selectedYear,
        });
        return true;
      },
      successMessage: 'Ολοκληρώθηκε η εξαγωγή PDF μήνα.',
      errorMessageFallback: 'Αποτυχία εξαγωγής PDF μήνα.',
      pendingMessage: 'Εξαγωγή PDF μήνα...',
      retryAction: handleExportMonthPdf,
    });
  }

  async function handleExportExcel() {
    await runActionWithFeedback({
      actionKey: 'exportExcel',
      execute: async () => {
        const { exportScheduleToExcel } = await loadExportService();
        await exportScheduleToExcel(getExportPayload());
        return true;
      },
      successMessage: 'Ολοκληρώθηκε η εξαγωγή Excel.',
      errorMessageFallback: 'Αποτυχία εξαγωγής Excel.',
      pendingMessage: 'Εξαγωγή Excel...',
      retryAction: handleExportExcel,
    });
  }

  async function handleExportWord() {
    await runActionWithFeedback({
      actionKey: 'exportWord',
      execute: async () => {
        const { exportScheduleToWord } = await loadExportService();
        await exportScheduleToWord(getExportPayload());
        return true;
      },
      successMessage: 'Ολοκληρώθηκε η εξαγωγή Word.',
      errorMessageFallback: 'Αποτυχία εξαγωγής Word.',
      pendingMessage: 'Εξαγωγή Word...',
      retryAction: handleExportWord,
    });
  }

  async function handleGenerateMonthlySchedule() {
    await runActionWithFeedback({
      actionKey: 'magicMonth',
      execute: () =>
        generateMagicMonth({
          month: selectedMonth,
          year: selectedYear,
          roleConfig: hasExplicitEmployeeScheduleRoles ? {} : monthlyRoleConfig,
          rules: {
            ...generatorRules,
            specialDaysByDate,
          },
        }),
      successMessage: 'Ο μηνιαίος προγραμματισμός ολοκληρώθηκε.',
      errorMessageFallback: 'Αποτυχία αυτόματης δημιουργίας μηνιαίου προγράμματος.',
      pendingMessage: 'Δημιουργία μηνιαίου προγράμματος...',
      retryAction: handleGenerateMonthlySchedule,
      markAsSynced: true,
    });
  }

  async function handleSaveSpecialDay(payload) {
    await upsertSpecialDay(payload);
  }

  const handleSaveTemplateFromToolbar = useCallback(
    async (name) => {
      if (!name) return;
      await runActionWithFeedback({
        actionKey: 'saveTemplate',
        execute: () => saveCurrentWeekAsTemplate(name),
        successMessage: 'Το πρότυπο αποθηκεύτηκε.',
        errorMessageFallback: 'Αποτυχία αποθήκευσης προτύπου.',
        pendingMessage: 'Αποθήκευση προτύπου...',
      });
    },
    [runActionWithFeedback, saveCurrentWeekAsTemplate],
  );

  const handleSaveWeekFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'saveWeek',
        execute: saveCurrentWeekManually,
        successMessage: 'Η εβδομάδα αποθηκεύτηκε.',
        errorMessageFallback: 'Αποτυχία αποθήκευσης εβδομάδας.',
        pendingMessage: 'Αποθήκευση εβδομάδας...',
        markAsSynced: true,
      }),
    [runActionWithFeedback, saveCurrentWeekManually],
  );

  const handleMagicWeekFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'magicWeek',
        execute: generateMagicWeek,
        successMessage: 'Η αυτόματη δημιουργία εβδομάδας ολοκληρώθηκε.',
        errorMessageFallback: 'Αποτυχία αυτόματης δημιουργίας εβδομάδας.',
        pendingMessage: 'Δημιουργία εβδομαδιαίου προγράμματος...',
        markAsSynced: true,
      }),
    [generateMagicWeek, runActionWithFeedback],
  );

  const handleFinalizeFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'finalizeWeek',
        execute: finalizeCurrentWeek,
        successMessage: 'Η εβδομάδα οριστικοποιήθηκε.',
        errorMessageFallback: 'Η οριστικοποίηση απέτυχε.',
        pendingMessage: 'Οριστικοποίηση και δημοσίευση...',
        markAsSynced: true,
      }),
    [finalizeCurrentWeek, runActionWithFeedback],
  );

  const handleClearWeekFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'clearWeek',
        execute: clearWeekShifts,
        successMessage: 'Η εβδομάδα καθαρίστηκε.',
        errorMessageFallback: 'Αποτυχία καθαρισμού εβδομάδας.',
        pendingMessage: 'Καθαρισμός εβδομάδας...',
      }),
    [clearWeekShifts, runActionWithFeedback],
  );

  const handleClearMonthFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'clearMonth',
        execute: () => clearMonthShifts({ year: selectedYear, month: selectedMonth }),
        successMessage: (result) =>
          result?.removedCount === 0
            ? 'Δεν βρέθηκαν βάρδιες για καθαρισμό στον επιλεγμένο μήνα.'
            : `Ο μήνας καθαρίστηκε (${result?.removedCount ?? 0} βάρδιες).`,
        errorMessageFallback: 'Αποτυχία καθαρισμού μήνα.',
        pendingMessage: 'Καθαρισμός μήνα...',
      }),
    [clearMonthShifts, runActionWithFeedback, selectedMonth, selectedYear],
  );

  const handleLoadTemplateFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'loadTemplate',
        execute: loadSelectedTemplateIntoCurrentWeek,
        successMessage: 'Το πρότυπο φορτώθηκε στην εβδομάδα.',
        errorMessageFallback: 'Αποτυχία φόρτωσης προτύπου.',
        pendingMessage: 'Φόρτωση προτύπου...',
        markAsSynced: true,
      }),
    [loadSelectedTemplateIntoCurrentWeek, runActionWithFeedback],
  );

  const handleRetryDataLoad = useCallback(() => {
    clearMessages();
    cleanupData();
    initializeData();
  }, [clearMessages, cleanupData, initializeData]);

  useEffect(() => {
    if (!errorMessage) return;
    const readableError = humanizeStoreMessage(errorMessage);
    pushToast({
      type: 'error',
      title: 'Πρόβλημα φόρτωσης',
      message: readableError,
      actionLabel: isFirebaseConfigured ? 'Δοκίμασε ξανά' : '',
      onAction: isFirebaseConfigured ? handleRetryDataLoad : undefined,
    });
    setSyncStatusOverride({ status: 'error', label: 'Σφάλμα συγχρονισμού' });
  }, [errorMessage, handleRetryDataLoad, pushToast]);

  useEffect(() => {
    if (!warningMessage) return;
    const tone = classifyStoreFeedback(warningMessage);
    const readableWarning = humanizeStoreMessage(warningMessage);
    const warningParts = splitStoreMessages(readableWarning);
    pushToast({
      type: tone,
      title:
        tone === 'success'
          ? 'Ολοκληρώθηκε'
          : tone === 'error'
            ? 'Αποτυχία'
            : tone === 'warning'
              ? warningParts.length > 1
                ? `Προσοχή (${warningParts.length})`
                : 'Προσοχή'
              : 'Ενημέρωση',
      message: formatToastMessage(readableWarning),
      duration: tone === 'warning' && warningParts.length > 1 ? 0 : undefined,
    });
  }, [pushToast, warningMessage]);

  useEffect(() => {
    if (!isAdmin) {
      setSyncStatusOverride({ status: 'saved', label: '' });
      return;
    }
    if (isSaving) {
      setSyncStatusOverride({ status: 'saving', label: 'Αποθήκευση...' });
      return;
    }
    if (syncStatusOverride.status === 'error') return;
    if (hasUnsavedChanges) {
      setSyncStatusOverride({ status: 'unsaved', label: 'Μη αποθηκευμένες αλλαγές' });
      return;
    }
    setSyncStatusOverride({ status: 'saved', label: '' });
  }, [hasUnsavedChanges, isAdmin, isSaving, syncStatusOverride.status]);

  const normalizedErrorMessage = humanizeStoreMessage(errorMessage);
  const normalizedWarningMessage = humanizeStoreMessage(warningMessage);

  const warningFeedbackTone = classifyStoreFeedback(warningMessage);

  const prioritizedStatusBanner = errorMessage
    ? {
        tone: 'danger',
        title: 'Δεν φορτώθηκαν πλήρως τα δεδομένα',
        message: normalizedErrorMessage,
        impact: 'Κάποια στοιχεία του scheduler μπορεί να είναι ελλιπή ή μη ενημερωμένα.',
        nextAction: 'Δοκίμασε ξανά φόρτωση. Αν επιμένει, έλεγξε σύνδεση ή ρυθμίσεις Firebase.',
        actionLabel: 'Δοκίμασε ξανά',
        onAction: isFirebaseConfigured ? handleRetryDataLoad : undefined,
      }
    : warningMessage && warningFeedbackTone === 'warning'
      ? {
          tone: 'warning',
          title: 'Χρειάζεται προσοχή',
          message: normalizedWarningMessage,
          impact: 'Η τελευταία ενέργεια ίσως ολοκληρώθηκε μερικώς.',
          nextAction: 'Έλεγξε τα στοιχεία που επηρεάζονται και επανάλαβε αν χρειάζεται.',
        }
      : null;

  const syncStatus = useMemo(() => {
    if (syncStatusOverride.status === 'saved' && lastSavedAt) {
      return {
        status: 'saved',
        label: `Αποθηκευμένο ${lastSavedAt.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}`,
      };
    }
    return {
      status: syncStatusOverride.status,
      label: syncStatusOverride.label,
    };
  }, [lastSavedAt, syncStatusOverride.label, syncStatusOverride.status]);

  const showReadOnlyBanner = !isAdmin && !isAdminTransitioning && isFirebaseConfigured && !prioritizedStatusBanner;

  if (isLoading || isAuthLoading) {
    return <p className="p-8 text-center font-medium text-slate-900 dark:text-slate-100">Φόρτωση προγράμματος...</p>;
  }

  const dashboardContent = (
    <>
      <main className={`scheduler-layout-shell mx-auto flex w-full ${shellWidthClass} flex-col gap-4 px-3 py-4 text-slate-900 sm:gap-5 sm:px-4 lg:px-5 xl:w-[calc(100%-24px)] 2xl:px-6 dark:text-slate-100`}>
        <WeekToolbar
          weekDays={weekDays}
          weekTemplates={weekTemplates}
          selectedTemplateId={selectedTemplateId}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          isAdmin={isAdmin}
          isAdminTransitioning={isAdminTransitioning}
          onOpenAdminLogin={handleOpenAdminLogin}
          onLogoutAdmin={handleLogoutAdmin}
          onSaveWeek={handleSaveWeekFromToolbar}
          onSaveTemplate={handleSaveTemplateFromToolbar}
          onSelectTemplate={setSelectedTemplateId}
          onLoadSelectedTemplate={handleLoadTemplateFromToolbar}
          onCopyWhatsapp={handleCopyWhatsapp}
          onClearWeek={handleClearWeekFromToolbar}
          onClearMonth={handleClearMonthFromToolbar}
          onFinalizeWeek={handleFinalizeFromToolbar}
          onMagicWand={handleMagicWeekFromToolbar}
          onExportWeekPdf={handleExportWeekPdf}
          onExportMonthPdf={handleExportMonthPdf}
          onExportExcel={handleExportExcel}
          onExportWord={handleExportWord}
          isWeekLocked={isWeekEffectivelyLocked}
          syncStatus={syncStatus}
          actionLoading={actionLoading}
        />

        <div className="flex justify-end">
          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-300/70 bg-white/55 p-1 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-sm dark:border-cyan-300/30 dark:bg-slate-900/45 dark:text-slate-100">
            {SHELL_WIDTH_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setShellWidthMode(option.value)}
                className={`rounded-md px-2 py-1 transition ${
                  shellWidthMode === option.value
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white/70 dark:text-slate-200 dark:hover:bg-slate-800/70'
                }`}
                aria-pressed={shellWidthMode === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {!isFirebaseConfigured ? (
          <MessageBanner
            icon={WifiOff}
            tone="warning"
            title="Το Firebase δεν είναι έτοιμο"
            message={firebaseConfigErrorMessage || 'Η σύνδεση με τη βάση δεν είναι διαθέσιμη.'}
            impact="Το dashboard εμφανίζεται, αλλά δεδομένα και αποθήκευση μπορεί να λείπουν."
            nextAction="Έλεγξε τα env vars στο local ή στο deployment environment."
          />
        ) : null}

        {showReadOnlyBanner ? (
          <MessageBanner
            icon={ShieldCheck}
            tone="info"
            title="Read-only πρόσβαση"
            message="Το περιβάλλον είναι σε προβολή χωρίς δικαίωμα επεξεργασίας."
            impact="Τα admin-only actions είναι κλειδωμένα μέχρι login διαχειριστή."
            nextAction="Αν χρειάζεσαι αλλαγές, κάνε είσοδο ως διαχειριστής από το toolbar."
          />
        ) : null}

        {prioritizedStatusBanner ? (
          <MessageBanner
            icon={AlertTriangle}
            tone={prioritizedStatusBanner.tone}
            title={prioritizedStatusBanner.title}
            message={prioritizedStatusBanner.message}
            impact={prioritizedStatusBanner.impact}
            nextAction={prioritizedStatusBanner.nextAction}
            actionLabel={prioritizedStatusBanner.actionLabel}
            onAction={prioritizedStatusBanner.onAction}
          />
        ) : null}

        <div
          className={`flex w-full min-w-0 flex-col items-stretch gap-4 lg:gap-5 xl:flex-row ${isResizingSidebar ? 'select-none' : ''}`}
          style={{ '--scheduler-sidebar-width': `${sidebarWidth}px` }}
        >
          <div className="order-1 min-w-0 xl:order-1 xl:w-[var(--scheduler-sidebar-width)] xl:basis-[var(--scheduler-sidebar-width)] xl:shrink-0">
            <div className="hidden md:block">
              <SchedulerSidebar
                employees={displayEmployees}
                shiftTemplates={shiftTemplates}
                absences={absences}
                isAbsencesLoading={isAbsencesLoading}
                absencesWarningMessage={absencesWarningMessage}
                weekDays={weekDays}
                visibleDays={visibleDays}
                isAdmin={isAdmin}
                isSaving={isSaving}
                scheduleMode={scheduleMode}
                onModeChange={setScheduleMode}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                analytics={analytics}
                onAddEmployee={addEmployee}
                onDeleteEmployee={deleteEmployee}
                onOpenAdminLogin={handleOpenAdminLogin}
                onOpenProfile={setProfileEmployee}
                onCreateAbsence={createAbsence}
                onUpdateAbsence={updateAbsence}
                onCancelAbsence={cancelAbsence}
                onDeleteAbsence={deleteAbsence}
                onAddShiftTemplate={addShiftTemplate}
                onDeleteShiftTemplate={deleteShiftTemplate}
                onCreateShift={addShift}
              />
            </div>
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Αλλαγή πλάτους sidebar"
            aria-valuemin={sidebarMinWidth}
            aria-valuemax={sidebarMaxWidth}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onPointerDown={handleSidebarResizeStart}
            onKeyDown={handleSidebarResizeKeyDown}
            className={`order-2 hidden w-3 shrink-0 cursor-col-resize touch-none items-stretch justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-brand-300/70 xl:flex ${
              isResizingSidebar ? 'bg-brand-500/15' : 'hover:bg-slate-900/5 dark:hover:bg-cyan-300/10'
            }`}
          >
            <span className={`my-3 w-1 rounded-full transition ${isResizingSidebar ? 'bg-brand-500 dark:bg-cyan-300' : 'bg-slate-300 dark:bg-cyan-300/35'}`} />
          </div>

          <div ref={mainPanelRef} className="order-3 min-w-0 flex-1 xl:order-3">
            <div className="min-w-0 space-y-4 lg:space-y-5">
              <WeeklyGrid
                weekDays={weekDays}
                monthDays={monthDays}
                shifts={visibleShifts}
                shiftTemplates={shiftTemplates}
                employees={displayEmployees}
                weekHistory={weekHistory}
                weekTemplates={weekTemplates}
                selectedHistoryWeekId={selectedHistoryWeekId}
                selectedTemplateId={selectedTemplateId}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                scheduleMode={scheduleMode}
                monthlyRoleConfig={monthlyRoleConfig}
                sundayRuleViolations={sundayRuleViolations}
                specialDaysByDate={specialDaysByDate}
                onChangeScheduleMode={setScheduleMode}
                onSelectMonth={setSelectedMonth}
                onSelectYear={setSelectedYear}
                onChangeMonthlyRoleConfig={setMonthlyRoleConfig}
                onSelectHistoryWeek={setSelectedHistoryWeekId}
                onLoadSelectedHistoryWeek={loadSelectedHistoryWeekToGrid}
                onSaveAsTemplate={saveCurrentWeekAsTemplate}
                onSelectTemplate={setSelectedTemplateId}
                onLoadSelectedTemplate={loadSelectedTemplateIntoCurrentWeek}
                onMagicWand={generateMagicWeek}
                onGenerateMonthlySchedule={handleGenerateMonthlySchedule}
                onPrevWeek={goToPreviousWeek}
                onCurrentWeek={goToCurrentWeek}
                onNextWeek={goToNextWeek}
                onJumpToWeekDate={setWeekFromDate}
                onCreateShift={addShift}
                onUpdateShift={updateShiftDetails}
                onDeleteShift={deleteShift}
                onToggleManualOverride={handleToggleManualOverride}
                onDeleteShiftTemplate={deleteShiftTemplate}
                onClearDayShifts={clearDayShifts}
                canManage={isAdmin}
                isWeekLocked={isWeekEffectivelyLocked}
                isSaving={isSaving}
                density={scheduleDensity}
              />

              <AnnouncementBoard
                announcements={announcements}
                isAdmin={isAdmin}
                isSaving={isSaving}
                onAddAnnouncement={addAnnouncement}
                onDeleteAnnouncement={deleteAnnouncement}
              />

              <div className={`grid gap-4 lg:gap-5 ${isAdmin ? 'xl:grid-cols-2' : ''}`}>
                {isAdmin ? (
                  <HistoryView
                    isAdmin={isAdmin}
                    employees={employees}
                    historyRows={attendanceHistory}
                    filters={historyFilters}
                    isLoading={isHistoryLoading}
                    onFilterChange={setHistoryFilters}
                  />
                ) : null}
                <AnalyticsPanel
                  employees={displayEmployees}
                  mode={scheduleMode}
                  onModeChange={setScheduleMode}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  totalsByEmployee={analytics.totalsByEmployee}
                  totalHours={analytics.totalHours}
                  leaveDaysByEmployee={analytics.leaveDaysByEmployee}
                  totalsByType={analytics.totalsByType}
                  shiftsCountByEmployee={analytics.shiftsCountByEmployee}
                  workBreakdownByEmployee={analytics.workBreakdownByEmployee}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
                <SchedulingRulesPanel
                  isAdmin={isAdmin}
                  isSaving={isSaving}
                  employees={employees}
                  generatorRules={generatorRules}
                  onSaveRules={saveGeneratorRules}
                  onSaveEmployeeRules={saveEmployeeSchedulingRules}
                />

                <SpecialDaysPanel
                  isAdmin={isAdmin}
                  isSaving={isSaving}
                  specialDaysByDate={specialDaysByDate}
                  onSaveSpecialDay={handleSaveSpecialDay}
                  onRemoveSpecialDay={removeSpecialDay}
                />
              </div>

              {isAdmin ? (
                <Suspense fallback={null}>
                  <WeekHistoryViewer isAdmin={isAdmin} weekHistory={weekHistory} employees={employees} />
                </Suspense>
              ) : null}
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-6 right-6 z-[65] flex flex-col gap-2 md:hidden">
        <button
          type="button"
          onClick={() => {
            setMobileSidebarSection('employees');
            setIsSidebarOpen(true);
          }}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/35 bg-white/80 text-slate-900 shadow-xl shadow-slate-900/20 backdrop-blur-md transition hover:bg-white dark:border-cyan-300/35 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-900/85"
          aria-label="Άνοιγμα sidebar"
        >
          <PanelLeft size={20} />
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileSidebarSection('manual');
            setIsSidebarOpen(true);
          }}
          className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-xl shadow-slate-900/20 transition hover:bg-brand-600"
          aria-label="Γρήγορη χειροκίνητη βάρδια"
        >
          <Plus size={24} />
        </button>
      </div>

      {isSidebarOpen ? (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Κλείσιμο"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-t-3xl bg-slate-100/90 p-3 shadow-2xl backdrop-blur-md dark:bg-slate-950/85">
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-300/70 dark:bg-slate-700/70" />
            <div className="max-h-[78vh] overflow-y-auto pb-4">
                <SchedulerSidebar
                  employees={employees}
                  shiftTemplates={shiftTemplates}
                  absences={absences}
                  isAbsencesLoading={isAbsencesLoading}
                  absencesWarningMessage={absencesWarningMessage}
                  weekDays={weekDays}
                  visibleDays={visibleDays}
                  isAdmin={isAdmin}
                  isSaving={isSaving}
                  scheduleMode={scheduleMode}
                  onModeChange={setScheduleMode}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  analytics={analytics}
                  onAddEmployee={addEmployee}
                  onDeleteEmployee={deleteEmployee}
                  onOpenAdminLogin={handleOpenAdminLogin}
                  onOpenProfile={setProfileEmployee}
                  onCreateAbsence={createAbsence}
                  onUpdateAbsence={updateAbsence}
                  onCancelAbsence={cancelAbsence}
                  onDeleteAbsence={deleteAbsence}
                  onAddShiftTemplate={addShiftTemplate}
                  onDeleteShiftTemplate={deleteShiftTemplate}
                  onCreateShift={addShift}
                  defaultSection={mobileSidebarSection}
                  compact
                />
            </div>
          </div>
        </div>
      ) : null}

      <Suspense fallback={null}>
        <AdminLoginModal
          open={isLoginModalOpen}
          onClose={handleCloseAdminLogin}
          onLogin={handleAdminLogin}
          onRequestPasswordReset={requestPasswordReset}
          isFirebaseConfigured={isFirebaseConfigured}
          defaultEmail={adminEmail}
          isDemoMode={isDemoMode}
        />
      </Suspense>

      <Suspense fallback={null}>
        <EmployeeProfileModal
          open={Boolean(profileEmployee)}
          employee={profileEmployee}
          isAdmin={isAdmin}
          onClose={handleCloseProfileModal}
          onSave={handleSaveProfile}
        />
      </Suspense>

      {quickAssignDraft.open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="glass-panel w-full max-w-md rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Γρήγορη Ανάθεση</h3>
              <button
                type="button"
                onClick={() => setQuickAssignDraft((prev) => ({ ...prev, open: false }))}
                className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Κλείσιμο
              </button>
            </div>

            <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
              {quickAssignDraft.employeeName} - {formatDateGreek(quickAssignDraft.date)}
            </p>

            <form onSubmit={handleQuickAssignSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Ώρα Έναρξης
                  <input
                    type="time"
                    value={quickAssignDraft.startTime}
                    onChange={(event) => setQuickAssignDraft((prev) => ({ ...prev, startTime: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    required
                  />
                </label>
                <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Ώρα Λήξης
                  <input
                    type="time"
                    value={quickAssignDraft.endTime}
                    onChange={(event) => setQuickAssignDraft((prev) => ({ ...prev, endTime: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    required
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                Τύπος
                <select
                  value={quickAssignDraft.type}
                  onChange={(event) => setQuickAssignDraft((prev) => ({ ...prev, type: event.target.value }))}
                  className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 dark:border-cyan-300/45 dark:text-white"
                >
                  <option value={SHIFT_TYPES.WORK}>Εργασία</option>
                  <option value={SHIFT_TYPES.REST}>Ρεπό</option>
                  <option value={SHIFT_TYPES.LEAVE}>Άδεια</option>
                  <option value={SHIFT_TYPES.SICK}>Ασθένεια</option>
                </select>
              </label>

              <button
                type="submit"
                className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                disabled={isSaving || isWeekEffectivelyLocked}
              >
                {isWeekEffectivelyLocked ? 'Η εβδομάδα είναι κλειδωμένη' : isSaving ? 'Αποθήκευση...' : 'Αποθήκευση'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <UndoSnackbar undoState={undoState} onUndo={undoLastAction} onDismiss={dismissUndo} isAdmin={isAdmin} />
    </>
  );

  if (!isAdmin) {
    return dashboardContent;
  }

  return (
    <Suspense fallback={dashboardContent}>
      <AdminDndShell onDragStart={handleDragStart} onDragEnd={handleDragEnd} activeDragItem={activeDragItem}>
        {dashboardContent}
      </AdminDndShell>
    </Suspense>
  );
}





