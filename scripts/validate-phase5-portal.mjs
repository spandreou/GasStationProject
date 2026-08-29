import assert from 'node:assert/strict';
import {
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
  SLUG_REGEX,
  RESERVED_SLUGS,
  VALID_BUSINESS_CATEGORIES,
  BUSINESS_CATEGORY_OPTIONS,
  DEFAULT_BUSINESS_CATEGORY,
  TRIAL_DURATION_DAYS,
  PROVISIONING_ERROR_REASONS,
  validatePortalSlug,
  generateSlugFromDisplayName,
  resolveBusinessCategory,
  normalizeRegistrationError,
  buildProvisioningPayload,
  determinePostLoginDestination,
  resolveStoreSelectorState,
} from '../src/utils/portalHelpers.js';
import { firebaseAuthRepository } from '../src/repositories/firebase/firebaseAuthRepository.js';

console.log('--- RUNNING PHASE 5 PORTAL PRODUCTION-LINKED VALIDATION SUITE ---');

// ============================================================================
// 1. CONSTANTS & CONTRACT INVARIANTS
// ============================================================================
console.log('1. Verifying Phase 5 contract constants...');
assert.equal(SLUG_MIN_LENGTH, 3, 'SLUG_MIN_LENGTH must be 3');
assert.equal(SLUG_MAX_LENGTH, 40, 'SLUG_MAX_LENGTH must be 40');
assert.equal(DEFAULT_BUSINESS_CATEGORY, 'OTHER', 'Default business category must be OTHER');
assert.equal(TRIAL_DURATION_DAYS, 7, 'Trial duration copy must be 7 days');
assert.ok(VALID_BUSINESS_CATEGORIES.includes('OTHER'), 'OTHER must be in valid categories');
assert.ok(VALID_BUSINESS_CATEGORIES.includes('FUEL_STATION'), 'FUEL_STATION must be in valid categories');
console.log('✓ Constants verified.');

// ============================================================================
// 2. SLUG VALIDATION PRODUCTION HELPER
// ============================================================================
console.log('2. Testing validatePortalSlug production helper...');
// Length boundaries
assert.equal(validatePortalSlug('ab').valid, false, 'Slug length 2 must fail');
assert.equal(validatePortalSlug('ab').reason, 'TOO_SHORT');

assert.equal(validatePortalSlug('abc').valid, true, 'Slug length 3 must pass');
assert.equal(validatePortalSlug('a'.repeat(40)).valid, true, 'Slug length 40 must pass');

assert.equal(validatePortalSlug('a'.repeat(41)).valid, false, 'Slug length 41 must fail');
assert.equal(validatePortalSlug('a'.repeat(41)).reason, 'TOO_LONG');

// Format checks
assert.equal(validatePortalSlug('bp-kallis').valid, true, 'Valid slug bp-kallis must pass');
assert.equal(validatePortalSlug('my-store-123').valid, true, 'Valid slug my-store-123 must pass');
assert.equal(validatePortalSlug('BP-KALLIS').valid, true, 'Uppercase slug must normalize to lowercase and pass');
assert.equal(validatePortalSlug('BP-KALLIS').slug, 'bp-kallis');

assert.equal(validatePortalSlug('-leading-dash').valid, false, 'Leading dash must fail');
assert.equal(validatePortalSlug('-leading-dash').reason, 'INVALID_FORMAT');

assert.equal(validatePortalSlug('trailing-dash-').valid, false, 'Trailing dash must fail');
assert.equal(validatePortalSlug('trailing-dash-').reason, 'INVALID_FORMAT');

assert.equal(validatePortalSlug('with spaces').valid, false, 'Spaces must fail');
assert.equal(validatePortalSlug('with spaces').reason, 'INVALID_FORMAT');

assert.equal(validatePortalSlug('special$char').valid, false, 'Special characters must fail');
assert.equal(validatePortalSlug('special$char').reason, 'INVALID_FORMAT');

// Reserved slugs
for (const reserved of ['admin', 'api', 'app', 'portal', 'stores', 'login', 'register', 'shiftoryx']) {
  const res = validatePortalSlug(reserved);
  assert.equal(res.valid, false, `Reserved slug "${reserved}" must fail`);
  assert.equal(res.reason, 'RESERVED_SLUG');
}

