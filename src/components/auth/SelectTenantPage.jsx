import { useEffect, useState } from 'react';
import { authRepository } from '../../repositories';
import { createTenantAuthTicketRedirect } from '../../firebase/authBrokerService';
import {
  getReturnToParam,
  resolveAuthorizedReturnTo,
  resolveCentralTenantDestination,
  TENANT_ACCESS_MESSAGES,
} from '../../services/tenantAccessService';
import AuthPageShell from './AuthPageShell';

const isAuthBrokerEnabled = String(import.meta.env.VITE_ENABLE_AUTH_BROKER || '').trim().toLowerCase() === 'true';

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
          const returnTo = getReturnToParam();
          if (returnTo) {
            const returnDestination = await resolveAuthorizedReturnTo({ uid: user.uid, returnTo });
            if (returnDestination.allowed && returnDestination.url) {
              setStatus('redirecting');
              setMessage('Μεταφορά στο πρατήριο...');
              if (isAuthBrokerEnabled) {
                const redirectUrl = await createTenantAuthTicketRedirect({
                  returnTo: returnDestination.url,
                  tenantId: returnDestination.access?.tenant?.id,
                });
                window.location.assign(redirectUrl);
                return;
              }

              window.location.assign(returnDestination.url);
              return;
            }
          }

          const result = await resolveCentralTenantDestination(user.uid);
          if (cancelled) return;

          if (result.type === 'redirect' && result.url) {
            setStatus('redirecting');
            setMessage('Μεταφορά στο πρατήριο...');
            if (isAuthBrokerEnabled) {
              const redirectUrl = await createTenantAuthTicketRedirect({
                returnTo: result.url,
                tenantId: result.tenant?.id,
              });
              window.location.assign(redirectUrl);
              return;
            }

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
      subtitle="Επίλεξε το πρατήριο που θέλεις να διαχειριστείς."
    >
      {status === 'checking' || status === 'redirecting' ? (
        <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-950">
          {status === 'checking' ? 'Έλεγχος διαθέσιμων πρατηρίων...' : message}
        </p>
      ) : null}

      {status === 'ready' ? (
        <div className="space-y-3">
          {tenants.map(({ tenant, membership, url }) => (
            <article
              key={tenant.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-black text-slate-950">{tenant.displayName || tenant.name || tenant.slug}</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{tenant.domain || url}</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                  {membership.status}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                  {membership.role}
                </span>
                <a
                  href={url}
                  onClick={async (event) => {
                    if (!isAuthBrokerEnabled) return;
                    event.preventDefault();
                    try {
                      setStatus('redirecting');
                      setMessage('Μεταφορά στο πρατήριο...');
                      const redirectUrl = await createTenantAuthTicketRedirect({
                        returnTo: url,
                        tenantId: tenant.id,
                      });
                      window.location.assign(redirectUrl);
                    } catch {
                      setStatus('error');
                      setMessage('Δεν ήταν δυνατή η ασφαλής μεταφορά σύνδεσης. Δοκίμασε ξανά.');
                    }
                  }}
                  className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800"
                >
                  Open Dashboard
                </a>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {status === 'no-access' || status === 'error' ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
          {message}
        </p>
      ) : null}
    </AuthPageShell>
  );
}
