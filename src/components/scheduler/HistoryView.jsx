import { History } from 'lucide-react';
import { getShiftTypeLabel } from '../../utils/analytics';

function buildMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 24; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' }).format(date);
    options.push({ value, label });
  }
  return options;
}

const monthOptions = buildMonthOptions();

export default function HistoryView({
  isAdmin,
  employees,
  historyRows,
  filters,
  isLoading,
  onFilterChange,
}) {
  if (!isAdmin) return null;

  return (
    <section className="glass-panel w-full rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <History size={18} className="text-cyan-700 dark:text-cyan-300" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Ιστορικό Παρουσιών</h2>
        </div>

        <div />
      </div>

      <div className="mb-4 grid gap-2 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Υπάλληλος
          <select
            value={filters.employeeId}
            onChange={(event) => onFilterChange({ employeeId: event.target.value })}
            className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
          >
            <option value="">Όλοι</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Μήνας/Έτος
          <select
            value={filters.yearMonth}
            onChange={(event) => onFilterChange({ yearMonth: event.target.value })}
            className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-auto rounded-xl border border-white/40 dark:border-cyan-300/25">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/85 text-white">
            <tr>
              <th className="px-3 py-2 font-semibold">Ημερομηνία</th>
              <th className="px-3 py-2 font-semibold">Τύπος</th>
              <th className="px-3 py-2 font-semibold">Ώρες</th>
              <th className="px-3 py-2 font-semibold">Σχόλια</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-200" colSpan={4}>
                  Φόρτωση ιστορικού...
                </td>
              </tr>
            ) : null}

            {!isLoading && !historyRows.length ? (
              <tr>
                <td className="px-3 py-3 text-slate-700 dark:text-slate-200" colSpan={4}>
                  Δεν βρέθηκαν εγγραφές για τα φίλτρα που επέλεξες.
                </td>
              </tr>
            ) : null}

            {!isLoading
              ? historyRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={
                      index % 2 === 0
                        ? 'bg-white/45 dark:bg-slate-900/35'
                        : 'bg-slate-100/60 dark:bg-slate-900/55'
                    }
                  >
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{row.date}</td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{getShiftTypeLabel(row.type)}</td>
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100">{row.totalHours || 0}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{row.notes || '-'}</td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
