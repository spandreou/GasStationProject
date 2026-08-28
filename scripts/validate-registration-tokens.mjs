import assert from 'node:assert/strict';
import {
  deriveEffectiveStatus,
  generateManagementTokenId,
  generateRawRegistrationToken,
  hashRegistrationToken,
  validateConsumedByActor,
  validateManagementTokenIdFormat,
  validateRegistrationTokenFormat,
  validateTokenGenerationInput,
  validateTokenListInput,
  validateTokenRevokeInput,
} from '../functions/src/registrationTokenCore.js';

console.log('--- RUNNING FINAL HARDENED REGISTRATION TOKEN CORE UNIT TESTS ---');

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

// 4. Fail-Closed Status Derivation Tests (Canonical expiresAt Only)
const now = 1000000;

// 4a. ACTIVE + future canonical expiresAt -> ACTIVE
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: now + 5000 }, now),
  'ACTIVE',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: { toMillis: () => now + 5000 } }, now),
  'ACTIVE',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: new Date(now + 5000) }, now),
  'ACTIVE',
);

// 4b. ACTIVE + expired expiry -> EXPIRED
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: now - 1 }, now),
  'EXPIRED',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: now }, now),
  'EXPIRED',
);

// 4c. FAIL-CLOSED: Secondary expiresAtMs MUST NOT rescue missing/malformed expiresAt!
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAtMs: now + 50000 }, now),
  'INVALID',
  'Missing canonical expiresAt with valid expiresAtMs MUST fail closed as INVALID',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: 'not-a-timestamp', expiresAtMs: now + 50000 }, now),
  'INVALID',
  'Malformed canonical expiresAt with valid expiresAtMs MUST fail closed as INVALID',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: null, expiresAtMs: now + 50000 }, now),
  'INVALID',
  'Null canonical expiresAt with valid expiresAtMs MUST fail closed as INVALID',
);

// 4d. Other states
assert.equal(deriveEffectiveStatus({ status: 'REVOKED' }, now), 'REVOKED');
assert.equal(deriveEffectiveStatus({ status: 'CONSUMED' }, now), 'CONSUMED');
assert.equal(deriveEffectiveStatus({ status: 'UNKNOWN_HACK' }, now), 'INVALID');
assert.equal(deriveEffectiveStatus(null, now), 'INVALID');

// 5. Strict Generation Input Validation (No Actor Override Allowed!)
const validGen = validateTokenGenerationInput({
  expiresInHours: 24,
  label: 'Test Label',
  businessCategoryHint: 'FUEL_STATION',
});
assert.equal(validGen.expiresInHours, 24);
assert.equal(validGen.label, 'Test Label');
assert.equal(validGen.businessCategoryHint, 'FUEL_STATION');

// Rejection of caller-supplied actor and unexpected fields
assert.throws(() => validateTokenGenerationInput({ adminUid: 'forged' }), /unexpected-input-field-adminUid/);
assert.throws(() => validateTokenGenerationInput({ actorUid: 'forged' }), /unexpected-input-field-actorUid/);
assert.throws(() => validateTokenGenerationInput({ createdBy: 'forged' }), /unexpected-input-field-createdBy/);
assert.throws(() => validateTokenGenerationInput({ tokenId: 'forged' }), /unexpected-input-field-tokenId/);
assert.throws(() => validateTokenGenerationInput({ tokenHash: 'forged' }), /unexpected-input-field-tokenHash/);
assert.throws(() => validateTokenGenerationInput('not-an-object'), /invalid-input-object/);
assert.throws(() => validateTokenGenerationInput([1, 2, 3]), /invalid-input-object/);
assert.throws(() => validateTokenGenerationInput({ expiresInHours: 0 }), /invalid-expires-in-hours/);
assert.throws(() => validateTokenGenerationInput({ expiresInHours: 1000 }), /invalid-expires-in-hours/);
assert.throws(() => validateTokenGenerationInput({ businessCategoryHint: 'INVALID_CATEGORY' }), /invalid-business-category-hint/);

// 6. Strict List Input Validation (Strict Management Cursor Format)
const validList = validateTokenListInput({ limit: 50, startAfterCursor: tokenId });
assert.equal(validList.limit, 50);
assert.equal(validList.startAfterCursor, tokenId);

// Cursor must match exact management ID format
assert.throws(() => validateTokenListInput({ startAfterCursor: 'rtok_123' }), /invalid-cursor-format/);
assert.throws(() => validateTokenListInput({ startAfterCursor: 'rtok_short' }), /invalid-cursor-format/);
assert.throws(() => validateTokenListInput({ startAfterCursor: 'rtok_with/slash/hack' }), /invalid-cursor-format/);
assert.throws(() => validateTokenListInput({ startAfterCursor: tokenHash }), /invalid-cursor-format/);
assert.throws(() => validateTokenListInput({ startAfterCursor: rawToken }), /invalid-cursor-format/);
assert.throws(() => validateTokenListInput({ adminUid: 'forged' }), /unexpected-input-field-adminUid/);
assert.throws(() => validateTokenListInput({ limit: 0 }), /invalid-limit/);
assert.throws(() => validateTokenListInput({ limit: 200 }), /invalid-limit/);

// 7. Strict Revoke Input Validation (No Actor Override Allowed!)
const validRevoke = validateTokenRevokeInput({ tokenId });
assert.equal(validRevoke.tokenId, tokenId);

assert.throws(() => validateTokenRevokeInput({ tokenId, adminUid: 'forged' }), /unexpected-input-field-adminUid/);
assert.throws(() => validateTokenRevokeInput({ tokenId, actorUid: 'forged' }), /unexpected-input-field-actorUid/);
assert.throws(() => validateTokenRevokeInput({ tokenId, revokedBy: 'forged' }), /unexpected-input-field-revokedBy/);
assert.throws(() => validateTokenRevokeInput({ tokenId: 'hack' }), /invalid-token-id/);
assert.throws(() => validateTokenRevokeInput({ tokenId: rawToken }), /invalid-token-id/);
assert.throws(() => validateTokenRevokeInput({ tokenId: tokenHash }), /invalid-token-id/);

// 8. Consumed By Actor Validation
assert.equal(validateConsumedByActor('user_12345'), 'user_12345');
assert.equal(validateConsumedByActor('  user_trimmed  '), 'user_trimmed');

assert.throws(() => validateConsumedByActor(''), /invalid-consumed-by-empty/);
assert.throws(() => validateConsumedByActor('   '), /invalid-consumed-by-empty/);
assert.throws(() => validateConsumedByActor(null), /invalid-consumed-by-must-be-string/);
assert.throws(() => validateConsumedByActor(undefined), /invalid-consumed-by-must-be-string/);
assert.throws(() => validateConsumedByActor({ uid: 'hack' }), /invalid-consumed-by-must-be-string/);
assert.throws(() => validateConsumedByActor(['user']), /invalid-consumed-by-must-be-string/);
assert.throws(() => validateConsumedByActor('a'.repeat(129)), /invalid-consumed-by-length/);
assert.throws(() => validateConsumedByActor('user\x00hack'), /invalid-consumed-by-contains-control-characters/);
assert.throws(() => validateConsumedByActor('user\nhack'), /invalid-consumed-by-contains-control-characters/);

console.log('--- ALL FINAL HARDENED REGISTRATION TOKEN CORE UNIT TESTS PASSED ---');
