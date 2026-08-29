import assert from 'node:assert/strict';
import {
  DEFAULT_BUSINESS_CATEGORY,
  DEFAULT_CUSTOMIZATION_MODE,
  PROVISIONING_ERROR_REASONS,
  ProvisioningValidationError,
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  TRIAL_DURATION_DAYS,
  VALID_BUSINESS_CATEGORIES,
  resolveBusinessCategory,
  validateDisplayName,
  validateProvisioningInput,
  validateTenantSlug,
} from '../functions/src/provisioningCore.js';

console.log('--- RUNNING PHASE 4 TENANT PROVISIONING CORE VALIDATION SUITE ---');

// 1. Slug Validation Tests & Exact Boundary Checks (3-40)
assert.equal(SLUG_MIN_LENGTH, 3);
assert.equal(SLUG_MAX_LENGTH, 40);

const validSlugs = ['eko-station', 'bp-kallis-2', 'my-cafe', 'salon-123', 'retail-store'];
for (const slug of validSlugs) {
  assert.equal(validateTenantSlug(slug), slug, `Slug "${slug}" should be valid`);
}

// Uppercase normalized to lowercase
assert.equal(validateTenantSlug('EKO-Station-1'), 'eko-station-1');

// Exact Length Boundary Tests
// Length 2 -> Fail
assert.throws(
  () => validateTenantSlug('ab'),
  (err) => err instanceof ProvisioningValidationError && err.reason === PROVISIONING_ERROR_REASONS.INVALID_ARGUMENT,
);
// Length 3 -> Pass
const slug3 = 'abc';
assert.equal(validateTenantSlug(slug3), 'abc', '3-character slug must be valid');
// Length 40 -> Pass
const slug40 = 'a' + 'b'.repeat(38) + 'c';
assert.equal(slug40.length, 40);
assert.equal(validateTenantSlug(slug40), slug40, '40-character slug must be valid');
// Length 41 -> Fail
const slug41 = 'a' + 'b'.repeat(39) + 'c';
assert.equal(slug41.length, 41);
assert.throws(
  () => validateTenantSlug(slug41),
  (err) => err instanceof ProvisioningValidationError && err.reason === PROVISIONING_ERROR_REASONS.INVALID_ARGUMENT,
);
// Length 64 -> Fail
assert.throws(
  () => validateTenantSlug('a'.repeat(64)),
  (err) => err instanceof ProvisioningValidationError && err.reason === PROVISIONING_ERROR_REASONS.INVALID_ARGUMENT,
);

// Invalid characters
assert.throws(() => validateTenantSlug('-start-hyphen'), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => validateTenantSlug('end-hyphen-'), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => validateTenantSlug('has_underscore'), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => validateTenantSlug('has space'), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => validateTenantSlug('has!special'), (err) => err instanceof ProvisioningValidationError);

// Reserved slugs
for (const reserved of RESERVED_SLUGS) {
  assert.throws(() => validateTenantSlug(reserved), (err) => err instanceof ProvisioningValidationError);
}

// Prohibited prefixes & suffixes
assert.throws(() => validateTenantSlug('gas-station'), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => validateTenantSlug('station-gas'), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => validateTenantSlug('shiftoryx-tenant'), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => validateTenantSlug('tenant-shiftoryx'), (err) => err instanceof ProvisioningValidationError);

console.log('Slug validation and exact boundary tests passed (3-40 chars).');

// 2. Display Name Validation Tests
assert.equal(validateDisplayName('  EKO Station Kallis  '), 'EKO Station Kallis');
assert.equal(validateDisplayName('Café & Bistro 100%'), 'Café & Bistro 100%');
assert.equal(validateDisplayName('Πρατήριο Καυσίμων'), 'Πρατήριο Καυσίμων');

assert.throws(() => validateDisplayName(''), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => validateDisplayName('   '), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => validateDisplayName('x'.repeat(101)), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => validateDisplayName('Bad\x00Name'), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => validateDisplayName('Bad\nName'), (err) => err instanceof ProvisioningValidationError);

console.log('Display name validation tests passed.');

// 3. Business Category Precedence & Trial Constants
assert.equal(DEFAULT_BUSINESS_CATEGORY, 'OTHER');
assert.equal(DEFAULT_CUSTOMIZATION_MODE, 'STANDARD');
assert.equal(TRIAL_DURATION_DAYS, 7, 'Trial duration must be exactly 7 days');

// Explicit valid categories
for (const cat of VALID_BUSINESS_CATEGORIES) {
  const resolved = resolveBusinessCategory(cat);
  assert.equal(resolved, cat, `Explicit category ${cat} must resolve to ${cat}`);
}

