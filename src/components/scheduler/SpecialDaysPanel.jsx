import { CalendarPlus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatDateGreek } from '../../utils/time';

const initialDraft = {
  date: '',
  isHoliday: false,
  isSpecialDay: true,
  label: '',
  operatingStartTime: '',
  operatingEndTime: '',
};

function toEntries(specialDaysByDate) {
  return Object.entries(specialDaysByDate || {})
    .map(([date, value]) => ({ date, ...(value || {}) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export default function SpecialDaysPanel({
  isAdmin,
  isSaving = false,
  specialDaysByDate = {},
  onSaveSpecialDay,
  onRemoveSpecialDay,
}) {
  const [draft, setDraft] = useState(initialDraft);
  const entries = useMemo(() => toEntries(specialDaysByDate), [specialDaysByDate]);

  async function handleSaveDraft() {
    const saved = await onSaveSpecialDay?.(draft);
    if (saved) {
      setDraft(initialDraft);
    }
  }

  async function handleRemoveEntry(date) {
    await onRemoveSpecialDay?.(date);
  }

  if (!isAdmin) return null;

  return (
    <section className="glass-panel rounded-2xl p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarPlus size={17} className="text-brand-700 dark:text-cyan-300" />
        <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Ειδικές Ημέρες / Αργίες</h2>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
          Ημερομηνία
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft((prev) => ({ ...prev, date: event.target.value }))}
            className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
          />
        </label>

        <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
          Custom Label
          <input
            type="text"
            value={draft.label}
            onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
            placeholder="π.χ. Εθνική Αργία ή Ειδικό Ωράριο"
            className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
          />
        </label>

        <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
          Ωράριο λειτουργίας (από)
          <input
            type="time"
            value={draft.operatingStartTime}
            onChange={(event) => setDraft((prev) => ({ ...prev, operatingStartTime: event.target.value }))}
            className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
          />
        </label>

        <label className="text-xs font-medium text-slate-800 dark:text-slate-200">
          Ωράριο λειτουργίας (έως)
          <input
            type="time"
            value={draft.operatingEndTime}
            onChange={(event) => setDraft((prev) => ({ ...prev, operatingEndTime: event.target.value }))}
            className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
          />
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-xs text-slate-800 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-200">
          <input
            type="checkbox"
            checked={Boolean(draft.isHoliday)}
            onChange={(event) => setDraft((prev) => ({ ...prev, isHoliday: event.target.checked }))}
          />
          Αργία
        </label>
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/40 px-3 py-2 text-xs text-slate-800 dark:border-cyan-300/35 dark:bg-slate-900/40 dark:text-slate-200">
          <input
            type="checkbox"
            checked={Boolean(draft.isSpecialDay)}
            onChange={(event) => setDraft((prev) => ({ ...prev, isSpecialDay: event.target.checked }))}
          />
          Ειδικό Ωράριο
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={isSaving || !draft.date}
          className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Αποθήκευση ειδικής ημέρας
        </button>
        <button
          type="button"
          onClick={() => setDraft(initialDraft)}
          className="rounded-lg border border-slate-300 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-white dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
        >
          Καθαρισμός φόρμας
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {entries.length ? (
          entries.map((entry) => {
            const badge = entry.isHoliday ? 'Αργία' : 'Ειδικό Ωράριο';
            const timeRange =
              entry.operatingStartTime && entry.operatingEndTime
                ? `${entry.operatingStartTime}-${entry.operatingEndTime}`
                : '';
            return (
              <article key={entry.date} className="glass-soft flex items-start justify-between gap-3 rounded-lg p-3 text-xs">
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900 dark:text-white">{formatDateGreek(entry.date)}</p>
                  <p className="text-slate-700 dark:text-slate-300">
                    {entry.label?.trim() || badge}
                    {timeRange ? ` (${timeRange})` : ''}
                  </p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">{badge}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        date: entry.date,
                        isHoliday: Boolean(entry.isHoliday),
                        isSpecialDay: Boolean(entry.isSpecialDay),
                        label: entry.label || '',
                        operatingStartTime: entry.operatingStartTime || '',
                        operatingEndTime: entry.operatingEndTime || '',
                      })
                    }
                    className="rounded-lg border border-slate-300 bg-white/60 px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-white dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
                  >
                    Επεξεργασία
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveEntry(entry.date)}
                    className="rounded-lg border border-red-300 bg-red-50/70 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-300/45 dark:bg-red-500/15 dark:text-red-200"
                  >
                    <span className="inline-flex items-center gap-1">
                      <Trash2 size={12} />
                      Διαγραφή
                    </span>
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <p className="rounded-lg border border-slate-300/60 bg-white/40 p-3 text-xs text-slate-700 dark:border-cyan-300/30 dark:bg-slate-900/40 dark:text-slate-300">
            Δεν έχουν οριστεί ειδικές ημέρες.
          </p>
        )}
      </div>
    </section>
  );
}
