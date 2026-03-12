import { Trash2 } from 'lucide-react';
import { getShiftDurationHours } from '../../utils/analytics';

export default function AssignedShiftItem({ shift, employee, hasConflict, onDelete, canManage = true }) {
  return (
    <article
      className={`rounded-lg border p-2 text-[11px] sm:text-xs shadow-sm backdrop-blur-sm ${
        hasConflict
          ? 'border-red-400 bg-red-100/80 dark:border-red-300/60 dark:bg-red-500/20'
          : 'border-white/35 bg-white/55 dark:border-cyan-300/30 dark:bg-slate-900/45'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-900 dark:text-white">{employee?.fullName || 'Ξ†Ξ³Ξ½Ο‰ΟƒΟ„ΞΏΟ‚'}</p>
        {canManage ? (
          <button
            type="button"
            onClick={() => onDelete(shift.id)}
            className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-500/30 dark:hover:text-red-200"
            title="Ξ”ΞΉΞ±Ξ³ΟΞ±Ο†Ξ® Ξ²Ξ¬ΟΞ΄ΞΉΞ±Ο‚"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>

      <p className="text-slate-700 dark:text-slate-200">
        {shift.startTime} - {shift.endTime}
        <span className="hidden sm:inline"> ({getShiftDurationHours(shift)} ώρες)</span>
      </p>

      {hasConflict ? <p className="mt-1 hidden font-medium text-red-700 sm:block dark:text-red-300">Ξ•Ο€ΞΉΞΊΞ¬Ξ»Ο…ΟΞ· ΞΌΞµ Ξ¬Ξ»Ξ»Ξ· Ξ²Ξ¬ΟΞ΄ΞΉΞ±</p> : null}
    </article>
  );
}

