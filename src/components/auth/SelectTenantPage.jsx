import { useEffect, useState } from 'react';
import { authRepository } from '../../repositories';
import { createTenantAuthTicketRedirect } from '../../firebase/authBrokerService';
import {
  getReturnToParam,
  resolveAuthorizedReturnTo,
  resolveCentralTenantDestination,
  TENANT_ACCESS_MESSAGES,
} from '../../services/tenantAccessService';
import { resolveStoreSelectorState } from '../../utils/portalHelpers';
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
            setStatus('unauthenticated');
            setMessage('Δεν είστε συνδεδεμένοι. Συνδεθείτε για να δείτε τα καταστήματα του λογαριασμού σας.');
          }
          return;
        }

        try {
          // Check if platform admin using real repository method
          const isAdmin = await authRepository.isPlatformAdmin(user.uid);
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

          const selectorState = resolveStoreSelectorState({ user, tenants: result.tenants });
          if (selectorState === 'ready') {
            setTenants(result.tenants);
            setStatus('ready');
            return;
          }

          setStatus('no-access');
          setMessage(result.message || TENANT_ACCESS_MESSAGES.noAccess);
        } catch (err) {
          if (!cancelled) {
            setStatus('error');
            const cat = err?.category ? ` [${err.category}]` : '';
            setMessage(`Δεν ήταν δυνατή η φόρτωση των καταστημάτων. Δοκιμάστε ξανά αργότερα.${cat}`);
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
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-500" />
          <p className="text-xs font-semibold text-slate-600">
            {status === 'checking' ? 'Έλεγχος διαθέσιμων καταστημάτων...' : message}
          </p>
        </div>
      )}

      {/* Platform Admin Notification Banner */}
      {isPlatformAdmin && (
        <div className="mb-4 rounded-2xl border border-purple-200 bg-purple-50 p-3.5 text-xs text-purple-900 flex items-center justify-between">
          <span className="font-semibold">Έχετε ρόλο Platform Administrator.</span>
          <a
            href="/admin"
            className="rounded-xl bg-purple-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-800 transition"
          >
            Admin Panel →
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
              className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            />
          )}

          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
            {filteredTenants.map(({ tenant, membership, url }) => (
              <article
                key={tenant.id}
                className="group relative rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-cyan-300 hover:bg-white hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 group-hover:text-cyan-700">
                      {tenant.displayName || tenant.name || tenant.slug}
                    </h2>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                      {tenant.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-cyan-100 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-800 border border-cyan-200">
                      {membership.role}
                    </span>
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-800 border border-emerald-200">
                      {membership.status}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-200/80">
                  <span className="text-[11px] text-slate-500">
                    Κατηγορία: <span className="font-semibold text-slate-700">{tenant.businessCategory || 'OTHER'}</span>
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
                      } catch (err) {
                        setStatus('error');
                        const cat = err?.category ? ` [${err.category}]` : '';
                        setMessage(`Δεν ήταν δυνατή η ασφαλής μεταφορά σύνδεσης. Δοκιμάστε ξανά.${cat}`);
                      }
                    }}
                    className="rounded-xl bg-slate-950 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-slate-800 transition"
                  >
                    Είσοδος →
                  </a>
                </div>
              </article>
            ))}

            {filteredTenants.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-500">
                Δεν βρέθηκαν καταστήματα με τον όρο &quot;{searchTerm}&quot;.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Unauthenticated State */}
      {status === 'unauthenticated' && (
        <div className="py-4 text-center space-y-4">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            🔒
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Δεν είστε συνδεδεμένοι</h2>
            <p className="mt-1 text-xs text-slate-600 max-w-xs mx-auto">
              Συνδεθείτε με τα στοιχεία του λογαριασμού σας για να δείτε τα διαθέσιμα καταστήματα.
            </p>
          </div>
          <div className="pt-2">
            <a
              href="/login"
              className="inline-flex w-full justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 hover:bg-slate-800 transition"
            >
              Σύνδεση στο Portal →
            </a>
          </div>
        </div>
      )}

      {/* No Access / Onboarding State (Authenticated with 0 stores) */}
      {status === 'no-access' && (
        <div className="py-4 text-center space-y-4">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-700">
            ℹ️
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Δεν βρέθηκαν συνδεδεμένα καταστήματα</h2>
            <p className="mt-1 text-xs text-slate-600 max-w-xs mx-auto">
              Ο λογαριασμός σας είναι ενεργός αλλά δεν έχει συσχετιστεί ακόμα με κάποιο κατάστημα ShiftOryx.
            </p>
          </div>
          <div className="pt-2">
            <a
              href="/register"
              className="inline-flex w-full justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 hover:bg-slate-800 transition"
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
          className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-900 space-y-2"
        >
          <p>{message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-[11px] font-bold underline hover:text-rose-950"
          >
            Επαναφόρτωση σελίδας
          </button>
        </div>
      )}
    </AuthPageShell>
  );
}
