import { useMemo, useState } from 'react';
import { authRepository } from '../../repositories';
import { createTenantAuthTicketRedirect } from '../../firebase/authBrokerService';
import {
  getReturnToParam,
  resolveAuthorizedReturnTo,
  resolveCentralTenantDestination,
} from '../../services/tenantAccessService';
import { getCurrentTenantHostContext } from '../../utils/tenantHostContext';
import { determinePostLoginDestination } from '../../utils/portalHelpers';
import AuthPageShell from './AuthPageShell';

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
const isAuthBrokerEnabled = String(import.meta.env.VITE_ENABLE_AUTH_BROKER || '').trim().toLowerCase() === 'true';

function getSafeLoginError() {
  return 'Τα στοιχεία σύνδεσης δεν είναι σωστά ή ο λογαριασμός δεν είναι διαθέσιμος.';
}

export default function LoginPage() {
  const hostContext = useMemo(getCurrentTenantHostContext, []);
  const returnTo = useMemo(getReturnToParam, []);
  const [email, setEmail] = useState(authRepository.getConfiguredAdminEmail?.() || '');
  const [password, setPassword] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const isConfigured = authRepository.isPersistenceConfigured?.() ?? true;
  const modeLabel = authRepository.getAuthModeLabel?.() || 'Admin Mode';

  async function routeAfterLogin(user) {
    if (hostContext.mode !== 'central') {
      window.location.assign('/app');
      return;
    }

    let isPlatformAdmin = false;
    try {
      isPlatformAdmin = await authRepository.isPlatformAdmin(user.uid);
    } catch {
      // Fail-closed/safe: continue normal tenant resolution
    }

    let authorizedReturnTo = null;
    if (returnTo) {
      authorizedReturnTo = await resolveAuthorizedReturnTo({ uid: user.uid, returnTo });
    }

    const centralDestination = await resolveCentralTenantDestination(user.uid);

    const decision = determinePostLoginDestination({
      isPlatformAdmin,
      authorizedReturnTo,
      centralDestination,
    });

    if (decision.type === 'admin') {
      window.location.assign(decision.url);
      return;
    }

    if (decision.type === 'authorizedReturnTo') {
      if (isAuthBrokerEnabled && hostContext.mode === 'central') {
        const redirectUrl = await createTenantAuthTicketRedirect({
          returnTo: decision.url,
          tenantId: decision.tenantId,
        });
        window.location.assign(redirectUrl);
        return;
      }
      window.location.assign(decision.url);
      return;
    }

    if (decision.type === 'tenant') {
      if (isAuthBrokerEnabled && hostContext.mode === 'central') {
        const redirectUrl = await createTenantAuthTicketRedirect({
          returnTo: decision.url,
          tenantId: decision.tenantId,
        });
        window.location.assign(redirectUrl);
        return;
      }
      window.location.assign(decision.url);
      return;
    }

    if (decision.type === 'select') {
      const selectUrl = new URL('/select-tenant', window.location.origin);
      if (returnTo) selectUrl.searchParams.set('returnTo', returnTo);
      window.location.assign(selectUrl.toString());
      return;
    }

    // Zero memberships -> guidance on /stores
    window.location.assign(decision.url);
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
      const user = await authRepository.signInAdmin({
        email: normalizedEmail,
        password,
        rememberDevice,
      });
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
      title="Sign in"
      subtitle="ShiftOryx Central Authentication Portal"
      footerText="Έχετε Registration Token;"
      footerLinkText="Εγγραφή & Ενεργοποίηση"
      footerLinkHref="/register"
    >
      <div className="mb-4 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-900">
        {modeLabel}
      </div>

      {!isConfigured ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Το Firebase Auth δεν είναι διαθέσιμο στο τρέχον περιβάλλον.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
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

          <label className="block text-sm font-black text-slate-700">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-950 outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100"
              required
              maxLength={MAX_PASSWORD_LENGTH}
              autoComplete="current-password"
            />
          </label>

          <div className="flex items-center justify-between gap-3 text-sm">
            <label className="inline-flex items-center gap-2 font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(event) => setRememberDevice(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-cyan-600"
              />
              Remember this device
            </label>
            <a href="/forgot-password" className="font-black text-cyan-700 hover:text-cyan-800">
              Forgot Password
            </a>
          </div>

          <button
            type="submit"
            className="w-full rounded-2xl bg-slate-950 px-3 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
            disabled={status === 'submitting' || status === 'redirecting'}
          >
            {status === 'submitting' ? 'Signing in...' : 'Sign In'}
          </button>

          <a
            href="mailto:support@homelabshare.gr?subject=ShiftOryx%20Support"
            className="block rounded-2xl border border-slate-200 px-3 py-3 text-center text-sm font-black text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >
            Contact Support
          </a>

          {message ? (
            <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-950">
              {message}
            </p>
          ) : null}
        </form>
      )}
    </AuthPageShell>
  );
}
