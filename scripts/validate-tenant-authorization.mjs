import {
  ADMIN_TENANT_ROLES,
  ACTIVE_MEMBERSHIP_STATUS,
  INACTIVE_MEMBERSHIP_STATUSES,
  resolveTenantAdminAuthorization,
} from '../src/services/tenantAuthorization.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDenied(result, reason, message) {
  assert(result.allowed === false, `${message}: expected denied.`);
  assert(result.reason === reason, `${message}: expected reason ${reason}, got ${result.reason}.`);
  assert(result.message === 'Δεν έχετε πρόσβαση σε αυτό το πρατήριο.', `${message}: expected safe Greek denial.`);
}

function assertAllowed(result, message) {
  assert(result.allowed === true, `${message}: expected allowed.`);
  assert(result.reason === 'active-tenant-admin-membership', `${message}: expected active membership reason.`);
}

const user = { uid: 'uid-123', email: 'owner@example.test' };
const tenant = { id: 'bp-kallis', slug: 'bp-kallis' };

assert(ACTIVE_MEMBERSHIP_STATUS === 'ACTIVE', 'Active membership status must be ACTIVE.');
assert(
  ['OWNER', 'ADMIN', 'MANAGER'].every((role) => ADMIN_TENANT_ROLES.includes(role)),
  'Supported admin tenant roles must be OWNER, ADMIN, MANAGER.',
);
assert(
  ['INACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED'].every((status) => INACTIVE_MEMBERSHIP_STATUSES.includes(status)),
  'Inactive statuses must include INACTIVE, SUSPENDED, EXPIRED, REVOKED.',
);

for (const role of ADMIN_TENANT_ROLES) {
  assertAllowed(
    resolveTenantAdminAuthorization({
      user,
      tenant,
      membership: { uid: user.uid, tenantId: tenant.id, status: 'ACTIVE', role },
    }),
    `ACTIVE ${role} membership`,
  );
}

for (const status of INACTIVE_MEMBERSHIP_STATUSES) {
  assertDenied(
    resolveTenantAdminAuthorization({
      user,
      tenant,
      membership: { uid: user.uid, tenantId: tenant.id, status, role: 'ADMIN' },
    }),
    'inactive-membership',
    `${status} membership`,
  );
}

assertDenied(
  resolveTenantAdminAuthorization({
    user,
    tenant,
    membership: null,
  }),
  'missing-membership',
  'missing membership',
);

assertDenied(
  resolveTenantAdminAuthorization({
    user,
    tenant,
    membership: { uid: user.uid, tenantId: 'eko-example', status: 'ACTIVE', role: 'ADMIN' },
  }),
  'tenant-mismatch',
  'wrong tenant membership',
);

assertDenied(
  resolveTenantAdminAuthorization({
    user,
    tenant,
    membership: { uid: 'other-uid', tenantId: tenant.id, status: 'ACTIVE', role: 'ADMIN' },
  }),
  'uid-mismatch',
  'wrong uid membership',
);

assertDenied(
  resolveTenantAdminAuthorization({
    user,
    tenant,
    membership: { uid: user.uid, tenantId: tenant.id, status: 'ACTIVE', role: 'VIEWER' },
  }),
  'invalid-role',
  'unsupported role membership',
);

assertDenied(
  resolveTenantAdminAuthorization({
    user: null,
    tenant,
    membership: { uid: user.uid, tenantId: tenant.id, status: 'ACTIVE', role: 'ADMIN' },
  }),
  'anonymous',
  'anonymous public user',
);

console.log('Tenant authorization checks passed');
