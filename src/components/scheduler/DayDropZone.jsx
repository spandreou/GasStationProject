import { useDroppable } from '@dnd-kit/core';

export default function DayDropZone({ date, canManage }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-drop-${date}`,
    data: { type: 'day', day: { date } },
    disabled: !canManage,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border border-dashed px-2 py-1.5 text-center text-[11px] font-medium transition ${
        isOver && canManage
          ? 'border-cyan-400 bg-cyan-100/85 text-cyan-900 dark:border-pink-300 dark:bg-pink-500/20 dark:text-pink-100'
          : 'border-cyan-300/60 bg-cyan-50/60 text-slate-700 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-200'
      }`}
    >
      {canManage ? 'Drop custom βάρδια εδώ' : 'Custom βάρδιες (read-only)'}
    </div>
  );
}
