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
        setMessage('Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει. Ζήτησε νέο email επαναφοράς.');
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
          setMessage('Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει. Ζήτησε νέο email επαναφοράς.');
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
      subtitle="Διάλεξε έναν νέο κωδικό για τον λογαριασμό σου."
    >
      {status === 'checking' ? (
        <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-950">
          Έλεγχος συνδέσμου...
        </p>
      ) : null}

      {status === 'invalid' || status === 'done' ? (
        <div className="space-y-3">
          <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-950">{message}</p>
          <a href="/login" className="inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800">
            Επιστροφή στη σύνδεση
          </a>
        </div>
      ) : null}

      {status === 'ready' || status === 'submitting' ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            Λογαριασμός: <span className="font-bold">{email}</span>
          </p>

          <label className="block text-sm font-black text-slate-700">
            Νέος κωδικός
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-950 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="new-password"
            />
          </label>

          <p className="text-xs font-semibold text-slate-500">
            Χρησιμοποίησε τουλάχιστον {MIN_PASSWORD_LENGTH} χαρακτήρες, ιδανικά με γράμματα, αριθμούς και σύμβολα.
          </p>

          <label className="block text-sm font-black text-slate-700">
            Επιβεβαίωση κωδικού
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-950 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-2xl bg-slate-950 px-3 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? 'Αλλαγή...' : 'Αλλαγή κωδικού'}
          </button>

          {message ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
              {message}
            </p>
          ) : null}
        </form>
      ) : null}
    </AuthPageShell>
  );
}
