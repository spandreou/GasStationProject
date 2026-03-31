import { RotateCcw, X } from 'lucide-react';

export default function UndoSnackbar({ undoState, onUndo, onDismiss, isAdmin }) {
  if (!undoState?.visible) return null;

  return (
    <div className="glass-panel fixed bottom-4 left-1/2 z-50 w-[95%] max-w-xl -translate-x-1/2 rounded-xl p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-800 dark:text-slate-100">{undoState.message}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onUndo}
            disabled={!isAdmin}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm hover:bg-slate-700 dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Αναίρεση
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            title="Κλείσιμο"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
