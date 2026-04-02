import { Pencil, X } from 'lucide-react';
import { getShiftDurationHours, getShiftTypeLabel, SHIFT_TYPES } from '../../utils/analytics';
import { getDurationLabel, getShiftTypeLabel as getScheduleShiftTypeLabel } from '../../utils/scheduleUtils';

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

export default function AssignedShiftItem({
  shift,
  employee,
  hasConflict,
  onDelete,
  onEdit,
  onToggleManualOverride,
  canManage = true,
}) {
  const type = shift.type || SHIFT_TYPES.WORK;
  const isWork = type === SHIFT_TYPES.WORK;
  const typeClass = getTypeClass(type);
  const scheduleShiftLabel = getScheduleShiftTypeLabel(shift.shiftType || 'custom');
  const customLabel = shift.shiftType === 'custom' ? shift.customLabel || shift.label : '';
  const canEdit = canManage && typeof onEdit === 'function';
  const canDelete = canManage && typeof onDelete === 'function';
  const canToggleManual = canManage && typeof onToggleManualOverride === 'function';
  const hasActions = canEdit || canDelete;

  return (
    <article
      className={`relative rounded-lg border p-1.5 text-[10px] sm:p-2 sm:text-xs shadow-sm backdrop-blur-sm ${
        typeClass ||
        (hasConflict
          ? 'border-red-400 bg-red-100/80 dark:border-red-300/60 dark:bg-red-500/20'
          : 'border-white/35 bg-white/55 dark:border-cyan-300/30 dark:bg-slate-900/45')
      }`}
    >
      {hasActions ? (
        <div className="absolute right-1 top-1 flex items-center gap-1">
          {canEdit ? (
            <button
              type="button"
              onClick={() => onEdit?.(shift)}
              className="rounded p-1 text-slate-500 hover:bg-sky-100 hover:text-sky-700 dark:text-slate-300 dark:hover:bg-sky-500/30 dark:hover:text-sky-200"
              title="Επεξεργασία βάρδιας"
              aria-label="Επεξεργασία βάρδιας"
            >
              <Pencil size={14} />
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              onClick={() => onDelete?.(shift.id)}
              className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-600 dark:text-slate-300 dark:hover:bg-red-500/30 dark:hover:text-red-200"
              title="Αφαίρεση βάρδιας"
              aria-label="Αφαίρεση βάρδιας"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pr-10">
        <p className="font-semibold text-slate-900 dark:text-white">{employee?.fullName || 'Άγνωστος'}</p>
      </div>

      {shift.isManualOverride ? (
        <div className="mt-1 flex items-center gap-2">
          <span className="inline-flex rounded-full border border-fuchsia-300/70 bg-fuchsia-100/80 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-900 dark:border-fuchsia-300/40 dark:bg-fuchsia-500/20 dark:text-fuchsia-100">
            Manual Override
          </span>
          {canToggleManual ? (
            <button
              type="button"
              onClick={() => onToggleManualOverride?.(shift.id, false)}
              className="rounded border border-slate-300/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-white/70 dark:border-cyan-300/35 dark:text-slate-200 dark:hover:bg-slate-800/60"
            >
              Καθαρισμός
            </button>
          ) : null}
        </div>
      ) : canToggleManual ? (
        <button
          type="button"
          onClick={() => onToggleManualOverride?.(shift.id, true)}
          className="mt-1 rounded border border-slate-300/70 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-white/70 dark:border-cyan-300/35 dark:text-slate-200 dark:hover:bg-slate-800/60"
        >
          Mark Manual
        </button>
      ) : null}

      <p className="text-slate-700 dark:text-slate-200">{getShiftTypeLabel(type)}</p>
      {isWork ? (
        <p className="text-slate-700 dark:text-slate-200">
          {scheduleShiftLabel}
          {customLabel ? ` • ${customLabel}` : ''}
        </p>
      ) : null}
      <p className="text-slate-700 dark:text-slate-200">
        {shift.startTime} - {shift.endTime}
        {isWork ? (
          <span className="hidden sm:inline"> ({getDurationLabel(shift.startTime, shift.endTime)} | {getShiftDurationHours(shift)} ώρες)</span>
        ) : (
          <span className="hidden sm:inline"> (1 ημέρα)</span>
        )}
      </p>

      {shift.notes ? <p className="mt-1 text-slate-700/90 dark:text-slate-300/90">Σημείωση: {shift.notes}</p> : null}
      {shift.isHoliday || shift.isSpecialDay ? (
        <p className="mt-1 inline-flex rounded-full border border-amber-300/70 bg-amber-100/80 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:border-amber-300/40 dark:bg-amber-500/20 dark:text-amber-100">
          {shift.specialDayLabel?.trim()
            ? `Ειδικό Ωράριο: ${shift.specialDayLabel}`
            : shift.isHoliday
              ? 'Αργία'
              : 'Ειδικό Ωράριο'}
        </p>
      ) : null}

      {hasConflict && isWork ? (
        <p className="mt-1 hidden font-medium text-red-700 sm:block dark:text-red-300">Επικάλυψη με άλλη βάρδια</p>
      ) : null}
    </article>
  );
}
