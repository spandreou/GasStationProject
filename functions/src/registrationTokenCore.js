import { createHash, randomBytes } from 'node:crypto';

export const REGISTRATION_TOKEN_BYTES = 32; // 256 bits of cryptographically secure entropy
export const REGISTRATION_TOKEN_PREFIX = 'stx_';

export const DEFAULT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (168 hours)
export const MIN_TOKEN_TTL_HOURS = 1;
export const MAX_TOKEN_TTL_HOURS = 720; // 30 days

export const REGISTRATION_TOKEN_STATUS = Object.freeze({
  active: 'ACTIVE',
  revoked: 'REVOKED',
  consumed: 'CONSUMED',
});

export const ALLOWED_BUSINESS_CATEGORIES = Object.freeze(
  new Set(['FUEL_STATION', 'CAFE', 'RESTAURANT', 'HAIR_SALON', 'RETAIL', 'OTHER']),
);

const TOKEN_FORMAT_REGEX = /^stx_[a-zA-Z0-9_-]{43,64}$/;

function toCleanString(value) {
  return String(value || '').trim();
}

/**
 * Generates a cryptographically secure, URL-safe registration token with >= 256 bits of entropy.
 * Format: stx_ + base64url(32 random bytes) -> 47 characters total.
 */
export function generateRawRegistrationToken() {
  const bytes = randomBytes(REGISTRATION_TOKEN_BYTES);
  const base64url = bytes.toString('base64url');
  return `${REGISTRATION_TOKEN_PREFIX}${base64url}`;
}

/**
 * Validates the syntactic format of a raw registration token.
 */
export function validateRegistrationTokenFormat(token) {
  const clean = toCleanString(token);
  return {
    valid: TOKEN_FORMAT_REGEX.test(clean),
    token: clean,
  };
}

/**
 * Computes the SHA-256 cryptographic hash of a valid raw registration token.
 * Only the hash is stored in Firestore; raw token material is never persisted.
 */
export function hashRegistrationToken(token) {
  const validation = validateRegistrationTokenFormat(token);
  if (!validation.valid) {
    throw new Error('invalid-registration-token-format');
  }
  return createHash('sha256').update(validation.token, 'utf8').digest('hex');
}

/**
 * Derives the effective token status taking server expiry into account.
 */
export function deriveEffectiveStatus(tokenData, nowMs = Date.now()) {
  if (!tokenData || typeof tokenData !== 'object') {
    return 'UNKNOWN';
  }

  if (tokenData.status === REGISTRATION_TOKEN_STATUS.consumed) {
    return 'CONSUMED';
  }

  if (tokenData.status === REGISTRATION_TOKEN_STATUS.revoked) {
    return 'REVOKED';
  }

  let expiresAtMs = 0;
  if (tokenData.expiresAt?.toMillis) {
    expiresAtMs = tokenData.expiresAt.toMillis();
  } else if (tokenData.expiresAt instanceof Date) {
    expiresAtMs = tokenData.expiresAt.getTime();
  } else if (typeof tokenData.expiresAt === 'number') {
    expiresAtMs = tokenData.expiresAt;
  } else if (typeof tokenData.expiresAt === 'string') {
    expiresAtMs = new Date(tokenData.expiresAt).getTime();
  }

  if (expiresAtMs > 0 && expiresAtMs <= nowMs) {
    return 'EXPIRED';
  }

  if (tokenData.status === REGISTRATION_TOKEN_STATUS.active) {
    return 'ACTIVE';
  }

  return tokenData.status || 'UNKNOWN';
}

/**
 * Validates administrative token generation input.
 */
export function validateTokenGenerationInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('invalid-input-object');
  }

  const allowedKeys = new Set(['expiresInHours', 'label', 'businessCategoryHint']);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`unknown-field: ${key}`);
    }
  }

  let expiresInHours = 168; // Default: 7 days
  if (input.expiresInHours !== undefined) {
    if (
      typeof input.expiresInHours !== 'number' ||
      !Number.isInteger(input.expiresInHours) ||
      input.expiresInHours < MIN_TOKEN_TTL_HOURS ||
      input.expiresInHours > MAX_TOKEN_TTL_HOURS
    ) {
      throw new Error(`invalid-expiresInHours: must be an integer between ${MIN_TOKEN_TTL_HOURS} and ${MAX_TOKEN_TTL_HOURS}`);
    }
    expiresInHours = input.expiresInHours;
  }

  let label = null;
  if (input.label !== undefined && input.label !== null) {
    if (typeof input.label !== 'string') {
      throw new Error('invalid-label: must be a string');
    }
    const cleanLabel = input.label.trim();
    if (cleanLabel.length > 100) {
      throw new Error('invalid-label: max length is 100 characters');
    }
    label = cleanLabel || null;
  }

  let businessCategoryHint = null;
  if (input.businessCategoryHint !== undefined && input.businessCategoryHint !== null) {
    if (typeof input.businessCategoryHint !== 'string') {
      throw new Error('invalid-businessCategoryHint: must be a string');
    }
    const category = input.businessCategoryHint.trim().toUpperCase();
    if (!ALLOWED_BUSINESS_CATEGORIES.has(category)) {
      throw new Error(`invalid-businessCategoryHint: allowed values are ${[...ALLOWED_BUSINESS_CATEGORIES].join(', ')}`);
    }
    businessCategoryHint = category;
  }

  return {
    expiresInHours,
    label,
    businessCategoryHint,
  };
}
