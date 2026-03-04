import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import ShiftCard from './ShiftCard';

const defaultForm = {
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
}) {
  const [form, setForm] = useState(defaultForm);

  const sortedEmployees = useMemo(
    () => [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName, 'el')),
    [employees],
  );

  async function handleSubmit(event) {
    event.preventDefault();
    await onAddEmployee(form);
    setForm(defaultForm);
  }

  async function handleDelete(employee) {
    const confirmed = window.confirm(
      `Θέλεις να διαγράψεις τον/την ${employee.fullName}; Θα διαγραφούν και οι βάρδιές του/της.`,
    );
    if (!confirmed) return;
    await onDeleteEmployee(employee.id);
  }

  return (
    <aside className="glass-panel space-y-4 rounded-2xl p-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Υπάλληλοι</h2>
        <p className="text-sm text-slate-700 dark:text-slate-300">Σύρε υπάλληλο πάνω σε βάρδια.</p>
      </div>

      <div className="max-h-[320px] space-y-2 overflow-auto pr-1 scrollbar-thin">
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

            <button
              type="button"
              onClick={() => handleDelete(employee)}
              disabled={!isAdmin}
              className="rounded-lg border border-white/35 bg-white/55 p-2 text-red-700 backdrop-blur-sm hover:bg-red-50/80 dark:border-red-300/40 dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              title="Διαγραφή"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="glass-soft space-y-2 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Νέος υπάλληλος</p>
          {!isAdmin ? (
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-300/60 dark:bg-amber-500/15 dark:text-amber-100 dark:hover:bg-amber-500/25"
            >
              <Lock size={12} />
              Admin Login
            </button>
          ) : null}
        </div>

        <input
          value={form.fullName}
          onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
          placeholder="Ονοματεπώνυμο"
          className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-300/50 transition placeholder:text-slate-700 focus:ring-2 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-300"
          required
          disabled={!isAdmin}
        />

        <input
          value={form.role}
          onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
          placeholder="Ρόλος (π.χ. Ταμείο)"
          className="input-glass w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-300/50 transition placeholder:text-slate-700 focus:ring-2 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-300"
          disabled={!isAdmin}
        />

        <label className="flex items-center justify-between text-xs font-medium text-slate-800 dark:text-slate-200">
          Χρώμα κάρτας
          <input
            type="color"
            value={form.color}
            onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
            className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white/70 dark:border-cyan-300/40 dark:bg-slate-900/40"
            disabled={!isAdmin}
          />
        </label>

        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isAdmin}
        >
          <Plus size={16} />
          Προσθήκη
        </button>
      </form>
    </aside>
  );
}
