import {
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const ABSENCE_TYPE_OPTIONS = [
  { value: 'LEAVE', label: 'Άδεια' },
  { value: 'SICK', label: 'Ασθένεια' },
  { value: 'OTHER', label: 'Άλλη απουσία' },
];

const REPLACEMENT_MODE_OPTIONS = [
  { value: 'AUTO', label: 'Αυτόματα' },
  { value: 'MANUAL', label: 'Χειροκίνητη επιλογή υπαλλήλου' },
  { value: 'NO_REPLACEMENT', label: 'Χωρίς αντικατάσταση / μόνο warning' },
];

const STATUS_FILTERS = [
  { value: '', label: 'Όλες' },
  { value: 'ACTIVE', label: 'Ενεργή' },
  { value: 'FUTURE', label: 'Μελλοντική' },
  { value: 'COMPLETED', label: 'Ολοκληρωμένη' },
  { value: 'CANCELLED', label: 'Ακυρωμένη' },
];

const WEEKDAY_SHORT = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];
const MONTH_NAMES = [
  'Ιανουάριος',
  'Φεβρουάριος',
  'Μάρτιος',
  'Απρίλιος',
  'Μάιος',
  'Ιούνιος',
  'Ιούλιος',
  'Αύγουστος',
  'Σεπτέμβριος',
  'Οκτώβριος',
  'Νοέμβριος',
  'Δεκέμβριος',
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isoDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIso(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, count) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + count);
  return next;
}

