import { Clock3 } from 'lucide-react';

export default function AnalyticsPanel({ employees, totalsByEmployee, totalHours }) {
  return (
    <section className="glass-panel rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock3 size={18} className="text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Σύνοψη Ωρών</h2>
      </div>

      <div className="mb-2 rounded-lg bg-brand-50/85 p-2 text-sm font-semibold text-brand-900">
        Σύνολο εβδομάδας: {totalHours} ώρες
      </div>

      <div className="space-y-2">
        {employees.map((employee) => (
          <div
            key={employee.id}
            className="glass-soft flex items-center justify-between rounded-lg px-3 py-2 text-sm"
          >
            <span className="font-medium text-slate-700">{employee.fullName}</span>
            <span className="font-bold text-slate-900">{totalsByEmployee[employee.id] || 0} ώρες</span>
          </div>
        ))}
      </div>
    </section>
  );
}