// Slug generator from display name
assert.equal(generateSlugFromDisplayName('BP Κάλλης Store'), 'bp-store');
assert.equal(generateSlugFromDisplayName('My Super Cafe & Bar!'), 'my-super-cafe-bar');
assert.ok(generateSlugFromDisplayName('A'.repeat(100)).length <= 40, 'Generated slug must not exceed 40 chars');
console.log('✓ Slug validation production helper passed.');

// ============================================================================
// 3. BUSINESS CATEGORY RESOLUTION PRODUCTION HELPER
// ============================================================================
console.log('3. Testing resolveBusinessCategory production helper...');
assert.equal(resolveBusinessCategory('CAFE'), 'CAFE', 'Explicit valid category must be respected');
assert.equal(resolveBusinessCategory('cafe'), 'CAFE', 'Case insensitive explicit category must be normalized');
assert.equal(resolveBusinessCategory('INVALID_CAT', 'RESTAURANT'), 'RESTAURANT', 'Token hint used when explicit invalid');
assert.equal(resolveBusinessCategory(null, 'HAIR_SALON'), 'HAIR_SALON', 'Token hint used when explicit null');
assert.equal(resolveBusinessCategory(null, null), 'OTHER', 'Fallback to OTHER when no hint or selection');
assert.equal(resolveBusinessCategory('INVALID', 'INVALID_HINT'), 'OTHER', 'Fallback to OTHER when both invalid');
console.log('✓ Business category resolution passed.');

// ============================================================================
// 4. PROVISIONING PAYLOAD BUILDER & ALLOWLIST
// ============================================================================
console.log('4. Testing buildProvisioningPayload production helper...');
const validPayload = buildProvisioningPayload({
  token: 'stx_valid_token_1234567890abcdef',
  slug: 'test-store',
  displayName: 'Test Store Display Name',
  businessCategory: 'CAFE',
});

assert.deepEqual(validPayload, {
  token: 'stx_valid_token_1234567890abcdef',
  slug: 'test-store',
  displayName: 'Test Store Display Name',
  businessCategory: 'CAFE',
});

// Injection attempts
const forbiddenFields = [
  'uid',
  'ownerUid',
  'actorUid',
  'role',
  'status',
  'email',
  'domain',
  'templateId',
  'templateVersion',
  'platformAdmin',
  'createdBy',
  'createdAt',
];

for (const field of forbiddenFields) {
  assert.throws(
    () => buildProvisioningPayload({
      token: 'stx_1',
      slug: 'test-slug',
      displayName: 'Test Name',
      [field]: 'malicious-value',
    }),
    new RegExp(`Forbidden field "${field}" detected`),
    `Payload builder must reject forbidden field ${field}`,
  );
}
console.log('✓ Payload builder and injection prevention passed.');

// ============================================================================
// 5. ERROR NORMALIZATION PRODUCTION HELPER
// ============================================================================
console.log('5. Testing normalizeRegistrationError production helper...');

const testCases = [
  {
    input: { details: { reason: PROVISIONING_ERROR_REASONS.PLATFORM_ADMIN_OVERLAP } },
    expectedReason: PROVISIONING_ERROR_REASONS.PLATFORM_ADMIN_OVERLAP,
    expectedRetryable: false,
  },
  {
    input: { details: { reason: PROVISIONING_ERROR_REASONS.EXISTING_MEMBERSHIP } },
    expectedReason: PROVISIONING_ERROR_REASONS.EXISTING_MEMBERSHIP,
    expectedRetryable: false,
  },
  {
    input: { details: { reason: PROVISIONING_ERROR_REASONS.TENANT_SLUG_TAKEN } },
    expectedReason: PROVISIONING_ERROR_REASONS.TENANT_SLUG_TAKEN,
    expectedRetryable: true,
  },
  {
    input: { details: { reason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_EXPIRED } },
    expectedReason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_EXPIRED,
    expectedRetryable: false,
  },
  {
    input: { details: { reason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_REVOKED } },
    expectedReason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_REVOKED,
    expectedRetryable: false,
  },
  {
    input: { details: { reason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_CONSUMED } },
    expectedReason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_CONSUMED,
    expectedRetryable: false,
  },
  {
    input: { details: { reason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_INVALID } },
    expectedReason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_INVALID,
    expectedRetryable: false,
  },
  {
    input: { details: { reason: PROVISIONING_ERROR_REASONS.PROVISIONING_INTERNAL } },
    expectedReason: PROVISIONING_ERROR_REASONS.PROVISIONING_INTERNAL,
    expectedRetryable: true,
  },
  {
    input: new Error('Firebase: permission-denied /raw/firestore/path secret_leak'),
    expectedReason: 'UNKNOWN',
    expectedRetryable: true,
  },
];

