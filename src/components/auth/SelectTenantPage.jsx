import { useEffect, useState } from 'react';
import { authRepository } from '../../repositories';
import {
  resolveCentralTenantDestination,
  TENANT_ACCESS_MESSAGES,
} from '../../services/tenantAccessService';
import AuthPageShell from './AuthPageShell';

export default function SelectTenantPage() {
  const [status, setStatus] = useState('checking');
  const [message, setMessage] = useState('');
  const [tenants, setTenants] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = authRepository.subscribeAuth(
      async (user) => {
        if (!user) {
          if (!cancelled) {
            setStatus('no-access');
            setMessage(TENANT_ACCESS_MESSAGES.noAccess);
          }
          return;
        }

        try {
          const result = await resolveCentralTenantDestination(user.uid);
          if (cancelled) return;

          if (result.type === 'redirect' && result.url) {
            setStatus('redirecting');
            setMessage('Μεταφορά στο πρατήριο...');
            window.location.assign(result.url);
            return;
          }

          if (result.type === 'select') {
            setTenants(result.tenants);
            setStatus('ready');
            return;
          }

          setStatus('no-access');
          setMessage(result.message || TENANT_ACCESS_MESSAGES.noAccess);
        } catch {
          if (!cancelled) {
            setStatus('error');
            setMessage('Δεν ήταν δυνατή η φόρτωση των πρατηρίων. Δοκίμασε ξανά αργότερα.');
          }
        }
      },
      () => {
        if (!cancelled) {
          setStatus('error');
          setMessage('Δεν ήταν δυνατή η επιβεβαίωση σύνδεσης.');
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return (
    <AuthPageShell
      title="Επιλογή πρατηρίου"
      subtitle="Η πρόσβαση βασίζεται στο Firebase uid και σε ενεργές tenant memberships."
    >
      {status === 'checking' || status === 'redirecting' ? (
        <p className="rounded-lg border border-cyan-300/35 bg-slate-950/35 px-3 py-2 text-sm">
          {status === 'checking' ? 'Έλεγχος διαθέσιμων πρατηρίων...' : message}
        </p>
      ) : null}

      {status === 'ready' ? (
        <div className="space-y-2">
          {tenants.map(({ tenant, url }) => (
            <a
              key={tenant.id}
              href={url}
              className="block rounded-lg border border-cyan-300/35 bg-slate-950/55 px-3 py-2 text-sm font-bold text-white hover:border-cyan-200"
            >
              {tenant.displayName || tenant.name || tenant.slug}
            </a>
          ))}
        </div>
      ) : null}

      {status === 'no-access' || status === 'error' ? (
        <p className="rounded-lg border border-amber-300/45 bg-amber-50/70 px-3 py-2 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-50">
          {message}
        </p>
      ) : null}
    </AuthPageShell>
  );
}
