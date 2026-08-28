import assert from 'node:assert/strict';

console.log('--- RUNNING PHASE 5 PORTAL UNIT VALIDATION SUITE ---');

// 1. Slug Syntax & UX Validation
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

function validateSlug(slug) {
  if (typeof slug !== 'string') return false;
  const trimmed = slug.trim().toLowerCase();
  return SLUG_REGEX.test(trimmed);
}

assert.equal(validateSlug('bp-kallis'), true, 'Valid slug "bp-kallis" must pass');
assert.equal(validateSlug('my-cafe-123'), true, 'Valid slug "my-cafe-123" must pass');
assert.equal(validateSlug('a-b'), true, 'Valid slug "a-b" (3 chars) must pass');
assert.equal(validateSlug('ab'), false, 'Too short slug (<3 chars) must fail');
assert.equal(validateSlug('-leading-dash'), false, 'Leading dash must fail');
assert.equal(validateSlug('trailing-dash-'), false, 'Trailing dash must fail');
assert.equal(validateSlug('UPPERCASE'), true, 'Uppercase should be lowercased and pass if valid format');
assert.equal(validateSlug('with spaces'), false, 'Spaces must fail');
assert.equal(validateSlug('special$char'), false, 'Special chars must fail');
console.log('Slug syntax validation passed.');

// 2. Business Category Allowlist & Fallback
const ALLOWED_CATEGORIES = new Set([
  'FUEL_STATION',
  'CAFE',
  'RESTAURANT',
  'HAIR_SALON',
  'RETAIL',
  'OTHER',
]);

function normalizeCategory(category, hint) {
  const norm = String(category || '').trim().toUpperCase();
  if (ALLOWED_CATEGORIES.has(norm)) return norm;
  const normHint = String(hint || '').trim().toUpperCase();
  if (ALLOWED_CATEGORIES.has(normHint)) return normHint;
  return 'OTHER';
}

assert.equal(normalizeCategory('FUEL_STATION'), 'FUEL_STATION');
assert.equal(normalizeCategory('cafe'), 'CAFE');
assert.equal(normalizeCategory('UNKNOWN_CAT', 'RESTAURANT'), 'RESTAURANT');
assert.equal(normalizeCategory('UNKNOWN_CAT', 'UNKNOWN_HINT'), 'OTHER');
assert.equal(normalizeCategory(null), 'OTHER');
console.log('Business category normalization passed.');

// 3. Provisioning Client Payload Sanitization
function sanitizeClientProvisioningPayload(input) {
  const allowedKeys = new Set(['token', 'slug', 'displayName', 'businessCategory']);
  const forbiddenAttempted = Object.keys(input).filter((k) => !allowedKeys.has(k));
  if (forbiddenAttempted.length > 0) {
    throw new Error(`Forbidden client fields detected: ${forbiddenAttempted.join(', ')}`);
  }

  return {
    token: String(input.token || '').trim(),
    slug: String(input.slug || '').trim().toLowerCase(),
    displayName: String(input.displayName || '').trim(),
    businessCategory: normalizeCategory(input.businessCategory),
  };
}

const safePayload = sanitizeClientProvisioningPayload({
  token: 'stx_test_token_123',
  slug: 'test-store',
  displayName: 'Test Store',
  businessCategory: 'CAFE',
});
assert.deepEqual(safePayload, {
  token: 'stx_test_token_123',
  slug: 'test-store',
  displayName: 'Test Store',
  businessCategory: 'CAFE',
});

assert.throws(
  () => sanitizeClientProvisioningPayload({ token: 'stx_1', slug: 's', displayName: 'N', role: 'ADMIN' }),
  /Forbidden client fields detected: role/,
  'Client injecting role must throw error',
);

assert.throws(
  () => sanitizeClientProvisioningPayload({ token: 'stx_1', slug: 's', displayName: 'N', uid: 'attacker-uid' }),
  /Forbidden client fields detected: uid/,
  'Client injecting uid must throw error',
);

assert.throws(
  () => sanitizeClientProvisioningPayload({ token: 'stx_1', slug: 's', displayName: 'N', status: 'ACTIVE' }),
  /Forbidden client fields detected: status/,
  'Client injecting status must throw error',
);

assert.throws(
  () => sanitizeClientProvisioningPayload({ token: 'stx_1', slug: 's', displayName: 'N', templateId: 'fake-tpl' }),
  /Forbidden client fields detected: templateId/,
  'Client injecting templateId must throw error',
);
console.log('Payload sanitization and injection prevention passed.');

// 4. Portal Routing Logic Decision Tree
function determinePostLoginDestination({ isPlatformAdmin, tenants, returnTo }) {
  if (isPlatformAdmin) {
    return { type: 'admin', url: '/admin-console' };
  }

  if (returnTo) {
    return { type: 'returnTo', url: returnTo };
  }

  if (!tenants || tenants.length === 0) {
    return { type: 'onboarding', url: '/stores' };
  }

  if (tenants.length === 1) {
    return { type: 'tenant', url: tenants[0].url || `/app` };
  }

  return { type: 'select', url: '/stores' };
}

assert.equal(
  determinePostLoginDestination({ isPlatformAdmin: true, tenants: [] }).url,
  '/admin-console',
  'Platform Admin must route to /admin-console',
);

assert.equal(
  determinePostLoginDestination({ isPlatformAdmin: false, tenants: [] }).url,
  '/stores',
  'Zero-membership user must route to /stores onboarding',
);

assert.equal(
  determinePostLoginDestination({ isPlatformAdmin: false, tenants: [{ url: 'https://store-a.shiftoryx.gr' }] }).url,
  'https://store-a.shiftoryx.gr',
  'Single tenant user must route to tenant URL',
);

assert.equal(
  determinePostLoginDestination({
    isPlatformAdmin: false,
    tenants: [{ url: 'https://store-a.shiftoryx.gr' }, { url: 'https://store-b.shiftoryx.gr' }],
  }).url,
  '/stores',
  'Multiple tenant user must route to /stores selector',
);

console.log('Portal routing decision logic passed.');
console.log('--- ALL PHASE 5 PORTAL UNIT VALIDATION TESTS PASSED SUCCESSFULLY ---');
