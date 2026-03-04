import { DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { AlertTriangle, ShieldCheck, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { WEEKDAY_LABELS } from '../../data/constants';
import { isFirebaseConfigured } from '../../firebase/config';
import { useSchedulerStore } from '../../hooks/useSchedulerStore';
import { useThemeMode } from '../../hooks/useThemeMode';
import { calculateWeeklyTotals } from '../../utils/analytics';
import {
  exportScheduleToExcel,
  exportScheduleToPdf,
  exportScheduleToWord,
} from '../../utils/exportUtils';
import { getWeekDays } from '../../utils/time';
import { buildWhatsappSummary } from '../../utils/whatsappExport';
import AdminLoginModal from './AdminLoginModal';
import AnalyticsPanel from './AnalyticsPanel';
import EmployeeProfileModal from './EmployeeProfileModal';
import EmployeeSidebar from './EmployeeSidebar';
import ManualShiftForm from './ManualShiftForm';
import UndoSnackbar from './UndoSnackbar';
import WeekToolbar from './WeekToolbar';
import WeeklyGrid from './WeeklyGrid';

export default function MainDashboard() {
  const [activeEmployee, setActiveEmployee] = useState(null);
  const [profileEmployee, setProfileEmployee] = useState(null);
  const { isDark, toggleTheme } = useThemeMode();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const {
    employees,
    shifts,
    weekStart,
    isLoading,
    isAuthLoading,
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
    deleteShift,
    clearWeekShifts,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    setWarningMessage,
    clearMessages,
    openLoginModal,
    closeLoginModal,
    loginAsAdmin,
    requestPasswordReset,
    logoutAdmin,
    undoLastAction,
    dismissUndo,
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

  const weekShifts = useMemo(
    () => shifts.filter((shift) => weekSet.has(shift.date)).sort((a, b) => a.date.localeCompare(b.date)),
    [shifts, weekSet],
  );

  const analytics = useMemo(
    () => calculateWeeklyTotals(weekShifts, employees, weekDays),
    [weekShifts, employees, weekDays],
  );

  async function handleDragEnd(event) {
    const { active, over } = event;
    setActiveEmployee(null);

    if (!isAdmin || !active || !over) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (activeData?.type !== 'employee' || overData?.type !== 'slot') return;

    const employee = activeData.employee;
    const slot = overData.slot;

    // ΞΞ¬ΞΈΞµ drop Ξ΄Ξ·ΞΌΞΉΞΏΟ…ΟΞ³ΞµΞ― Ξ¬ΞΌΞµΟƒΞ± Ξ±Ξ½Ξ¬ΞΈΞµΟƒΞ· Ξ²Ξ¬ΟΞ΄ΞΉΞ±Ο‚ ΟƒΟ„Ξ· Ξ²Ξ¬ΟƒΞ·.
    await addShift({
      employeeId: employee.id,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: slot.label,
    });
  }

  function handleDragStart(event) {
    if (!isAdmin) return;
    const activeData = event.active.data.current;
    if (activeData?.type === 'employee') {
      setActiveEmployee(activeData.employee);
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
      setWarningMessage('Ξ¤ΞΏ Ο€ΟΟΞ³ΟΞ±ΞΌΞΌΞ± Ξ±Ξ½Ο„ΞΉΞ³ΟΞ¬Ο†Ξ·ΞΊΞµ ΟƒΟ„ΞΏ clipboard Ξ³ΞΉΞ± WhatsApp.');
      setTimeout(() => clearMessages(), 2500);
    } catch {
      setWarningMessage('Ξ‘Ο€ΞΏΟ„Ο…Ο‡Ξ―Ξ± Ξ±Ξ½Ο„ΞΉΞ³ΟΞ±Ο†Ξ®Ο‚. Ξ•Ο€ΞΉΞ²ΞµΞ²Ξ±Ξ―Ο‰ΟƒΞµ Ξ¬Ξ΄ΞµΞΉΞ± clipboard ΟƒΟ„ΞΏΞ½ browser.');
    }
  }

  async function handleSaveProfile(profilePayload) {
    await editEmployee(profilePayload);
  }

  function getExportPayload() {
    return {
      weekDays,
      weekdayLabels: WEEKDAY_LABELS,
      shifts: weekShifts,
      employees,
    };
  }

  function handleExportPdf() {
    try {
      exportScheduleToPdf(getExportPayload());
    } catch {
      setWarningMessage('Ξ‘Ο€ΞΏΟ„Ο…Ο‡Ξ―Ξ± ΞµΞΎΞ±Ξ³Ο‰Ξ³Ξ®Ο‚ PDF.');
    }
  }

  function handleExportExcel() {
    try {
      exportScheduleToExcel(getExportPayload());
    } catch {
      setWarningMessage('Ξ‘Ο€ΞΏΟ„Ο…Ο‡Ξ―Ξ± ΞµΞΎΞ±Ξ³Ο‰Ξ³Ξ®Ο‚ Excel.');
    }
  }

  async function handleExportWord() {
    try {
      await exportScheduleToWord(getExportPayload());
    } catch {
      setWarningMessage('Ξ‘Ο€ΞΏΟ„Ο…Ο‡Ξ―Ξ± ΞµΞΎΞ±Ξ³Ο‰Ξ³Ξ®Ο‚ Word.');
    }
  }

  if (isLoading || isAuthLoading) {
    return <p className="p-8 text-center font-medium text-slate-900 dark:text-slate-100">Ξ¦ΟΟΟ„Ο‰ΟƒΞ· Ο€ΟΞΏΞ³ΟΞ¬ΞΌΞΌΞ±Ο„ΞΏΟ‚...</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4 text-slate-900 md:p-6 dark:text-slate-100">
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
          onCopyWhatsapp={handleCopyWhatsapp}
          onClearWeek={clearWeekShifts}
          onExportPdf={handleExportPdf}
          onExportExcel={handleExportExcel}
          onExportWord={handleExportWord}
        />

        {!isFirebaseConfigured ? (
          <div className="glass-soft flex items-start gap-2 rounded-xl border border-amber-300/70 p-3 text-sm text-amber-900 dark:text-amber-200">
            <WifiOff size={18} className="mt-0.5 shrink-0" />
            Ξ”ΞµΞ½ Ξ²ΟΞ­ΞΈΞ·ΞΊΞ±Ξ½ Firebase env vars. Ξ— ΞµΟ†Ξ±ΟΞΌΞΏΞ³Ξ® Ο„ΟΞ­Ο‡ΞµΞΉ ΟƒΞµ local demo mode ΞΌΞµ localStorage.
          </div>
        ) : null}

        {!isAdmin ? (
          <div className="glass-soft flex items-start gap-2 rounded-xl border border-slate-300/60 p-3 text-sm text-slate-800 dark:text-slate-100">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            Read-only mode: ΞΟΞ½ΞΏ ΞΏ ΟƒΟ…Ξ½Ξ΄ΞµΞ΄ΞµΞΌΞ­Ξ½ΞΏΟ‚ Ξ΄ΞΉΞ±Ο‡ΞµΞΉΟΞΉΟƒΟ„Ξ®Ο‚ Ξ²Ξ»Ξ­Ο€ΞµΞΉ Ξ‘Ξ¦Ξ ΞΊΞ±ΞΉ ΞΊΞ¬Ξ½ΞµΞΉ Ξ±Ξ»Ξ»Ξ±Ξ³Ξ­Ο‚.
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

        <div className="grid gap-4 xl:grid-cols-[320px,1fr]">
          <div className="space-y-4">
            <EmployeeSidebar
              employees={employees}
              isAdmin={isAdmin}
              onAddEmployee={addEmployee}
              onDeleteEmployee={deleteEmployee}
              onOpenAdminLogin={openLoginModal}
              onOpenProfile={setProfileEmployee}
            />
            <ManualShiftForm
              employees={employees}
              weekDays={weekDays}
              onCreateShift={addShift}
              canManage={isAdmin}
            />
            <AnalyticsPanel
              employees={employees}
              totalsByEmployee={analytics.totalsByEmployee}
              totalHours={analytics.totalHours}
            />
          </div>

          <WeeklyGrid
            weekDays={weekDays}
            shifts={weekShifts}
            employees={employees}
            onDeleteShift={deleteShift}
            canManage={isAdmin}
          />
        </div>
      </main>

      <DragOverlay>
        {activeEmployee ? (
          <div className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-lg">
            {activeEmployee.fullName}
          </div>
        ) : null}
      </DragOverlay>

      <AdminLoginModal
        open={isLoginModalOpen}
        onClose={closeLoginModal}
        onLogin={loginAsAdmin}
        onRequestPasswordReset={requestPasswordReset}
        isFirebaseConfigured={isFirebaseConfigured}
      />

      <EmployeeProfileModal
        open={Boolean(profileEmployee)}
        employee={profileEmployee}
        isAdmin={isAdmin}
        onClose={() => setProfileEmployee(null)}
        onSave={handleSaveProfile}
      />

      <UndoSnackbar undoState={undoState} onUndo={undoLastAction} onDismiss={dismissUndo} isAdmin={isAdmin} />
    </DndContext>
  );
}

