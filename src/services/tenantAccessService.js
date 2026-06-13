import { tenantMembershipsRepository, tenantsRepository } from '../repositories';
import { resolveTenantHostContext } from '../utils/tenantHostContext';

export const TENANT_ACCESS_MESSAGES = {
  noAccess: 'Δεν υπάρχει ενεργό πρατήριο συνδεδεμένο με αυτόν τον λογαριασμό.',
  denied: 'Δεν έχετε πρόσβαση σε αυτό το πρατήριο.',
};

function getEnvValue(name, fallback = '') {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function buildTenantUrl(tenant) {
  if (!tenant) return '';

  if (typeof tenant.domain === 'string' && tenant.domain.trim()) {
    return `https://${tenant.domain.trim().toLowerCase()}`;
  }

  if (typeof tenant.slug === 'string' && tenant.slug.trim()) {
    const baseDomain = getEnvValue('VITE_PUBLIC_APP_BASE_DOMAIN', 'homelabshare.gr').toLowerCase();
    return `https://${tenant.slug.trim().toLowerCase()}.${baseDomain}`;
  }

  return '';
}

export async function listActiveTenantAccessForUser(uid) {
  if (!uid) return [];

  const memberships = await tenantMembershipsRepository.listActiveMembershipsForUser(uid);
  const rows = await Promise.all(
    memberships.map(async (membership) => {
      const tenant = await tenantsRepository.getTenantById(membership.tenantId);
      return tenant
        ? {
            membership,
            tenant,
            url: buildTenantUrl(tenant),
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
  if (hostContext.mode !== 'tenant') {
    return {
      allowed: true,
      hostContext,
    };
  }

  const tenant = await tenantsRepository.getTenantBySlug(hostContext.tenantSlug);
  if (!tenant) {
    return {
      allowed: false,
      hostContext,
      reason: 'tenant-not-found',
      message: TENANT_ACCESS_MESSAGES.denied,
    };
  }

  const allowed = await tenantMembershipsRepository.hasActiveMembership(uid, tenant.id);
  return {
    allowed,
    tenant,
    hostContext,
    reason: allowed ? 'active-membership' : 'membership-denied',
    message: allowed ? '' : TENANT_ACCESS_MESSAGES.denied,
  };
}
