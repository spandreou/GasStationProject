import { useEffect, useMemo, useState } from 'react';
import { authRepository } from '../../repositories';
import AuthPageShell from './AuthPageShell';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

function getResetCode() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get('oobCode') || '';
}

export default function ResetPasswordPage() {
  const oobCode = useMemo(getResetCode, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function verifyCode() {
      if (!oobCode) {
        setStatus('invalid');
        setMessage('Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει.');
        return;
      }

      try {
        const resetEmail = await authRepository.verifyAdminPasswordResetCode(oobCode);
        if (!cancelled) {
          setEmail(resetEmail);
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setStatus('invalid');
          setMessage('Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει.');
        }
      }
    }

    verifyCode();
    return () => {
      cancelled = true;
    };
  }, [oobCode]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(`Ο νέος κωδικός πρέπει να έχει τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες.`);
      return;
    }

    if (password.length > MAX_PASSWORD_LENGTH) {
      setMessage(`Ο νέος κωδικός πρέπει να έχει έως ${MAX_PASSWORD_LENGTH} χαρακτήρες.`);
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Οι κωδικοί δεν ταιριάζουν.');
      return;
    }

    setStatus('submitting');
    try {
      await authRepository.confirmAdminPasswordReset({ oobCode, newPassword: password });
      setPassword('');
      setConfirmPassword('');
      setStatus('done');
      setMessage('Ο κωδικός άλλαξε επιτυχώς. Μεταφορά στη σύνδεση...');
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/login');
        window.setTimeout(() => {
          window.location.assign('/login');
        }, 900);
      }
    } catch {
      setStatus('ready');
      setMessage('Δεν ήταν δυνατή η αλλαγή κωδικού. Ζήτησε νέο σύνδεσμο επαναφοράς.');
    }
  }

  return (
    <AuthPageShell
      title="Νέος κωδικός"
      subtitle="Ο σύνδεσμος επαναφοράς ελέγχεται από το Firebase Auth."
    >
      {status === 'checking' ? (
        <p className="rounded-lg border border-cyan-300/35 bg-slate-950/35 px-3 py-2 text-sm">
          Έλεγχος συνδέσμου...
        </p>
      ) : null}

      {status === 'invalid' || status === 'done' ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-cyan-300/35 bg-slate-950/35 px-3 py-2 text-sm">{message}</p>
          <a href="/login" className="inline-flex rounded-lg bg-brand-500 px-3 py-2 text-sm font-bold text-white hover:bg-brand-600">
            Επιστροφή στη σύνδεση
          </a>
        </div>
      ) : null}

      {status === 'ready' || status === 'submitting' ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="rounded-lg border border-cyan-300/25 bg-slate-950/25 px-3 py-2 text-xs">
            Λογαριασμός: <span className="font-bold">{email}</span>
          </p>

          <label className="block text-sm font-bold">
            Νέος κωδικός
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-cyan-300/45 bg-slate-950/75 px-3 py-2 text-white outline-none"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="new-password"
            />
          </label>

          <label className="block text-sm font-bold">
            Επιβεβαίωση κωδικού
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-cyan-300/45 bg-slate-950/75 px-3 py-2 text-white outline-none"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60"
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? 'Αλλαγή...' : 'Αλλαγή κωδικού'}
          </button>

          {message ? (
            <p className="rounded-lg border border-amber-300/45 bg-amber-50/70 px-3 py-2 text-xs text-amber-950 dark:bg-amber-500/10 dark:text-amber-50">
              {message}
            </p>
          ) : null}
        </form>
      ) : null}
    </AuthPageShell>
  );
}
