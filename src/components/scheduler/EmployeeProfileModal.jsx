import { Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const emptyForm = {
  fullName: '',
  role: '',
  color: '#1D4ED8',
  afm: '',
  phone: '',
  email: '',
  hireDate: '',
};

export default function EmployeeProfileModal({ open, employee, isAdmin, onClose, onSave }) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!employee) {
      setForm(emptyForm);
      return;
    }

    setForm({
      fullName: employee.fullName || '',
      role: employee.role || '',
      color: employee.color || '#1D4ED8',
      afm: employee.afm || '',
      phone: employee.phone || '',
      email: employee.email || '',
      hireDate: employee.hireDate || '',
    });
  }, [employee]);

  if (!open || !employee) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isAdmin) return;

    await onSave({
      id: employee.id,
      ...form,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="glass-panel w-full max-w-lg rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {isAdmin ? 'Επεξεργασία Προφίλ Υπαλλήλου' : 'Προφίλ Υπαλλήλου'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-900 md:col-span-2 dark:text-slate-100">
            Ονοματεπώνυμο
            <input
              value={form.fullName}
              onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
              disabled={!isAdmin}
              required
            />
          </label>

          <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Ρόλος
            <input
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
              disabled={!isAdmin}
            />
          </label>

          <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Χρώμα
            <input
              type="color"
              value={form.color}
              onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
              className="mt-1 h-10 w-full cursor-pointer rounded border border-slate-300 bg-white/70 dark:border-cyan-300/40 dark:bg-slate-900/40"
              disabled={!isAdmin}
            />
          </label>

          <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Τηλέφωνο
            <input
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
              disabled={!isAdmin}
            />
          </label>

          <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
              disabled={!isAdmin}
            />
          </label>

          <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Ημερομηνία Πρόσληψης
            <input
              type="date"
              value={form.hireDate}
              onChange={(event) => setForm((prev) => ({ ...prev, hireDate: event.target.value }))}
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
              disabled={!isAdmin}
            />
          </label>

          <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            ΑΦΜ
            {isAdmin ? (
              <input
                value={form.afm}
                onChange={(event) => setForm((prev) => ({ ...prev, afm: event.target.value }))}
                className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
              />
            ) : (
              <div className="mt-1 rounded-lg border border-slate-300/80 bg-white/40 px-3 py-2 text-sm text-slate-700 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-300">
                Μόνο για διαχειριστή
              </div>
            )}
          </label>

          {isAdmin ? (
            <button
              type="submit"
              className="md:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400"
            >
              <Save size={16} />
              Αποθήκευση
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
