import { useDroppable } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Loader2, Trash2, UserRound, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { WEEKDAY_LABELS } from '../../data/constants';
import { SHIFT_TYPES } from '../../utils/analytics';
import {
  formatGreekDate,
  getDurationLabel,
  groupAndSortShiftsByDay,
} from '../../utils/scheduleUtils';
import { formatDateGreek, normalizeTimeLabel, timeToMinutes } from '../../utils/time';
import AssignedShiftItem from './AssignedShiftItem';

const MONTH_OPTIONS = [
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

function getDaySpecialInfo(dayShifts) {
  const specialShift = (dayShifts || []).find((item) => item.isHoliday || item.isSpecialDay);
  if (!specialShift) return null;
  if (specialShift.specialDayLabel?.trim()) return specialShift.specialDayLabel.trim();
  return specialShift.isHoliday ? 'Αργία' : 'Ειδικό Ωράριο';
}

function getDayLabel(date) {
  return new Intl.DateTimeFormat('el-GR', { weekday: 'long' }).format(new Date(`${date}T00:00:00`));
}

function getSnapshotSourceLabel(source) {
  switch (source) {
    case 'manual_save_button':
      return 'Αποθήκευση';
    case 'manual_save':
      return 'Αυτόματη Αποθήκευση';
    case 'magic_wand':
      return 'Magic Wand';
    case 'finalize':
      return 'Οριστικοποίηση';
    case 'template_load':
      return 'Φόρτωση Προτύπου';
    case 'history_load':
      return 'Φόρτωση Ιστορικού';
    default:
      return source || 'χειροκίνητα';
  }
}

function buildConflictShiftIdSet(shifts) {
  const shiftsByEmployeeDay = new Map();
  const conflictIds = new Set();

  for (const shift of shifts || []) {
    if ((shift.type || SHIFT_TYPES.WORK) !== SHIFT_TYPES.WORK) continue;
    if (!shift.employeeId || !shift.date || !shift.id) continue;

    const key = `${shift.employeeId}_${shift.date}`;
    if (!shiftsByEmployeeDay.has(key)) {
      shiftsByEmployeeDay.set(key, []);
    }
    shiftsByEmployeeDay.get(key).push(shift);
  }

  for (const dayShifts of shiftsByEmployeeDay.values()) {
    dayShifts.sort((a, b) => {
      const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
      if (startDiff !== 0) return startDiff;
      return timeToMinutes(a.endTime) - timeToMinutes(b.endTime);
    });

    for (let index = 0; index < dayShifts.length; index += 1) {
      const current = dayShifts[index];
      const currentEnd = timeToMinutes(current.endTime);

      for (let nextIndex = index + 1; nextIndex < dayShifts.length; nextIndex += 1) {
        const next = dayShifts[nextIndex];
        if (timeToMinutes(next.startTime) >= currentEnd) break;
        conflictIds.add(current.id);
        conflictIds.add(next.id);
      }
    }
  }

  return conflictIds;
}

function TemplateAssignmentCard({ template, canManage, onDeleteTemplate }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `template-assignment-${template.id}`,
    data: { type: 'template-assignment', template },
    disabled: !canManage,
  });

  return (
    <article
      ref={setNodeRef}
      className={`rounded-xl border p-3 text-xs shadow-sm backdrop-blur-sm transition ${
        isOver && canManage
          ? 'border-brand-400 bg-brand-50/90 dark:border-cyan-300 dark:bg-cyan-500/15'
          : 'border-cyan-300/45 bg-cyan-50/70 dark:border-cyan-300/30 dark:bg-slate-900/45'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-white">{template.label}</p>
          <p className="text-slate-700 dark:text-slate-300">
            {normalizeTimeLabel(template.startTime)} - {normalizeTimeLabel(template.endTime)} ({getDurationLabel(template.startTime, template.endTime)})
          </p>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={() => onDeleteTemplate(template.id)}
            className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-500/30 dark:hover:text-red-200"
            title="Διαγραφή κάρτας"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-slate-300/70 px-2 py-1.5 text-[11px] text-slate-700 dark:border-cyan-300/35 dark:text-slate-300">
        <UserRound size={13} />
        {canManage ? 'Σύρε υπάλληλο εδώ για ανάθεση' : 'Αναμονή ανάθεσης'}
      </div>
    </article>
  );
}

function DayBox({
  day,
  title,
  subtitle,
  dayShifts,
  dayTemplates,
  canManage,
  getEmployeeById,
  getSundayViolationMessage,
  conflictShiftIds,
  onDeleteShift,
  onDeleteShiftTemplate,
  onClearDay,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-box-${day}`,
    data: { type: 'day-box', day: { date: day } },
    disabled: !canManage,
  });

  const specialInfo = getDaySpecialInfo(dayShifts);

  return (
    <section
      ref={setNodeRef}
      onDragOver={(event) => event.preventDefault()}
      className={`relative overflow-hidden rounded-2xl border p-3 shadow-sm backdrop-blur-sm transition sm:p-4 ${
        isOver && canManage
          ? 'border-brand-400 bg-brand-50/70 dark:border-cyan-300 dark:bg-cyan-500/10'
          : 'border-white/45 bg-white/45 dark:border-cyan-300/30 dark:bg-slate-900/40'
      }`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-cyan-200/45 blur-2xl dark:bg-pink-400/20" />

      <header className="relative mb-3 rounded-xl bg-slate-900/85 px-3 py-2 text-xs font-semibold text-white dark:bg-slate-950/85 dark:text-cyan-100">
        <div className="flex items-center justify-between gap-2">
          <span>
            {title} ({subtitle})
          </span>
          {canManage ? (
            <button
              type="button"
              onClick={() => onClearDay(day)}
              className="rounded p-1 text-white/85 hover:bg-red-500/20 hover:text-red-200"
              title="Καθαρισμός ημέρας"
              aria-label="Καθαρισμός ημέρας"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
        {specialInfo ? (
          <span className="mt-1 inline-flex rounded-full border border-amber-300/60 bg-amber-100/20 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
            {specialInfo === 'Αργία' ? 'Αργία' : `Ειδικό Ωράριο: ${specialInfo}`}
          </span>
        ) : null}
      </header>

      <div className="space-y-2">
        {dayTemplates.map((template) => (
          <TemplateAssignmentCard
            key={template.id}
            template={template}
            canManage={canManage}
            onDeleteTemplate={onDeleteShiftTemplate}
          />
        ))}

        {dayShifts.map((shift) => {
          const sundayWarning = getSundayViolationMessage(shift.id);
          return (
            <div key={shift.id} className="space-y-1">
              <AssignedShiftItem
                shift={shift}
                employee={getEmployeeById(shift.employeeId)}
                hasConflict={conflictShiftIds.has(shift.id)}
                onDelete={onDeleteShift}
                canManage={canManage}
              />
              {sundayWarning ? (
                <p className="rounded border border-amber-300/60 bg-amber-50/70 px-2 py-1 text-[11px] text-amber-900 dark:border-amber-300/40 dark:bg-amber-500/10 dark:text-amber-200">
                  {sundayWarning}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ScheduleModeSelector({ scheduleMode, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
      Τύπος Προγράμματος
      <select
        className="input-glass rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
        value={scheduleMode}
        onChange={(event) => onChange?.(event.target.value)}
      >
        <option value="week">Διαμόρφωση προγράμματος εβδομάδας</option>
        <option value="month">Διαμόρφωση προγράμματος μήνα</option>
      </select>
    </label>
  );
}

export default function WeeklyGrid({
  weekDays,
  monthDays = [],
  shifts,
  shiftTemplates,
  employees,
  weekHistory = [],
  weekTemplates = [],
  selectedHistoryWeekId = '',
  selectedTemplateId = '',
  selectedMonth = new Date().getMonth(),
  selectedYear = new Date().getFullYear(),
  scheduleMode = 'week',
  monthlyRoleConfig = { coreAId: '', coreBId: '', intermediateId: '' },
  sundayRuleViolations = {},
  onChangeScheduleMode,
  onSelectMonth,
  onSelectYear,
  onChangeMonthlyRoleConfig,
  onSelectHistoryWeek,
  onLoadSelectedHistoryWeek,
  onSaveAsTemplate,
  onSelectTemplate,
  onLoadSelectedTemplate,
  onMagicWand,
  onGenerateMonthlySchedule,
  onJumpToWeekDate,
  onDeleteShift,
  onDeleteShiftTemplate,
  onClearDayShifts,
  canManage,
  isSaving = false,
}) {
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const grouped = useMemo(() => groupAndSortShiftsByDay(shifts), [shifts]);
  const conflictShiftIds = useMemo(() => buildConflictShiftIdSet(shifts), [shifts]);

  const navItems = useMemo(
    () =>
      weekDays.map((day, index) => ({
        key: day,
        label: WEEKDAY_LABELS[index],
        date: formatDateGreek(day),
      })),
    [weekDays],
  );

  const placedTemplatesByDay = useMemo(() => {
    const map = new Map(weekDays.map((day) => [day, []]));
    shiftTemplates.forEach((template) => {
      if (!template.isPlaced) return;
      if (!map.has(template.date)) return;
      map.get(template.date).push(template);
    });
    for (const values of map.values()) {
      values.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    }
    return map;
  }, [shiftTemplates, weekDays]);

  const monthYears = useMemo(() => {
    const year = new Date().getFullYear();
    return Array.from({ length: 7 }, (_, index) => year - 3 + index);
  }, []);

  const activeEmployees = useMemo(
    () => (employees || []).filter((employee) => employee?.isActive !== false),
    [employees],
  );

  function getEmployeeById(employeeId) {
    return employeeById.get(employeeId);
  }

  function getSundayViolationMessage(shiftId) {
    return sundayRuleViolations?.[shiftId] || '';
  }

  function clearDayWithConfirm(date) {
    const shouldClear = window.confirm(`Να διαγραφούν όλες οι βάρδιες για ${formatDateGreek(date)};`);
    if (!shouldClear) return;
    onClearDayShifts(date);
  }

  function getScrollStep() {
    const container = scrollRef.current;
    if (!container) return 0;
    const firstChild = container.firstElementChild;
    const childWidth = firstChild ? firstChild.getBoundingClientRect().width : container.clientWidth;
    const styles = getComputedStyle(container);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || 0);
    return childWidth + gap;
  }

  function scrollToIndex(index) {
    const container = scrollRef.current;
    if (!container) return;
    const safeIndex = Math.max(0, Math.min(index, navItems.length - 1));
    const step = getScrollStep() || container.clientWidth;
    container.scrollTo({ left: step * safeIndex, behavior: 'smooth' });
    setActiveIndex(safeIndex);
  }

  function handleScroll() {
    const container = scrollRef.current;
    if (!container) return;
    const step = getScrollStep() || container.clientWidth;
    const nextIndex = Math.round(container.scrollLeft / step);
    if (nextIndex !== activeIndex) {
      setActiveIndex(Math.max(0, Math.min(nextIndex, navItems.length - 1)));
    }
  }

  return (
    <section id="weekly-grid-export" className="glass-panel rounded-2xl p-2 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 sm:mb-3">
        <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Πίνακας Βαρδιών</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ScheduleModeSelector scheduleMode={scheduleMode} onChange={onChangeScheduleMode} />
          {isSaving ? (
            <div className="inline-flex items-center gap-1 rounded-full border border-brand-200/70 bg-brand-50/80 px-2 py-1 text-[11px] font-semibold text-brand-800 dark:border-cyan-300/45 dark:bg-cyan-500/15 dark:text-cyan-100">
              <Loader2 size={12} className="animate-spin" />
              Αποθήκευση...
            </div>
          ) : null}
        </div>
      </div>

      {scheduleMode === 'week' ? (
        <>
          <div className="mb-3 grid gap-2 md:grid-cols-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className="input-glass rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                onChange={(event) => onJumpToWeekDate?.(event.target.value)}
              />
              <select
                className="input-glass rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                value={selectedHistoryWeekId}
                onChange={(event) => onSelectHistoryWeek?.(event.target.value)}
              >
                <option value="">Ιστορικό εβδομάδων</option>
                {weekHistory.map((item) => (
                  <option key={item.id} value={item.weekId}>
                    {item.weekStart} ({getSnapshotSourceLabel(item.source)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={onLoadSelectedHistoryWeek}
                className="rounded-lg border border-slate-300 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
              >
                Φόρτωση Εβδομάδας
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <select
                className="input-glass rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-900 dark:border-cyan-300/45 dark:text-white"
                value={selectedTemplateId}
                onChange={(event) => onSelectTemplate?.(event.target.value)}
              >
                <option value="">Πρότυπα</option>
                {weekTemplates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const name = window.prompt('Όνομα προτύπου');
                  if (!name) return;
                  onSaveAsTemplate?.(name);
                }}
                className="rounded-lg border border-slate-300 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
              >
                Αποθήκευση ως Πρότυπο
              </button>
              <button
                type="button"
                onClick={onLoadSelectedTemplate}
                className="rounded-lg border border-slate-300 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100"
              >
                Φόρτωση Προτύπου
              </button>
              <button
                type="button"
                onClick={onMagicWand}
                className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
              >
                Αυτόματη Δημιουργία
              </button>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex - 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/70 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-cyan-300/30 dark:bg-slate-900/60 dark:text-slate-100"
              aria-label="Προηγούμενη ημέρα"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex flex-1 gap-2 overflow-x-auto scrollbar-thin snap-x snap-mandatory scroll-smooth">
              {navItems.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => scrollToIndex(index)}
                  className={`flex w-[110px] shrink-0 snap-center flex-col items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                    activeIndex === index
                      ? 'border-brand-400 bg-brand-500 text-white shadow-sm'
                      : 'border-slate-200 bg-white/70 text-slate-700'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] font-medium opacity-80">{item.date}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex + 1)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/70 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-cyan-300/30 dark:bg-slate-900/60 dark:text-slate-100"
              aria-label="Επόμενη ημέρα"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth md:grid md:min-w-[1120px] md:grid-cols-2 md:gap-4 md:snap-none xl:grid-cols-4"
          >
            {weekDays.map((day, index) => {
              const dayShifts = grouped[day] || [];
              const dayTemplates = placedTemplatesByDay.get(day) || [];

              return (
                <div key={day} className="min-w-full shrink-0 snap-start md:min-w-0 md:snap-none">
                  <DayBox
                    day={day}
                    title={WEEKDAY_LABELS[index]}
                    subtitle={formatDateGreek(day)}
                    dayShifts={dayShifts}
                    dayTemplates={dayTemplates}
                    canManage={canManage}
                    getEmployeeById={getEmployeeById}
                    getSundayViolationMessage={getSundayViolationMessage}
                    conflictShiftIds={conflictShiftIds}
                    onDeleteShift={onDeleteShift}
                    onDeleteShiftTemplate={onDeleteShiftTemplate}
                    onClearDay={clearDayWithConfirm}
                  />
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
              Μήνας
              <select
                value={selectedMonth}
                onChange={(event) => onSelectMonth?.(Number(event.target.value))}
                className="input-glass rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
              >
                {MONTH_OPTIONS.map((monthLabel, index) => (
                  <option key={monthLabel} value={index}>
                    {monthLabel}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
              Έτος
              <select
                value={selectedYear}
                onChange={(event) => onSelectYear?.(Number(event.target.value))}
                className="input-glass rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
              >
                {monthYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={onGenerateMonthlySchedule}
              disabled={!canManage}
              className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Αυτόματη δημιουργία μηνιαίου προγράμματος
            </button>
          </div>

          <div className="mb-3 grid gap-2 md:grid-cols-3">
            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
              Βασικός Υπάλληλος Α
              <select
                value={monthlyRoleConfig?.coreAId || ''}
                onChange={(event) =>
                  onChangeMonthlyRoleConfig?.((prev) => ({ ...prev, coreAId: event.target.value }))
                }
                disabled={!canManage}
                className="input-glass min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
              >
                <option value="">Επιλογή</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
              Βασικός Υπάλληλος Β
              <select
                value={monthlyRoleConfig?.coreBId || ''}
                onChange={(event) =>
                  onChangeMonthlyRoleConfig?.((prev) => ({ ...prev, coreBId: event.target.value }))
                }
                disabled={!canManage}
                className="input-glass min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
              >
                <option value="">Επιλογή</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-100">
              Ενδιάμεσος Υπάλληλος
              <select
                value={monthlyRoleConfig?.intermediateId || ''}
                onChange={(event) =>
                  onChangeMonthlyRoleConfig?.((prev) => ({ ...prev, intermediateId: event.target.value }))
                }
                disabled={!canManage}
                className="input-glass min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 dark:border-cyan-300/40 dark:text-white"
              >
                <option value="">Επιλογή</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {monthDays.map((day) => {
              const dayShifts = grouped[day] || [];
              return (
                <DayBox
                  key={day}
                  day={day}
                  title={getDayLabel(day)}
                  subtitle={formatGreekDate(day)}
                  dayShifts={dayShifts}
                  dayTemplates={[]}
                  canManage={canManage}
                  getEmployeeById={getEmployeeById}
                  getSundayViolationMessage={getSundayViolationMessage}
                  conflictShiftIds={conflictShiftIds}
                  onDeleteShift={onDeleteShift}
                  onDeleteShiftTemplate={onDeleteShiftTemplate}
                  onClearDay={clearDayWithConfirm}
                />
              );
            })}
          </div>

          {!monthDays.length ? (
            <p className="rounded-xl border border-slate-300/60 bg-white/45 p-4 text-sm text-slate-700 dark:border-cyan-300/30 dark:bg-slate-900/40 dark:text-slate-200">
              Δεν βρέθηκαν ημέρες για τον επιλεγμένο μήνα.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}


