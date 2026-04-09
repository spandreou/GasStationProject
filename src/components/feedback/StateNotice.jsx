import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';

const STATE_STYLES = {
  success:
    'border-emerald-300/70 bg-emerald-50/85 text-emerald-900 dark:border-emerald-300/45 dark:bg-emerald-500/20 dark:text-emerald-100',
  warning:
    'border-amber-300/70 bg-amber-50/80 text-amber-900 dark:border-amber-300/45 dark:bg-amber-500/20 dark:text-amber-100',
  loading:
    'border-slate-300/70 bg-white/55 text-slate-800 dark:border-cyan-300/30 dark:bg-slate-900/45 dark:text-slate-200',
  empty:
    'border-slate-300/70 bg-white/55 text-slate-700 dark:border-cyan-300/30 dark:bg-slate-900/45 dark:text-slate-300',
  error:
    'border-rose-300/70 bg-rose-50/80 text-rose-900 dark:border-rose-300/45 dark:bg-rose-500/20 dark:text-rose-100',
  info:
    'border-slate-300/70 bg-white/55 text-slate-800 dark:border-cyan-300/30 dark:bg-slate-900/45 dark:text-slate-200',
};

function StateIcon({ state }) {
  if (state === 'loading') return <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" />;
  if (state === 'success') return <CheckCircle2 size={14} className="mt-0.5 shrink-0" />;
  if (state === 'warning') return <AlertTriangle size={14} className="mt-0.5 shrink-0" />;
  if (state === 'error') return <AlertCircle size={14} className="mt-0.5 shrink-0" />;
  return <Info size={14} className="mt-0.5 shrink-0" />;
}

export default function StateNotice({
  state = 'info',
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
}) {
  return (
    <div
      className={`rounded-lg border px-3 ${compact ? 'py-2 text-xs' : 'py-3 text-sm'} ${
        STATE_STYLES[state] || STATE_STYLES.info
      }`}
      role={state === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <StateIcon state={state} />
        <div className="space-y-1">
          {title ? <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold`}>{title}</p> : null}
          {message ? <p className={compact ? 'text-[11px]' : 'text-xs'}>{message}</p> : null}
          {actionLabel && typeof onAction === 'function' ? (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex rounded-md border border-current/35 px-2 py-0.5 text-[11px] font-semibold hover:bg-white/35 dark:hover:bg-slate-900/45"
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
