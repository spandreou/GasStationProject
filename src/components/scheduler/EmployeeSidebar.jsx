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
    <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Υπάλληλοι</h2>
        <p className="text-sm text-slate-500">Σύρε υπάλληλο πάνω σε βάρδια.</p>
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
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Προφίλ / Επεξεργασία"
            >
              <Pencil size={15} />
            </button>

            <button
              type="button"
              onClick={() => handleDelete(employee)}
              disabled={!isAdmin}
              className="rounded-lg border border-slate-200 bg-white p-2 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              title="Διαγραφή"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-2 rounded-xl bg-slate-50 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Νέος υπάλληλος</p>
          {!isAdmin ? (
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
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
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          required
          disabled={!isAdmin}
        />

        <input
          value={form.role}
          onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
          placeholder="Ρόλος (π.χ. Ταμείο)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          disabled={!isAdmin}
        />

        <label className="flex items-center justify-between text-xs text-slate-600">
          Χρώμα κάρτας
          <input
            type="color"
            value={form.color}
            onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
            className="h-8 w-12 cursor-pointer rounded border border-slate-300"
            disabled={!isAdmin}
          />
        </label>

        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isAdmin}
        >
          <Plus size={16} />
          Προσθήκη
        </button>
      </form>
    </aside>
  );
}
