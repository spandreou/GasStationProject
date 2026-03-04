import { useEffect, useState } from 'react';
import { SHIFT_PRESETS } from '../../data/constants';

const initialManualState = {
  employeeId: '',
  date: '',
  startTime: '10:00',
  endTime: '18:00',
  notes: '',
};

export default function ManualShiftForm({ employees, weekDays, onCreateShift, canManage }) {
  const [form, setForm] = useState({
    ...initialManualState,
    employeeId: employees[0]?.id || '',
    date: weekDays[0] || '',
  });

  const hasEmployees = employees.length > 0;

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      employeeId: employees.some((employee) => employee.id === prev.employeeId)
        ? prev.employeeId
        : employees[0]?.id || '',
      date: weekDays.includes(prev.date) ? prev.date : weekDays[0] || '',
    }));
  }, [employees, weekDays]);

  async function handleSubmit(event) {
    event.preventDefault();
    await onCreateShift({ ...form, label: 'Χειροκίνητη' });
    setForm((prev) => ({ ...prev, notes: '' }));
  }

  function applyPreset(preset) {
    setForm((prev) => ({ ...prev, startTime: preset.startTime, endTime: preset.endTime, label: preset.label }));
  }

  return (
    <section className="glass-panel rounded-2xl p-4">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Χειροκίνητη Βάρδια</h2>
      <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">Ορισμός ενδιάμεσης βάρδιας (π.χ. 10:00 - 18:00).</p>

      <div className="mb-3 flex flex-wrap gap-2">
        {SHIFT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded-lg border border-brand-200/70 bg-brand-50/85 px-2 py-1 text-xs font-semibold text-brand-800 backdrop-blur-sm hover:bg-brand-100 dark:border-cyan-300/45 dark:bg-cyan-500/15 dark:text-cyan-100 dark:hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canManage}
          >
            Preset: {preset.startTime}-{preset.endTime}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="grid gap-2 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Υπάλληλος
          <select
            className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
            value={form.employeeId}
            onChange={(event) => setForm((prev) => ({ ...prev, employeeId: event.target.value }))}
            required
            disabled={!hasEmployees || !canManage}
          >
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Ημερομηνία
          <select
            className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
            value={form.date}
            onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
            required
            disabled={!canManage}
          >
            {weekDays.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Ώρα Έναρξης
          <input
            type="time"
            className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
            value={form.startTime}
            onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
            required
            disabled={!canManage}
          />
        </label>

        <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Ώρα Λήξης
          <input
            type="time"
            className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition focus:ring-2 dark:border-cyan-300/45 dark:text-white"
            value={form.endTime}
            onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
            required
            disabled={!canManage}
          />
        </label>

        <label className="text-sm font-medium text-slate-900 md:col-span-2 dark:text-slate-100">
          Σημειώσεις
          <input
            className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 outline-none ring-brand-300/50 transition placeholder:text-slate-700 focus:ring-2 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-300"
            placeholder="Προαιρετικό"
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            disabled={!canManage}
          />
        </label>

        <button
          type="submit"
          className="md:col-span-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasEmployees || !canManage}
        >
          Αποθήκευση Βάρδιας
        </button>
      </form>
    </section>
  );
}
