import { AlertTriangle, Plus, ShieldCheck, WifiOff } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { WEEKDAY_LABELS } from '../../data/constants';
import { adminEmail, firebaseConfigErrorMessage, isDemoMode, isFirebaseConfigured } from '../../firebase/config';
import { useSchedulerStore } from '../../hooks/useSchedulerStore';
import { useThemeMode } from '../../hooks/useThemeMode';
import { calculateWeeklyTotals, getShiftTypeLabel, SHIFT_TYPES } from '../../utils/analytics';
import { getMonthDays } from '../../utils/scheduleUtils';
import { getWeekDays } from '../../utils/time';
import { buildWhatsappSummary } from '../../utils/whatsappExport';
import AnnouncementBoard from './AnnouncementBoard';
import AnalyticsPanel from './AnalyticsPanel';
import EmployeeSidebar from './EmployeeSidebar';
import HistoryView from './HistoryView';
import ManualShiftForm from './ManualShiftForm';
import SchedulingRulesPanel from './SchedulingRulesPanel';
import SpecialDaysPanel from './SpecialDaysPanel';
import UndoSnackbar from './UndoSnackbar';
import WeekToolbar from './WeekToolbar';
import WeeklyGrid from './WeeklyGrid';

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

export default function MainDashboard() {
  const [activeDragItem, setActiveDragItem] = useState(null);
  const [profileEmployee, setProfileEmployee] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [isManualSheetOpen, setIsManualSheetOpen] = useState(false);
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

  const { isDark, toggleTheme } = useThemeMode();

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
  const isWeekEffectivelyLocked = isWeekLocked && weekShifts.length > 0;
  const monthShifts = useMemo(
    () => shifts.filter((shift) => monthSet.has(shift.date)).sort((a, b) => a.date.localeCompare(b.date)),
    [shifts, monthSet],
  );
  const visibleDays = scheduleMode === 'month' ? monthDays : weekDays;
  const visibleShifts = scheduleMode === 'month' ? monthShifts : weekShifts;

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

  const handleMobileManualShiftCreate = useCallback(
    async (payload) => {
      const created = await addShift(payload);
      if (created?.id) {
        setIsManualSheetOpen(false);
      }
    },
    [addShift],
  );

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
    try {
      const text = buildWhatsappSummary({
        shifts: weekShifts,
        employees,
        weekDays,
        weekdayLabels: WEEKDAY_LABELS,
      });

      await navigator.clipboard.writeText(text);
      setWarningMessage('Το πρόγραμμα αντιγράφηκε στο clipboard για WhatsApp.');
      setTimeout(() => clearMessages(), 2500);
    } catch {
      setWarningMessage('Αποτυχία αντιγραφής. Επιβεβαίωσε άδεια clipboard στον browser.');
    }
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
      shifts: weekShifts,
      employees,
    };
  }

  async function handleExportWeekPdf() {
    try {
      const { exportScheduleToPdf } = await loadExportService();
      await exportScheduleToPdf({
        mode: 'week',
        days: weekDays,
        shifts: weekShifts,
        employees,
      });
    } catch {
      setWarningMessage('Αποτυχία εξαγωγής PDF εβδομάδας.');
    }
  }

  async function handleExportMonthPdf() {
    try {
      const { exportScheduleToPdf } = await loadExportService();
      await exportScheduleToPdf({
        mode: 'month',
        days: monthDays,
        shifts: monthShifts,
        employees,
        month: selectedMonth,
        year: selectedYear,
      });
    } catch {
      setWarningMessage('Αποτυχία εξαγωγής PDF μήνα.');
    }
  }

  async function handleExportExcel() {
    try {
      const { exportScheduleToExcel } = await loadExportService();
      await exportScheduleToExcel(getExportPayload());
    } catch {
      setWarningMessage('Αποτυχία εξαγωγής Excel.');
    }
  }

  async function handleExportWord() {
    try {
      const { exportScheduleToWord } = await loadExportService();
      await exportScheduleToWord(getExportPayload());
    } catch {
      setWarningMessage('Αποτυχία εξαγωγής Word.');
    }
  }


  async function handleGenerateMonthlySchedule() {
    await generateMagicMonth({
      month: selectedMonth,
      year: selectedYear,
      roleConfig: monthlyRoleConfig,
      rules: {
        ...generatorRules,
        specialDaysByDate,
      },
    });
  }

  async function handleSaveSpecialDay(payload) {
    await upsertSpecialDay(payload);
  }

  if (isLoading || isAuthLoading) {
    return <p className="p-8 text-center font-medium text-slate-900 dark:text-slate-100">Φόρτωση προγράμματος...</p>;
  }

  const dashboardContent = (
    <>
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 p-4 text-slate-900 sm:gap-4 md:p-6 dark:text-slate-100">
        <WeekToolbar
          weekDays={weekDays}
          isAdmin={isAdmin}
          isDark={isDark}
          onOpenAdminLogin={openLoginModal}
          onLogoutAdmin={logoutAdmin}
          onToggleTheme={toggleTheme}
          onPrevWeek={goToPreviousWeek}
          onNextWeek={goToNextWeek}
          onCurrentWeek={goToCurrentWeek}
          onSaveWeek={saveCurrentWeekManually}
          onCopyWhatsapp={handleCopyWhatsapp}
          onClearWeek={clearWeekShifts}
          onFinalizeWeek={finalizeCurrentWeek}
          onMagicWand={generateMagicWeek}
          onJumpToWeekDate={setWeekFromDate}
          onExportWeekPdf={handleExportWeekPdf}
          onExportMonthPdf={handleExportMonthPdf}
          onExportExcel={handleExportExcel}
          onExportWord={handleExportWord}
          isWeekLocked={isWeekEffectivelyLocked}
        />

        {!isFirebaseConfigured ? (
          <div className="glass-soft flex items-start gap-2 rounded-xl border border-amber-300/70 p-3 text-sm text-amber-900 dark:text-amber-200">
            <WifiOff size={18} className="mt-0.5 shrink-0" />
            {firebaseConfigErrorMessage || 'Το Firebase δεν είναι ρυθμισμένο. Έλεγξε τα env vars στο Vercel/τοπικό περιβάλλον.'}
          </div>
        ) : null}

        {!isAdmin ? (
          <div className="glass-soft flex items-start gap-2 rounded-xl border border-slate-300/60 p-2 text-[10px] text-slate-800 leading-snug sm:p-3 sm:text-sm dark:text-slate-100">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            <p className="line-clamp-2 sm:line-clamp-none">
              Λειτουργία μόνο ανάγνωσης: μόνο ο συνδεδεμένος διαχειριστής βλέπει ΑΦΜ και κάνει αλλαγές.
            </p>
          </div>
        ) : null}

        {warningMessage ? (
          <div className="glass-soft flex items-start gap-2 rounded-xl border border-red-300/70 p-3 text-sm text-red-700 dark:text-red-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            {warningMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="glass-soft rounded-xl border border-red-300/70 p-3 text-sm text-red-700 dark:text-red-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-5 sm:gap-4 xl:grid-cols-[360px,1fr]">
          <div className="order-2 space-y-5 sm:space-y-4 md:order-1">
            <div className="hidden md:block">
              <EmployeeSidebar
                employees={employees}
                shiftTemplates={shiftTemplates}
                weekDays={weekDays}
                isAdmin={isAdmin}
                onAddEmployee={addEmployee}
                onDeleteEmployee={deleteEmployee}
                onOpenAdminLogin={openLoginModal}
                onOpenProfile={setProfileEmployee}
                onAddShiftTemplate={addShiftTemplate}
                onDeleteShiftTemplate={deleteShiftTemplate}
              />
            </div>

            <div className="hidden md:block">
              <ManualShiftForm employees={employees} weekDays={visibleDays} onCreateShift={addShift} canManage={isAdmin} />
            </div>

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

          <div className="order-1 md:order-2">
            <div className="space-y-5 sm:space-y-4">
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
                isSaving={isSaving}
              />
              <AnnouncementBoard
                announcements={announcements}
                isAdmin={isAdmin}
                isSaving={isSaving}
                onAddAnnouncement={addAnnouncement}
                onDeleteAnnouncement={deleteAnnouncement}
              />
              <Suspense fallback={null}>
                <WeekHistoryViewer isAdmin={isAdmin} weekHistory={weekHistory} employees={employees} />
              </Suspense>
            </div>
          </div>
        </div>

        <HistoryView
          isAdmin={isAdmin}
          employees={employees}
          historyRows={attendanceHistory}
          filters={historyFilters}
          isLoading={isHistoryLoading}
          onFilterChange={setHistoryFilters}
        />
      </main>

      <button
        type="button"
        onClick={() => setIsQuickActionsOpen(true)}
        className="fixed bottom-6 right-6 z-[65] inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-xl shadow-slate-900/20 transition hover:bg-brand-600 md:hidden"
        aria-label="Quick actions"
      >
        <Plus size={24} />
      </button>

      {isQuickActionsOpen ? (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Κλείσιμο"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsQuickActionsOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl sm:rounded-t-3xl bg-slate-100/90 p-4 shadow-2xl backdrop-blur-md dark:bg-slate-950/85">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300/70 dark:bg-slate-700/70" />
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Γρήγορες Ενέργειες</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setIsQuickActionsOpen(false);
                  setIsSidebarOpen(true);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-left text-sm font-semibold text-slate-900 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-cyan-300/30 dark:bg-slate-900/60 dark:text-slate-100"
              >
                Νέος Υπάλληλος
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsQuickActionsOpen(false);
                  setIsManualSheetOpen(true);
                }}
                className="w-full rounded-xl border border-brand-300/70 bg-brand-500/90 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
              >
                Νέα Custom Βάρδια
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isManualSheetOpen ? (
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Κλείσιμο"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsManualSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-t-3xl bg-slate-100/90 p-3 shadow-2xl backdrop-blur-md dark:bg-slate-950/85">
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-300/70 dark:bg-slate-700/70" />
            <div className="max-h-[78vh] overflow-y-auto pb-4">
              <ManualShiftForm
                employees={employees}
                weekDays={visibleDays}
                onCreateShift={handleMobileManualShiftCreate}
                canManage={isAdmin}
              />
            </div>
          </div>
        </div>
      ) : null}

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
              <EmployeeSidebar
                employees={employees}
                shiftTemplates={shiftTemplates}
                weekDays={weekDays}
                isAdmin={isAdmin}
                onAddEmployee={addEmployee}
                onDeleteEmployee={deleteEmployee}
                onOpenAdminLogin={openLoginModal}
                onOpenProfile={setProfileEmployee}
                onAddShiftTemplate={addShiftTemplate}
                onDeleteShiftTemplate={deleteShiftTemplate}
                compact
              />
            </div>
          </div>
        </div>
      ) : null}

      <Suspense fallback={null}>
        <AdminLoginModal
          open={isLoginModalOpen}
          onClose={closeLoginModal}
          onLogin={loginAsAdmin}
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
              {quickAssignDraft.employeeName} - {quickAssignDraft.date}
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

