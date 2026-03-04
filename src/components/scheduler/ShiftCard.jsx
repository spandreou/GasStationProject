import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { UserRound } from 'lucide-react';

export default function ShiftCard({ employee, disabled = false, showRole = true }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `employee-${employee.id}`,
    data: { type: 'employee', employee },
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      className={`w-full rounded-xl border border-white/35 bg-white/55 p-3 text-left shadow-sm backdrop-blur-sm transition dark:border-cyan-300/35 dark:bg-slate-900/45 ${
        disabled
          ? 'cursor-not-allowed opacity-70'
          : 'hover:border-brand-300 hover:bg-white/80 hover:shadow dark:hover:border-pink-300/45 dark:hover:bg-slate-800/70'
      }`}
      disabled={disabled}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: employee.color || '#1D4ED8' }}
        >
          <UserRound size={16} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-white">{employee.fullName}</p>
          {showRole ? <p className="truncate text-xs text-slate-700 dark:text-slate-300">{employee.role}</p> : null}
        </div>
      </div>
    </button>
  );
}
