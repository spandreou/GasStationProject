import { tenantMembershipsRepository, tenantsRepository } from '../repositories';
import {
  resolveTenantAdminAuthorization,
  TENANT_ACCESS_DENIED_MESSAGE,
} from './tenantAuthorization';
import {
  resolveTenantHostContext,
  getResolvedDomainFamilies,
  isAllowedTenantSlug,
} from '../utils/tenantHostContext';

export const TENANT_ACCESS_MESSAGES = {
  noAccess: 'Δεν υπάρχει ενεργό κατάστημα συνδεδεμένο με αυτόν τον λογαριασμό.',
  denied: TENANT_ACCESS_DENIED_MESSAGE,
};

function getEnvValue(name, fallback = '') {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getCentralPortalDomain(familyId = 'primary') {
  const families = getResolvedDomainFamilies();
  const family = families.find((f) => f.id === familyId) || families[0];
  return family.centralDomain;
}

function isLocalHost(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(String(hostname || '').toLowerCase());
}

export function getCentralPortalOrigin() {
  if (typeof window === 'undefined') {
    return `https://${getCentralPortalDomain()}`;
  }

  const currentHostname = window.location.hostname;
  const hostContext = resolveTenantHostContext(currentHostname);

  if (isLocalHost(currentHostname) || hostContext.mode === 'central') {
    return window.location.origin;
  }

  const targetFamilyId = hostContext.family || 'primary';
  return `https://${getCentralPortalDomain(targetFamilyId)}`;
}

export function buildCentralLoginUrl(returnTo = '') {
  const url = new URL('/login', getCentralPortalOrigin());
  if (returnTo) {
    url.searchParams.set('returnTo', returnTo);
  }
  return url.toString();
}

export function getReturnToParam() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return params.get('returnTo') || '';
}

export function createCurrentReturnToUrl() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function parseSafeReturnTo(returnTo) {
  if (!returnTo || typeof window === 'undefined') return null;

  try {
    const url = new URL(returnTo, window.location.origin);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.username || url.password) return null;

    const hostContext = resolveTenantHostContext(url.hostname);
    if (!['local', 'tenant'].includes(hostContext.mode)) return null;

    return { url, hostContext };
  } catch {
    return null;
  }
}

export async function resolveAuthorizedReturnTo({ uid, returnTo }) {
  const parsed = parseSafeReturnTo(returnTo);
  if (!uid || !parsed) {
    return {
      allowed: false,
      reason: 'invalid-return-to',
      url: '',
    };
  }

  const result = await verifyTenantAccessForHost({
    uid,
    hostname: parsed.url.hostname,
  });

  return {
    allowed: Boolean(result.allowed),
    reason: result.reason || 'unknown',
    url: result.allowed ? parsed.url.toString() : '',
    access: result,
  };
}

export function buildTenantUrl(tenant, familyId = 'primary') {
  if (!tenant) return '';

  const families = getResolvedDomainFamilies();
  const targetFamily = families.find((f) => f.id === familyId) || families[0];

  if (typeof tenant.domain === 'string' && tenant.domain.trim()) {
    const domain = tenant.domain.trim().toLowerCase();
    if (domain.endsWith(`.${targetFamily.baseDomain}`)) {
      const candidate = domain.slice(0, -(targetFamily.baseDomain.length + 1));
      if (candidate && !candidate.includes('.') && isAllowedTenantSlug(candidate)) {
        return `https://${domain}`;
      }
    }
  }

  if (typeof tenant.slug === 'string' && tenant.slug.trim()) {
    const slug = tenant.slug.trim().toLowerCase();
    if (isAllowedTenantSlug(slug)) {
      return `https://${slug}.${targetFamily.baseDomain}`;
    }
  }

  return '';
}

export async function listActiveTenantAccessForUser(uid, contextHostname = '') {
  if (!uid) return [];

  const hostContext = resolveTenantHostContext(
    contextHostname || (typeof window !== 'undefined' ? window.location.hostname : ''),
  );
  const familyId = hostContext.family || 'primary';

  const memberships = await tenantMembershipsRepository.listActiveMembershipsForUser(uid);
  const rows = await Promise.all(
    memberships.map(async (membership) => {
      const tenant = await tenantsRepository.getTenantById(membership.tenantId);
      return tenant
        ? {
            membership,
            tenant,
            url: buildTenantUrl(tenant, familyId),
          }
        : null;
    }),
  );

  return rows.filter(Boolean);
}

export async function resolveCentralTenantDestination(uid) {
  const tenants = await listActiveTenantAccessForUser(uid);

  if (tenants.length === 0) {
    return {
      type: 'no-access',
      message: TENANT_ACCESS_MESSAGES.noAccess,
      tenants,
    };
  }

  if (tenants.length === 1) {
    return {
      type: 'redirect',
      tenant: tenants[0].tenant,
      url: tenants[0].url,
      tenants,
    };
  }

  return {
    type: 'select',
    tenants,
  };
}

export async function verifyTenantAccessForHost({ uid, hostname }) {
  if (!uid) {
    return {
      allowed: false,
      reason: 'no-user',
      message: TENANT_ACCESS_MESSAGES.denied,
    };
  }

  const hostContext = resolveTenantHostContext(hostname);
  if (!['local', 'tenant'].includes(hostContext.mode)) {
    return {
      allowed: false,
      hostContext,
      reason: 'unsupported-host',
      message: TENANT_ACCESS_MESSAGES.denied,
    };
  }

  const tenant = await tenantsRepository.getTenantById(hostContext.tenantSlug);
  if (!tenant) {
    return {
      allowed: false,
      hostContext,
      reason: 'tenant-not-found',
      message: TENANT_ACCESS_MESSAGES.denied,
    };
  }

  const membership = await tenantMembershipsRepository.getActiveAdminMembership(uid, tenant.id);
  const authorization = resolveTenantAdminAuthorization({
    user: { uid },
    tenant,
    membership,
  });

  return {
    ...authorization,
    tenant,
    membership,
    hostContext,
    message: authorization.allowed ? '' : TENANT_ACCESS_MESSAGES.denied,
  };
}