for (const tc of testCases) {
  const result = normalizeRegistrationError(tc.input);
  assert.equal(result.reason, tc.expectedReason, `Reason should match ${tc.expectedReason}`);
  assert.equal(result.retryable, tc.expectedRetryable, `Retryable should match ${tc.expectedRetryable}`);
  assert.ok(result.message && typeof result.message === 'string', 'Message must be a non-empty string');
  assert.ok(!result.message.includes('secret_leak'), 'Raw error message must not leak');
  assert.ok(!result.message.includes('/raw/firestore/path'), 'Raw path must not leak');
}
console.log('✓ Error normalization passed.');

// ============================================================================
// 6. ROUTING DECISION & SELECTOR STATE PRODUCTION HELPERS
// ============================================================================
console.log('6. Testing routing decisions and store selector state helpers...');

// Platform Admin routing
assert.deepEqual(
  determinePostLoginDestination({ isPlatformAdmin: true, destination: { type: 'stores', url: '/stores' } }),
  { type: 'admin', url: '/admin' },
  'Platform Admin must route to /admin',
);

// returnTo routing
assert.deepEqual(
  determinePostLoginDestination({ isPlatformAdmin: false, returnTo: 'https://tenant-a.homelabshare.gr/app' }),
  { type: 'returnTo', url: 'https://tenant-a.homelabshare.gr/app' },
  'Authorized returnTo must be respected',
);

// Destination routing
assert.deepEqual(
  determinePostLoginDestination({ isPlatformAdmin: false, destination: { type: 'redirect', url: 'https://tenant-a.homelabshare.gr' } }),
  { type: 'tenant', url: 'https://tenant-a.homelabshare.gr' },
  'Tenant redirect destination must be respected',
);

// Fallback to /stores
assert.deepEqual(
  determinePostLoginDestination({ isPlatformAdmin: false, destination: null }),
  { type: 'stores', url: '/stores' },
  'Fallback destination must be /stores',
);

// Selector states
assert.equal(resolveStoreSelectorState({ user: null }), 'unauthenticated');
assert.equal(resolveStoreSelectorState({ user: { uid: 'u1' }, tenants: [] }), 'no-access');
assert.equal(resolveStoreSelectorState({ user: { uid: 'u1' }, tenants: [{ tenantId: 't1' }] }), 'ready');
assert.equal(resolveStoreSelectorState({ user: { uid: 'u1' }, tenants: [{ tenantId: 't1' }, { tenantId: 't2' }] }), 'ready');
console.log('✓ Routing decision and store selector state helpers passed.');

// ============================================================================
// 7. REAL PLATFORM ADMIN REPOSITORY CONTRACT
// ============================================================================
console.log('7. Testing real platform admin repository method contract...');
assert.equal(
  typeof firebaseAuthRepository.isPlatformAdmin,
  'function',
  'firebaseAuthRepository.isPlatformAdmin must be a defined function',
);

// Call with invalid/empty input (fail-closed)
const nullResult = await firebaseAuthRepository.isPlatformAdmin(null);
assert.equal(nullResult, false, 'isPlatformAdmin(null) must return false');

const emptyResult = await firebaseAuthRepository.isPlatformAdmin('');
assert.equal(emptyResult, false, 'isPlatformAdmin("") must return false');
console.log('✓ Real platform admin repository method contract verified.');

console.log('--- ALL PHASE 5 PORTAL PRODUCTION-LINKED VALIDATION TESTS PASSED ---');
