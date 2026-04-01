import { useEffect, useMemo, useState } from 'react';
import { SHIFT_PRESETS, SHIFT_TYPE_OPTIONS } from '../../data/constants';
import { SHIFT_TYPES } from '../../utils/analytics';

const initialManualState = {
  employeeId: '',
  date: '',
  shiftType: 'intermediate',
  customLabel: '',
  startTime: '10:00',
  endTime: '18:00',
  type: SHIFT_TYPES.WORK,
  notes: '',
  isHoliday: false,
  isSpecialDay: false,
  specialDayLabel: '',
};

export default function ManualShiftForm({ employees, weekDays, onCreateShift, canManage }) {
  const availableDays = weekDays || [];
  const [form, setForm] = useState({
    ...initialManualState,
    employeeId: employees[0]?.id || '',
    date: availableDays[0] || '',
  });

  const hasEmployees = employees.length > 0;

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      employeeId: employees.some((employee) => employee.id === prev.employeeId)
        ? prev.employeeId
        : employees[0]?.id || '',
      date: availableDays.includes(prev.date) ? prev.date : availableDays[0] || '',
    }));
  }, [employees, availableDays]);

  const shiftTypeLabel = useMemo(() => {
    return SHIFT_TYPE_OPTIONS.find((item) => item.value === form.shiftType)?.label || 'Προσαρμοσμένη';
  }, [form.shiftType]);

  async function handleSubmit(event) {
    event.preventDefault();
    await onCreateShift({
      ...form,
      label: form.shiftType === 'custom' ? form.customLabel || 'Προσαρμοσμένη' : shiftTypeLabel,
      shiftType: form.shiftType,
    });
    setForm((prev) => ({ ...prev, notes: '', specialDayLabel: '', customLabel: prev.shiftType === 'custom' ? prev.customLabel : '' }));
  }

  function applyPreset(preset) {
    setForm((prev) => ({
      ...prev,
      shiftType: preset.shiftType,
      startTime: preset.startTime,
      endTime: preset.endTime,
      customLabel: preset.shiftType === 'custom' ? prev.customLabel : '',
    }));
  }

  return (
    <section className="glass-panel rounded-2xl p-3 sm:p-4">
      <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Χειροκίνητη Βάρδια</h2>
      <p className="mb-2 text-xs text-slate-700 sm:mb-3 sm:text-sm dark:text-slate-300">
        Παραμετροποίηση βάρδιας: τύπος, ώρες, ειδικό ωράριο, σημειώσεις.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {SHIFT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded-lg border border-brand-200/70 bg-brand-50/85 px-2 py-1 text-[11px] font-semibold text-brand-800 sm:text-xs backdrop-blur-sm hover:bg-brand-100 dark:border-cyan-300/45 dark:bg-cyan-500/15 dark:text-cyan-100 dark:hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canManage}
          >
            {preset.label}: {preset.startTime}-{preset.endTime}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="grid gap-2 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Υπάλληλος
          <select
            className="input-glass mt-1 w-full min-h-12 appearance-none rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
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
            className="input-glass mt-1 w-full min-h-12 appearance-none rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
            value={form.date}
            onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
            required
            disabled={!canManage}
          >
            {availableDays.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Τύπος Βάρδιας
          <select
            className="input-glass mt-1 w-full min-h-12 appearance-none rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
            value={form.shiftType}
            onChange={(event) => setForm((prev) => ({ ...prev, shiftType: event.target.value }))}
            required
            disabled={!canManage}
          >
            {SHIFT_TYPE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Κατηγορία Παρουσίας
          <select
            className="input-glass mt-1 w-full min-h-12 appearance-none rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
            required
            disabled={!canManage}
          >
            <option value={SHIFT_TYPES.WORK}>Εργασία</option>
            <option value={SHIFT_TYPES.REST}>Ρεπό</option>
            <option value={SHIFT_TYPES.LEAVE}>Άδεια</option>
            <option value={SHIFT_TYPES.SICK}>Ασθένεια</option>
          </select>
        </label>

        {form.shiftType === 'custom' ? (
          <label className="text-sm font-medium text-slate-900 dark:text-slate-100 md:col-span-2">
            Ετικέτα Προσαρμοσμένης Βάρδιας
            <input
              className="input-glass mt-1 w-full min-h-12 rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition placeholder:text-slate-500 focus:ring-2 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
              placeholder="π.χ. Εκπαίδευση / Απογραφή"
              value={form.customLabel}
              onChange={(event) => setForm((prev) => ({ ...prev, customLabel: event.target.value }))}
              disabled={!canManage}
              required
            />
          </label>
        ) : null}

        <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Ώρα Έναρξης
          <input
            type="time"
            className="input-glass mt-1 w-full min-h-12 rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
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
            className="input-glass mt-1 w-full min-h-12 rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
            value={form.endTime}
            onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
            required
            disabled={!canManage}
          />
        </label>

        <label className="md:col-span-2 inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-sm text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-100">
          <input
            type="checkbox"
            checked={form.isHoliday}
            onChange={(event) => setForm((prev) => ({ ...prev, isHoliday: event.target.checked }))}
            disabled={!canManage}
          />
          Αργία
        </label>

        <label className="md:col-span-2 inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-sm text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-100">
          <input
            type="checkbox"
            checked={form.isSpecialDay}
            onChange={(event) => setForm((prev) => ({ ...prev, isSpecialDay: event.target.checked }))}
            disabled={!canManage}
          />
          Ειδικό Ωράριο
        </label>

        {form.isHoliday || form.isSpecialDay ? (
          <label className="text-sm font-medium text-slate-900 dark:text-slate-100 md:col-span-2">
            Περιγραφή Ειδικής Ημέρας
            <input
              className="input-glass mt-1 w-full min-h-12 rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition placeholder:text-slate-500 focus:ring-2 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
              placeholder="π.χ. Ειδικό Ωράριο 08:00-20:00"
              value={form.specialDayLabel}
              onChange={(event) => setForm((prev) => ({ ...prev, specialDayLabel: event.target.value }))}
              disabled={!canManage}
            />
          </label>
        ) : null}

        <label className="text-sm font-medium text-slate-900 md:col-span-2 dark:text-slate-100">
          Σημειώσεις
          <input
            className="input-glass mt-1 w-full min-h-12 rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition placeholder:text-slate-500 focus:ring-2 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
            placeholder="Προαιρετικό"
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            disabled={!canManage}
          />
        </label>

        <button
          type="submit"
          className="md:col-span-2 rounded-lg bg-slate-900 px-3 py-2 min-h-12 text-sm font-semibold text-white hover:bg-slate-700 dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasEmployees || !canManage}
        >
          Αποθήκευση Βάρδιας
        </button>
      </form>
    </section>
  );
}
