import { LockKeyhole, X } from 'lucide-react';
import { useState } from 'react';

const DEFAULT_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || '';

export default function AdminLoginModal({ open, onClose, onLogin, isFirebaseConfigured }) {
  const [credentials, setCredentials] = useState({
    email: DEFAULT_EMAIL,
    password: '',
  });

  if (!open) return null;

  function handleClose() {
    setCredentials((prev) => ({ ...prev, password: '' }));
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const success = await onLogin(credentials);
    if (success) {
      setCredentials((prev) => ({ ...prev, password: '' }));
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
          <input
            type="email"
            value={credentials.email}
            onChange={(event) => setCredentials((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="admin@email.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            autoFocus
            required
            disabled={!isFirebaseConfigured}
          />

          <input
            type="password"
            value={credentials.password}
            onChange={(event) => setCredentials((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Κωδικός"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            required
            disabled={!isFirebaseConfigured}
          />

          <button
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isFirebaseConfigured}
          >
            Σύνδεση
          </button>
        </form>
      </div>
    </div>
  );
}
