import { RotateCcw, X } from 'lucide-react';

export default function UndoSnackbar({ undoState, onUndo, onDismiss, isAdmin }) {
  if (!undoState?.visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[95%] max-w-xl -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-700">{undoState.message}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={!isAdmin}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Αναίρεση
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            title="Κλείσιμο"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
