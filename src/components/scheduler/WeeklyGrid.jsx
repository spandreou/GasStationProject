import { useDroppable } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { SHIFT_PRESETS, WEEKDAY_LABELS } from '../../data/constants';
import { getShiftDurationHours } from '../../utils/analytics';
import { findOverlapConflicts } from '../../utils/overlap';
import { formatDateGreek } from '../../utils/time';
import DropShiftSlot from './DropShiftSlot';

function getSlotId(day, preset) {
  return `slot-${day}-${preset.startTime}-${preset.endTime}`;
}

export default function WeeklyGrid({ weekDays, shifts, employees, onDeleteShift, canManage }) {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function getEmployeeById(employeeId) {
    return employeeById.get(employeeId);
  }

  function hasConflict(shift) {
    return findOverlapConflicts(shifts, shift).length > 0;
  }

  const isCustomShift = (shift) =>
    !SHIFT_PRESETS.some((preset) => preset.startTime === shift.startTime && preset.endTime === shift.endTime);

  const customShifts = shifts.filter((shift) => isCustomShift(shift));
  const customShiftsByDay = weekDays.map((day) => ({
    day,
    shifts: customShifts.filter((shift) => shift.date === day),
  }));

  const { setNodeRef: setCustomColumnRef, isOver: isOverCustomColumn } = useDroppable({
    id: 'custom-column',
    data: { type: 'custom-column' },
    disabled: !canManage,
  });

  const navItems = useMemo(
    () => [
      ...weekDays.map((day, index) => ({
        key: day,
        label: WEEKDAY_LABELS[index],
        date: formatDateGreek(day),
      })),
      { key: 'custom', label: 'Custom', date: 'Βάρδια' },
    ],
    [weekDays],
  );

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
    <section className="glass-panel rounded-2xl p-2 sm:p-4">
      <h2 className="mb-2 text-base font-bold text-slate-900 sm:mb-3 sm:text-lg dark:text-white">Εβδομαδιαίο Πλάνο</h2>

      <div className="mb-3 flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => scrollToIndex(activeIndex - 1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/70 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white dark:border-cyan-300/30 dark:bg-slate-900/60 dark:text-slate-100"
          aria-label="Προηγούμενη ημέρα"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="flex flex-1 gap-2 overflow-x-auto scrollbar-thin">
          {navItems.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onClick={() => scrollToIndex(index)}
              className={`flex min-w-[96px] flex-col items-center rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
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
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth md:grid md:min-w-[1120px] md:grid-cols-8 md:snap-none"
      >
        {weekDays.map((day, index) => {
          const dayShifts = shifts.filter((shift) => shift.date === day);

          return (
            <div
              key={day}
              className="glass-soft min-w-full shrink-0 space-y-2 rounded-xl p-1.5 snap-start md:w-auto md:min-w-0 md:space-y-3 md:p-2 md:snap-none"
            >
              <header className="rounded-lg bg-slate-900/85 px-2 py-1 text-center text-[11px] font-semibold text-white backdrop-blur-sm sm:text-xs dark:bg-slate-950/85 dark:text-cyan-100">
                {WEEKDAY_LABELS[index]} ({formatDateGreek(day)})
              </header>

              {SHIFT_PRESETS.map((preset) => {
                const slotShifts = dayShifts.filter(
                  (shift) => shift.startTime === preset.startTime && shift.endTime === preset.endTime,
                );

                return (
                  <DropShiftSlot
                    key={getSlotId(day, preset)}
                    slotId={getSlotId(day, preset)}
                    slot={{ ...preset, date: day }}
                    shifts={slotShifts}
                    getEmployeeById={getEmployeeById}
                    isConflict={hasConflict}
                    onDeleteShift={onDeleteShift}
                    canManage={canManage}
                  />
                );
              })}

            </div>
          );
        })}

        <div className="glass-soft min-w-full shrink-0 space-y-2 rounded-xl p-1.5 snap-start md:w-auto md:min-w-0 md:space-y-3 md:p-2 md:snap-none">
          <header className="rounded-lg bg-slate-900/85 px-2 py-1 text-center text-[11px] font-semibold text-white backdrop-blur-sm sm:text-xs dark:bg-slate-950/85 dark:text-cyan-100">
            Custom Βάρδια
          </header>

          <section
            ref={setCustomColumnRef}
            className={`space-y-3 rounded-xl border p-2 backdrop-blur-sm transition ${
              isOverCustomColumn && canManage
                ? 'border-cyan-400/80 bg-cyan-50/70 dark:border-pink-300/70 dark:bg-pink-500/15'
                : 'border-white/40 bg-white/30 dark:border-cyan-300/30 dark:bg-slate-900/35'
            }`}
          >
            {customShiftsByDay.some((group) => group.shifts.length) ? (
              customShiftsByDay.map((group, index) =>
                group.shifts.length ? (
                  <div key={group.day} className="space-y-2">
                    <p className="text-[11px] font-semibold text-slate-700 sm:text-xs dark:text-slate-200">
                      {WEEKDAY_LABELS[index]} ({formatDateGreek(group.day)})
                    </p>
                    <div className="space-y-2">
                      {group.shifts.map((shift) => {
                        const employee = getEmployeeById(shift.employeeId);
                        const hasShiftConflict = hasConflict(shift);

                        return (
                          <article
                            key={shift.id}
                            className={`rounded-lg border p-2 text-[11px] sm:text-xs shadow-sm backdrop-blur-sm ${
                              hasShiftConflict
                                ? 'border-red-400 bg-red-100/80 dark:border-red-300/60 dark:bg-red-500/20'
                                : 'border-white/35 bg-white/55 dark:border-cyan-300/30 dark:bg-slate-900/45'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {employee?.fullName || 'Άγνωστος'}
                              </p>
                              {canManage ? (
                                <button
                                  type="button"
                                  onClick={() => onDeleteShift(shift.id)}
                                  className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-500/30 dark:hover:text-red-200"
                                  title="Διαγραφή βάρδιας"
                                >
                                  <Trash2 size={14} />
                                </button>
                              ) : null}
                            </div>
                            <p className="text-slate-700 dark:text-slate-200">
                              {shift.startTime} - {shift.endTime} ({getShiftDurationHours(shift)} ώρες)
                            </p>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ) : null,
              )
            ) : (
              <p className="text-[11px] text-slate-500 sm:text-xs dark:text-slate-400">Σύρε custom βάρδια εδώ</p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

