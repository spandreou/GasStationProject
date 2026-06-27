import { createHash, randomBytes } from 'node:crypto';

export const AUTH_TICKET_TTL_MS = 60_000;
export const AUTH_TICKET_BYTES = 32;
export const AUTH_TICKET_STATUS = {
  pending: 'PENDING',
  used: 'USED',
};

export const AUTH_BROKER_ROLES = ['OWNER', 'ADMIN', 'MANAGER'];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function toCleanString(value) {
  return String(value || '').trim();
}

function normalizeHostname(value) {
  return toCleanString(value).split(':')[0].toLowerCase();
}

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}`;
  } catch {
    return '';
  }
}

function isLocalHostname(hostname) {
  return LOCAL_HOSTS.has(normalizeHostname(hostname));
}

export function generateAuthTicket() {
  return randomBytes(AUTH_TICKET_BYTES).toString('hex');
}

export function validateTicketFormat(ticket) {
  const value = toCleanString(ticket);
  return {
    valid: /^[a-f0-9]{64}$/i.test(value),
    ticket: value,
  };
}

export function hashAuthTicket(ticket) {
  const validation = validateTicketFormat(ticket);
  if (!validation.valid) {
    throw new Error('invalid-ticket');
  }

  return createHash('sha256').update(validation.ticket, 'utf8').digest('hex');
}

export function isAllowedBrokerOrigin(origin, allowedOrigins = []) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;
  return allowedOrigins.map(normalizeOrigin).includes(normalizedOrigin);
}

export function resolveTenantIdFromHostname({
  hostname,
  baseDomain = 'homelabshare.gr',
  centralDomain = 'gas.homelabshare.gr',
}) {
  const cleanHostname = normalizeHostname(hostname);
  const cleanBaseDomain = normalizeHostname(baseDomain);
  const cleanCentralDomain = normalizeHostname(centralDomain);

  if (!cleanHostname || cleanHostname === cleanCentralDomain) return '';
  if (isLocalHostname(cleanHostname)) return '';
  if (!cleanHostname.endsWith(`.${cleanBaseDomain}`)) return '';

  const tenantId = cleanHostname.slice(0, -(cleanBaseDomain.length + 1));
  if (!tenantId || tenantId === 'gas') return '';
  return tenantId;
}

function isAllowedTenantPath(pathname) {
  return pathname === '/' || pathname === '/app' || pathname.startsWith('/app/');
}

export function validateBrokerReturnTo({
  returnTo,
  expectedTenantId = '',
  baseDomain = 'homelabshare.gr',
  centralDomain = 'gas.homelabshare.gr',
  allowedTenantIds = [],
  production = true,
}) {
  try {
    const url = new URL(toCleanString(returnTo));
    const hostname = normalizeHostname(url.hostname);
    const protocol = url.protocol.toLowerCase();

    if (production && protocol !== 'https:') {
      return { valid: false, reason: 'invalid-protocol' };
    }

    if (!production && !['http:', 'https:'].includes(protocol)) {
      return { valid: false, reason: 'invalid-protocol' };
    }

    if (url.username || url.password) {
      return { valid: false, reason: 'url-credentials-not-allowed' };
    }

    if (hostname === normalizeHostname(centralDomain)) {
      return { valid: false, reason: 'central-return-not-allowed' };
    }

    const tenantId = resolveTenantIdFromHostname({ hostname, baseDomain, centralDomain });
    if (!tenantId) {
      return { valid: false, reason: 'unknown-tenant-host' };
    }

    if (expectedTenantId && tenantId !== expectedTenantId) {
      return { valid: false, reason: 'tenant-mismatch' };
    }

    if (allowedTenantIds.length > 0 && !allowedTenantIds.includes(tenantId)) {
      return { valid: false, reason: 'tenant-not-allowed' };
    }

    if (!isAllowedTenantPath(url.pathname)) {
      return { valid: false, reason: 'path-not-allowed' };
    }

    return {
      valid: true,
      reason: 'valid',
      tenantId,
      url: url.toString(),
      returnToHost: hostname,
      allowedTenantOrigin: `${url.protocol}//${hostname}${url.port ? `:${url.port}` : ''}`,
    };
  } catch {
    return { valid: false, reason: 'invalid-url' };
  }
}

export function buildTenantTicketRedirectUrl(returnTo, ticket) {
  const validation = validateTicketFormat(ticket);
  if (!validation.valid) {
    throw new Error('invalid-ticket');
  }

  const url = new URL(returnTo);
  url.hash = `authTicket=${encodeURIComponent(validation.ticket)}`;
  return url.toString();
}

export function buildAuthTicketDocument({
  uid,
  tenantId,
  role,
  returnTo,
  returnToHost,
  centralOrigin,
  allowedTenantOrigin,
  requestId,
  nowMs = Date.now(),
}) {
  return {
    uid: toCleanString(uid),
    tenantId: toCleanString(tenantId),
    role: toCleanString(role).toUpperCase(),
    status: AUTH_TICKET_STATUS.pending,
    returnTo: toCleanString(returnTo),
    returnToHost: normalizeHostname(returnToHost),
    centralOrigin: normalizeOrigin(centralOrigin),
    allowedTenantOrigin: normalizeOrigin(allowedTenantOrigin),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + AUTH_TICKET_TTL_MS,
    usedAt: null,
    usedByOrigin: null,
    requestId: toCleanString(requestId),
  };
}

export function isActiveBrokerMembership(membership) {
  return Boolean(
    membership &&
      membership.status === 'ACTIVE' &&
      AUTH_BROKER_ROLES.includes(String(membership.role || '').toUpperCase()),
  );
}
