import { Clock3 } from 'lucide-react';

export default function AnalyticsPanel({ employees, totalsByEmployee, totalHours }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <Clock3 size={18} className="text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Σύνοψη Ωρών</h2>
      </div>

      <div className="mb-2 rounded-lg bg-brand-50 p-2 text-sm font-semibold text-brand-800">
        Σύνολο εβδομάδας: {totalHours} ώρες
      </div>

      <div className="space-y-2">
        {employees.map((employee) => (
          <div
            key={employee.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
          >
            <span className="font-medium text-slate-700">{employee.fullName}</span>
            <span className="font-bold text-slate-900">{totalsByEmployee[employee.id] || 0} ώρες</span>
          </div>
        ))}
      </div>
    </section>
  );
}
