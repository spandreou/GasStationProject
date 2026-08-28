import assert from 'node:assert/strict';
import {
  ALLOWED_BUSINESS_CATEGORIES,
  DEFAULT_TOKEN_TTL_MS,
  MAX_TOKEN_TTL_HOURS,
  MIN_TOKEN_TTL_HOURS,
  REGISTRATION_TOKEN_BYTES,
  REGISTRATION_TOKEN_PREFIX,
  REGISTRATION_TOKEN_STATUS,
  deriveEffectiveStatus,
  generateRawRegistrationToken,
  hashRegistrationToken,
  validateRegistrationTokenFormat,
  validateTokenGenerationInput,
} from '../functions/src/registrationTokenCore.js';

console.log('--- RUNNING REGISTRATION TOKEN CORE UNIT TESTS ---');

// 1. Generation & Entropy Check
const token = generateRawRegistrationToken();
assert.ok(token.startsWith(REGISTRATION_TOKEN_PREFIX), 'Token must start with prefix');
assert.ok(token.length >= 47, `Token length should be >= 47 (got ${token.length})`);
const formatCheck = validateRegistrationTokenFormat(token);
assert.equal(formatCheck.valid, true, 'Generated token format must be valid');

// Test uniqueness across 1000 generated tokens
const generatedSet = new Set();
for (let i = 0; i < 1000; i++) {
  const t = generateRawRegistrationToken();
  assert.ok(!generatedSet.has(t), 'Token collision detected in randomBytes entropy generation');
  generatedSet.add(t);
}
assert.equal(generatedSet.size, 1000, 'All 1000 tokens must be unique');

// 2. Format Validation Check
assert.equal(validateRegistrationTokenFormat(null).valid, false, 'null token must be invalid');
assert.equal(validateRegistrationTokenFormat('').valid, false, 'empty token must be invalid');
assert.equal(validateRegistrationTokenFormat('invalid').valid, false, 'plain invalid token must be invalid');
assert.equal(validateRegistrationTokenFormat('stx_short').valid, false, 'short token must be invalid');
assert.equal(validateRegistrationTokenFormat('stx_!!!badcharacters###').valid, false, 'bad chars must be invalid');

// 3. Hashing Check
const hash1 = hashRegistrationToken(token);
const hash2 = hashRegistrationToken(token);
assert.equal(hash1, hash2, 'Hashing must be deterministic');
assert.equal(hash1.length, 64, 'SHA-256 hash must be 64 hex characters');
assert.notEqual(hash1, token, 'Hash must not equal raw token');
assert.throws(() => hashRegistrationToken('invalid_token'), /invalid-registration-token-format/);

// 4. Status Derivation Check
const now = Date.now();
assert.equal(deriveEffectiveStatus({ status: 'CONSUMED' }, now), 'CONSUMED');
assert.equal(deriveEffectiveStatus({ status: 'REVOKED' }, now), 'REVOKED');
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: now - 1000 }, now),
  'EXPIRED',
  'Past expiration must derive EXPIRED',
);
assert.equal(
  deriveEffectiveStatus({ status: 'ACTIVE', expiresAt: now + 60000 }, now),
  'ACTIVE',
  'Future expiration must derive ACTIVE',
);
assert.equal(
  deriveEffectiveStatus(
    { status: 'ACTIVE', expiresAt: { toMillis: () => now - 5000 } },
    now,
  ),
  'EXPIRED',
  'Firestore Timestamp toMillis past expiry must derive EXPIRED',
);

// 5. Input Validation Check
const defaultInput = validateTokenGenerationInput({});
assert.equal(defaultInput.expiresInHours, 168, 'Default expiresInHours should be 168 (7 days)');
assert.equal(defaultInput.label, null);
assert.equal(defaultInput.businessCategoryHint, null);

const customInput = validateTokenGenerationInput({
  expiresInHours: 48,
  label: 'BP Kallis New Store',
  businessCategoryHint: 'FUEL_STATION',
});
assert.equal(customInput.expiresInHours, 48);
assert.equal(customInput.label, 'BP Kallis New Store');
assert.equal(customInput.businessCategoryHint, 'FUEL_STATION');

assert.throws(
  () => validateTokenGenerationInput({ unknownField: 'evil' }),
  /unknown-field/,
  'Unknown field must be rejected',
);
assert.throws(
  () => validateTokenGenerationInput({ expiresInHours: 0 }),
  /invalid-expiresInHours/,
  '0 hours must be rejected',
);
assert.throws(
  () => validateTokenGenerationInput({ expiresInHours: 800 }),
  /invalid-expiresInHours/,
  '> 720 hours must be rejected',
);
assert.throws(
  () => validateTokenGenerationInput({ businessCategoryHint: 'ASTRONAUT_SPACE_PORT' }),
  /invalid-businessCategoryHint/,
  'Invalid business category must be rejected',
);

console.log('--- ALL REGISTRATION TOKEN CORE UNIT TESTS PASSED ---');
