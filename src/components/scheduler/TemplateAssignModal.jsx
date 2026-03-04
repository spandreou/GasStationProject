import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDateGreek } from '../../utils/time';

export default function TemplateAssignModal({ open, template, date, employees, onClose, onConfirm }) {
  const [employeeId, setEmployeeId] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmployeeId(employees[0]?.id || '');
  }, [open, employees]);

  if (!open || !template) return null;

  const hasEmployees = employees.length > 0;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!employeeId) return;
    await onConfirm(employeeId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="glass-panel w-full max-w-md rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Ανάθεση Custom Βάρδιας</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="glass-soft mb-3 rounded-lg p-3 text-sm text-slate-800 dark:text-slate-100">
          <p className="font-semibold">{template.label}</p>
          <p>
            {template.startTime} - {template.endTime}
          </p>
          <p className="mt-1 text-xs text-slate-700 dark:text-slate-300">Ημέρα: {formatDateGreek(date)}</p>
        </div>

        {!hasEmployees ? (
          <p className="mb-3 text-sm text-red-700 dark:text-red-200">Δεν υπάρχουν υπάλληλοι για ανάθεση.</p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
            Επιλογή υπαλλήλου
            <select
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              disabled={!hasEmployees}
              required
            >
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-800/60"
            >
              Άκυρο
            </button>
            <button
              type="submit"
              disabled={!hasEmployees || !employeeId}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check size={15} />
              Ανάθεση
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
