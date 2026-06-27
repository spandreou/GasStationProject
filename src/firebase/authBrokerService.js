import { httpsCallable } from 'firebase/functions';
import {
  functions,
  isAuthBrokerEnabled,
  isFirebaseConfigured,
} from './config';

const SAFE_BROKER_ERROR = 'Δεν ήταν δυνατή η ασφαλής μεταφορά σύνδεσης. Δοκίμασε ξανά.';
const TICKET_PATTERN = /^[a-f0-9]{64}$/i;

function assertBrokerReady() {
  if (!isAuthBrokerEnabled || !isFirebaseConfigured || !functions) {
    throw new Error(SAFE_BROKER_ERROR);
  }
}

function getSafeError() {
  return new Error(SAFE_BROKER_ERROR);
}

export function hasAuthTicketInUrl() {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).has('authTicket');
}

export function readAndClearAuthTicketFromUrl() {
  if (typeof window === 'undefined') return '';

  const hash = window.location.hash || '';
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const ticket = String(params.get('authTicket') || '').trim();

  if (ticket) {
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, '', cleanUrl || '/');
  }

  return TICKET_PATTERN.test(ticket) ? ticket : '';
}

export async function createTenantAuthTicketRedirect({ returnTo, tenantId }) {
  assertBrokerReady();

  try {
    const createAuthTicket = httpsCallable(functions, 'createAuthTicket');
    const response = await createAuthTicket({ returnTo, tenantId });
    const redirectUrl = String(response.data?.redirectUrl || '');
    if (!redirectUrl.startsWith('https://') && !redirectUrl.startsWith('http://localhost')) {
      throw getSafeError();
    }
    return redirectUrl;
  } catch {
    throw getSafeError();
  }
}

export async function exchangeTenantAuthTicket(ticket) {
  assertBrokerReady();

  if (!TICKET_PATTERN.test(String(ticket || ''))) {
    throw getSafeError();
  }

  try {
    const exchangeAuthTicket = httpsCallable(functions, 'exchangeAuthTicket');
    const response = await exchangeAuthTicket({ ticket });
    const customToken = String(response.data?.customToken || '');
    if (!customToken) throw getSafeError();

    return {
      customToken,
      tenantId: String(response.data?.tenantId || ''),
      role: String(response.data?.role || ''),
    };
  } catch {
    throw getSafeError();
  }
}

export { SAFE_BROKER_ERROR };
