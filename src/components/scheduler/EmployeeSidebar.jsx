import { Lock, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatDateGreek } from '../../utils/time';
import ConfirmDialog from '../feedback/ConfirmDialog';
import StateNotice from '../feedback/StateNotice';
import ShiftCard from './ShiftCard';
import ShiftTemplateCard from './ShiftTemplateCard';

const defaultEmployeeForm = {
  fullName: '',
  role: '',
  color: '#1D4ED8',
  afm: '',
  phone: '',
  email: '',
  hireDate: '',
};

const defaultTemplateForm = {
  label: '',
  date: '',
  startTime: '10:00',
  endTime: '12:00',
};

export default function EmployeeSidebar({
  employees,
  shiftTemplates,
  weekDays,
  isAdmin,
  onAddEmployee,
  onDeleteEmployee,
  onOpenAdminLogin,
  onOpenProfile,
  onAddShiftTemplate,
  onDeleteShiftTemplate,
  compact = false,
  className = '',
  view = 'all',
}) {
  const showEmployeesBlock = view !== 'templates';
  const showTemplatesBlock = view !== 'employees';

  const [employeeForm, setEmployeeForm] = useState(defaultEmployeeForm);
  const [templateForm, setTemplateForm] = useState({ ...defaultTemplateForm, date: weekDays?.[0] || '' });
  const [confirmState, setConfirmState] = useState(null);

  useEffect(() => {
    setTemplateForm((prev) => ({
      ...prev,
      date: weekDays?.includes(prev.date) ? prev.date : weekDays?.[0] || '',
    }));
  }, [weekDays]);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName, 'el')),
    [employees],
  );

  const pendingTemplates = useMemo(
    () =>
      [...shiftTemplates]
        .filter((template) => !template.isPlaced)
        .sort((a, b) => {
          const dateDiff = (a.date || '').localeCompare(b.date || '');
          if (dateDiff !== 0) return dateDiff;
          return (a.startTime || '').localeCompare(b.startTime || '');
        }),
    [shiftTemplates],
  );

  async function handleEmployeeSubmit(event) {
    event.preventDefault();
    const created = await onAddEmployee(employeeForm);
    if (created) {
      setEmployeeForm(defaultEmployeeForm);
    }
  }

  async function handleTemplateSubmit(event) {
    event.preventDefault();
    const created = await onAddShiftTemplate(templateForm);
    if (created) {
      setTemplateForm((prev) => ({
        ...defaultTemplateForm,
        date: prev.date,
      }));
    }
  }

  function askDeleteEmployee(employee) {
    setConfirmState({
      tone: 'danger',
      title: 'Διαγραφή υπαλλήλου',
      message: `Θέλεις να διαγράψεις τον/την ${employee.fullName};`,
      details: 'Θα διαγραφούν και οι βάρδιες που συνδέονται με αυτόν τον υπάλληλο. Η ενέργεια δεν αναιρείται από το UI.',
      confirmLabel: 'Ναι, διαγραφή',
      action: async () => onDeleteEmployee(employee.id),
    });
  }

  function askDeleteTemplate(template) {
    setConfirmState({
      tone: 'danger',
      title: 'Διαγραφή κάρτας βάρδιας',
      message: `Θέλεις να διαγράψεις την κάρτα "${template.label}";`,
      details: 'Η ενέργεια αφαιρεί την κάρτα από τη λίστα έτοιμων templates και δεν αναιρείται από το UI.',
      confirmLabel: 'Ναι, διαγραφή',
      action: async () => onDeleteShiftTemplate(template.id),
    });
  }

  async function handleConfirmAction() {
    if (!confirmState?.action) return;
    await confirmState.action();
    setConfirmState(null);
  }

  return (
    <aside className={`glass-soft space-y-4 rounded-2xl ${compact ? 'p-3' : 'p-4'} ${className}`}>
      {showEmployeesBlock ? (
        <>
          <div>
            <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Υπάλληλοι</h2>
            <p className="text-xs text-slate-700 sm:text-sm dark:text-slate-300">
              Σύρε υπάλληλο πάνω σε κάρτα βάρδιας μέσα στο grid για ανάθεση.
            </p>
          </div>

          {!isAdmin ? (
            <StateNotice
              state="info"
              compact
              title="Read-only προβολή"
              message="Μπορείς να δεις στοιχεία προσωπικού, αλλά όχι να προσθέσεις ή να διαγράψεις υπαλλήλους."
              actionLabel="Είσοδος διαχειριστή"
              onAction={onOpenAdminLogin}
            />
          ) : null}

          <div className="max-h-[220px] space-y-2 overflow-auto pr-1 scrollbar-thin sm:max-h-[260px]">
            {sortedEmployees.map((employee) => (
              <div key={employee.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <ShiftCard employee={employee} disabled={!isAdmin} showRole={isAdmin} />
                </div>

                <button
                  type="button"
                  onClick={() => onOpenProfile(employee)}
                  disabled={!isAdmin}
                  className="rounded-lg border border-white/35 bg-white/55 p-2 text-slate-700 backdrop-blur-sm hover:bg-white/80 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-800/70 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Προφίλ / Επεξεργασία"
                >
                  <Pencil size={15} />
                </button>

                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => askDeleteEmployee(employee)}
                    className="rounded-lg border border-white/35 bg-white/55 p-2 text-red-700 backdrop-blur-sm hover:bg-red-50/80 dark:border-red-300/40 dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25"
                    title="Διαγραφή"
                  >
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            ))}

            {!sortedEmployees.length ? (
              <StateNotice
                state="empty"
                compact
                title="Δεν υπάρχουν υπάλληλοι"
                message="Πρόσθεσε τον πρώτο υπάλληλο για να ξεκινήσεις αναθέσεις βαρδιών."
              />
            ) : null}
          </div>

          <form onSubmit={handleEmployeeSubmit} className="glass-soft space-y-2 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-800 sm:text-sm dark:text-slate-100">Νέος υπάλληλος</p>
              {!isAdmin ? (
                <button
                  type="button"
                  onClick={onOpenAdminLogin}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 sm:text-xs dark:border-amber-300/60 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/25"
                >
                  <Lock size={12} />
                  Είσοδος Διαχειριστή
                </button>
              ) : null}
            </div>

            <input
              value={employeeForm.fullName}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, fullName: event.target.value }))}
              placeholder="Ονοματεπώνυμο"
              className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900 outline-none ring-brand-300/50 transition placeholder:text-slate-700 focus:ring-2 sm:text-sm dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-300"
              required
              disabled={!isAdmin}
            />

            <input
              value={employeeForm.role}
              onChange={(event) => setEmployeeForm((prev) => ({ ...prev, role: event.target.value }))}
              placeholder="Ρόλος (π.χ. Ταμείο)"
              className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900 outline-none ring-brand-300/50 transition placeholder:text-slate-700 focus:ring-2 sm:text-sm dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-300"
              disabled={!isAdmin}
            />

            <label className="flex items-center justify-between text-[11px] font-medium text-slate-800 sm:text-xs dark:text-slate-200">
              Χρώμα κάρτας
              <input
                type="color"
                value={employeeForm.color}
                onChange={(event) => setEmployeeForm((prev) => ({ ...prev, color: event.target.value }))}
                className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white/70 dark:border-cyan-300/40 dark:bg-slate-900/40"
                disabled={!isAdmin}
              />
            </label>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-[13px] font-semibold text-white hover:bg-brand-600 sm:text-sm dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isAdmin}
            >
              <Plus size={16} />
              Προσθήκη
            </button>
          </form>
        </>
      ) : null}

      {showTemplatesBlock ? (
        <section className="glass-soft space-y-3 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-cyan-700 dark:text-pink-300" />
            <h3 className="text-xs font-bold text-slate-900 sm:text-sm dark:text-white">Μη ανατεθειμένες κάρτες</h3>
          </div>

          {!isAdmin ? (
            <StateNotice
              state="info"
              compact
              title="Read-only templates"
              message="Μπορείς να δεις τις κάρτες templates, αλλά η διαχείριση γίνεται μόνο από διαχειριστή."
            />
          ) : null}

          <div className="max-h-[170px] space-y-2 overflow-auto pr-1 scrollbar-thin sm:max-h-[200px]">
            {pendingTemplates.map((template) => (
              <div key={template.id} className="flex items-center gap-2">
                <div className="flex-1">
                  <ShiftTemplateCard template={template} disabled={!isAdmin} />
                </div>

                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => askDeleteTemplate(template)}
                    className="rounded-lg border border-white/35 bg-white/55 p-2 text-red-700 backdrop-blur-sm hover:bg-red-50/80 dark:border-red-300/40 dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25"
                    title="Διαγραφή κάρτας"
                  >
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            ))}

            {!pendingTemplates.length ? (
              <StateNotice
                state="empty"
                compact
                title="Δεν υπάρχουν έτοιμες κάρτες"
                message={
                  isAdmin
                    ? 'Δημιούργησε νέα κάρτα και σύρε την στην ημέρα που θέλεις.'
                    : 'Όταν δημιουργηθούν νέες κάρτες από διαχειριστή, θα εμφανιστούν εδώ.'
                }
              />
            ) : null}
          </div>

          <form
            onSubmit={handleTemplateSubmit}
            className="space-y-2 rounded-lg border border-cyan-300/45 bg-cyan-50/55 p-2.5 dark:border-pink-300/35 dark:bg-slate-900/45"
          >
            <p className="text-[11px] font-semibold text-slate-800 sm:text-xs dark:text-slate-100">Νέα κάρτα βάρδιας</p>

            <input
              value={templateForm.label}
              onChange={(event) => setTemplateForm((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="Όνομα (π.χ. Πλύσιμο)"
              className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900 outline-none ring-brand-300/50 transition placeholder:text-slate-700 focus:ring-2 sm:text-sm dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-300"
              disabled={!isAdmin}
              required
            />

            <label className="block text-[11px] font-medium text-slate-800 sm:text-xs dark:text-slate-100">
              Ημερομηνία
              <select
                value={templateForm.date}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, date: event.target.value }))}
                className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 sm:text-sm dark:border-cyan-300/45 dark:text-white"
                disabled={!isAdmin}
                required
              >
                {(weekDays || []).map((day) => (
                  <option key={day} value={day}>
                    {formatDateGreek(day)}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="time"
                value={templateForm.startTime}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, startTime: event.target.value }))}
                className="input-glass appearance-none rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 sm:text-sm dark:border-cyan-300/45 dark:text-white"
                disabled={!isAdmin}
                required
              />
              <input
                type="time"
                value={templateForm.endTime}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, endTime: event.target.value }))}
                className="input-glass appearance-none rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 sm:text-sm dark:border-cyan-300/45 dark:text-white"
                disabled={!isAdmin}
                required
              />
            </div>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-cyan-700 sm:text-sm dark:border dark:border-pink-300/45 dark:bg-pink-500/85 dark:hover:bg-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!isAdmin}
            >
              <Plus size={16} />
              Προσθήκη Προτύπου
            </button>
          </form>
        </section>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || ''}
        message={confirmState?.message || ''}
        details={confirmState?.details || ''}
        tone={confirmState?.tone || 'danger'}
        confirmLabel={confirmState?.confirmLabel || 'Ναι, συνέχισε'}
        onClose={() => setConfirmState(null)}
        onConfirm={handleConfirmAction}
      />
    </aside>
  );
}
