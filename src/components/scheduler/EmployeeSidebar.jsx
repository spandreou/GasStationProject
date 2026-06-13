import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
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
  onOpenAdminLogin,
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