// Case insensitive normalization
assert.equal(resolveBusinessCategory('cafe'), 'CAFE');
assert.equal(resolveBusinessCategory(' fuel_station '), 'FUEL_STATION');

// Token hint fallback when client category omitted
assert.equal(resolveBusinessCategory(undefined, 'CAFE'), 'CAFE');
assert.equal(resolveBusinessCategory(null, 'RESTAURANT'), 'RESTAURANT');

// Safe OTHER default when both client category and token hint are omitted or invalid
assert.equal(resolveBusinessCategory(undefined, undefined), 'OTHER');
assert.equal(resolveBusinessCategory(undefined, 'INVALID_HINT'), 'OTHER');

// Explicit invalid category throws
assert.throws(() => resolveBusinessCategory('INVALID_CATEGORY'), (err) => err instanceof ProvisioningValidationError);
assert.throws(() => resolveBusinessCategory(123), (err) => err instanceof ProvisioningValidationError);

console.log('Business category precedence and 7-day trial constant tests passed.');

// 4. Structured Error Reasons Vocabulary
assert.equal(PROVISIONING_ERROR_REASONS.PLATFORM_ADMIN_OVERLAP, 'platform-admin-overlap');
assert.equal(PROVISIONING_ERROR_REASONS.EXISTING_MEMBERSHIP, 'existing-membership');
assert.equal(PROVISIONING_ERROR_REASONS.TENANT_SLUG_TAKEN, 'tenant-slug-taken');
assert.equal(PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_EXPIRED, 'registration-token-expired');
assert.equal(PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_REVOKED, 'registration-token-revoked');
assert.equal(PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_CONSUMED, 'registration-token-consumed');
assert.equal(PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_INVALID, 'registration-token-invalid');
assert.equal(PROVISIONING_ERROR_REASONS.PROVISIONING_INTERNAL, 'provisioning-internal');
assert.equal(PROVISIONING_ERROR_REASONS.INVALID_ARGUMENT, 'invalid-argument');
assert.equal(PROVISIONING_ERROR_REASONS.UNAUTHENTICATED, 'unauthenticated');

console.log('Structured error reasons vocabulary tests passed.');

// 5. Provisioning Input Validation (Strict Unknown & Forbidden Rejection)
const validToken = 'stx_abcdef1234567890abcdef1234567890abcdef12345';
const validPayload = {
  token: validToken,
  slug: 'eko-kallis',
  displayName: 'EKO Kallis Station',
  businessCategory: 'FUEL_STATION',
};

const validated = validateProvisioningInput(validPayload);
assert.equal(validated.token, validToken);
assert.equal(validated.slug, 'eko-kallis');
assert.equal(validated.displayName, 'EKO Kallis Station');
assert.equal(validated.businessCategory, 'FUEL_STATION');

// Forbidden field tampering
const forbiddenFields = [
  { role: 'OWNER' },
  { role: 'ADMIN' },
  { role: 'MANAGER' },
  { ownerUid: 'forged-uid' },
  { adminUid: 'forged-uid' },
  { actorUid: 'forged-uid' },
  { status: 'ACTIVE' },
  { createdBy: 'hacker' },
  { platformAdmin: true },
  { membershipRole: 'OWNER' },
  { memberships: {} },
  { domain: 'custom.domain.com' },
  { templateId: 'malicious-template' },
  { templateVersion: '9.9.9' },
  { brandingOverrides: { customCss: 'evil' } },
  { customizationMode: 'UNRESTRICTED' },
  { email: 'user-injected@evil.com' },
];

for (const forbidden of forbiddenFields) {
  assert.throws(
    () => validateProvisioningInput({ ...validPayload, ...forbidden }),
    (err) => err instanceof ProvisioningValidationError && err.reason === PROVISIONING_ERROR_REASONS.INVALID_ARGUMENT,
    `Forbidden field "${Object.keys(forbidden)[0]}" must be rejected`,
  );
}

// Unknown field rejection
assert.throws(
  () => validateProvisioningInput({ ...validPayload, unexpectedExtraField: 'value' }),
  (err) => err instanceof ProvisioningValidationError && err.reason === PROVISIONING_ERROR_REASONS.INVALID_ARGUMENT,
);

// Malformed token format
assert.throws(
  () => validateProvisioningInput({ ...validPayload, token: 'invalid_token_no_prefix' }),
  (err) => err instanceof ProvisioningValidationError && err.reason === PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_INVALID,
);
assert.throws(
  () => validateProvisioningInput({ ...validPayload, token: 'stx_short' }),
  (err) => err instanceof ProvisioningValidationError && err.reason === PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_INVALID,
);

console.log('Input tampering and security validation tests passed.');
console.log('--- ALL PHASE 4 CORE VALIDATION TESTS PASSED SUCCESSFULLY ---');
