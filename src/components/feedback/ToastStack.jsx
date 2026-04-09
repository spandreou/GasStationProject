import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect } from 'react';

const TOAST_STYLES = {
  success:
    'border-emerald-300/70 bg-emerald-50/95 text-emerald-900 dark:border-emerald-300/45 dark:bg-emerald-500/20 dark:text-emerald-100',
  error:
    'border-rose-300/70 bg-rose-50/95 text-rose-900 dark:border-rose-300/45 dark:bg-rose-500/20 dark:text-rose-100',
  warning:
    'border-amber-300/70 bg-amber-50/95 text-amber-900 dark:border-amber-300/45 dark:bg-amber-500/20 dark:text-amber-100',
  info:
    'border-slate-400/75 bg-slate-100/96 text-slate-950 ring-1 ring-slate-300/60 dark:border-cyan-300/45 dark:bg-slate-900/92 dark:text-slate-50 dark:ring-cyan-300/20',
};

function ToastIcon({ type }) {
  if (type === 'success') return <CheckCircle2 size={16} className="shrink-0" />;
  if (type === 'error') return <AlertCircle size={16} className="shrink-0" />;
  if (type === 'warning') return <AlertTriangle size={16} className="shrink-0" />;
  return <Info size={16} className="shrink-0" />;
}

function ToastItem({ toast, onDismiss }) {
  const isInfoToast = (toast.type || 'info') === 'info';

  useEffect(() => {
    if (!Number.isFinite(toast.duration) || toast.duration <= 0) return undefined;
    const timeoutId = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timeoutId);
  }, [toast, onDismiss]);

  return (
    <article
      className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur-md ${
        TOAST_STYLES[toast.type] || TOAST_STYLES.info
      }`}
      role="status"
      aria-live="polite"
    >
      <ToastIcon type={toast.type} />
      <div className="min-w-0 flex-1">
        {toast.title ? (
          <p className={`text-xs font-semibold ${isInfoToast ? 'text-slate-950 dark:text-slate-50' : ''}`}>{toast.title}</p>
        ) : null}
        <p className={`text-xs leading-relaxed ${isInfoToast ? 'text-slate-900/95 dark:text-slate-100/95' : ''}`}>
          {toast.message}
        </p>
        {toast.actionLabel && typeof toast.onAction === 'function' ? (
          <button
            type="button"
            onClick={toast.onAction}
            className={`mt-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
              isInfoToast
                ? 'border-slate-500/45 text-slate-900 hover:bg-slate-200/75 dark:border-slate-300/35 dark:text-slate-100 dark:hover:bg-slate-800/65'
                : 'border-current/35 hover:bg-white/35 dark:hover:bg-slate-900/45'
            }`}
          >
            {toast.actionLabel}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className={`rounded p-1 transition ${
          isInfoToast
            ? 'text-slate-900/85 hover:bg-slate-200/75 hover:text-slate-950 dark:text-slate-100/85 dark:hover:bg-slate-800/65 dark:hover:text-slate-50'
            : 'text-current/70 hover:bg-white/35 hover:text-current dark:hover:bg-slate-900/45'
        }`}
        aria-label="Close notification"
      >
        <X size={13} />
      </button>
    </article>
  );
}

export default function ToastStack({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[120] flex w-[min(360px,calc(100vw-1.5rem))] flex-col gap-2 sm:right-4 sm:top-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
