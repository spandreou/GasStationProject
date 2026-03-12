import { useDroppable } from '@dnd-kit/core';
import { Trash2 } from 'lucide-react';
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

  return (
    <section className="glass-panel rounded-2xl p-3 sm:p-4">
      <h2 className="mb-3 text-base font-bold text-slate-900 sm:text-lg dark:text-white">Εβδομαδιαίο Πλάνο</h2>

      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:min-w-[1120px] md:grid-cols-8 md:snap-none">
        {weekDays.map((day, index) => {
          const dayShifts = shifts.filter((shift) => shift.date === day);

          return (
            <div key={day} className="glass-soft w-full shrink-0 space-y-3 rounded-xl p-2 snap-start md:w-auto md:snap-none">
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

        <div className="glass-soft w-full shrink-0 space-y-3 rounded-xl p-2 snap-start md:w-auto md:snap-none">
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

