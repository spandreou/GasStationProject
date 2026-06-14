import { useMemo, useState } from 'react';
import { authRepository } from '../../repositories';
import {
  resolveCentralTenantDestination,
  TENANT_ACCESS_MESSAGES,
} from '../../services/tenantAccessService';
import { getCurrentTenantHostContext } from '../../utils/tenantHostContext';
import AuthPageShell from './AuthPageShell';

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;

function getSafeLoginError() {
  return 'Δεν ήταν δυνατή η σύνδεση. Έλεγξε τα στοιχεία και δοκίμασε ξανά.';
}

export default function LoginPage() {
  const hostContext = useMemo(getCurrentTenantHostContext, []);
  const [email, setEmail] = useState(authRepository.getConfiguredAdminEmail?.() || '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const isConfigured = authRepository.isPersistenceConfigured?.() ?? true;
  const modeLabel = authRepository.getAuthModeLabel?.() || 'Admin Mode';

  async function routeAfterLogin(user) {
    if (hostContext.mode !== 'central') {
      window.location.assign('/app');
      return;
    }

    const destination = await resolveCentralTenantDestination(user.uid);
    if (destination.type === 'redirect' && destination.url) {
      window.location.assign(destination.url);
      return;
    }

    if (destination.type === 'select') {
      window.location.assign('/select-tenant');
      return;
    }

    setStatus('error');
    setMessage(destination.message || TENANT_ACCESS_MESSAGES.noAccess);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');

    const normalizedEmail = email.trim();
    if (!normalizedEmail || normalizedEmail.length > MAX_EMAIL_LENGTH) {
      setStatus('error');
      setMessage(getSafeLoginError());
      return;
    }

    if (!password || password.length > MAX_PASSWORD_LENGTH) {
      setStatus('error');
      setMessage(getSafeLoginError());
      return;
    }

    setStatus('submitting');
    try {
      const user = await authRepository.signInAdmin({ email: normalizedEmail, password });
      setPassword('');
      setStatus('redirecting');
      setMessage('Η σύνδεση ολοκληρώθηκε. Μεταφορά...');
      await routeAfterLogin(user);
    } catch {
      setStatus('error');
      setMessage(getSafeLoginError());
    }
  }

  return (
    <AuthPageShell
      title="Σύνδεση Διαχειριστή"
      subtitle="Σύνδεση με Firebase Auth λογαριασμό διαχειριστή."
    >
      <div className="mb-3 rounded-lg border border-cyan-300/45 bg-cyan-50/70 px-3 py-2 text-xs text-cyan-950 dark:bg-cyan-500/10 dark:text-cyan-50">
        {modeLabel}
      </div>

      {!isConfigured ? (
        <p className="rounded-lg border border-amber-300/45 bg-amber-50/70 px-3 py-2 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-50">
          Το Firebase Auth δεν είναι διαθέσιμο στο τρέχον περιβάλλον.
        </p>
      ) : (
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

          <label className="block text-sm font-bold">
            Κωδικός
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-cyan-300/45 bg-slate-950/75 px-3 py-2 text-white outline-none"
              required
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="current-password"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-60"
            disabled={status === 'submitting' || status === 'redirecting'}
          >
            {status === 'submitting' ? 'Σύνδεση...' : 'Σύνδεση'}
          </button>

          <a
            href="/forgot-password"
            className="block rounded-lg border border-cyan-300/35 px-3 py-2 text-center text-sm font-bold text-cyan-100 hover:bg-cyan-500/10"
          >
            Ξέχασα τον κωδικό
          </a>

          {message ? (
            <p className="rounded-lg border border-cyan-300/35 bg-slate-950/35 px-3 py-2 text-xs">
              {message}
            </p>
          ) : null}
        </form>
      )}
    </AuthPageShell>
  );
}
