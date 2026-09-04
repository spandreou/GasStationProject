import assert from 'node:assert/strict';
import {
  canAddEmployee,
  DEFAULT_PLAN_LIMITS,
  isFeatureEntitled,
  PLANS,
  resolveTenantEntitlements,
  SUBSCRIPTION_STATUS,
} from '../functions/src/entitlements/entitlementResolver.js';

console.log('--- RUNNING PHASE 7 ENTITLEMENT RESOLVER TEST SUITE ---');

let testsCount = 0;
function pass() {
  testsCount++;
}

const activeTenant = { id: 'tenant-1', status: 'ACTIVE', slug: 'tenant-1' };
const suspendedTenant = { id: 'tenant-2', status: 'SUSPENDED', slug: 'tenant-2' };

// 1. Missing or inactive tenant fails closed
const missingTenant = resolveTenantEntitlements({ tenant: null, subscription: { status: 'ACTIVE', planId: PLANS.starter } });
assert.equal(missingTenant.valid, false);
assert.equal(missingTenant.reason, 'tenant-not-found');
pass();

const suspendedRes = resolveTenantEntitlements({ tenant: suspendedTenant, subscription: { status: 'ACTIVE', planId: PLANS.starter } });
assert.equal(suspendedRes.valid, false);
assert.equal(suspendedRes.reason, 'tenant-status-SUSPENDED');
pass();

// 2. Active subscription resolves correctly
const now = Date.now();
const activeStarter = resolveTenantEntitlements({
  tenant: activeTenant,
  subscription: {
    planId: PLANS.starter,
    status: SUBSCRIPTION_STATUS.active,
    effectiveAtMs: now - 10_000,
    expiresAtMs: now + 86_400_000,
  },
  now,
});
assert.equal(activeStarter.valid, true);
assert.equal(activeStarter.planId, PLANS.starter);
assert.equal(activeStarter.limits.maxEmployees, DEFAULT_PLAN_LIMITS[PLANS.starter].maxEmployees);
assert.equal(activeStarter.limits.enableAdvancedSolver, false);
pass();

// 3. Trialing subscription resolves correctly
const trialingPro = resolveTenantEntitlements({
  tenant: activeTenant,
  subscription: {
    planId: PLANS.professional,
    status: SUBSCRIPTION_STATUS.trialing,
    expiresAtMs: now + 7 * 86_400_000,
  },
  now,
});
assert.equal(trialingPro.valid, true);
assert.equal(trialingPro.status, SUBSCRIPTION_STATUS.trialing);
assert.equal(trialingPro.limits.maxEmployees, DEFAULT_PLAN_LIMITS[PLANS.professional].maxEmployees);
assert.equal(trialingPro.limits.enableAdvancedSolver, true);
pass();

// 4. Expired subscription fails closed
const expiredSub = resolveTenantEntitlements({
  tenant: activeTenant,
  subscription: {
    planId: PLANS.starter,
    status: SUBSCRIPTION_STATUS.active,
    expiresAtMs: now - 1000,
  },
  now,
});
assert.equal(expiredSub.valid, false);
assert.equal(expiredSub.reason, 'subscription-expired');
pass();

// 5. Future subscription not yet effective fails closed
const futureSub = resolveTenantEntitlements({
  tenant: activeTenant,
  subscription: {
    planId: PLANS.starter,
    status: SUBSCRIPTION_STATUS.active,
    effectiveAtMs: now + 50_000,
  },
  now,
});
assert.equal(futureSub.valid, false);
assert.equal(futureSub.reason, 'subscription-not-yet-effective');
pass();

// 6. Unknown plan fails closed
const unknownPlan = resolveTenantEntitlements({
  tenant: activeTenant,
  subscription: {
    planId: 'MAGIC_SUPER_UNLIMITED',
    status: SUBSCRIPTION_STATUS.active,
  },
  now,
});
assert.equal(unknownPlan.valid, false);
assert.equal(unknownPlan.reason, 'unknown-plan-MAGIC_SUPER_UNLIMITED');
pass();

// 7. Pilot complimentary fallback
const pilotTenant = { id: 'bp-kallis', status: 'ACTIVE', tier: 'PILOT' };
const pilotGrant = resolveTenantEntitlements({ tenant: pilotTenant, subscription: null });
assert.equal(pilotGrant.valid, true);
assert.equal(pilotGrant.planId, PLANS.pilot);
assert.equal(pilotGrant.limits.maxEmployees, 15);
pass();

// 8. Custom limit overrides
const customSub = resolveTenantEntitlements({
  tenant: activeTenant,
  subscription: {
    planId: PLANS.starter,
    status: SUBSCRIPTION_STATUS.active,
    limitOverrides: {
      maxEmployees: 22,
    },
  },
  now,
});
assert.equal(customSub.valid, true);
assert.equal(customSub.limits.maxEmployees, 22);
pass();

// 9. canAddEmployee and isFeatureEntitled helpers
assert.equal(canAddEmployee({ activeEmployeeCount: 9, entitlements: activeStarter }), true);
assert.equal(canAddEmployee({ activeEmployeeCount: 10, entitlements: activeStarter }), false);
assert.equal(canAddEmployee({ activeEmployeeCount: 5, entitlements: expiredSub }), false);

assert.equal(isFeatureEntitled('enableAdvancedSolver', activeStarter), false);
assert.equal(isFeatureEntitled('enableAdvancedSolver', trialingPro), true);
assert.equal(isFeatureEntitled('enableAdvancedSolver', expiredSub), false);
pass();

console.log(`\n--- ALL ${testsCount} ENTITLEMENT RESOLVER TESTS PASSED ---`);
