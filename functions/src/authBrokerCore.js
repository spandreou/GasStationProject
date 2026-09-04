import { createHash, randomBytes } from 'node:crypto';

export const AUTH_TICKET_TTL_MS = 60_000;
export const AUTH_TICKET_BYTES = 32;
export const AUTH_TICKET_STATUS = {
  pending: 'PENDING',
  used: 'USED',
};

export const AUTH_BROKER_ROLES = ['OWNER'];

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export const RESERVED_SUBDOMAINS = new Set([
  'www',
  'admin',
  'api',
  'auth',
  'login',
  'register',
  'stores',
  'portal',
  'app',
  'support',
  'status',
  'mail',
  'firebase',
  'billing',
  'ops',
  'dashboard',
  'shiftoryx',
  'gas',
  'tenant',
  'root',
  'system',
  'null',
  'undefined',
]);

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function isAllowedTenantSlug(slug) {
  if (typeof slug !== 'string') return false;
  const normalized = slug.trim().toLowerCase();
  if (normalized.length < SLUG_MIN_LENGTH || normalized.length > SLUG_MAX_LENGTH) {
    return false;
  }
  if (!SLUG_REGEX.test(normalized)) {
    return false;
  }
  if (RESERVED_SUBDOMAINS.has(normalized)) {
    return false;
  }
  if (normalized.startsWith('gas-') || normalized.endsWith('-gas')) {
    return false;
  }
  if (normalized.startsWith('shiftoryx-') || normalized.endsWith('-shiftoryx')) {
    return false;
  }
  return true;
}

export const DEFAULT_DOMAIN_FAMILIES = [
  {
    id: 'primary',
    baseDomain: 'shiftoryx.gr',
    centralDomain: 'shiftoryx.gr',
  },
  {
    id: 'legacy',
    baseDomain: 'homelabshare.gr',
    centralDomain: 'gas.homelabshare.gr',
  },
];

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

export function normalizeDomainFamily(family) {
  if (!family || typeof family !== 'object') return null;
  const id = String(family.id || '').trim().toLowerCase();
  const baseDomain = normalizeHostname(family.baseDomain);
  const centralDomain = normalizeHostname(
    family.centralDomain || (id === 'primary' ? baseDomain : `gas.${baseDomain}`),
  );
  if (!id || !baseDomain || !centralDomain) return null;
  return { id, baseDomain, centralDomain };
}

export function resolveDomainFamilies(config = {}) {
  if (Array.isArray(config.domainFamilies) && config.domainFamilies.length > 0) {
    const parsed = config.domainFamilies.map(normalizeDomainFamily).filter(Boolean);
    if (parsed.length > 0) return parsed;
  }

  if (config.baseDomain || config.centralDomain) {
    const primaryBase = normalizeHostname(config.baseDomain || 'shiftoryx.gr');
    const primaryCentral = normalizeHostname(
      config.centralDomain ||
        (primaryBase === 'homelabshare.gr' ? 'gas.homelabshare.gr' : primaryBase),
    );

    const legacyBase = normalizeHostname(
      config.legacyBaseDomain || (primaryBase !== 'homelabshare.gr' ? 'homelabshare.gr' : ''),
    );
    const legacyCentral = normalizeHostname(
      config.legacyCentralDomain || (legacyBase ? 'gas.homelabshare.gr' : ''),
    );

    const families = [
      {
        id: 'primary',
        baseDomain: primaryBase,
        centralDomain: primaryCentral,
      },
    ];

    if (legacyBase && legacyCentral && legacyBase !== primaryBase) {
      families.push({
        id: 'legacy',
        baseDomain: legacyBase,
        centralDomain: legacyCentral,
      });
    }

    return families;
  }

  return DEFAULT_DOMAIN_FAMILIES.map(normalizeDomainFamily).filter(Boolean);
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

export function resolveDomainFamilyForHostname({
  hostname,
  baseDomain,
  centralDomain,
  domainFamilies,
}) {
  const cleanHostname = normalizeHostname(hostname);
  if (!cleanHostname) return null;

  const families = resolveDomainFamilies({ baseDomain, centralDomain, domainFamilies });

  for (const family of families) {
    if (cleanHostname === family.centralDomain) {
      return { family, role: 'central' };
    }
    if (cleanHostname.endsWith(`.${family.baseDomain}`)) {
      const candidate = cleanHostname.slice(0, -(family.baseDomain.length + 1));
      // Subdomain must be strictly single-label. Deep nested subdomains (e.g. foo.bar.shiftoryx.gr) fail closed.
      if (!candidate || candidate.includes('.')) {
        return null;
      }
      if (RESERVED_SUBDOMAINS.has(candidate)) {
        return { family, role: 'reserved', reservedSlug: candidate };
      }
      if (isAllowedTenantSlug(candidate)) {
        return { family, role: 'tenant', tenantSlug: candidate };
      }
      return null;
    }
  }

  return null;
}

export function isAllowedTenantOrigin(origin, domainFamilies = []) {
  try {
    const url = new URL(toCleanString(origin));
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password || url.port) return false;
    const hostname = normalizeHostname(url.hostname);
    const targetInfo = resolveDomainFamilyForHostname({
      hostname,
      domainFamilies,
    });
    return Boolean(targetInfo && targetInfo.role === 'tenant' && targetInfo.tenantSlug);
  } catch {
    return false;
  }
}

export function resolveTenantIdFromHostname({
  hostname,
  baseDomain,
  centralDomain,
  domainFamilies,
}) {
  const cleanHostname = normalizeHostname(hostname);
  if (!cleanHostname || isLocalHostname(cleanHostname)) return '';

  const targetInfo = resolveDomainFamilyForHostname({
    hostname: cleanHostname,
    baseDomain,
    centralDomain,
    domainFamilies,
  });

  if (targetInfo && targetInfo.role === 'tenant' && targetInfo.tenantSlug) {
    return targetInfo.tenantSlug;
  }

  return '';
}

function isAllowedTenantPath(pathname) {
  return pathname === '/' || pathname === '/app' || pathname.startsWith('/app/');
}

export function validateBrokerReturnTo({
  returnTo,
  expectedTenantId = '',
  baseDomain,
  centralDomain,
  domainFamilies,
  callerOrigin = '',
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

    const families = resolveDomainFamilies({ baseDomain, centralDomain, domainFamilies });

    for (const family of families) {
      if (hostname === family.centralDomain) {
        return { valid: false, reason: 'central-return-not-allowed' };
      }
    }

    const targetInfo = resolveDomainFamilyForHostname({
      hostname,
      domainFamilies: families,
    });

    if (!targetInfo || targetInfo.role !== 'tenant' || !targetInfo.tenantSlug) {
      return { valid: false, reason: 'unknown-tenant-host' };
    }

    const tenantId = targetInfo.tenantSlug;

    if (callerOrigin) {
      const callerUrl = new URL(toCleanString(callerOrigin));
      const callerHost = normalizeHostname(callerUrl.hostname);
      const callerInfo = resolveDomainFamilyForHostname({
        hostname: callerHost,
        domainFamilies: families,
      });

      if (callerInfo && callerInfo.family.id !== targetInfo.family.id) {
        return { valid: false, reason: 'cross-family-redirect-not-allowed' };
      }
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
      familyId: targetInfo.family.id,
      family: targetInfo.family,
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
