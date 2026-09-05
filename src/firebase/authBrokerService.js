import { httpsCallable } from 'firebase/functions';
import {
  functions,
  isAuthBrokerEnabled,
  isFirebaseConfigured,
} from './config.js';

const SAFE_BROKER_ERROR = 'Δεν ήταν δυνατή η ασφαλής μεταφορά σύνδεσης. Δοκίμασε ξανά.';
const TICKET_PATTERN = /^[a-f0-9]{64}$/i;

export function classifyBrokerError(err, prefix = 'BROKER_CREATE') {
  if (err?.category && typeof err.category === 'string') {
    return err.category;
  }

  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || '').toLowerCase();
  const reason = String(err?.details?.reason || err?.reason || '').toLowerCase();

  // Authentication errors
  if (
    code.includes('unauthenticated') ||
    reason.includes('missing-auth') ||
    message.includes('missing-auth') ||
    message.includes('unauthenticated')
  ) {
    return `${prefix}_UNAUTHENTICATED`;
  }

  // Permission / Authorization errors
  if (
    code.includes('permission-denied') ||
    reason.includes('invalid-central-origin') ||
    reason.includes('tenant-origin-mismatch') ||
    reason.includes('missing-membership') ||
    reason.includes('membership-mismatch') ||
    reason.includes('inactive-or-invalid-membership') ||
    reason.includes('platform-admin-tenant-access-forbidden') ||
    reason.includes('cross-family-redirect-not-allowed') ||
    message.includes('permission-denied') ||
    message.includes('forbidden')
  ) {
    return `${prefix}_PERMISSION_DENIED`;
  }

  // Invalid argument / Format errors
  if (
    code.includes('invalid-argument') ||
    reason.includes('missing-return-to') ||
    reason.includes('invalid-protocol') ||
    reason.includes('central-return-not-allowed') ||
    reason.includes('unknown-tenant-host') ||
    reason.includes('tenant-mismatch') ||
    reason.includes('tenant-not-allowed') ||
    reason.includes('path-not-allowed') ||
    reason.includes('invalid-url') ||
    message.includes('invalid-argument') ||
    message.includes('missing-return-to')
  ) {
    return `${prefix}_INVALID_ARGUMENT`;
  }

  // Specific custom errors
  if (message.includes('invalid-redirect-url') || reason.includes('invalid-redirect-url')) {
    return `${prefix}_INVALID_REDIRECT`;
  }
  if (message.includes('invalid-ticket-format') || message.includes('invalid-ticket')) {
    return `${prefix}_INVALID_TICKET`;
  }
  if (message.includes('missing-custom-token')) {
    return `${prefix}_MISSING_CUSTOM_TOKEN`;
  }

  // Network / Connection / Availability / CSP / fetch failures
  if (
    code.includes('unavailable') ||
    code.includes('network') ||
    code.includes('timeout') ||
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    (code === 'functions/internal' && message === 'internal' && !err?.details)
  ) {
    return `${prefix}_NETWORK`;
  }

  // Not found
  if (
    code.includes('not-found') ||
    reason.includes('tenant-not-found') ||
    message.includes('tenant-not-found')
  ) {
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
