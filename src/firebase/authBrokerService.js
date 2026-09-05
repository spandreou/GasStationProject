import { httpsCallable } from 'firebase/functions';
import {
  functions,
  isAuthBrokerEnabled,
  isFirebaseConfigured,
} from './config.js';

const SAFE_BROKER_ERROR = 'Δεν ήταν δυνατή η ασφαλής μεταφορά σύνδεσης. Δοκίμασε ξανά.';
const TICKET_PATTERN = /^[a-f0-9]{64}$/i;

export function classifyBrokerError(err, prefix = 'BROKER_CREATE') {
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || '').toLowerCase();

  if (code.includes('unauthenticated') || message.includes('missing-auth') || message.includes('unauthenticated')) {
    return `${prefix}_UNAUTHENTICATED`;
  }
  if (code.includes('permission-denied') || message.includes('permission-denied') || message.includes('forbidden')) {
    return `${prefix}_PERMISSION_DENIED`;
  }
  if (code.includes('invalid-argument') || message.includes('invalid-argument') || message.includes('missing-return-to')) {
    return `${prefix}_INVALID_ARGUMENT`;
  }
  if (code.includes('unavailable') || code.includes('network') || message.includes('network') || message.includes('offline') || message.includes('failed to fetch')) {
    return `${prefix}_NETWORK`;
  }
  if (code.includes('not-found') || message.includes('tenant-not-found')) {
    return `${prefix}_NOT_FOUND`;
  }
  return `${prefix}_INTERNAL`;
}

function assertBrokerReady() {
  if (!isAuthBrokerEnabled || !isFirebaseConfigured || !functions) {
    const err = new Error(SAFE_BROKER_ERROR);
    err.category = 'BROKER_CREATE_NOT_READY';
    throw err;
  }
}

function getSafeError(err, prefix = 'BROKER_CREATE') {
  const safeErr = new Error(SAFE_BROKER_ERROR);
  safeErr.category = classifyBrokerError(err, prefix);
  return safeErr;
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
      throw getSafeError(new Error('invalid-redirect-url'), 'BROKER_CREATE');
    }
    return redirectUrl;
  } catch (err) {
    throw getSafeError(err, 'BROKER_CREATE');
  }
}

export async function exchangeTenantAuthTicket(ticket) {
  assertBrokerReady();

  if (!TICKET_PATTERN.test(String(ticket || ''))) {
    throw getSafeError(new Error('invalid-ticket-format'), 'BROKER_EXCHANGE');
  }

  try {
    const exchangeAuthTicket = httpsCallable(functions, 'exchangeAuthTicket');
    const response = await exchangeAuthTicket({ ticket });
    const customToken = String(response.data?.customToken || '');
    if (!customToken) throw getSafeError(new Error('missing-custom-token'), 'BROKER_EXCHANGE');

    return {
      customToken,
      tenantId: String(response.data?.tenantId || ''),
      role: String(response.data?.role || ''),
    };
  } catch (err) {
    throw getSafeError(err, 'BROKER_EXCHANGE');
  }
}

export { SAFE_BROKER_ERROR };
