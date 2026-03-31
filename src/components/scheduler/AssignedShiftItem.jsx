import { X } from 'lucide-react';
import { getShiftDurationHours, getShiftTypeLabel, SHIFT_TYPES } from '../../utils/analytics';

function getTypeClass(type) {
  switch (type) {
    case SHIFT_TYPES.REST:
      return 'border-slate-500/60 bg-slate-500/50 text-white';
    case SHIFT_TYPES.LEAVE:
      return 'border-orange-500/60 bg-orange-500/50 text-white';
    case SHIFT_TYPES.SICK:
      return 'border-red-500/60 bg-red-500/50 text-white';
    case SHIFT_TYPES.WORK:
    default:
      return '';
  }
}

export default function AssignedShiftItem({ shift, employee, hasConflict, onDelete, canManage = true }) {
  const type = shift.type || SHIFT_TYPES.WORK;
  const isWork = type === SHIFT_TYPES.WORK;
  const typeClass = getTypeClass(type);

  return (
    <article
      className={`relative rounded-lg border p-1.5 text-[10px] sm:p-2 sm:text-xs shadow-sm backdrop-blur-sm ${
        typeClass ||
        (hasConflict
          ? 'border-red-400 bg-red-100/80 dark:border-red-300/60 dark:bg-red-500/20'
          : 'border-white/35 bg-white/55 dark:border-cyan-300/30 dark:bg-slate-900/45')
      }`}
    >
      {canManage ? (
        <button
          type="button"
          onClick={() => onDelete(shift.id)}
          className="absolute right-1 top-1 rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-500/30 dark:hover:text-red-200"
          title="Αφαίρεση βάρδιας"
          aria-label="Αφαίρεση βάρδιας"
        >
          <X size={14} />
        </button>
      ) : null}

      <div className="flex items-center justify-between gap-2 pr-6">
        <p className="font-semibold text-slate-900 dark:text-white">{employee?.fullName || 'Άγνωστος'}</p>
      </div>

      <p className="text-slate-700 dark:text-slate-200">{getShiftTypeLabel(type)}</p>
      <p className="text-slate-700 dark:text-slate-200">
        {shift.startTime} - {shift.endTime}
        {isWork ? <span className="hidden sm:inline"> ({getShiftDurationHours(shift)} ώρες)</span> : <span className="hidden sm:inline"> (1 ημέρα)</span>}
      </p>

      {hasConflict && isWork ? (
        <p className="mt-1 hidden font-medium text-red-700 sm:block dark:text-red-300">Επικάλυψη με άλλη βάρδια</p>
      ) : null}
    </article>
  );
}
