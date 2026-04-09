import { AlertTriangle, Info, PanelLeft, Plus, RefreshCw, ShieldCheck, WifiOff } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WEEKDAY_LABELS } from '../../data/constants';
import { adminEmail, firebaseConfigErrorMessage, isDemoMode, isFirebaseConfigured } from '../../firebase/config';
import { useSchedulerStore } from '../../hooks/useSchedulerStore';
import useToastQueue from '../../hooks/useToastQueue';
import { useThemeMode } from '../../hooks/useThemeMode';
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
    return 'Ξ”ΞµΞ½ ΞΏΞ»ΞΏΞΊΞ»Ξ·ΟΟΞΈΞ·ΞΊΞµ ΞΏ ΞΊΞ±ΞΈΞ±ΟΞΉΟƒΞΌΟΟ‚ ΞµΞ²Ξ΄ΞΏΞΌΞ¬Ξ΄Ξ±Ο‚. ΞΟ€ΞΏΟΞµΞ― Ξ½Ξ± Ξ­ΞΌΞµΞΉΞ½Ξ±Ξ½ Ξ²Ξ¬ΟΞ΄ΞΉΞµΟ‚. Ξ”ΞΏΞΊΞ―ΞΌΞ±ΟƒΞµ ΞΎΞ±Ξ½Ξ¬.';
  }
  if (normalized.includes('failed to clear month')) {
    return 'Ξ”ΞµΞ½ ΞΏΞ»ΞΏΞΊΞ»Ξ·ΟΟΞΈΞ·ΞΊΞµ ΞΏ ΞΊΞ±ΞΈΞ±ΟΞΉΟƒΞΌΟΟ‚ ΞΌΞ®Ξ½Ξ±. ΞΟ€ΞΏΟΞµΞ― Ξ½Ξ± Ξ­ΞΌΞµΞΉΞ½Ξ±Ξ½ Ξ²Ξ¬ΟΞ΄ΞΉΞµΟ‚. Ξ”ΞΏΞΊΞ―ΞΌΞ±ΟƒΞµ ΞΎΞ±Ξ½Ξ¬.';
  }
  if (normalized.includes('failed to create shift')) {
    return 'Ξ— Ξ²Ξ¬ΟΞ΄ΞΉΞ± Ξ΄ΞµΞ½ Ξ±Ο€ΞΏΞΈΞ·ΞΊΞµΟΟ„Ξ·ΞΊΞµ. ΞΞ»ΞµΞ³ΞΎΞµ Ο„Ξ± ΟƒΟ„ΞΏΞΉΟ‡ΞµΞ―Ξ± ΞΊΞ±ΞΉ Ξ΄ΞΏΞΊΞ―ΞΌΞ±ΟƒΞµ ΞΎΞ±Ξ½Ξ¬.';
  }
  if (normalized.includes('overlapping shift')) {
    return 'Ξ¥Ο€Ξ¬ΟΟ‡ΞµΞΉ ΞµΟ€ΞΉΞΊΞ¬Ξ»Ο…ΟΞ· Ξ²Ξ¬ΟΞ΄ΞΉΞ±Ο‚ Ξ³ΞΉΞ± Ο„ΞΏΞ½ Ξ―Ξ΄ΞΉΞΏ Ο…Ο€Ξ¬Ξ»Ξ»Ξ·Ξ»ΞΏ. Ξ”ΞΉΟΟΞΈΟ‰ΟƒΞµ Ο„ΞΉΟ‚ ΟΟΞµΟ‚ ΞΊΞ±ΞΉ ΞΎΞ±Ξ½Ξ±Ο€ΟΞΏΟƒΟ€Ξ¬ΞΈΞ·ΟƒΞµ.';
  }
  if (normalized.includes('this week is locked')) {
    return 'Ξ— ΞµΞ²Ξ΄ΞΏΞΌΞ¬Ξ΄Ξ± ΞµΞ―Ξ½Ξ±ΞΉ ΞΊΞ»ΞµΞΉΞ΄Ο‰ΞΌΞ­Ξ½Ξ· ΞΌΞµΟ„Ξ¬ Ο„Ξ·Ξ½ ΞΏΟΞΉΟƒΟ„ΞΉΞΊΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ·. Ξ”ΞµΞ½ ΞµΟ€ΞΉΟ„ΟΞ­Ο€ΞΏΞ½Ο„Ξ±ΞΉ Ξ±Ξ»Ξ»Ξ±Ξ³Ξ­Ο‚.';
  }
  if (normalized.includes('template') || normalized.includes('custom βαρδι')) {
    return 'Δεν μπορέσαμε να φορτώσουμε τις custom βάρδιες. Οι κάρτες templates μπορεί να λείπουν προσωρινά, οπότε δεν θα μπορείς να τις αναθέσεις. Δοκίμασε ξανά φόρτωση ή ανανέωσε τη σελίδα.';
  }
  if (normalized.includes('history')) {
    return 'Ξ”ΞµΞ½ ΞµΞ½Ξ·ΞΌΞµΟΟΞΈΞ·ΞΊΞµ Ο€Ξ»Ξ®ΟΟ‰Ο‚ Ο„ΞΏ ΞΉΟƒΟ„ΞΏΟΞΉΞΊΟ. ΞΞΉ Ο„ΞµΞ»ΞµΟ…Ο„Ξ±Ξ―ΞµΟ‚ Ξ±Ξ»Ξ»Ξ±Ξ³Ξ­Ο‚ ΞΌΟ€ΞΏΟΞµΞ― Ξ½Ξ± ΞΌΞ·Ξ½ ΞµΞΌΟ†Ξ±Ξ½Ξ―Ξ¶ΞΏΞ½Ο„Ξ±ΞΉ Ξ¬ΞΌΞµΟƒΞ±.';
  }
  if (normalized.includes('clipboard')) {
    return 'Ξ”ΞµΞ½ Ξ®Ο„Ξ±Ξ½ Ξ΄Ο…Ξ½Ξ±Ο„Ξ® Ξ· Ξ±Ξ½Ο„ΞΉΞ³ΟΞ±Ο†Ξ® ΟƒΟ„ΞΏ clipboard. ΞΞ»ΞµΞ³ΞΎΞµ Ο„Ξ± Ξ΄ΞΉΞΊΞ±ΞΉΟΞΌΞ±Ο„Ξ± browser ΞΊΞ±ΞΉ Ξ΄ΞΏΞΊΞ―ΞΌΞ±ΟƒΞµ ΞΎΞ±Ξ½Ξ¬.';
  }
  if (normalized.includes('pdf') || normalized.includes('excel') || normalized.includes('word')) {
    return 'Ξ— ΞµΞΎΞ±Ξ³Ο‰Ξ³Ξ® Ξ±ΟΟ‡ΞµΞ―ΞΏΟ… Ξ±Ο€Ξ­Ο„Ο…Ο‡Ξµ. Ξ”ΞΏΞΊΞ―ΞΌΞ±ΟƒΞµ ΞΎΞ±Ξ½Ξ¬ Ξ® Ξ¬Ξ»Ξ»Ξ±ΞΎΞµ Ο„ΟΟ€ΞΏ ΞµΞΎΞ±Ξ³Ο‰Ξ³Ξ®Ο‚.';
  }

  return message;
}