function countInclusiveDays(startDate, endDate) {
  const start = parseIso(startDate);
  const end = parseIso(endDate);
  if (!start || !end || start > end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function formatDate(iso) {
  if (!iso) return '-';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function monthRange(year, month) {
  const start = isoDate(year, month, 1);
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const end = isoDate(year, month, last);
  return { start, end };
}

function dateRangesOverlap(startA, endA, startB, endB) {
  return startA <= endB && endA >= startB;
}

function getAbsenceTypeLabel(type) {
  return ABSENCE_TYPE_OPTIONS.find((option) => option.value === type)?.label || 'Άλλη απουσία';
}

function getReplacementLabel(mode) {
  return REPLACEMENT_MODE_OPTIONS.find((option) => option.value === mode)?.label || 'Αυτόματα';
}

function deriveAbsenceStatus(absence, now = todayIso()) {
  if (absence.status === 'CANCELLED') return 'CANCELLED';
  if (absence.startDate > now) return 'FUTURE';
  if (absence.endDate < now) return 'COMPLETED';
  return 'ACTIVE';
}

function getStatusLabel(status) {
  if (status === 'ACTIVE') return 'Ενεργή';
  if (status === 'FUTURE') return 'Μελλοντική';
  if (status === 'COMPLETED') return 'Ολοκληρωμένη';
  if (status === 'CANCELLED') return 'Ακυρωμένη';
  return status || '';
}

function buildCalendarDays(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const firstMondayOffset = (first.getUTCDay() + 6) % 7;
  const firstVisible = addDays(first, -firstMondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const current = addDays(firstVisible, index);
    return {
      iso: current.toISOString().slice(0, 10),
      day: current.getUTCDate(),
      inMonth: current.getUTCMonth() === month,
    };
  });
}

function DateRangePicker({ startDate, endDate, onChange }) {
  const start = parseIso(startDate);
  const [calendar, setCalendar] = useState(() => {
    const base = start || new Date();
    return { year: base.getUTCFullYear(), month: base.getUTCMonth() };
  });

  const days = useMemo(() => buildCalendarDays(calendar.year, calendar.month), [calendar]);
  const totalDays = countInclusiveDays(startDate, endDate);

  function moveMonth(delta) {
    setCalendar((prev) => {
      const date = new Date(Date.UTC(prev.year, prev.month + delta, 1));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
    });
  }

  function handleDayClick(iso) {
    if (!startDate || (startDate && endDate)) {
      onChange({ startDate: iso, endDate: '' });
      return;
    }

    if (iso < startDate) {
      onChange({ startDate: iso, endDate: startDate });
      return;
    }

    onChange({ startDate, endDate: iso });
  }

  return (
    <div data-testid="absence-date-range-picker" className="rounded-xl border border-cyan-300/35 bg-slate-950/40 p-3">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => moveMonth(-1)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Προηγούμενος μήνας">
          <ChevronLeft size={16} />
        </button>
        <div className="text-sm font-bold text-white">
          {MONTH_NAMES[calendar.month]} {calendar.year}
        </div>
        <button type="button" onClick={() => moveMonth(1)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Επόμενος μήνας">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-cyan-100/75">
        {WEEKDAY_SHORT.map((item) => (
          <div key={item} className="py-1">
            {item}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isStart = day.iso === startDate;
          const isEnd = day.iso === endDate;
          const isInRange = startDate && endDate && day.iso >= startDate && day.iso <= endDate;
          return (
            <button
              type="button"
              key={day.iso}
              data-testid="absence-calendar-day"
              data-date={day.iso}
              data-in-month={day.inMonth ? 'true' : 'false'}
              onClick={() => handleDayClick(day.iso)}
              className={[
                'h-8 rounded-lg text-xs font-semibold transition',
                day.inMonth ? 'text-white' : 'text-slate-500',
                isInRange ? 'bg-cyan-400/20 text-cyan-50' : 'hover:bg-white/10',
                isStart || isEnd ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300' : '',
              ].join(' ')}
            >
              {day.day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 text-xs text-cyan-50 sm:grid-cols-3">
        <div data-testid="absence-start-date" className="rounded-lg bg-white/8 px-2 py-1.5">
          Από: <span className="font-bold">{formatDate(startDate)}</span>
        </div>
        <div data-testid="absence-end-date" className="rounded-lg bg-white/8 px-2 py-1.5">
          Έως: <span className="font-bold">{formatDate(endDate)}</span>
        </div>
        <div data-testid="absence-total-days" className="rounded-lg bg-white/8 px-2 py-1.5">
          Σύνολο: <span className="font-bold">{totalDays}</span> ημέρες
        </div>
      </div>
    </div>
  );
}

function createEmptyForm(selectedYear, selectedMonth) {
  return {
    id: '',
    employeeId: '',
    type: 'LEAVE',
    startDate: '',
    endDate: '',
    replacementMode: 'AUTO',
    manualReplacementEmployeeId: '',
    note: '',
  };
}

export default function AbsencesPanel({
  employees = [],
  absences = [],
  isLoading = false,
  warningMessage = '',
  isAdmin = false,
  isSaving = false,
  selectedMonth = new Date().getMonth(),
  selectedYear = new Date().getFullYear(),
  onCreateAbsence,
  onUpdateAbsence,
  onCancelAbsence,
  onDeleteAbsence,
}) {
  const [filters, setFilters] = useState({
    year: selectedYear,
    month: selectedMonth,
    employeeId: '',
    type: '',
    status: '',
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(() => createEmptyForm(selectedYear, selectedMonth));

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee?.isActive !== false).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'el')),
    [employees],
  );
  const employeesById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);

  const filteredAbsences = useMemo(() => {
    const { start, end } = monthRange(Number(filters.year), Number(filters.month));
    return absences
      .filter((absence) => dateRangesOverlap(absence.startDate, absence.endDate, start, end))
      .filter((absence) => !filters.employeeId || absence.employeeId === filters.employeeId)
      .filter((absence) => {
        if (!filters.type) return true;
        if (absence.type) return absence.type === filters.type;
        return absence.typeLabel === getAbsenceTypeLabel(filters.type);
      })
      .filter((absence) => !filters.status || deriveAbsenceStatus(absence) === filters.status)
      .sort((a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        (a.employeeName || a.employeeId || '').localeCompare(b.employeeName || b.employeeId || '', 'el'),
      );
  }, [absences, filters]);

  const summary = useMemo(() => {
    const upcoming = filteredAbsences.filter((absence) => deriveAbsenceStatus(absence) === 'FUTURE').length;
    const affecting = filteredAbsences.filter((absence) => absence.status !== 'CANCELLED').length;
    const daysByEmployee = new Map();
    filteredAbsences.forEach((absence) => {
      if (absence.status === 'CANCELLED') return;
      const key = absence.employeeId || absence.employeeName || absence.id;
      daysByEmployee.set(key, (daysByEmployee.get(key) || 0) + countInclusiveDays(absence.startDate, absence.endDate));
    });
    return {
      total: filteredAbsences.length,
      upcoming,
      affecting,
      daysByEmployee,
    };
  }, [filteredAbsences]);

  function openCreateModal() {
    setDraft(createEmptyForm(Number(filters.year), Number(filters.month)));
    setModalOpen(true);
  }

  function openEditModal(absence) {
    setDraft({
      id: absence.id,
      employeeId: absence.employeeId,
      type: absence.type || 'LEAVE',
      startDate: absence.startDate,
      endDate: absence.endDate,
      replacementMode: absence.replacementMode || 'AUTO',
      manualReplacementEmployeeId: absence.manualReplacementEmployeeId || '',
      note: absence.note || '',
    });
    setModalOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const payload = {
      employeeId: draft.employeeId,
      type: draft.type,
      startDate: draft.startDate,
      endDate: draft.endDate,
      replacementMode: draft.replacementMode,
      manualReplacementEmployeeId: draft.manualReplacementEmployeeId,
      note: draft.note,
    };
    const ok = draft.id
      ? await onUpdateAbsence?.(draft.id, payload)
      : await onCreateAbsence?.(payload);
    if (ok) setModalOpen(false);
  }

  const canSubmit = Boolean(
    isAdmin &&
      draft.employeeId &&
      draft.type &&
      draft.startDate &&
      draft.endDate &&
      draft.replacementMode &&
      (draft.replacementMode !== 'MANUAL' || draft.manualReplacementEmployeeId),
  );

  if (!isAdmin) return null;

  return (
    <div data-testid="absences-panel" className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Άδειες / Απουσίες</h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Διαχείριση και προβολή αδειών υπαλλήλων
        </p>
      </div>

      {warningMessage ? (
        <div
          data-testid="absences-scoped-warning"
          className="flex gap-2 rounded-xl border border-amber-300/45 bg-amber-400/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100"
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Περιορισμένη φόρτωση αδειών</p>
            <p className="mt-0.5">{warningMessage}</p>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        data-testid="add-absence-button"
        onClick={openCreateModal}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-600 disabled:opacity-60"
        disabled={isSaving}
      >
        <Plus size={14} />
        Προσθήκη Άδειας / Απουσίας
      </button>

      <div className="grid gap-2 text-xs">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Μήνας</span>
            <select
              value={filters.month}
              onChange={(event) => setFilters((prev) => ({ ...prev, month: Number(event.target.value) }))}
              className="w-full rounded-lg border border-cyan-300/35 bg-slate-950/70 px-2 py-2 text-white"
            >
              {MONTH_NAMES.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Έτος</span>
            <input
              type="number"
              value={filters.year}
              onChange={(event) => setFilters((prev) => ({ ...prev, year: Number(event.target.value) }))}
              className="w-full rounded-lg border border-cyan-300/35 bg-slate-950/70 px-2 py-2 text-white"
            />
          </label>
        </div>

        <select
          value={filters.employeeId}
          onChange={(event) => setFilters((prev) => ({ ...prev, employeeId: event.target.value }))}
          className="w-full rounded-lg border border-cyan-300/35 bg-slate-950/70 px-2 py-2 text-white"
        >
          <option value="">Όλοι οι υπάλληλοι</option>
          {activeEmployees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            value={filters.type}
            onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}
            className="w-full rounded-lg border border-cyan-300/35 bg-slate-950/70 px-2 py-2 text-white"
          >
            <option value="">Όλοι οι τύποι</option>
            {ABSENCE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            className="w-full rounded-lg border border-cyan-300/35 bg-slate-950/70 px-2 py-2 text-white"
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-cyan-300/20 bg-slate-950/25 p-2">
          <p className="text-slate-500 dark:text-slate-400">Σύνολο μήνα</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{summary.total}</p>
        </div>
        <div className="rounded-xl border border-cyan-300/20 bg-slate-950/25 p-2">
          <p className="text-slate-500 dark:text-slate-400">Επερχόμενες</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{summary.upcoming}</p>
        </div>
      </div>

      {summary.daysByEmployee.size ? (
        <div className="rounded-xl border border-cyan-300/20 bg-slate-950/20 p-2 text-xs">
          <p className="mb-1 font-bold text-slate-900 dark:text-white">Ημέρες ανά υπάλληλο</p>
          <div className="space-y-1">
            {[...summary.daysByEmployee.entries()].map(([employeeId, days]) => (
              <div key={employeeId} className="flex justify-between gap-2 text-slate-700 dark:text-slate-200">
                <span className="truncate">{employeesById.get(employeeId)?.fullName || employeeId}</span>
                <span className="font-bold">{days}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="rounded-xl border border-cyan-300/25 bg-slate-950/20 p-3 text-xs text-slate-700 dark:text-slate-200">
          Φόρτωση αδειών...
        </p>
      ) : filteredAbsences.length ? (
        <div className="space-y-2">
          {filteredAbsences.map((absence) => {
            const employee = employeesById.get(absence.employeeId);
            const status = deriveAbsenceStatus(absence);
            const displayName = employee?.fullName || absence.employeeName || absence.employeeId || '-';
            const typeLabel = absence.typeLabel || getAbsenceTypeLabel(absence.type);
            return (
              <article
                key={absence.id}
                data-testid="absence-card"
                className="rounded-xl border border-cyan-300/25 bg-slate-950/35 p-3 text-xs text-slate-700 dark:text-slate-100"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold">{displayName}</p>
                    <p className="mt-0.5 font-semibold text-cyan-700 dark:text-cyan-200">{typeLabel}</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold">{getStatusLabel(status)}</span>
                </div>
                <p className="mt-2 font-semibold">
                  {formatDate(absence.startDate)} - {formatDate(absence.endDate)}
                </p>
                <p>{countInclusiveDays(absence.startDate, absence.endDate)} ημέρες</p>
                {isAdmin ? <p>Αντικατάσταση: {getReplacementLabel(absence.replacementMode)}</p> : null}
                {isAdmin && absence.note ? <p className="mt-1 text-slate-500 dark:text-slate-300">Σχόλιο: {absence.note}</p> : null}

                {isAdmin ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      data-testid="edit-absence-button"
                      onClick={() => openEditModal(absence)}
                      className="inline-flex items-center gap-1 rounded-lg border border-cyan-300/35 px-2 py-1 font-semibold hover:bg-white/10"
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                    {absence.status !== 'CANCELLED' ? (
                      <button
                        type="button"
                        data-testid="cancel-absence-button"
                        onClick={() => onCancelAbsence?.(absence.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300/45 px-2 py-1 font-semibold hover:bg-amber-300/10"
                      >
                        <Ban size={12} />
                        Ακύρωση
                      </button>
                    ) : null}
                    <button
                      type="button"
                      data-testid="delete-absence-button"
                      onClick={() => {
                        if (window.confirm('Να διαγραφεί οριστικά η άδεια;')) onDeleteAbsence?.(absence.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300/45 px-2 py-1 font-semibold hover:bg-red-300/10"
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-cyan-300/25 bg-slate-950/20 p-3 text-xs text-slate-700 dark:text-slate-200">
          Δεν υπάρχουν καταχωρημένες άδειες για το επιλεγμένο διάστημα.
        </p>
      )}

      {modalOpen && isAdmin && typeof document !== 'undefined'
        ? createPortal(
          (
        <div
          data-testid="absence-modal"
          className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/70 p-3 sm:items-center"
        >
          <form
            onSubmit={handleSubmit}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-cyan-300/35 bg-slate-900 p-4 text-sm text-white shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="inline-flex items-center gap-2 text-lg font-bold">
                  <CalendarDays size={18} />
                  {draft.id ? 'Επεξεργασία Άδειας' : 'Νέα Άδεια / Απουσία'}
                </h3>
                <p className="mt-1 text-xs text-slate-300">Το εύρος ημερομηνιών είναι inclusive.</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Κλείσιμο">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold">Υπάλληλος</span>
                <select
                  data-testid="absence-employee-select"
                  value={draft.employeeId}
                  onChange={(event) => setDraft((prev) => ({ ...prev, employeeId: event.target.value, manualReplacementEmployeeId: '' }))}
                  className="w-full rounded-lg border border-cyan-300/35 bg-slate-950 px-3 py-2"
                  required
                >
                  <option value="">Επιλογή υπαλλήλου</option>
                  {activeEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-bold">Τύπος</span>
                <select
                  data-testid="absence-type-select"
                  value={draft.type}
                  onChange={(event) => setDraft((prev) => ({ ...prev, type: event.target.value }))}
                  className="w-full rounded-lg border border-cyan-300/35 bg-slate-950 px-3 py-2"
                  required
                >
                  {ABSENCE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3">
              <DateRangePicker
                startDate={draft.startDate}
                endDate={draft.endDate}
                onChange={(range) => setDraft((prev) => ({ ...prev, ...range }))}
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold">Αντικατάσταση</span>
                <select
                  data-testid="absence-replacement-mode"
                  value={draft.replacementMode}
                  onChange={(event) => setDraft((prev) => ({ ...prev, replacementMode: event.target.value, manualReplacementEmployeeId: '' }))}
                  className="w-full rounded-lg border border-cyan-300/35 bg-slate-950 px-3 py-2"
                  required
                >
                  {REPLACEMENT_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {draft.replacementMode === 'MANUAL' ? (
                <label className="space-y-1">
                  <span className="text-xs font-bold">Χειροκίνητος αντικαταστάτης</span>
                  <select
                    value={draft.manualReplacementEmployeeId}
                    onChange={(event) => setDraft((prev) => ({ ...prev, manualReplacementEmployeeId: event.target.value }))}
                    className="w-full rounded-lg border border-cyan-300/35 bg-slate-950 px-3 py-2"
                    required
                  >
                    <option value="">Επιλογή αντικαταστάτη</option>
                    {activeEmployees
                      .filter((employee) => employee.id !== draft.employeeId)
                      .map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.fullName}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
            </div>

            <label className="mt-3 block space-y-1">
              <span className="text-xs font-bold">Σχόλιο</span>
              <textarea
                value={draft.note}
                onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
                className="min-h-20 w-full rounded-lg border border-cyan-300/35 bg-slate-950 px-3 py-2"
                placeholder="Προαιρετικό σχόλιο"
              />
            </label>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-500 px-4 py-2 font-semibold hover:bg-white/10">
                Άκυρο
              </button>
              <button
                type="submit"
                data-testid="save-absence-button"
                disabled={!canSubmit || isSaving}
                className="rounded-lg bg-brand-500 px-4 py-2 font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Αποθήκευση...' : 'Αποθήκευση'}
              </button>
            </div>
          </form>
        </div>
          ),
          document.body,
        )
        : null}
    </div>
  );
}
