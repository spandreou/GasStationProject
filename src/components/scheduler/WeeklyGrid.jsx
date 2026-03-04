import { SHIFT_PRESETS, WEEKDAY_LABELS } from '../../data/constants';
import { findOverlapConflicts } from '../../utils/overlap';
import { formatDateGreek } from '../../utils/time';
import AssignedShiftItem from './AssignedShiftItem';
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
    <section className="glass-panel rounded-2xl p-4">
      <h2 className="mb-3 text-lg font-bold text-slate-900">Εβδομαδιαίο Πλάνο</h2>

      <div className="grid min-w-[980px] grid-cols-7 gap-3 overflow-x-auto pb-2">
        {weekDays.map((day, index) => {
          const dayShifts = shifts.filter((shift) => shift.date === day);
          const customShifts = dayShifts.filter(
            (shift) =>
              !SHIFT_PRESETS.some(
                (preset) => preset.startTime === shift.startTime && preset.endTime === shift.endTime,
              ),
          );

          return (
            <div key={day} className="glass-soft space-y-3 rounded-xl p-2">
              <header className="rounded-lg bg-slate-900/85 px-2 py-1 text-center text-xs font-semibold text-white backdrop-blur-sm">
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

              <div className="glass-soft rounded-xl p-2">
                <p className="mb-2 text-xs font-semibold text-slate-600">Ενδιάμεσες βάρδιες</p>
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
                    <p className="text-[11px] text-slate-400">Χωρίς ενδιάμεσες βάρδιες</p>
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
