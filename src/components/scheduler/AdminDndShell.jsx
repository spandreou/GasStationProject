import { DndContext, DragOverlay, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';

export default function AdminDndShell({ children, onDragStart, onDragEnd, activeDragItem }) {
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      {children}
      <DragOverlay>
        {activeDragItem ? (
          <div className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-lg dark:border dark:border-cyan-300/35">
            {activeDragItem.label}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
