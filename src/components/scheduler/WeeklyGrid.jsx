import { useDroppable } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Loader2, Trash2, UserRound, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { WEEKDAY_LABELS } from '../../data/constants';
import { SHIFT_TYPES } from '../../utils/analytics';
import { findOverlapConflicts } from '../../utils/overlap';
import { formatDateGreek, normalizeTimeLabel } from '../../utils/time';
import AssignedShiftItem from './AssignedShiftItem';

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
            {normalizeTimeLabel(template.startTime)} - {normalizeTimeLabel(template.endTime)}
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
  index,
  dayShifts,
  dayTemplates,
  canManage,
  getEmployeeById,
  hasConflict,
  onDeleteShift,
  onDeleteShiftTemplate,
  onClearDay,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-box-${day}`,
    data: { type: 'day-box', day: { date: day } },
    disabled: !canManage,
  });

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

      <header className="relative mb-3 flex items-center justify-between gap-2 rounded-xl bg-slate-900/85 px-3 py-2 text-xs font-semibold text-white dark:bg-slate-950/85 dark:text-cyan-100">
        <span>
          {WEEKDAY_LABELS[index]} ({formatDateGreek(day)})
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

        {dayShifts.map((shift) => (
          <AssignedShiftItem
            key={shift.id}
            shift={shift}
            employee={getEmployeeById(shift.employeeId)}
            hasConflict={hasConflict(shift)}
            onDelete={onDeleteShift}
            canManage={canManage}
          />
        ))}
      </div>
    </section>
  );
}

export default function WeeklyGrid({
  weekDays,
  shifts,
  shiftTemplates,
  employees,
  onDeleteShift,
  onDeleteShiftTemplate,
  onClearDayShifts,
  canManage,
  isSaving = false,
}) {
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

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

  function getEmployeeById(employeeId) {
    return employeeById.get(employeeId);
  }

  function hasConflict(shift) {
    if ((shift.type || SHIFT_TYPES.WORK) !== SHIFT_TYPES.WORK) return false;
    return findOverlapConflicts(shifts, shift).length > 0;
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
      <div className="mb-2 flex items-center justify-between gap-2 sm:mb-3">
        <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Dynamic Sandbox Week</h2>
        {isSaving ? (
          <div className="inline-flex items-center gap-1 rounded-full border border-brand-200/70 bg-brand-50/80 px-2 py-1 text-[11px] font-semibold text-brand-800 dark:border-cyan-300/45 dark:bg-cyan-500/15 dark:text-cyan-100">
            <Loader2 size={12} className="animate-spin" />
            Saving...
          </div>
        ) : null}
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
          const dayShifts = shifts.filter((shift) => shift.date === day);
          const dayTemplates = placedTemplatesByDay.get(day) || [];

          return (
            <div key={day} className="min-w-full shrink-0 snap-start md:min-w-0 md:snap-none">
              <DayBox
                day={day}
                index={index}
                dayShifts={dayShifts}
                dayTemplates={dayTemplates}
                canManage={canManage}
                getEmployeeById={getEmployeeById}
                hasConflict={hasConflict}
                onDeleteShift={onDeleteShift}
                onDeleteShiftTemplate={onDeleteShiftTemplate}
                onClearDay={(date) => {
                  const shouldClear = window.confirm(`Να διαγραφούν όλες οι βάρδιες για ${formatDateGreek(date)};`);
                  if (!shouldClear) return;
                  onClearDayShifts(date);
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
