import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useEffect } from 'react';

const TOAST_STYLES = {
  success:
    'border-emerald-300 bg-emerald-50 text-emerald-950 shadow-emerald-950/10 dark:border-emerald-300/65 dark:bg-emerald-950 dark:text-emerald-50 dark:shadow-black/35',
  error:
    'border-rose-300 bg-rose-50 text-rose-950 shadow-rose-950/10 dark:border-rose-300/65 dark:bg-rose-950 dark:text-rose-50 dark:shadow-black/35',
  warning:
    'border-amber-300 bg-amber-50 text-amber-950 shadow-amber-950/10 dark:border-amber-300/70 dark:bg-amber-950 dark:text-amber-50 dark:shadow-black/35',
  info:
    'border-slate-300 bg-slate-50 text-slate-950 shadow-slate-950/10 dark:border-cyan-300/60 dark:bg-slate-950 dark:text-slate-50 dark:shadow-black/35',
};

const ICON_STYLES = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200',
  error: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-100',
  info: 'bg-slate-200 text-slate-700 dark:bg-cyan-400/15 dark:text-cyan-100',
};

function ToastIcon({ type }) {
  const iconType = type || 'info';
  const className = `mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ICON_STYLES[iconType] || ICON_STYLES.info}`;
  if (type === 'success') return <CheckCircle2 size={18} className={className} />;
  if (type === 'error') return <AlertCircle size={18} className={className} />;
  if (type === 'warning') return <AlertTriangle size={18} className={className} />;
  return <Info size={18} className={className} />;
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
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3.5 shadow-2xl ring-1 ring-white/20 ${
        TOAST_STYLES[toast.type] || TOAST_STYLES.info
      }`}
      role="status"
      aria-live="polite"
    >
      <ToastIcon type={toast.type} />
      <div className="min-w-0 flex-1">
        {toast.title ? (
          <p className={`text-sm font-bold leading-5 ${isInfoToast ? 'text-slate-950 dark:text-slate-50' : ''}`}>{toast.title}</p>
        ) : null}
        <p className={`mt-0.5 max-h-48 overflow-y-auto whitespace-pre-line break-words pr-1 text-[13px] font-medium leading-5 ${isInfoToast ? 'text-slate-900/95 dark:text-slate-100/95' : ''}`}>
          {toast.message}
        </p>
        {toast.actionLabel && typeof toast.onAction === 'function' ? (
          <button
            type="button"
            onClick={toast.onAction}
            className={`mt-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
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
        className={`rounded-lg p-1.5 transition ${
          isInfoToast
            ? 'text-slate-900/85 hover:bg-slate-200/75 hover:text-slate-950 dark:text-slate-100/85 dark:hover:bg-slate-800/65 dark:hover:text-slate-50'
            : 'text-current/70 hover:bg-white/35 hover:text-current dark:hover:bg-slate-900/45'
        }`}
        aria-label="Close notification"
      >
        <X size={16} />
      </button>
    </article>
  );
}

export default function ToastStack({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[min(520px,calc(100vw-2rem))] flex-col gap-3 sm:right-6 sm:top-6">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
