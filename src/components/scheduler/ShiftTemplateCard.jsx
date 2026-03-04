import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Sparkles } from 'lucide-react';

export default function ShiftTemplateCard({ template, disabled = false }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `template-${template.id}`,
    data: { type: 'shift-template', template },
    disabled,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      className={`w-full rounded-xl border border-cyan-300/55 bg-cyan-100/55 p-3 text-left shadow-sm backdrop-blur-sm transition dark:border-pink-300/45 dark:bg-slate-900/55 ${
        disabled
          ? 'cursor-not-allowed opacity-70'
          : 'hover:border-cyan-400 hover:bg-cyan-100/75 dark:hover:border-pink-300/70 dark:hover:bg-slate-800/75'
      }`}
      disabled={disabled}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500 text-white dark:bg-pink-500">
          <Sparkles size={16} />
        </span>

        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-white">{template.label}</p>
          <p className="truncate text-xs text-slate-700 dark:text-slate-300">
            {template.startTime} - {template.endTime}
          </p>
        </div>
      </div>
    </button>
  );
}
