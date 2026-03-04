import { useDroppable } from '@dnd-kit/core';
import AssignedShiftItem from './AssignedShiftItem';

export default function DropShiftSlot({
  slotId,
  slot,
  shifts,
  getEmployeeById,
  isConflict,
  onDeleteShift,
  canManage,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: slotId,
    data: { type: 'slot', slot },
    disabled: !canManage,
  });

  return (
    <section
      ref={setNodeRef}
      className={`min-h-[110px] rounded-xl border-2 border-dashed p-2 transition ${
        isOver && canManage
          ? 'border-brand-400 bg-brand-50/80 backdrop-blur-sm dark:border-cyan-300 dark:bg-cyan-500/15'
          : 'border-white/35 bg-white/40 backdrop-blur-sm dark:border-cyan-300/30 dark:bg-slate-900/35'
      }`}
    >
      <header className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{slot.label}</p>
        <p className="text-[11px] text-slate-600 dark:text-slate-300">
          {slot.startTime} - {slot.endTime}
        </p>
      </header>

      <div className="space-y-2">
        {shifts.map((shift) => (
          <AssignedShiftItem
            key={shift.id}
            shift={shift}
            employee={getEmployeeById(shift.employeeId)}
            hasConflict={isConflict(shift)}
            onDelete={onDeleteShift}
            canManage={canManage}
          />
        ))}

        {!shifts.length ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {canManage ? 'Σύρε υπάλληλο εδώ' : 'Read-only προβολή'}
          </p>
        ) : null}
      </div>
    </section>
  );
}
