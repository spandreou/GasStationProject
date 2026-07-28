import { KeyRound, LockKeyhole, Mail, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function AdminLoginModal({
  open,
  onClose,
  onLogin,
  onRequestPasswordReset,
  isFirebaseConfigured,
  defaultEmail = '',
  isDemoMode = true,
}) {
  const [credentials, setCredentials] = useState({
    email: defaultEmail,
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCredentials((prev) => ({
      ...prev,
      email: prev.email || defaultEmail,
    }));
  }, [defaultEmail, open]);

  if (!open || typeof document === 'undefined') return null;

  function handleClose() {
    setCredentials((prev) => ({ ...prev, password: '' }));
    setIsSubmitting(false);
    setIsSendingReset(false);
    setSubmitError('');
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const success = await onLogin(credentials);
      if (success) {
        setCredentials((prev) => ({ ...prev, password: '' }));
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Firebase Auth Login Error:', {
          code: error?.code,
          message: error?.message,
          raw: error,
        });
      }

      if (error?.code === 'auth/network-request-failed') {
        setSubmitError(
          'Αποτυχία δικτύου. Έλεγξε internet και ότι το domain είναι στα Authorized Domains του Firebase Auth.',
        );
      } else {
        setSubmitError('Τα στοιχεία σύνδεσης δεν είναι σωστά ή ο λογαριασμός δεν είναι διαθέσιμος.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    setIsSendingReset(true);
    setSubmitError('');
    try {
      await onRequestPasswordReset(credentials.email);
    } catch {
      // Keep response generic
    } finally {
      setSubmitError('Αν υπάρχει λογαριασμός με αυτό το email, θα σταλεί σύνδεσμος επαναφοράς.');
      setIsSendingReset(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center">
      <div className="glass-panel w-full max-h-[85vh] max-w-sm overflow-y-auto rounded-t-2xl p-4 sm:rounded-2xl">
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-300/70 sm:hidden dark:bg-slate-700/70" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
            <LockKeyhole size={18} />
            Σύνδεση Διαχειριστή
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 rounded-lg border border-cyan-300/45 bg-cyan-50/60 px-3 py-2 text-xs text-cyan-900 dark:border-cyan-300/35 dark:bg-cyan-500/10 dark:text-cyan-100">
          {isDemoMode ? 'Demo Tenant Login' : 'Tenant Admin Login'}
        </div>

        <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
          {isFirebaseConfigured
            ? isDemoMode
              ? 'Σύνδεση με Firebase Auth. Η πρόσβαση διαχειριστή δίνεται μόνο με ενεργό tenant membership.'
              : 'Σύνδεση με Firebase Auth. Η πρόσβαση διαχειριστή δίνεται μόνο με ενεργό tenant membership.'
            : 'Το Firebase Auth δεν είναι διαθέσιμο στο τρέχον περιβάλλον.'}
        </p>
        {isDemoMode ? (
          <p className="mb-3 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs text-slate-700 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-300">
            Δεν υπάρχουν fallback credentials. Ο χρήστης πρέπει να υπάρχει στο Firebase Auth και να έχει ACTIVE membership στο tenant.
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
            Email
            <div className="input-glass mt-1 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 dark:border-cyan-300/45">
              <Mail size={14} className="text-slate-600 dark:text-slate-300" />
              <input
                type="email"
                value={credentials.email}
                onChange={(event) => setCredentials((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="admin email"
                className="w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-500 dark:text-white dark:placeholder:text-slate-400"
                autoFocus
                required
                disabled={!isFirebaseConfigured}
              />
            </div>
          </label>

          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
            Κωδικός
            <div className="input-glass mt-1 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 dark:border-cyan-300/45">
              <KeyRound size={14} className="text-slate-600 dark:text-slate-300" />
              <input
                type="password"
                value={credentials.password}
                onChange={(event) => setCredentials((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Κωδικός"
                className="w-full border-none bg-transparent p-0 text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-500 dark:text-white dark:placeholder:text-slate-400"
                required
                disabled={!isFirebaseConfigured}
              />
            </div>
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400"
            disabled={!isFirebaseConfigured || isSubmitting}
          >
            {isSubmitting ? 'Σύνδεση...' : 'Σύνδεση'}
          </button>

          {submitError ? (
            <p className="rounded-lg border border-red-300/70 bg-red-50/70 px-3 py-2 text-xs text-red-700 dark:border-red-300/50 dark:bg-red-500/15 dark:text-red-200">
              {submitError}
            </p>
          ) : null}
        </form>

        <button
          type="button"
          onClick={handlePasswordReset}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50/70 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-300/40 dark:bg-slate-900/35 dark:text-slate-100 dark:hover:bg-slate-800/60"
          disabled={!isFirebaseConfigured || !credentials.email || isSendingReset}
        >
          {isSendingReset ? 'Αποστολή email...' : 'Ξέχασα τον κωδικό'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
