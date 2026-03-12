import { SHIFT_PRESETS, WEEKDAY_LABELS } from '../../data/constants';
import { findOverlapConflicts } from '../../utils/overlap';
import { formatDateGreek } from '../../utils/time';
import AssignedShiftItem from './AssignedShiftItem';
import DayDropZone from './DayDropZone';
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

  return (
    <section className="glass-panel rounded-2xl p-3 sm:p-4">
      <h2 className="mb-3 text-base font-bold text-slate-900 sm:text-lg dark:text-white">Ξ•Ξ²Ξ΄ΞΏΞΌΞ±Ξ΄ΞΉΞ±Ξ―ΞΏ Ξ Ξ»Ξ¬Ξ½ΞΏ</h2>

      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:min-w-[980px] md:grid-cols-7 md:snap-none">
        {weekDays.map((day, index) => {
          const dayShifts = shifts.filter((shift) => shift.date === day);
          const customShifts = dayShifts.filter(
            (shift) =>
              !SHIFT_PRESETS.some(
                (preset) => preset.startTime === shift.startTime && preset.endTime === shift.endTime,
              ),
          );

          return (
            <div key={day} className="glass-soft w-full shrink-0 space-y-3 rounded-xl p-2 snap-start md:w-auto md:snap-none">
              <header className="rounded-lg bg-slate-900/85 px-2 py-1 text-center text-[11px] font-semibold text-white backdrop-blur-sm sm:text-xs dark:bg-slate-950/85 dark:text-cyan-100">
                {WEEKDAY_LABELS[index]} ({formatDateGreek(day)})
              </header>

              <DayDropZone date={day} canManage={canManage} />

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

              <div className="glass-soft rounded-xl p-2">
                <p className="mb-2 text-[11px] font-semibold text-slate-700 sm:text-xs dark:text-slate-200">Ξ•Ξ½Ξ΄ΞΉΞ¬ΞΌΞµΟƒΞµΟ‚ Ξ²Ξ¬ΟΞ΄ΞΉΞµΟ‚</p>
                <div className="space-y-2">
                  {customShifts.map((shift) => (
                    <AssignedShiftItem
                      key={shift.id}
                      shift={shift}
                      employee={getEmployeeById(shift.employeeId)}
                      hasConflict={hasConflict(shift)}
                      onDelete={onDeleteShift}
                      canManage={canManage}
                    />
                  ))}
                  {!customShifts.length ? (
                    <p className="text-[11px] text-slate-500 sm:text-xs dark:text-slate-400">Ξ§Ο‰ΟΞ―Ο‚ ΞµΞ½Ξ΄ΞΉΞ¬ΞΌΞµΟƒΞµΟ‚ Ξ²Ξ¬ΟΞ΄ΞΉΞµΟ‚</p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

