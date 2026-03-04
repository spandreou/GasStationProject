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
import TemplateAssignModal from './TemplateAssignModal';
import UndoSnackbar from './UndoSnackbar';
import WeekToolbar from './WeekToolbar';
import WeeklyGrid from './WeeklyGrid';

export default function MainDashboard() {
  const [activeDragItem, setActiveDragItem] = useState(null);
  const [profileEmployee, setProfileEmployee] = useState(null);
  const [templateAssignState, setTemplateAssignState] = useState({ open: false, template: null, date: '' });

  const { isDark, toggleTheme } = useThemeMode();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const {
    employees,
    shifts,
    shiftTemplates,
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
    addShiftTemplate,
    deleteShiftTemplate,
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
    setActiveDragItem(null);

    if (!isAdmin || !active || !over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'employee' && overData?.type === 'slot') {
      const employee = activeData.employee;
      const slot = overData.slot;

      await addShift({
        employeeId: employee.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        label: slot.label,
      });
      return;
    }

    if (activeData?.type === 'shift-template' && overData?.type === 'day') {
      const template = activeData.template;
      const date = overData.day?.date;
      if (!template || !date) return;

      if (!employees.length) {
        setWarningMessage('Δεν υπάρχουν υπάλληλοι για ανάθεση της custom βάρδιας.');
        return;
      }

      const templateEmployeeId =
        template.employeeId && employees.some((employee) => employee.id === template.employeeId) ? template.employeeId : '';

      if (templateEmployeeId) {
        await addShift({
          employeeId: templateEmployeeId,
          date,
          startTime: template.startTime,
          endTime: template.endTime,
          label: template.label,
          trackUndo: true,
        });
        return;
      }

      setTemplateAssignState({ open: true, template, date });
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

  async function handleAssignTemplate(employeeId) {
    const { template, date } = templateAssignState;
    if (!template || !date || !employeeId) return;

    await addShift({
      employeeId,
      date,
      startTime: template.startTime,
      endTime: template.endTime,
      label: template.label,
      trackUndo: true,
    });

    setTemplateAssignState({ open: false, template: null, date: '' });
  }

  function closeTemplateAssign() {
    setTemplateAssignState({ open: false, template: null, date: '' });
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
      setWarningMessage('Αποτυχία εξαγωγής PDF.');
    }
  }

  function handleExportExcel() {
    try {
      exportScheduleToExcel(getExportPayload());
    } catch {
      setWarningMessage('Αποτυχία εξαγωγής Excel.');
    }
  }

  async function handleExportWord() {
    try {
      await exportScheduleToWord(getExportPayload());
    } catch {
      setWarningMessage('Αποτυχία εξαγωγής Word.');
    }
  }

  if (isLoading || isAuthLoading) {
    return <p className="p-8 text-center font-medium text-slate-900 dark:text-slate-100">Φόρτωση προγράμματος...</p>;
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
            Δεν βρέθηκαν Firebase env vars. Η εφαρμογή τρέχει σε local demo mode με localStorage.
          </div>
        ) : null}

        {!isAdmin ? (
          <div className="glass-soft flex items-start gap-2 rounded-xl border border-slate-300/60 p-3 text-sm text-slate-800 dark:text-slate-100">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            Read-only mode: Μόνο ο συνδεδεμένος διαχειριστής βλέπει ΑΦΜ και κάνει αλλαγές.
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

        <div className="grid gap-4 xl:grid-cols-[360px,1fr]">
          <div className="space-y-4">
            <EmployeeSidebar
              employees={employees}
              shiftTemplates={shiftTemplates}
              isAdmin={isAdmin}
              onAddEmployee={addEmployee}
              onDeleteEmployee={deleteEmployee}
              onOpenAdminLogin={openLoginModal}
              onOpenProfile={setProfileEmployee}
              onAddShiftTemplate={addShiftTemplate}
              onDeleteShiftTemplate={deleteShiftTemplate}
            />

            <ManualShiftForm employees={employees} weekDays={weekDays} onCreateShift={addShift} canManage={isAdmin} />

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
        {activeDragItem ? (
          <div className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-lg dark:border dark:border-cyan-300/35">
            {activeDragItem.label}
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

      <TemplateAssignModal
        open={templateAssignState.open}
        template={templateAssignState.template}
        date={templateAssignState.date}
        employees={employees}
        onClose={closeTemplateAssign}
        onConfirm={handleAssignTemplate}
      />

      <UndoSnackbar undoState={undoState} onUndo={undoLastAction} onDismiss={dismissUndo} isAdmin={isAdmin} />
    </DndContext>
  );
}
