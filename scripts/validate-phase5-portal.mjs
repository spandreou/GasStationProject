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
  determinePostLoginDestination({
    isPlatformAdmin: true,
    authorizedReturnTo: null,
    centralDestination: { type: 'stores', url: '/stores' },
  }),
  { type: 'admin', url: '/admin' },
  'Platform Admin must route to /admin',
);

// Authorized returnTo routing
assert.deepEqual(
  determinePostLoginDestination({
    isPlatformAdmin: false,
    authorizedReturnTo: { allowed: true, url: 'https://bp-kallis.homelabshare.gr/app', access: { tenant: { id: 'bp-kallis' } } },
    centralDestination: { type: 'stores', url: '/stores' },
  }),
  { type: 'authorizedReturnTo', url: 'https://bp-kallis.homelabshare.gr/app', tenantId: 'bp-kallis' },
  'Authorized returnTo must be respected',
);

// Unauthorized returnTo fallback to destination
assert.deepEqual(
  determinePostLoginDestination({
    isPlatformAdmin: false,
    authorizedReturnTo: { allowed: false, url: null },
    centralDestination: { type: 'redirect', url: 'https://bp-kallis.homelabshare.gr', tenant: { id: 'bp-kallis' } },
  }),
  { type: 'tenant', url: 'https://bp-kallis.homelabshare.gr', tenantId: 'bp-kallis' },
  'Unauthorized returnTo must fall back to single tenant destination',
);

// Single tenant destination routing
assert.deepEqual(
  determinePostLoginDestination({
    isPlatformAdmin: false,
    authorizedReturnTo: null,
    centralDestination: { type: 'redirect', url: 'https://bp-kallis.homelabshare.gr', tenant: { id: 'bp-kallis' } },
  }),
  { type: 'tenant', url: 'https://bp-kallis.homelabshare.gr', tenantId: 'bp-kallis' },
  'Tenant redirect destination must be respected',
);

// Multi-tenant selection routing
assert.deepEqual(
  determinePostLoginDestination({
    isPlatformAdmin: false,
    authorizedReturnTo: null,
    centralDestination: { type: 'select', tenants: [{ tenantId: 't1' }, { tenantId: 't2' }] },
  }),
  { type: 'select', url: '/select-tenant' },
  'Multi-tenant select destination must route to /select-tenant',
);

// Fallback to /stores (zero memberships)
assert.deepEqual(
  determinePostLoginDestination({
    isPlatformAdmin: false,
    authorizedReturnTo: null,
    centralDestination: null,
  }),
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
// 7. REAL PLATFORM ADMIN & AUTH REPOSITORY CONTRACT
// ============================================================================
console.log('7. Testing real platform admin & auth repository method contracts...');
assert.equal(
  typeof firebaseAuthRepository.isPlatformAdmin,
  'function',
  'firebaseAuthRepository.isPlatformAdmin must be a defined function',
);
assert.equal(
  typeof firebaseAuthRepository.createUserAccount,
  'function',
  'firebaseAuthRepository.createUserAccount must be a defined function',
);

// Call with invalid/empty input (fail-closed)
const nullResult = await firebaseAuthRepository.isPlatformAdmin(null);
assert.equal(nullResult, false, 'isPlatformAdmin(null) must return false');

const emptyResult = await firebaseAuthRepository.isPlatformAdmin('');
assert.equal(emptyResult, false, 'isPlatformAdmin("") must return false');
console.log('✓ Real platform admin & auth repository method contracts verified.');

// ============================================================================
// 8. REGISTER PAGE UX & DOMAIN CONTRACT ASSERTIONS
// ============================================================================
console.log('8. Testing RegisterPage UX and domain boundary contracts...');
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const registerPageCode = fs.readFileSync(path.resolve(__dirname, '../src/components/auth/RegisterPage.jsx'), 'utf8');

// Assert no premature .shiftoryx.gr operational construction in RegisterPage
assert.ok(
  !registerPageCode.includes('.shiftoryx.gr'),
  'RegisterPage must NOT construct or imply operational .shiftoryx.gr tenant URLs in Phase 5',
);
assert.ok(
  !registerPageCode.includes('https://'),
  'RegisterPage slug input must NOT prepend https:// protocol prefix',
);

// Assert no false schedule generation copy
assert.ok(
  !registerPageCode.includes('δημιουργούμε το πρόγραμμα βαρδιών σας'),
  'RegisterPage must NOT falsely claim that a full work schedule is generated during tenant provisioning',
);
assert.ok(
  registerPageCode.includes('αρχικοποιούμε τις βασικές ρυθμίσεις του καταστήματος'),
  'RegisterPage must accurately describe initialization of basic store settings',
);

// Assert direct createUserAccount call
assert.ok(
  registerPageCode.includes('authRepository.createUserAccount({'),
  'RegisterPage must call authRepository.createUserAccount directly without optional chaining',
);
assert.ok(
  !registerPageCode.includes('authRepository.createUserAccount?.('),
  'RegisterPage must NOT use optional chaining on authRepository.createUserAccount',
);
console.log('✓ RegisterPage UX and domain boundary contracts verified.');

console.log('--- ALL PHASE 5 PORTAL PRODUCTION-LINKED VALIDATION TESTS PASSED ---');
