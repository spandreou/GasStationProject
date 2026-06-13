const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function getEnvValue(name, fallback = '') {
  const value = import.meta.env?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function resolveTenantHostContext(hostnameValue = '') {
  const hostname = String(hostnameValue || '').split(':')[0].toLowerCase();
  const baseDomain = getEnvValue('VITE_PUBLIC_APP_BASE_DOMAIN', 'homelabshare.gr').toLowerCase();
  const centralDomain = getEnvValue('VITE_CENTRAL_PORTAL_DOMAIN', `gas.${baseDomain}`).toLowerCase();
  const defaultTenantSlug = getEnvValue('VITE_DEFAULT_TENANT_SLUG', 'bp-kallis');

  if (!hostname || LOCAL_HOSTS.has(hostname)) {
    return {
      mode: 'local',
      hostname,
      tenantSlug: defaultTenantSlug,
    };
  }

  if (hostname === centralDomain) {
    return {
      mode: 'central',
      hostname,
    };
  }

  if (hostname.endsWith(`.${baseDomain}`)) {
    const tenantSlug = hostname.slice(0, -(baseDomain.length + 1));
    if (tenantSlug && tenantSlug !== 'gas') {
      return {
        mode: 'tenant',
        hostname,
        tenantSlug,
      };
    }
  }

  return {
    mode: 'unknown',
    hostname,
  };
}

export function getCurrentTenantHostContext() {
  if (typeof window === 'undefined') {
    return resolveTenantHostContext('');
  }

  return resolveTenantHostContext(window.location.hostname);
}
