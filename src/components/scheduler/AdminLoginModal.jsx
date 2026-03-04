import { KeyRound, LockKeyhole, Mail, X } from 'lucide-react';
import { useState } from 'react';

const DEFAULT_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || '';

export default function AdminLoginModal({
  open,
  onClose,
  onLogin,
  onRequestPasswordReset,
  isFirebaseConfigured,
}) {
  const [credentials, setCredentials] = useState({
    email: DEFAULT_EMAIL,
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  if (!open) return null;

  function handleClose() {
    setCredentials((prev) => ({ ...prev, password: '' }));
    setIsSubmitting(false);
    setIsSendingReset(false);
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const success = await onLogin(credentials);
      if (success) {
        setCredentials((prev) => ({ ...prev, password: '' }));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordReset() {
    setIsSendingReset(true);
    try {
      await onRequestPasswordReset(credentials.email);
    } finally {
      setIsSendingReset(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="glass-panel w-full max-w-sm rounded-2xl p-4">
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

        <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
          {isFirebaseConfigured
            ? 'Χρησιμοποίησε λογαριασμό Firebase Auth για είσοδο.'
            : 'Το Firebase Auth δεν είναι διαθέσιμο στο τρέχον περιβάλλον.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
            Email
            <div className="input-glass mt-1 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 dark:border-cyan-300/45">
              <Mail size={14} className="text-slate-600 dark:text-slate-300" />
              <input
                type="email"
                value={credentials.email}
                onChange={(event) => setCredentials((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="admin@email.com"
                className="w-full border-none bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-700 dark:text-white dark:placeholder:text-slate-300"
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
                className="w-full border-none bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-700 dark:text-white dark:placeholder:text-slate-300"
                required
                disabled={!isFirebaseConfigured}
              />
            </div>
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isFirebaseConfigured || isSubmitting}
          >
            {isSubmitting ? 'Σύνδεση...' : 'Σύνδεση'}
          </button>
        </form>

        <button
          type="button"
          onClick={handlePasswordReset}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50/70 dark:border-cyan-300/40 dark:bg-slate-900/35 dark:text-slate-100 dark:hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isFirebaseConfigured || !credentials.email || isSendingReset}
        >
          {isSendingReset ? 'Αποστολή email...' : 'Ξέχασα τον κωδικό'}
        </button>
      </div>
    </div>
  );
}
