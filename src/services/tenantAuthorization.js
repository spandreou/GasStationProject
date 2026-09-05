export const ACTIVE_MEMBERSHIP_STATUS = 'ACTIVE';
export const INACTIVE_MEMBERSHIP_STATUSES = ['INACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED'];
export const ADMIN_TENANT_ROLES = ['OWNER'];
export const TENANT_ACCESS_DENIED_MESSAGE = 'Δεν έχετε πρόσβαση σε αυτό το κατάστημα.';

function normalizeToken(value) {
  return String(value || '').trim().toUpperCase();
}

function denied(reason) {
  return {
    allowed: false,
    reason,
    message: TENANT_ACCESS_DENIED_MESSAGE,
  };
}

export function isActiveTenantAdminMembership(membership, { uid, tenantId } = {}) {
  if (!membership || !uid || !tenantId) return false;
  return (
    membership.uid === uid &&
    membership.tenantId === tenantId &&
    normalizeToken(membership.status) === ACTIVE_MEMBERSHIP_STATUS &&
    ADMIN_TENANT_ROLES.includes(normalizeToken(membership.role))
  );
}

export function resolveTenantAdminAuthorization({ user, tenant, membership }) {
  if (!user?.uid) return denied('anonymous');
  if (!tenant?.id) return denied('tenant-not-found');
  if (!membership) return denied('missing-membership');
  if (membership.uid !== user.uid) return denied('uid-mismatch');
  if (membership.tenantId !== tenant.id) return denied('tenant-mismatch');
  if (normalizeToken(membership.status) !== ACTIVE_MEMBERSHIP_STATUS) return denied('inactive-membership');
  if (!ADMIN_TENANT_ROLES.includes(normalizeToken(membership.role))) return denied('invalid-role');

  return {
    allowed: true,
    reason: 'active-tenant-admin-membership',
    message: '',
    tenant,
    membership,
    role: normalizeToken(membership.role),
  };
}
