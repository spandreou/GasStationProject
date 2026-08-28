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
  const [searchTerm, setSearchTerm] = useState('');
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = authRepository.subscribeAuth(
      async (user) => {
        if (!user) {
          if (!cancelled) {
            setStatus('no-access');
            setMessage('Δεν είστε συνδεδεμένοι. Συνδεθείτε ή δημιουργήστε νέο κατάστημα.');
          }
          return;
        }

        try {
          // Check if platform admin
          const isAdmin = await authRepository.isPlatformAdmin?.(user.uid);
          if (!cancelled && isAdmin) {
            setIsPlatformAdmin(true);
          }

          const returnTo = getReturnToParam();
          if (returnTo) {
            const returnDestination = await resolveAuthorizedReturnTo({ uid: user.uid, returnTo });
            if (returnDestination.allowed && returnDestination.url) {
              setStatus('redirecting');
              setMessage('Μεταφορά στο κατάστημα...');
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
            setMessage('Μεταφορά στο κατάστημα...');
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
            setMessage('Δεν ήταν δυνατή η φόρτωση των καταστημάτων. Δοκιμάστε ξανά αργότερα.');
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

  const filteredTenants = tenants.filter(({ tenant }) => {
    const name = String(tenant.displayName || tenant.name || tenant.slug || '').toLowerCase();
    const query = searchTerm.toLowerCase().trim();
    return !query || name.includes(query);
  });

  return (
    <AuthPageShell
      title="Τα Καταστήματά σας"
      subtitle="ShiftOryx Stores Directory & Tenant Selector"
      footerText="Χρειάζεστε νέο κατάστημα;"
      footerLinkText="Εγγραφή με Token"
      footerLinkHref="/register"
    >
      {/* Loading / Redirecting status */}
      {(status === 'checking' || status === 'redirecting') && (
        <div className="py-6 text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-400" />
          <p className="text-xs font-medium text-slate-300">
            {status === 'checking' ? 'Έλεγχος διαθέσιμων καταστημάτων...' : message}
          </p>
        </div>
      )}

      {/* Platform Admin Notification Banner */}
      {isPlatformAdmin && (
        <div className="mb-4 rounded-xl border border-purple-500/30 bg-purple-950/30 p-3 text-xs text-purple-200 flex items-center justify-between">
          <span>Έχετε ρόλο Platform Administrator.</span>
          <a
            href="/admin-console"
            className="rounded-lg bg-purple-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-purple-500"
          >
            Admin Console →
          </a>
        </div>
      )}

      {/* Ready with Stores */}
      {status === 'ready' && (
        <div className="space-y-4">
          {tenants.length > 2 && (
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Αναζήτηση καταστήματος..."
              className="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          )}

          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
            {filteredTenants.map(({ tenant, membership, url }) => (
              <article
                key={tenant.id}
                className="group relative rounded-xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-cyan-500/50 hover:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-100 group-hover:text-cyan-300">
                      {tenant.displayName || tenant.name || tenant.slug}
                    </h2>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                      {tenant.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300 border border-cyan-500/20">
                      {membership.role}
                    </span>
                    <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 border border-emerald-500/20">
                      {membership.status}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/60">
                  <span className="text-[11px] text-slate-400">
                    Κατηγορία: <span className="text-slate-200">{tenant.businessCategory || 'OTHER'}</span>
                  </span>
                  <a
                    href={url}
                    onClick={async (event) => {
                      if (!isAuthBrokerEnabled) return;
                      event.preventDefault();
                      try {
                        setStatus('redirecting');
                        setMessage('Μεταφορά στο κατάστημα...');
                        const redirectUrl = await createTenantAuthTicketRedirect({
                          returnTo: url,
                          tenantId: tenant.id,
                        });
                        window.location.assign(redirectUrl);
                      } catch {
                        setStatus('error');
                        setMessage('Δεν ήταν δυνατή η ασφαλής μεταφορά σύνδεσης. Δοκιμάστε ξανά.');
                      }
                    }}
                    className="rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-cyan-950/40 hover:from-cyan-400 hover:to-blue-500"
                  >
                    Είσοδος →
                  </a>
                </div>
              </article>
            ))}

            {filteredTenants.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400">
                Δεν βρέθηκαν καταστήματα με τον όρο &quot;{searchTerm}&quot;.
              </p>
            )}
          </div>
        </div>
      )}

      {/* No Access / Onboarding State */}
      {status === 'no-access' && (
        <div className="py-4 text-center space-y-4">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-400">
            ℹ️
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">Δεν βρέθηκαν συνδεδεμένα καταστήματα</h2>
            <p className="mt-1 text-xs text-slate-400 max-w-xs mx-auto">
              Ο λογαριασμός σας είναι ενεργός αλλά δεν έχει συσχετιστεί ακόμα με κάποιο κατάστημα ShiftOryx.
            </p>
          </div>
          <div className="pt-2">
            <a
              href="/register"
              className="inline-flex w-full justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-950/50 hover:from-cyan-400 hover:to-blue-500"
            >
              Ενεργοποίηση με Registration Token →
            </a>
          </div>
        </div>
      )}

      {/* Error State */}
      {status === 'error' && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs font-medium text-rose-200 space-y-2"
        >
          <p>{message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-[11px] font-bold underline hover:text-rose-100"
          >
            Επαναφόρτωση σελίδας
          </button>
        </div>
      )}
    </AuthPageShell>
  );
}