function toActionError(error, fallbackMessage) {
  const rawMessage = error?.message || fallbackMessage;
  return humanizeStoreMessage(rawMessage) || fallbackMessage;
}

function classifyStoreFeedback(message) {
  const normalized = String(message || '').toLowerCase();
  if (!normalized) return 'info';

  const successSignals = ['αποθηκε', 'οριστικ', 'ολοκληρ', 'δημοσι', 'φορτώθηκε', 'αντιγράφηκε'];
  const errorSignals = ['αποτυχ', 'failed', 'error', 'δεν ', 'cannot', 'unable', 'επικάλυψη', 'κλειδω'];

  if (errorSignals.some((keyword) => normalized.includes(keyword))) return 'warning';
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
  const [actionLoading, setActionLoading] = useState({});
  const [syncStatusOverride, setSyncStatusOverride] = useState({ status: 'saved', label: '' });
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAdminTransitioning, setIsAdminTransitioning] = useState(false);
  const previousWeekFingerprintRef = useRef('');
  const skipNextUnsavedRef = useRef(false);

  const { isDark, toggleTheme } = useThemeMode();
  const { toasts, pushToast, dismissToast } = useToastQueue({ maxVisible: 3 });

  const {
    employees,
    shifts,
    shiftTemplates,
    weekHistory,
    weekTemplates,
    generatorRules,
    specialDaysByDate,
    selectedHistoryWeekId,
    selectedTemplateId,
    sundayRuleViolations,
    announcements,
    attendanceHistory,
    historyFilters,
    isHistoryLoading,
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
  const weekFingerprint = useMemo(() => createWeekFingerprint(weekShifts), [weekShifts]);
  const isWeekEffectivelyLocked = isWeekLocked && weekShifts.length > 0;
  const monthShifts = useMemo(
    () => shifts.filter((shift) => monthSet.has(shift.date)).sort((a, b) => a.date.localeCompare(b.date)),
    [shifts, monthSet],
  );
  const visibleDays = scheduleMode === 'month' ? monthDays : weekDays;
  const visibleShifts = scheduleMode === 'month' ? monthShifts : weekShifts;

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
    () => calculateWeeklyTotals(weekShifts, employees, weekDays),
    [weekShifts, employees, weekDays],
  );
  const monthlyAnalytics = useMemo(
    () => calculateWeeklyTotals(monthShifts, employees, monthDays),
    [monthShifts, employees, monthDays],
  );
  const analytics = scheduleMode === 'month' ? monthlyAnalytics : weeklyAnalytics;

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
    setSyncStatusOverride({ status: 'saved', label: 'Ξ‘Ο€ΞΏΞΈΞ·ΞΊΞµΟ…ΞΌΞ­Ξ½ΞΏ' });
  }, [weekFingerprint]);

  async function runActionWithFeedback({
    actionKey,
    execute,
    successMessage,
    errorMessageFallback,
    markAsSynced = false,
    retryAction,
  }) {
    setActionBusy(actionKey, true);
    setSyncStatusOverride({ status: 'saving', label: 'Ξ•ΞΊΟ„Ξ­Ξ»ΞµΟƒΞ· ΞµΞ½Ξ­ΟΞ³ΞµΞΉΞ±Ο‚...' });

    try {
      const result = await execute();
      if (result === false || result === null) {
        const failureMessage = humanizeStoreMessage(errorMessageFallback);
        setSyncStatusOverride({ status: 'error', label: 'Ξ— ΞµΞ½Ξ­ΟΞ³ΞµΞΉΞ± Ξ±Ο€Ξ­Ο„Ο…Ο‡Ξµ' });
        pushToast({
          type: 'error',
          title: 'Ξ‘Ο€ΞΏΟ„Ο…Ο‡Ξ―Ξ±',
          message: failureMessage,
          actionLabel: retryAction ? 'Ξ”ΞΏΞΊΞ―ΞΌΞ±ΟƒΞµ ΞΎΞ±Ξ½Ξ¬' : '',
          onAction: retryAction,
        });
        return false;
      }

      if (markAsSynced) {
        markSynced();
      } else {
        setSyncStatusOverride({ status: 'saved', label: '' });
      }

      if (successMessage) {
        pushToast({ type: 'success', title: 'ΞΞ³ΞΉΞ½Ξµ', message: successMessage });
      }
      return true;
    } catch (error) {
      const failureMessage = toActionError(error, errorMessageFallback);
      setSyncStatusOverride({ status: 'error', label: 'Ξ— ΞµΞ½Ξ­ΟΞ³ΞµΞΉΞ± Ξ±Ο€Ξ­Ο„Ο…Ο‡Ξµ' });
      pushToast({
        type: 'error',
        title: 'Ξ‘Ο€ΞΏΟ„Ο…Ο‡Ξ―Ξ±',
        message: failureMessage,
        actionLabel: retryAction ? 'Ξ”ΞΏΞΊΞ―ΞΌΞ±ΟƒΞµ ΞΎΞ±Ξ½Ξ¬' : '',
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
          shifts: weekShifts,
          employees,
          weekDays,
          weekdayLabels: WEEKDAY_LABELS,
        });
        await navigator.clipboard.writeText(text);
        return true;
      },
      successMessage: 'Το πρόγραμμα αντιγράφηκε στο clipboard για WhatsApp.',
      errorMessageFallback: 'Δεν ήταν δυνατή η αντιγραφή στο clipboard.',
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
      setWarningMessage('Ξ— ΞµΞ²Ξ΄ΞΏΞΌΞ¬Ξ΄Ξ± ΞµΞ―Ξ½Ξ±ΞΉ ΞΊΞ»ΞµΞΉΞ΄Ο‰ΞΌΞ­Ξ½Ξ·. Ξ”ΞµΞ½ ΞµΟ€ΞΉΟ„ΟΞ­Ο€ΞµΟ„Ξ±ΞΉ Ξ½Ξ­Ξ± Ξ±Ξ½Ξ¬ΞΈΞµΟƒΞ·.');
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
      setWarningMessage(error?.message || 'Ξ‘Ο€ΞΏΟ„Ο…Ο‡Ξ―Ξ± Ξ±Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ·Ο‚ Ξ±Ξ½Ξ¬ΞΈΞµΟƒΞ·Ο‚.');
    }
  }

  function getExportPayload() {
    return {
      weekDays,
      weekdayLabels: WEEKDAY_LABELS,
      shifts: weekShifts,
      employees,
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
          shifts: weekShifts,
          employees,
        });
        return true;
      },
      successMessage: 'Ολοκληρώθηκε η εξαγωγή PDF εβδομάδας.',
      errorMessageFallback: 'Αποτυχία εξαγωγής PDF εβδομάδας.',
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
          shifts: monthShifts,
          employees,
          month: selectedMonth,
          year: selectedYear,
        });
        return true;
      },
      successMessage: 'Ολοκληρώθηκε η εξαγωγή PDF μήνα.',
      errorMessageFallback: 'Αποτυχία εξαγωγής PDF μήνα.',
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
          roleConfig: monthlyRoleConfig,
          rules: {
            ...generatorRules,
            specialDaysByDate,
          },
        }),
      successMessage: 'Ο μηνιαίος προγραμματισμός ολοκληρώθηκε.',
      errorMessageFallback: 'Αποτυχία αυτόματης δημιουργίας μηνιαίου προγράμματος.',
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
      }),
    [clearWeekShifts, runActionWithFeedback],
  );

  const handleClearMonthFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'clearMonth',
        execute: () => clearMonthShifts({ year: selectedYear, month: selectedMonth }),
        successMessage: 'Ο μήνας καθαρίστηκε.',
        errorMessageFallback: 'Αποτυχία καθαρισμού μήνα.',
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
    pushToast({
      type: tone,
      title: tone === 'success' ? 'Ολοκληρώθηκε' : tone === 'warning' ? 'Προσοχή' : 'Ενημέρωση',
      message: humanizeStoreMessage(warningMessage),
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
    return <p className="p-8 text-center font-medium text-slate-900 dark:text-slate-100">Ξ¦ΟΟΟ„Ο‰ΟƒΞ· Ο€ΟΞΏΞ³ΟΞ¬ΞΌΞΌΞ±Ο„ΞΏΟ‚...</p>;
  }

  const dashboardContent = (
    <>
      <main className="scheduler-layout-shell mx-auto flex w-full max-w-[1820px] flex-col gap-4 p-4 text-slate-900 sm:gap-5 md:p-6 lg:p-7 dark:text-slate-100">
        <WeekToolbar
          weekDays={weekDays}
          weekTemplates={weekTemplates}
          selectedTemplateId={selectedTemplateId}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          isAdmin={isAdmin}
          isAdminTransitioning={isAdminTransitioning}
          isDark={isDark}
          onOpenAdminLogin={handleOpenAdminLogin}
          onLogoutAdmin={handleLogoutAdmin}
          onToggleTheme={toggleTheme}
          onPrevWeek={goToPreviousWeek}
          onNextWeek={goToNextWeek}
          onCurrentWeek={goToCurrentWeek}
          onSaveWeek={handleSaveWeekFromToolbar}
          onSaveTemplate={handleSaveTemplateFromToolbar}
          onSelectTemplate={setSelectedTemplateId}
          onLoadSelectedTemplate={handleLoadTemplateFromToolbar}
          onCopyWhatsapp={handleCopyWhatsapp}
          onClearWeek={handleClearWeekFromToolbar}
          onClearMonth={handleClearMonthFromToolbar}
          onFinalizeWeek={handleFinalizeFromToolbar}
          onMagicWand={handleMagicWeekFromToolbar}
          onJumpToWeekDate={setWeekFromDate}
          onExportWeekPdf={handleExportWeekPdf}
          onExportMonthPdf={handleExportMonthPdf}
          onExportExcel={handleExportExcel}
          onExportWord={handleExportWord}
          isWeekLocked={isWeekEffectivelyLocked}
          syncStatus={syncStatus}
          actionLoading={actionLoading}
        />

        {!isFirebaseConfigured ? (
          <MessageBanner
            icon={WifiOff}
            tone="warning"
            title="Ξ¤ΞΏ Firebase Ξ΄ΞµΞ½ ΞµΞ―Ξ½Ξ±ΞΉ Ξ­Ο„ΞΏΞΉΞΌΞΏ"
            message={firebaseConfigErrorMessage || 'Ξ— ΟƒΟΞ½Ξ΄ΞµΟƒΞ· ΞΌΞµ Ο„Ξ· Ξ²Ξ¬ΟƒΞ· Ξ΄ΞµΞ½ ΞµΞ―Ξ½Ξ±ΞΉ Ξ΄ΞΉΞ±ΞΈΞ­ΟƒΞΉΞΌΞ·.'}
            impact="Ξ¤ΞΏ dashboard ΞµΞΌΟ†Ξ±Ξ½Ξ―Ξ¶ΞµΟ„Ξ±ΞΉ, Ξ±Ξ»Ξ»Ξ¬ Ξ΄ΞµΞ΄ΞΏΞΌΞ­Ξ½Ξ± ΞΊΞ±ΞΉ Ξ±Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ· ΞΌΟ€ΞΏΟΞµΞ― Ξ½Ξ± Ξ»ΞµΞ―Ο€ΞΏΟ…Ξ½."
            nextAction="ΞΞ»ΞµΞ³ΞΎΞµ Ο„Ξ± env vars ΟƒΟ„ΞΏ local Ξ® ΟƒΟ„ΞΏ deployment environment."
          />
        ) : null}

        {showReadOnlyBanner ? (
          <MessageBanner
            icon={ShieldCheck}
            tone="info"
            title="Read-only Ο€ΟΟΟƒΞ²Ξ±ΟƒΞ·"
            message="Ξ¤ΞΏ Ο€ΞµΟΞΉΞ²Ξ¬Ξ»Ξ»ΞΏΞ½ ΞµΞ―Ξ½Ξ±ΞΉ ΟƒΞµ Ο€ΟΞΏΞ²ΞΏΞ»Ξ® Ο‡Ο‰ΟΞ―Ο‚ Ξ΄ΞΉΞΊΞ±Ξ―Ο‰ΞΌΞ± ΞµΟ€ΞµΞΎΞµΟΞ³Ξ±ΟƒΞ―Ξ±Ο‚."
            impact="Ξ¤Ξ± admin-only actions ΞµΞ―Ξ½Ξ±ΞΉ ΞΊΞ»ΞµΞΉΞ΄Ο‰ΞΌΞ­Ξ½Ξ± ΞΌΞ­Ο‡ΟΞΉ login Ξ΄ΞΉΞ±Ο‡ΞµΞΉΟΞΉΟƒΟ„Ξ®."
            nextAction="Ξ‘Ξ½ Ο‡ΟΞµΞΉΞ¬Ξ¶ΞµΟƒΞ±ΞΉ Ξ±Ξ»Ξ»Ξ±Ξ³Ξ­Ο‚, ΞΊΞ¬Ξ½Ξµ ΞµΞ―ΟƒΞΏΞ΄ΞΏ Ο‰Ο‚ Ξ΄ΞΉΞ±Ο‡ΞµΞΉΟΞΉΟƒΟ„Ξ®Ο‚ Ξ±Ο€Ο Ο„ΞΏ toolbar."
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

        <div className="grid items-start gap-4 lg:gap-5 xl:grid-cols-[320px,minmax(0,1fr)] 2xl:grid-cols-[340px,minmax(0,1fr)]">
          <div className="order-1 xl:order-1">
            <div className="hidden md:block">
              <SchedulerSidebar
                employees={employees}
                shiftTemplates={shiftTemplates}
                weekDays={weekDays}
                visibleDays={visibleDays}
                isAdmin={isAdmin}
                scheduleMode={scheduleMode}
                onModeChange={setScheduleMode}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                analytics={analytics}
                onAddEmployee={addEmployee}
                onDeleteEmployee={deleteEmployee}
                onOpenAdminLogin={handleOpenAdminLogin}
                onOpenProfile={setProfileEmployee}
                onAddShiftTemplate={addShiftTemplate}
                onDeleteShiftTemplate={deleteShiftTemplate}
                onCreateShift={addShift}
              />
            </div>
          </div>

          <div className="order-2 min-w-0 xl:order-2">
            <div className="space-y-4 lg:space-y-5">
              <WeeklyGrid
                weekDays={weekDays}
                monthDays={monthDays}
                shifts={visibleShifts}
                shiftTemplates={shiftTemplates}
                employees={employees}
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
                  employees={employees}
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
          aria-label="Ξ†Ξ½ΞΏΞΉΞ³ΞΌΞ± sidebar"
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
          aria-label="Ξ“ΟΞ®Ξ³ΞΏΟΞ· Ο‡ΞµΞΉΟΞΏΞΊΞ―Ξ½Ξ·Ο„Ξ· Ξ²Ξ¬ΟΞ΄ΞΉΞ±"
        >
          <Plus size={24} />
        </button>
      </div>

      {isSidebarOpen ? (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="ΞΞ»ΞµΞ―ΟƒΞΉΞΌΞΏ"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-t-3xl bg-slate-100/90 p-3 shadow-2xl backdrop-blur-md dark:bg-slate-950/85">
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-300/70 dark:bg-slate-700/70" />
            <div className="max-h-[78vh] overflow-y-auto pb-4">
                <SchedulerSidebar
                  employees={employees}
                  shiftTemplates={shiftTemplates}
                  weekDays={weekDays}
                  visibleDays={visibleDays}
                  isAdmin={isAdmin}
                  scheduleMode={scheduleMode}
                  onModeChange={setScheduleMode}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  analytics={analytics}
                  onAddEmployee={addEmployee}
                  onDeleteEmployee={deleteEmployee}
                  onOpenAdminLogin={handleOpenAdminLogin}
                  onOpenProfile={setProfileEmployee}
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
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Ξ“ΟΞ®Ξ³ΞΏΟΞ· Ξ‘Ξ½Ξ¬ΞΈΞµΟƒΞ·</h3>
              <button
                type="button"
                onClick={() => setQuickAssignDraft((prev) => ({ ...prev, open: false }))}
                className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                ΞΞ»ΞµΞ―ΟƒΞΉΞΌΞΏ
              </button>
            </div>

            <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
              {quickAssignDraft.employeeName} - {formatDateGreek(quickAssignDraft.date)}
            </p>

            <form onSubmit={handleQuickAssignSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  ΞΟΞ± ΞΞ½Ξ±ΟΞΎΞ·Ο‚
                  <input
                    type="time"
                    value={quickAssignDraft.startTime}
                    onChange={(event) => setQuickAssignDraft((prev) => ({ ...prev, startTime: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    required
                  />
                </label>
                <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  ΞΟΞ± Ξ›Ξ®ΞΎΞ·Ο‚
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
                Ξ¤ΟΟ€ΞΏΟ‚
                <select
                  value={quickAssignDraft.type}
                  onChange={(event) => setQuickAssignDraft((prev) => ({ ...prev, type: event.target.value }))}
                  className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 dark:border-cyan-300/45 dark:text-white"
                >
                  <option value={SHIFT_TYPES.WORK}>Ξ•ΟΞ³Ξ±ΟƒΞ―Ξ±</option>
                  <option value={SHIFT_TYPES.REST}>Ξ΅ΞµΟ€Ο</option>
                  <option value={SHIFT_TYPES.LEAVE}>Ξ†Ξ΄ΞµΞΉΞ±</option>
                  <option value={SHIFT_TYPES.SICK}>Ξ‘ΟƒΞΈΞ­Ξ½ΞµΞΉΞ±</option>
                </select>
              </label>

              <button
                type="submit"
                className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                disabled={isSaving || isWeekEffectivelyLocked}
              >
                {isWeekEffectivelyLocked ? 'Ξ— ΞµΞ²Ξ΄ΞΏΞΌΞ¬Ξ΄Ξ± ΞµΞ―Ξ½Ξ±ΞΉ ΞΊΞ»ΞµΞΉΞ΄Ο‰ΞΌΞ­Ξ½Ξ·' : isSaving ? 'Ξ‘Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ·...' : 'Ξ‘Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ·'}
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





