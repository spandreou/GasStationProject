import { useEffect, useState } from 'react';
import { authRepository } from '../../repositories';
import {
  exchangeTenantAuthTicket,
  readAndClearAuthTicketFromUrl,
  SAFE_BROKER_ERROR,
} from '../../firebase/authBrokerService';
import { buildCentralLoginUrl, createCurrentReturnToUrl } from '../../services/tenantAccessService';

export default function AuthTicketCallback() {
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    let cancelled = false;
    const ticket = readAndClearAuthTicketFromUrl();
    if (!ticket) return undefined;

    setStatus('exchanging');

    exchangeTenantAuthTicket(ticket)
      .then(({ customToken }) => authRepository.signInWithBrokerCustomToken({ customToken }))
      .then(() => {
        if (!cancelled && typeof window !== 'undefined') {
          window.location.assign('/app');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'idle') return null;

  return (
    <div className="fixed inset-x-4 top-4 z-[80] mx-auto max-w-xl rounded-2xl border border-cyan-300/45 bg-slate-950/95 p-4 text-sm font-semibold text-slate-100 shadow-2xl shadow-cyan-950/40">
      {status === 'exchanging' ? (
        <p>Ολοκλήρωση ασφαλούς σύνδεσης...</p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>{SAFE_BROKER_ERROR}</p>
          <a
            href={buildCentralLoginUrl(createCurrentReturnToUrl())}
            className="rounded-xl bg-brand-500 px-3 py-2 text-center text-xs font-black text-white hover:bg-brand-600"
          >
            Επιστροφή στη σύνδεση
          </a>
        </div>
      )}
    </div>
  );
}
