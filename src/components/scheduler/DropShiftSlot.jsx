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
      className={`min-h-[72px] rounded-xl border-2 border-dashed p-1.5 shadow-sm transition sm:min-h-[110px] sm:p-2 ${
        isOver && canManage
          ? 'border-brand-400 bg-brand-50/80 backdrop-blur-sm dark:border-cyan-300 dark:bg-cyan-500/15'
          : 'border-white/40 bg-white/35 backdrop-blur-sm dark:border-cyan-300/30 dark:bg-slate-900/35'
      }`}
    >
      <header className="mb-1.5 flex items-center justify-between sm:mb-2">
        <p className="text-[10px] font-semibold text-slate-700 sm:text-xs dark:text-slate-200">{slot.label}</p>
        <p className="text-[9px] text-slate-600 sm:text-[11px] dark:text-slate-300">
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
          <p className="text-[9px] text-slate-500 sm:text-[11px] dark:text-slate-400">
            {canManage ? 'Σύρε υπάλληλο εδώ' : 'Read-only προβολή'}
          </p>
        ) : null}
      </div>
    </section>
  );
}

