import assert from 'node:assert/strict';
import {
  isActiveTenantAdminMembership,
} from '../src/services/tenantAuthorization.js';
import {
  resolveStoreSelectorState,
} from '../src/utils/portalHelpers.js';
import {
  isAllowedTenantOrigin,
  resolveValidatedTenantOrigin,
  validateBrokerReturnTo,
} from '../functions/src/authBrokerCore.js';

console.log('--- RUNNING GENERIC MULTI-TENANT DISCOVERY TEST MATRIX ---');

let passedTests = 0;
function pass(testName) {
  passedTests++;
  console.log('  [PASS] ' + testName);
}

const testUid = 'user-owner-multi';

// 1. Invariant: Active membership evaluation is 100% generic across arbitrary tenant IDs
const arbitraryTenants = [
  'tenant-alpha',
  'store-beta',
  'north-hub-123',
  'bp-kallis',
  'athens-central',
  'store-xyz-999',
];

for (const tenantId of arbitraryTenants) {
  const membership = {
    uid: testUid,
    tenantId,
    role: 'OWNER',
    status: 'ACTIVE',
  };

  assert.equal(
    isActiveTenantAdminMembership(membership, { uid: testUid, tenantId }),
    true,
    'Active OWNER membership for arbitrary tenant ' + tenantId + ' must evaluate to true',
  );
}
pass('Arbitrary store IDs correctly recognized by generic membership validator');

// 2. Inactive / wrong role / wrong UID memberships strictly rejected for any tenant
const negativeCases = [
  { desc: 'SUSPENDED status', doc: { uid: testUid, tenantId: 'store-1', role: 'OWNER', status: 'SUSPENDED' }, expected: false },
  { desc: 'EXPIRED status', doc: { uid: testUid, tenantId: 'store-1', role: 'OWNER', status: 'EXPIRED' }, expected: false },
  { desc: 'REVOKED status', doc: { uid: testUid, tenantId: 'store-1', role: 'OWNER', status: 'REVOKED' }, expected: false },
  { desc: 'MANAGER role (non-owner)', doc: { uid: testUid, tenantId: 'store-1', role: 'MANAGER', status: 'ACTIVE' }, expected: false },
  { desc: 'STAFF role', doc: { uid: testUid, tenantId: 'store-1', role: 'STAFF', status: 'ACTIVE' }, expected: false },
  { desc: 'UID mismatch', doc: { uid: 'different-uid', tenantId: 'store-1', role: 'OWNER', status: 'ACTIVE' }, expected: false },
  { desc: 'tenantId mismatch', doc: { uid: testUid, tenantId: 'store-wrong', role: 'OWNER', status: 'ACTIVE' }, checkTenantId: 'store-1', expected: false },
];

for (const c of negativeCases) {
  const checkTenant = c.checkTenantId || c.doc.tenantId;
  assert.equal(
    isActiveTenantAdminMembership(c.doc, { uid: testUid, tenantId: checkTenant }),
    c.expected,
    c.desc + ' must be rejected',
  );
}
pass('Strict status, role, and tenant binding invariants enforced across all stores');

// 3. Multi-Store Resolution: User with multiple arbitrary active stores
const mockUser = { uid: testUid, email: 'owner@example.com' };

// Scenario A: User has 0 stores
const state0 = resolveStoreSelectorState({ user: mockUser, tenants: [] });
assert.equal(state0, 'no-access', '0 stores must resolve to no-access state');
pass('0 stores correctly resolves to no-access');

// Scenario B: User has 1 arbitrary store (Tenant A)
const tenantsA = [
  {
    tenant: { id: 'store-alpha', slug: 'store-alpha', displayName: 'Store Alpha', status: 'ACTIVE' },
    membership: { uid: testUid, tenantId: 'store-alpha', role: 'OWNER', status: 'ACTIVE' },
    url: 'https://store-alpha.shiftoryx.gr',
  },
];
const state1 = resolveStoreSelectorState({ user: mockUser, tenants: tenantsA });
assert.equal(state1, 'ready', '1 store must resolve to ready state');
pass('1 arbitrary store (Store Alpha) correctly resolves');

// Scenario C: User has 2 arbitrary stores (Store Alpha & Store Beta)
const tenantsAB = [
  ...tenantsA,
  {
    tenant: { id: 'store-beta', slug: 'store-beta', displayName: 'Store Beta', status: 'ACTIVE' },
    membership: { uid: testUid, tenantId: 'store-beta', role: 'OWNER', status: 'ACTIVE' },
    url: 'https://store-beta.shiftoryx.gr',
  },
];
const state2 = resolveStoreSelectorState({ user: mockUser, tenants: tenantsAB });
assert.equal(state2, 'ready', 'Multiple arbitrary stores must resolve to ready state');
assert.equal(tenantsAB.length, 2, '2 stores must be present');
pass('Multiple arbitrary stores (Store Alpha & Store Beta) correctly resolve');

// Scenario D: User has N arbitrary stores (3+)
const tenantsN = [
  ...tenantsAB,
  {
    tenant: { id: 'store-gamma-3', slug: 'store-gamma-3', displayName: 'Store Gamma 3', status: 'ACTIVE' },
    membership: { uid: testUid, tenantId: 'store-gamma-3', role: 'OWNER', status: 'ACTIVE' },
    url: 'https://store-gamma-3.shiftoryx.gr',
  },
];
const state3 = resolveStoreSelectorState({ user: mockUser, tenants: tenantsN });
assert.equal(state3, 'ready', 'N stores must resolve to ready state');
assert.equal(tenantsN.length, 3, '3 stores must be present');
pass('N arbitrary stores correctly resolve without hardcoded constraints');

// 4. Broker returnTo & origin validation for arbitrary stores
const domainFamilies = [
  { id: 'primary', baseDomain: 'shiftoryx.gr', centralDomain: 'shiftoryx.gr' },
  { id: 'legacy', baseDomain: 'homelabshare.gr', centralDomain: 'gas.homelabshare.gr' },
];

for (const slug of ['store-alpha', 'store-beta', 'store-gamma-3', 'arbitrary-corp-99']) {
  const origin = 'https://' + slug + '.shiftoryx.gr';
  assert.equal(isAllowedTenantOrigin(origin, domainFamilies), true, 'Origin ' + origin + ' must be allowed');

  const returnTo = origin + '/app';
  const validation = validateBrokerReturnTo({
    returnTo,
    expectedTenantId: slug,
    domainFamilies,
    callerOrigin: 'https://shiftoryx.gr',
    allowedTenantIds: [slug],
    production: true,
  });
  assert.equal(validation.valid, true, 'Validation for ' + slug + ' must be valid');
  assert.equal(validation.tenantId, slug, 'Resolved tenantId must match ' + slug);
  assert.equal(validation.allowedTenantOrigin, origin, 'Resolved origin must match ' + origin);
}
pass('Broker returnTo & origin validation passes for all arbitrary stores dynamically');

console.log('\n--- ALL ' + passedTests + ' GENERIC MULTI-TENANT DISCOVERY TESTS PASSED ---');
