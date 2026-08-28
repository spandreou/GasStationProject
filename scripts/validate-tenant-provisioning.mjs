import assert from 'node:assert/strict';
import {
  CATEGORY_TEMPLATE_MAP,
  DEFAULT_BUSINESS_CATEGORY,
  DEFAULT_CUSTOMIZATION_MODE,
  DEFAULT_TEMPLATE_ID,
  DEFAULT_TEMPLATE_VERSION,
  RESERVED_SLUGS,
  VALID_BUSINESS_CATEGORIES,
  resolveCategoryAndTemplate,
  validateDisplayName,
  validateProvisioningInput,
  validateTenantSlug,
} from '../functions/src/provisioningCore.js';

console.log('--- RUNNING PHASE 4 TENANT PROVISIONING CORE VALIDATION SUITE ---');

// 1. Slug Validation Tests
const validSlugs = ['eko-station', 'bp-kallis-2', 'my-cafe', 'salon-123', 'retail-store'];
for (const slug of validSlugs) {
  assert.equal(validateTenantSlug(slug), slug, `Slug "${slug}" should be valid`);
}

// Uppercase normalized to lowercase
assert.equal(validateTenantSlug('EKO-Station-1'), 'eko-station-1');

// Invalid length
assert.throws(() => validateTenantSlug('ab'), /slug length must be between 3 and 64 characters/);
assert.throws(() => validateTenantSlug('a'.repeat(65)), /slug length must be between 3 and 64 characters/);

// Invalid characters
assert.throws(() => validateTenantSlug('-start-hyphen'), /cannot start or end with a hyphen/);
assert.throws(() => validateTenantSlug('end-hyphen-'), /cannot start or end with a hyphen/);
assert.throws(() => validateTenantSlug('has_underscore'), /lowercase alphanumeric characters and hyphens/);
assert.throws(() => validateTenantSlug('has space'), /lowercase alphanumeric characters and hyphens/);
assert.throws(() => validateTenantSlug('has!special'), /lowercase alphanumeric characters and hyphens/);

// Reserved slugs
for (const reserved of RESERVED_SLUGS) {
  assert.throws(() => validateTenantSlug(reserved), /reserved for platform services/);
}

// Prohibited prefixes & suffixes
assert.throws(() => validateTenantSlug('gas-station'), /cannot start with "gas-"/);
assert.throws(() => validateTenantSlug('station-gas'), /cannot start with "gas-" or end with "-gas"/);
assert.throws(() => validateTenantSlug('shiftoryx-tenant'), /cannot start with "shiftoryx-"/);
assert.throws(() => validateTenantSlug('tenant-shiftoryx'), /cannot start with "shiftoryx-" or end with "-shiftoryx"/);

console.log('Slug validation tests passed.');

// 2. Display Name Validation Tests
assert.equal(validateDisplayName('  EKO Station Kallis  '), 'EKO Station Kallis');
assert.equal(validateDisplayName('Café & Bistro 100%'), 'Café & Bistro 100%');
assert.equal(validateDisplayName('Πρατήριο Καυσίμων'), 'Πρατήριο Καυσίμων');

assert.throws(() => validateDisplayName(''), /displayName length must be between 1 and 100 characters/);
assert.throws(() => validateDisplayName('   '), /displayName length must be between 1 and 100 characters/);
assert.throws(() => validateDisplayName('x'.repeat(101)), /displayName length must be between 1 and 100 characters/);
assert.throws(() => validateDisplayName('Bad\x00Name'), /cannot contain control characters/);
assert.throws(() => validateDisplayName('Bad\nName'), /cannot contain control characters/);

console.log('Display name validation tests passed.');

// 3. Business Category & Template Resolution Tests
assert.equal(DEFAULT_BUSINESS_CATEGORY, 'OTHER');
assert.equal(DEFAULT_TEMPLATE_ID, 'generic-default');
assert.equal(DEFAULT_TEMPLATE_VERSION, '1.0.0');
assert.equal(DEFAULT_CUSTOMIZATION_MODE, 'STANDARD');

for (const cat of VALID_BUSINESS_CATEGORIES) {
  const resolved = resolveCategoryAndTemplate(cat);
  assert.equal(resolved.businessCategory, cat);
  assert.equal(resolved.templateId, CATEGORY_TEMPLATE_MAP[cat].templateId);
  assert.equal(resolved.templateVersion, '1.0.0');
  assert.equal(resolved.customizationMode, 'STANDARD');
}

// Fallback to token hint if category is omitted
const resolvedWithHint = resolveCategoryAndTemplate(undefined, 'CAFE');
assert.equal(resolvedWithHint.businessCategory, 'CAFE');
assert.equal(resolvedWithHint.templateId, 'cafe-default');

// Safe OTHER fallback if hint is invalid or omitted
const resolvedDefault = resolveCategoryAndTemplate(undefined, undefined);
assert.equal(resolvedDefault.businessCategory, 'OTHER');
assert.equal(resolvedDefault.templateId, 'generic-default');

const resolvedInvalidHint = resolveCategoryAndTemplate(undefined, 'INVALID_HINT');
assert.equal(resolvedInvalidHint.businessCategory, 'OTHER');
assert.equal(resolvedInvalidHint.templateId, 'generic-default');

// Invalid category explicit value throws
assert.throws(() => resolveCategoryAndTemplate('INVALID_CATEGORY'), /businessCategory must be one of:/);
assert.throws(() => resolveCategoryAndTemplate(123), /businessCategory must be a string/);

console.log('Business category and template resolution tests passed.');

// 4. Provisioning Input Validation (Strict Unknown & Forbidden Rejection)
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
];

for (const forbidden of forbiddenFields) {
  assert.throws(
    () => validateProvisioningInput({ ...validPayload, ...forbidden }),
    /Forbidden field detected:/,
    `Forbidden field "${Object.keys(forbidden)[0]}" must be rejected`,
  );
}

// Unknown field rejection
assert.throws(
  () => validateProvisioningInput({ ...validPayload, unexpectedExtraField: 'value' }),
  /Unknown field detected: "unexpectedExtraField"/,
);

// Malformed token format
assert.throws(
  () => validateProvisioningInput({ ...validPayload, token: 'invalid_token_no_prefix' }),
  /Invalid registration token format/,
);
assert.throws(
  () => validateProvisioningInput({ ...validPayload, token: 'stx_short' }),
  /Invalid registration token format/,
);

console.log('Input tampering and security validation tests passed.');
console.log('--- ALL PHASE 4 CORE VALIDATION TESTS PASSED SUCCESSFULLY ---');
