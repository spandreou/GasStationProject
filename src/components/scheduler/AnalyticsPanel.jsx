import { Clock3 } from 'lucide-react';

export default function AnalyticsPanel({
  employees,
  totalsByEmployee,
  totalHours,
  leaveDaysByEmployee,
  totalsByType,
}) {
  return (
    <section className="glass-panel rounded-2xl p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2 sm:mb-3">
        <Clock3 size={18} className="text-brand-600 dark:text-cyan-300" />
        <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Σύνοψη Ωρών & Απουσιών</h2>
      </div>

      <div className="mb-2 rounded-lg bg-brand-50/85 p-2 text-xs font-semibold text-brand-900 sm:text-sm dark:bg-cyan-500/15 dark:text-cyan-100">
        Σύνολο εβδομάδας: {totalHours} ώρες
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-[11px] sm:text-xs">
        <div className="rounded-md bg-slate-500/50 px-2 py-1 text-white">Ρεπό: {totalsByType?.restDays || 0}</div>
        <div className="rounded-md bg-orange-500/50 px-2 py-1 text-white">Άδειες: {totalsByType?.leaveDays || 0}</div>
        <div className="rounded-md bg-red-500/50 px-2 py-1 text-white">Ασθένειες: {totalsByType?.sickDays || 0}</div>
      </div>

      <div className="space-y-2">
        {employees.map((employee) => {
          const leave = leaveDaysByEmployee?.[employee.id] || { restDays: 0, leaveDays: 0, sickDays: 0 };
          return (
            <div key={employee.id} className="glass-soft rounded-lg px-3 py-2 text-xs sm:text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800 dark:text-slate-100">{employee.fullName}</span>
                <span className="font-bold text-slate-900 dark:text-white">{totalsByEmployee[employee.id] || 0} ώρες</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                Ρεπό: {leave.restDays} | Άδεια: {leave.leaveDays} | Ασθένεια: {leave.sickDays}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
