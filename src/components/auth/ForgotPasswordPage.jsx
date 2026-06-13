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
      subtitle="Συμπλήρωσε το email του λογαριασμού διαχειριστή."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm font-bold">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-cyan-300/45 bg-slate-950/75 px-3 py-2 text-white outline-none"
            required
            maxLength={MAX_EMAIL_LENGTH}
            autoComplete="email"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Αποστολή...' : 'Αποστολή συνδέσμου επαναφοράς'}
        </button>

        {message ? (
          <p className="rounded-lg border border-cyan-300/35 bg-cyan-50/70 px-3 py-2 text-xs text-cyan-950 dark:bg-cyan-500/10 dark:text-cyan-50">
            {message}
          </p>
        ) : null}
      </form>
    </AuthPageShell>
  );
}
