import assert from 'node:assert/strict';
import {
  deriveEffectiveStatus,
  generateManagementTokenId,
  generateRawRegistrationToken,
  hashRegistrationToken,
  validateManagementTokenIdFormat,
  validateRegistrationTokenFormat,
  validateTokenGenerationInput,
  validateTokenListInput,
  validateTokenRevokeInput,
} from '../functions/src/registrationTokenCore.js';

console.log('--- RUNNING HARDENED REGISTRATION TOKEN CORE UNIT TESTS ---');

// 1. Raw Token Generation & Format
const rawToken = generateRawRegistrationToken();
assert.ok(rawToken.startsWith('stx_'), 'Token must start with stx_');
assert.equal(rawToken.length, 47, 'Token must be 47 characters long');
const validFormat = validateRegistrationTokenFormat(rawToken);
assert.equal(validFormat.valid, true, 'Generated token must pass format validation');

// 2. Management Token ID Generation & Format
const tokenId = generateManagementTokenId();
assert.ok(tokenId.startsWith('rtok_'), 'Management tokenId must start with rtok_');
assert.equal(tokenId.length, 37, 'Management tokenId must be 37 characters long (rtok_ + 32 hex chars)');
const validIdFormat = validateManagementTokenIdFormat(tokenId);
assert.equal(validIdFormat.valid, true, 'Generated management tokenId must pass format validation');

// 3. Separation of Management ID and Token Hash
const tokenHash = hashRegistrationToken(rawToken);
assert.equal(tokenHash.length, 64, 'Token hash must be 64-char SHA256 hex string');
assert.notEqual(tokenId, tokenHash, 'CRITICAL: Management tokenId must NOT equal tokenHash');
assert.equal(validateManagementTokenIdFormat(tokenHash).valid, false, 'SHA256 hash must not be accepted as management tokenId');
assert.equal(validateRegistrationTokenFormat(tokenId).valid, false, 'Management tokenId must not be accepted as raw token');

// 4. Fail-Closed Status Derivation Tests
const now = 1000000;

// 4a. ACTIVE + future expiry -> ACTIVE
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAtMs: now + 5000 }, now),
  'ACTIVE',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: { toMillis: () => now + 5000 } }, now),
  'ACTIVE',
);

// 4b. ACTIVE + expired expiry -> EXPIRED
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAtMs: now - 1 }, now),
  'EXPIRED',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAtMs: now }, now),
  'EXPIRED',
);

// 4c. FAIL-CLOSED: ACTIVE + missing/malformed expiry -> INVALID (NEVER ACTIVE!)
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE' }, now),
  'INVALID',
  'ACTIVE token without expiry must fail closed as INVALID',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: null }, now),
  'INVALID',
  'ACTIVE token with null expiry must fail closed as INVALID',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAtMs: NaN }, now),
  'INVALID',
  'ACTIVE token with NaN expiry must fail closed as INVALID',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: 'not-a-date' }, now),
  'INVALID',
  'ACTIVE token with string expiry must fail closed as INVALID',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAtMs: -100 }, now),
  'INVALID',
  'ACTIVE token with negative expiry must fail closed as INVALID',
);

// 4d. Other states
assert.equal(deriveEffectiveStatus({ status: 'REVOKED' }, now), 'REVOKED');
assert.equal(deriveEffectiveStatus({ status: 'CONSUMED' }, now), 'CONSUMED');
assert.equal(deriveEffectiveStatus({ status: 'UNKNOWN_HACK' }, now), 'INVALID');
assert.equal(deriveEffectiveStatus(null, now), 'INVALID');

// 5. Strict Generation Input Validation
const validGen = validateTokenGenerationInput({
  expiresInHours: 24,
  label: 'Test Label',
  businessCategoryHint: 'FUEL_STATION',
});
assert.equal(validGen.expiresInHours, 24);
assert.equal(validGen.label, 'Test Label');
assert.equal(validGen.businessCategoryHint, 'FUEL_STATION');

// Unknown fields rejected
assert.throws(
  () => validateTokenGenerationInput({ expiresInHours: 24, unexpectedField: 'hack' }),
  /unexpected-input-field-unexpectedField/,
);
// Out of range TTL rejected
assert.throws(
  () => validateTokenGenerationInput({ expiresInHours: 0 }),
  /invalid-expires-in-hours/,
);
assert.throws(
  () => validateTokenGenerationInput({ expiresInHours: 1000 }),
  /invalid-expires-in-hours/,
);
// Invalid category rejected
assert.throws(
  () => validateTokenGenerationInput({ businessCategoryHint: 'INVALID_CATEGORY' }),
  /invalid-business-category-hint/,
);

// 6. Strict List Input Validation
const validList = validateTokenListInput({ limit: 50, startAfterCursor: 'rtok_123' });
assert.equal(validList.limit, 50);
assert.equal(validList.startAfterCursor, 'rtok_123');

// Unknown fields rejected
assert.throws(
  () => validateTokenListInput({ limit: 10, evil: true }),
  /unexpected-input-field-evil/,
);
// Out of range limit rejected
assert.throws(() => validateTokenListInput({ limit: 0 }), /invalid-limit/);
assert.throws(() => validateTokenListInput({ limit: 200 }), /invalid-limit/);

// 7. Strict Revoke Input Validation
const validRevoke = validateTokenRevokeInput({ tokenId });
assert.equal(validRevoke.tokenId, tokenId);

// Unknown fields rejected
assert.throws(
  () => validateTokenRevokeInput({ tokenId, extra: 1 }),
  /unexpected-input-field-extra/,
);
// Invalid tokenId format rejected
assert.throws(
  () => validateTokenRevokeInput({ tokenId: 'hack' }),
  /invalid-token-id/,
);
assert.throws(
  () => validateTokenRevokeInput({ tokenId: rawToken }),
  /invalid-token-id/,
);
assert.throws(
  () => validateTokenRevokeInput({ tokenId: tokenHash }),
  /invalid-token-id/,
);

console.log('--- ALL HARDENED REGISTRATION TOKEN CORE UNIT TESTS PASSED ---');
