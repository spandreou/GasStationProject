import { BarChart3, CalendarDays, ChevronDown, ChevronUp, LayoutPanelTop, Sparkles, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import AbsencesPanel from './AbsencesPanel';
import AnalyticsPanel from './AnalyticsPanel';
import EmployeeSidebar from './EmployeeSidebar';
import ManualShiftForm from './ManualShiftForm';

function SidebarSection({ id, title, icon: Icon, activeId, onToggle, children, helperText = '' }) {
  const isOpen = activeId === id;

  return (
    <section className="rounded-2xl border border-white/35 bg-white/22 p-2.5 backdrop-blur-sm dark:border-cyan-300/18 dark:bg-slate-900/22">
      <button
        type="button"
        data-testid={`${id}-nav`}
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition hover:bg-white/25 dark:hover:bg-slate-900/35"
        aria-expanded={isOpen}
      >
        <span className="inline-flex items-center gap-2">
          <Icon size={16} className="text-slate-700 dark:text-cyan-100" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</span>
        </span>
        {isOpen ? <ChevronUp size={16} className="text-slate-600 dark:text-slate-300" /> : <ChevronDown size={16} className="text-slate-600 dark:text-slate-300" />}
      </button>

      {isOpen ? (
        <div className="mt-2 space-y-2">
          {helperText ? <p className="px-2 text-xs text-slate-600 dark:text-slate-300">{helperText}</p> : null}
          <div>{children}</div>
        </div>
      ) : null}
    </section>
  );
}

export default function SchedulerSidebar({
  employees,
  shiftTemplates,
  absences,
  isAbsencesLoading,
  weekDays,
  visibleDays,
  isAdmin,
  isSaving,
  scheduleMode,
  onModeChange,
  selectedMonth,
  selectedYear,
  analytics,
  onAddEmployee,
  onDeleteEmployee,
  onOpenAdminLogin,
  onOpenProfile,
  onCreateAbsence,
  onUpdateAbsence,
  onCancelAbsence,
  onDeleteAbsence,
  onAddShiftTemplate,
  onDeleteShiftTemplate,
  onCreateShift,
  defaultSection = 'employees',
  compact = false,
}) {
  const [activeSection, setActiveSection] = useState(defaultSection);

  const templateCount = useMemo(
    () => (shiftTemplates || []).filter((template) => !template?.isPlaced).length,
    [shiftTemplates],
  );

  function handleToggle(sectionId) {
    setActiveSection((prev) => (prev === sectionId ? '' : sectionId));
  }

  return (
    <div className={`space-y-3 ${compact ? 'space-y-2.5' : ''}`}>
      <SidebarSection
        id="employees"
        title="Υπάλληλοι"
        icon={UsersRound}
        activeId={activeSection}
        onToggle={handleToggle}
        helperText="Διαχείριση προσωπικού και drag & drop ανάθεση στο grid."
      >
        <EmployeeSidebar
          employees={employees}
          shiftTemplates={shiftTemplates}
          weekDays={weekDays}
          isAdmin={isAdmin}
          onAddEmployee={onAddEmployee}
          onDeleteEmployee={onDeleteEmployee}
          onOpenAdminLogin={onOpenAdminLogin}
          onOpenProfile={onOpenProfile}
          onAddShiftTemplate={onAddShiftTemplate}
          onDeleteShiftTemplate={onDeleteShiftTemplate}
          view="employees"
          compact={compact}
          className="border-white/30 bg-white/18 dark:border-cyan-300/16 dark:bg-slate-900/20"
        />
      </SidebarSection>

      <SidebarSection
        id="absences"
        title="Άδειες"
        icon={CalendarDays}
        activeId={activeSection}
        onToggle={handleToggle}
        helperText="Άδειες, ασθένειες και άλλες απουσίες που επηρεάζουν το πρόγραμμα."
      >
        <AbsencesPanel
          employees={employees}
          absences={absences}
          isLoading={isAbsencesLoading}
          isAdmin={isAdmin}
          isSaving={isSaving}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onCreateAbsence={onCreateAbsence}
          onUpdateAbsence={onUpdateAbsence}
          onCancelAbsence={onCancelAbsence}
          onDeleteAbsence={onDeleteAbsence}
        />
      </SidebarSection>

      <SidebarSection
        id="manual"
        title="Χειροκίνητη Βάρδια"
        icon={LayoutPanelTop}
        activeId={activeSection}
        onToggle={handleToggle}
        helperText="Γρήγορη προσθήκη custom βάρδιας χωρίς να φύγεις από το dashboard."
      >
        <ManualShiftForm employees={employees} weekDays={visibleDays} onCreateShift={onCreateShift} canManage={isAdmin} />
      </SidebarSection>

      <SidebarSection
        id="templates"
        title="Μη Ανατεθειμένες Κάρτες"
        icon={Sparkles}
        activeId={activeSection}
        onToggle={handleToggle}
        helperText={`Έτοιμες κάρτες προς ανάθεση: ${templateCount}`}
      >
        <EmployeeSidebar
          employees={employees}
          shiftTemplates={shiftTemplates}
          weekDays={weekDays}
          isAdmin={isAdmin}
          onAddEmployee={onAddEmployee}
          onDeleteEmployee={onDeleteEmployee}
          onOpenAdminLogin={onOpenAdminLogin}
          onOpenProfile={onOpenProfile}
          onAddShiftTemplate={onAddShiftTemplate}
          onDeleteShiftTemplate={onDeleteShiftTemplate}
          view="templates"
          compact={compact}
          className="border-white/30 bg-white/18 dark:border-cyan-300/16 dark:bg-slate-900/20"
        />
      </SidebarSection>

      <SidebarSection
        id="analytics"
        title="Στατιστικά"
        icon={BarChart3}
        activeId={activeSection}
        onToggle={handleToggle}
        helperText={scheduleMode === 'month' ? 'Μηνιαία εικόνα ωρών και τύπων βάρδιας.' : 'Εβδομαδιαία εικόνα ωρών και τύπων βάρδιας.'}
      >
        <AnalyticsPanel
          employees={employees}
          mode={scheduleMode}
          onModeChange={onModeChange}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          totalsByEmployee={analytics.totalsByEmployee}
          totalHours={analytics.totalHours}
          leaveDaysByEmployee={analytics.leaveDaysByEmployee}
          totalsByType={analytics.totalsByType}
          shiftsCountByEmployee={analytics.shiftsCountByEmployee}
          workBreakdownByEmployee={analytics.workBreakdownByEmployee}
        />
      </SidebarSection>
    </div>
  );
}
