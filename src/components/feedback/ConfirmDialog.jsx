import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useEffect } from 'react';

const TONE_STYLES = {
  danger:
    'border-rose-300/70 bg-rose-50/95 text-rose-900 dark:border-rose-300/45 dark:bg-rose-500/20 dark:text-rose-100',
  warning:
    'border-amber-300/70 bg-amber-50/95 text-amber-900 dark:border-amber-300/45 dark:bg-amber-500/20 dark:text-amber-100',
  info:
    'border-slate-300/70 bg-white/95 text-slate-900 dark:border-cyan-300/35 dark:bg-slate-900/85 dark:text-slate-100',
};

const CONFIRM_BUTTON_STYLES = {
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  warning: 'bg-amber-600 text-white hover:bg-amber-700',
  info: 'bg-brand-500 text-white hover:bg-brand-600',
};

export default function ConfirmDialog({
  open,
  title,
  message,
  details,
  confirmLabel = 'Επιβεβαίωση',
  cancelLabel = 'Ακύρωση',
  tone = 'danger',
  isConfirming = false,
  onClose,
  onConfirm,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== 'Escape' && event.key !== 'Esc') return;
      event.preventDefault();
      if (!isConfirming) onClose?.();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isConfirming, onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label="Κλείσιμο" onClick={onClose} />
      <section
        className={`relative w-full max-w-md rounded-2xl border p-4 shadow-2xl backdrop-blur-md ${
          TONE_STYLES[tone] || TONE_STYLES.info
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-current/70 transition hover:bg-white/35 hover:text-current dark:hover:bg-slate-900/45"
          aria-label="Κλείσιμο διαλόγου"
        >
          <X size={14} />
        </button>

        <div className="mb-3 flex items-start gap-2 pr-7">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-bold">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed">{message}</p>
          </div>
        </div>

        {details ? <p className="mb-3 text-[11px] opacity-95">{details}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-current/35 px-3 py-1.5 text-xs font-semibold hover:bg-white/35 dark:hover:bg-slate-900/45"
            disabled={isConfirming}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              CONFIRM_BUTTON_STYLES[tone] || CONFIRM_BUTTON_STYLES.info
            }`}
            disabled={isConfirming}
          >
            {isConfirming ? <Loader2 size={13} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
