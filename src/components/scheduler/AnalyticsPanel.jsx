import { Clock3 } from 'lucide-react';

export default function AnalyticsPanel({
  employees,
  mode = 'week',
  onModeChange,
  selectedMonth,
  selectedYear,
  totalsByEmployee,
  totalHours,
  leaveDaysByEmployee,
  totalsByType,
  shiftsCountByEmployee = {},
  workBreakdownByEmployee = {},
}) {
  const isMonthMode = mode === 'month';
  const monthLabel = new Intl.DateTimeFormat('el-GR', { month: 'long', year: 'numeric' }).format(
    new Date(selectedYear || new Date().getFullYear(), selectedMonth ?? new Date().getMonth(), 1),
  );
  const hasEmployees = employees.length > 0;

  return (
    <section className="glass-panel h-full rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
        <div className="flex items-center gap-2">
          <Clock3 size={18} className="text-brand-600 dark:text-cyan-300" />
          <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">
            {isMonthMode ? 'Ώρες Μήνα Ανά Υπάλληλο' : 'Ώρες Εβδομάδας Ανά Υπάλληλο'}
          </h2>
        </div>
        <div className="inline-flex rounded-lg border border-slate-300/70 bg-white/50 p-1 dark:border-cyan-300/35 dark:bg-slate-900/45">
          <button
            type="button"
            onClick={() => onModeChange?.('week')}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
              !isMonthMode
                ? 'bg-brand-500 text-white'
                : 'text-slate-700 hover:bg-white/70 dark:text-slate-200 dark:hover:bg-slate-800/70'
            }`}
          >
            Εβδομάδα
          </button>
          <button
            type="button"
            onClick={() => onModeChange?.('month')}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
              isMonthMode
                ? 'bg-brand-500 text-white'
                : 'text-slate-700 hover:bg-white/70 dark:text-slate-200 dark:hover:bg-slate-800/70'
            }`}
          >
            Μήνας
          </button>
        </div>
      </div>

      <div className="mb-3 rounded-lg bg-brand-50/85 p-2 text-xs font-semibold text-brand-900 sm:text-sm dark:bg-cyan-500/15 dark:text-cyan-100">
        {isMonthMode ? `Σύνολο μήνα (${monthLabel}): ${totalHours} ώρες` : `Σύνολο εβδομάδας: ${totalHours} ώρες`}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4 sm:text-xs">
        <div className="rounded-md bg-slate-500/50 px-2 py-1 text-white">Ρεπό: {totalsByType?.restDays || 0}</div>
        <div className="rounded-md bg-orange-500/50 px-2 py-1 text-white">Άδειες: {totalsByType?.leaveDays || 0}</div>
        <div className="rounded-md bg-red-500/50 px-2 py-1 text-white">Ασθένειες: {totalsByType?.sickDays || 0}</div>
        <div className="rounded-md bg-indigo-500/50 px-2 py-1 text-white">
          Κυριακές εκτός εργασίας: {totalsByType?.nonWorkingSundays || 0}
        </div>
      </div>

      {!hasEmployees ? (
        <div className="rounded-xl border border-dashed border-slate-300/70 bg-white/45 p-3 text-xs text-slate-700 dark:border-cyan-300/35 dark:bg-slate-900/35 dark:text-slate-300">
          Δεν υπάρχουν υπάλληλοι για να εμφανιστούν στατιστικά.
        </div>
      ) : (
        <div className="space-y-2">
          {employees.map((employee) => {
            const leave = leaveDaysByEmployee?.[employee.id] || {
              restDays: 0,
              leaveDays: 0,
              sickDays: 0,
              nonWorkingSundays: 0,
              inferredRestDays: 0,
            };
            const breakdown = workBreakdownByEmployee?.[employee.id] || {
              morning: 0,
              intermediate: 0,
              evening: 0,
              custom: 0,
            };

            return (
              <div key={employee.id} className="glass-soft rounded-lg px-3 py-2 text-xs sm:text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{employee.fullName}</span>
                  <span className="font-bold text-slate-900 dark:text-white">{totalsByEmployee[employee.id] || 0} ώρες</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                  Βάρδιες: {shiftsCountByEmployee?.[employee.id] || 0} | Πρωινές: {breakdown.morning || 0} | Ενδιάμεσες:{' '}
                  {breakdown.intermediate || 0} | Απογευματινές: {breakdown.evening || 0} | Προσαρμοσμένες:{' '}
                  {breakdown.custom || 0}
                </p>
                <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                  Ρεπό: {leave.restDays} | Άδεια: {leave.leaveDays} | Ασθένεια: {leave.sickDays} | Κυριακές εκτός
                  εργασίας: {leave.nonWorkingSundays || 0}
                </p>
                {leave.inferredRestDays > 0 ? (
                  <p className="mt-1 text-[10px] text-slate-600 dark:text-slate-400">
                    Περιλαμβάνεται υπολογισμένο εβδομαδιαίο ρεπό: {leave.inferredRestDays}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
