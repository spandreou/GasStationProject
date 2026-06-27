import { useState } from 'react';
import { authRepository } from '../../repositories';
import AuthPageShell from './AuthPageShell';

const GENERIC_MESSAGE = 'Αν υπάρχει λογαριασμός με αυτό το email, θα σταλεί σύνδεσμος επαναφοράς.';
const MAX_EMAIL_LENGTH = 254;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    const normalizedEmail = email.trim();
    try {
      if (normalizedEmail && normalizedEmail.length <= MAX_EMAIL_LENGTH) {
        await authRepository.sendAdminPasswordResetEmail(normalizedEmail);
      }
    } catch {
      // Keep the response generic so account existence is not revealed.
    } finally {
      setMessage(GENERIC_MESSAGE);
      setIsSubmitting(false);
    }
  }

  return (
    <AuthPageShell
      title="Επαναφορά κωδικού"
      subtitle="Συμπλήρωσε το email του λογαριασμού σου και θα σταλεί ασφαλής σύνδεσμος επαναφοράς."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm font-black text-slate-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-950 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
            required
            maxLength={MAX_EMAIL_LENGTH}
            autoComplete="email"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-2xl bg-slate-950 px-3 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Αποστολή...' : 'Αποστολή συνδέσμου επαναφοράς'}
        </button>

        <a
          href="/login"
          className="block rounded-2xl border border-slate-200 px-3 py-3 text-center text-sm font-black text-slate-700 hover:border-slate-300 hover:bg-slate-50"
        >
          Back to login
        </a>

        {message ? (
          <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-950">
            {message}
          </p>
        ) : null}
      </form>
    </AuthPageShell>
  );
}
