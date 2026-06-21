import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import ConfirmDialog from '../feedback/ConfirmDialog';
import StateNotice from '../feedback/StateNotice';
import ShiftCard from './ShiftCard';

const defaultEmployeeForm = {
  fullName: '',
  role: '',
  color: '#1D4ED8',
  afm: '',
  phone: '',
  email: '',
  hireDate: '',
};

export default function EmployeeSidebar({
  employees,
  isAdmin,
  onAddEmployee,
  onDeleteEmployee,
  onOpenProfile,
  compact = false,
  className = '',
}) {
  const [employeeForm, setEmployeeForm] = useState(defaultEmployeeForm);
  const [confirmState, setConfirmState] = useState(null);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName, 'el')),
    [employees],
  );

  async function handleEmployeeSubmit(event) {
    event.preventDefault();
    const created = await onAddEmployee(employeeForm);
    if (created) {
      setEmployeeForm(defaultEmployeeForm);
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

  async function handleConfirmAction() {
    if (!confirmState?.action) return;
    await confirmState.action();
    setConfirmState(null);
  }

  return (
    <aside className={`glass-soft space-y-4 rounded-2xl ${compact ? 'p-3' : 'p-4'} ${className}`}>
      <div>
        <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Υπάλληλοι</h2>
        <p className="text-xs text-slate-700 sm:text-sm dark:text-slate-300">
          {isAdmin
            ? 'Σύρε υπάλληλο πάνω σε κάρτα βάρδιας μέσα στο grid για ανάθεση.'
            : 'Προσωπικό βαρδιών.'}
        </p>
      </div>

      <div className="max-h-[220px] space-y-2 overflow-auto pr-1 scrollbar-thin sm:max-h-[260px]">
        {sortedEmployees.map((employee) => (
          <div key={employee.id} className="grid grid-cols-[minmax(0,1fr),auto] items-center gap-2">
            <div className="min-w-0">
              <ShiftCard employee={employee} disabled={!isAdmin} showRole />
            </div>

            {isAdmin ? (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => onOpenProfile(employee)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/35 bg-white/55 text-slate-700 backdrop-blur-sm hover:bg-white/80 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100 dark:hover:bg-slate-800/70"
                  title="Προφίλ / Επεξεργασία"
                  aria-label={`Προφίλ / Επεξεργασία ${employee.fullName}`}
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => askDeleteEmployee(employee)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/35 bg-white/55 text-red-700 backdrop-blur-sm hover:bg-red-50/80 dark:border-red-300/40 dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25"
                  title="Διαγραφή"
                  aria-label={`Διαγραφή ${employee.fullName}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
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

      {isAdmin ? (
      <form onSubmit={handleEmployeeSubmit} className="glass-soft space-y-2 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-800 sm:text-sm dark:text-slate-100">Νέος υπάλληλος</p>
        </div>

        <input
          value={employeeForm.fullName}
          onChange={(event) => setEmployeeForm((prev) => ({ ...prev, fullName: event.target.value }))}
          placeholder="Ονοματεπώνυμο"
          className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900 outline-none ring-brand-300/50 transition placeholder:text-slate-700 focus:ring-2 sm:text-sm dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-300"
          required
        />

        <input
          value={employeeForm.role}
          onChange={(event) => setEmployeeForm((prev) => ({ ...prev, role: event.target.value }))}
          placeholder="Ρόλος (π.χ. Ταμείο)"
          className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px] text-slate-900 outline-none ring-brand-300/50 transition placeholder:text-slate-700 focus:ring-2 sm:text-sm dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-300"
        />

        <label className="flex items-center justify-between text-[11px] font-medium text-slate-800 sm:text-xs dark:text-slate-200">
          Χρώμα κάρτας
          <input
            type="color"
            value={employeeForm.color}
            onChange={(event) => setEmployeeForm((prev) => ({ ...prev, color: event.target.value }))}
            className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white/70 dark:border-cyan-300/40 dark:bg-slate-900/40"
          />
        </label>

        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-[13px] font-semibold text-white hover:bg-brand-600 sm:text-sm dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={16} />
          Προσθήκη
        </button>
      </form>
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
