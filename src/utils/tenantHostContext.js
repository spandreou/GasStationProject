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

export const DEFAULT_HOST_FAMILIES = [
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

function getEnvValue(name, fallback = '') {
  const value = import.meta.env?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function getResolvedDomainFamilies() {
  const primaryBase = getEnvValue('VITE_PUBLIC_APP_BASE_DOMAIN', 'shiftoryx.gr').toLowerCase();
  const primaryCentral = getEnvValue(
    'VITE_CENTRAL_PORTAL_DOMAIN',
    primaryBase === 'homelabshare.gr' ? 'gas.homelabshare.gr' : primaryBase,
  ).toLowerCase();

  const legacyBase = getEnvValue(
    'VITE_LEGACY_APP_BASE_DOMAIN',
    primaryBase !== 'homelabshare.gr' ? 'homelabshare.gr' : '',
  ).toLowerCase();
  const legacyCentral = getEnvValue(
    'VITE_LEGACY_CENTRAL_PORTAL_DOMAIN',
    legacyBase ? 'gas.homelabshare.gr' : '',
  ).toLowerCase();

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

export function resolveTenantHostContext(hostnameValue = '') {
  const hostname = String(hostnameValue || '').split(':')[0].toLowerCase();
  const defaultTenantSlug = getEnvValue('VITE_DEFAULT_TENANT_SLUG', 'bp-kallis');

  if (!hostname || LOCAL_HOSTS.has(hostname)) {
    return {
      mode: 'local',
      hostname,
      tenantSlug: defaultTenantSlug,
      family: null,
    };
  }

  const families = getResolvedDomainFamilies();

  for (const family of families) {
    if (hostname === family.centralDomain) {
      return {
        mode: 'central',
        hostname,
        family: family.id,
      };
    }

    if (hostname.endsWith(`.${family.baseDomain}`)) {
      const candidate = hostname.slice(0, -(family.baseDomain.length + 1));
      // Subdomain must be strictly single-label. Deep nested subdomains (e.g. foo.bar.shiftoryx.gr) fail closed.
      if (!candidate || candidate.includes('.')) {
        continue;
      }
      if (RESERVED_SUBDOMAINS.has(candidate)) {
        return {
          mode: 'reserved',
          hostname,
          reservedSlug: candidate,
          family: family.id,
        };
      }
      if (isAllowedTenantSlug(candidate)) {
        return {
          mode: 'tenant',
          hostname,
          tenantSlug: candidate,
          family: family.id,
        };
      }
    }
  }

  return {
    mode: 'unknown',
    hostname,
    family: null,
  };
}

export function getCurrentTenantHostContext() {
  if (typeof window === 'undefined') {
    return resolveTenantHostContext('');
  }

  return resolveTenantHostContext(window.location.hostname);
}

