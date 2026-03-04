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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
            <LockKeyhole size={18} />
            Σύνδεση Διαχειριστή
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mb-3 text-sm text-slate-500">
          {isFirebaseConfigured
            ? 'Χρησιμοποίησε λογαριασμό Firebase Auth για είσοδο.'
            : 'Το Firebase Auth δεν είναι διαθέσιμο στο τρέχον περιβάλλον.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm text-slate-700">
            Email
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
              <Mail size={14} className="text-slate-500" />
              <input
                type="email"
                value={credentials.email}
                onChange={(event) => setCredentials((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="admin@email.com"
                className="w-full border-none p-0 text-sm outline-none"
                autoFocus
                required
                disabled={!isFirebaseConfigured}
              />
            </div>
          </label>

          <label className="block text-sm text-slate-700">
            Κωδικός
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
              <KeyRound size={14} className="text-slate-500" />
              <input
                type="password"
                value={credentials.password}
                onChange={(event) => setCredentials((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Κωδικός"
                className="w-full border-none p-0 text-sm outline-none"
                required
                disabled={!isFirebaseConfigured}
              />
            </div>
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isFirebaseConfigured || isSubmitting}
          >
            {isSubmitting ? 'Σύνδεση...' : 'Σύνδεση'}
          </button>
        </form>

        <button
          type="button"
          onClick={handlePasswordReset}
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!isFirebaseConfigured || !credentials.email || isSendingReset}
        >
          {isSendingReset ? 'Αποστολή email...' : 'Ξέχασα τον κωδικό'}
        </button>
      </div>
    </div>
  );
}
