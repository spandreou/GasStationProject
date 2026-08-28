import { createHash, randomBytes } from 'node:crypto';

export const REGISTRATION_TOKEN_PREFIX = 'stx_';
export const MANAGEMENT_TOKEN_ID_PREFIX = 'rtok_';
export const TOKEN_FORMAT_REGEX = /^stx_[a-zA-Z0-9_-]{43,64}$/;
export const MANAGEMENT_TOKEN_ID_REGEX = /^rtok_[a-f0-9]{32}$/;
export const CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/;

export const ALLOWED_BUSINESS_CATEGORIES = Object.freeze([
  'FUEL_STATION',
  'CAFE',
  'RESTAURANT',
  'HAIR_SALON',
  'RETAIL',
  'OTHER',
]);

export const TOKEN_STATUS = Object.freeze({
  active: 'ACTIVE',
  revoked: 'REVOKED',
  consumed: 'CONSUMED',
  expired: 'EXPIRED',
  invalid: 'INVALID',
});

export const DEFAULT_TTL_HOURS = 168; // 7 days
export const MIN_TTL_HOURS = 1;
export const MAX_TTL_HOURS = 720; // 30 days
export const MAX_LABEL_LENGTH = 100;
export const MAX_LIST_LIMIT = 100;
export const DEFAULT_LIST_LIMIT = 25;
export const MAX_CONSUMED_BY_LENGTH = 128;

export function generateRawRegistrationToken() {
  const entropy = randomBytes(32).toString('base64url');
  return `${REGISTRATION_TOKEN_PREFIX}${entropy}`;
}

export function generateManagementTokenId() {
  const entropy = randomBytes(16).toString('hex');
  return `${MANAGEMENT_TOKEN_ID_PREFIX}${entropy}`;
}

export function validateRegistrationTokenFormat(token) {
  if (typeof token !== 'string') {
    return { valid: false, reason: 'token-must-be-string' };
  }
  const cleanToken = token.trim();
  if (!cleanToken) {
    return { valid: false, reason: 'token-empty' };
  }
  if (!TOKEN_FORMAT_REGEX.test(cleanToken)) {
    return { valid: false, reason: 'token-invalid-format' };
  }
  return { valid: true, token: cleanToken };
}

export function validateManagementTokenIdFormat(tokenId) {
  if (typeof tokenId !== 'string') {
    return { valid: false, reason: 'token-id-must-be-string' };
  }
  const cleanId = tokenId.trim();
  if (!MANAGEMENT_TOKEN_ID_REGEX.test(cleanId)) {
    return { valid: false, reason: 'token-id-invalid-format' };
  }
  return { valid: true, tokenId: cleanId };
}

export function hashRegistrationToken(token) {
  const validation = validateRegistrationTokenFormat(token);
  if (!validation.valid) {
    throw new Error(`Cannot hash invalid registration token: ${validation.reason}`);
  }
  return createHash('sha256').update(validation.token, 'utf8').digest('hex');
}

export function extractExpiresAtMs(tokenData) {
  if (!tokenData || typeof tokenData !== 'object') return null;

  // Canonical expiresAt source only (No expiresAtMs fallback!)
  if (tokenData.expiresAt) {
    if (typeof tokenData.expiresAt.toMillis === 'function') {
      const ms = tokenData.expiresAt.toMillis();
      return Number.isInteger(ms) && ms > 0 ? ms : null;
    }
    if (typeof tokenData.expiresAt === 'number') {
      return Number.isInteger(tokenData.expiresAt) && tokenData.expiresAt > 0
        ? tokenData.expiresAt
        : null;
    }
    if (tokenData.expiresAt instanceof Date) {
      const ms = tokenData.expiresAt.getTime();
      return Number.isInteger(ms) && ms > 0 ? ms : null;
    }
  }

  return null;
}

export function deriveEffectiveStatus(tokenData, nowMs = Date.now()) {
  if (!tokenData || typeof tokenData !== 'object') {
    return TOKEN_STATUS.invalid;
  }

  const rawStatus = String(tokenData.status || '').trim().toUpperCase();

  if (rawStatus === TOKEN_STATUS.revoked) {
    return TOKEN_STATUS.revoked;
  }

  if (rawStatus === TOKEN_STATUS.consumed) {
    return TOKEN_STATUS.consumed;
  }

  if (rawStatus === TOKEN_STATUS.active) {
    const expiresAtMs = extractExpiresAtMs(tokenData);
    // Fail closed: missing or malformed expiresAt MUST NOT derive ACTIVE
    if (expiresAtMs === null) {
      return TOKEN_STATUS.invalid;
    }
    if (expiresAtMs <= nowMs) {
      return TOKEN_STATUS.expired;
    }
    return TOKEN_STATUS.active;
  }

  return TOKEN_STATUS.invalid;
}

function isPlainObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function validateTokenGenerationInput(input) {
  if (input !== undefined && input !== null && !isPlainObject(input)) {
    throw new Error('invalid-input-object');
  }

  const safeInput = input || {};
  const allowedKeys = new Set(['expiresInHours', 'label', 'businessCategoryHint']);
  for (const key of Object.keys(safeInput)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`unexpected-input-field-${key}`);
    }
  }

  let expiresInHours = DEFAULT_TTL_HOURS;
  if (safeInput.expiresInHours !== undefined && safeInput.expiresInHours !== null) {
    const parsedHours = Number(safeInput.expiresInHours);
    if (!Number.isInteger(parsedHours) || parsedHours < MIN_TTL_HOURS || parsedHours > MAX_TTL_HOURS) {
      throw new Error(`invalid-expires-in-hours-must-be-integer-between-${MIN_TTL_HOURS}-and-${MAX_TTL_HOURS}`);
    }
    expiresInHours = parsedHours;
  }

  let label = null;
  if (safeInput.label !== undefined && safeInput.label !== null) {
    if (typeof safeInput.label !== 'string') {
      throw new Error('invalid-label-must-be-string');
    }
    const cleanLabel = safeInput.label.trim();
    if (cleanLabel.length > MAX_LABEL_LENGTH) {
      throw new Error(`invalid-label-exceeds-max-length-${MAX_LABEL_LENGTH}`);
    }
    label = cleanLabel || null;
  }

  let businessCategoryHint = null;
  if (safeInput.businessCategoryHint !== undefined && safeInput.businessCategoryHint !== null) {
    if (typeof safeInput.businessCategoryHint !== 'string') {
      throw new Error('invalid-business-category-hint-must-be-string');
    }
    const cleanCategory = safeInput.businessCategoryHint.trim().toUpperCase();
    if (!ALLOWED_BUSINESS_CATEGORIES.includes(cleanCategory)) {
      throw new Error(`invalid-business-category-hint-must-be-one-of-${ALLOWED_BUSINESS_CATEGORIES.join(',')}`);
    }
    businessCategoryHint = cleanCategory;
  }

  return {
    expiresInHours,
    label,
    businessCategoryHint,
  };
}

export function validateTokenListInput(input) {
  if (input !== undefined && input !== null && !isPlainObject(input)) {
    throw new Error('invalid-input-object');
  }

  const safeInput = input || {};
  const allowedKeys = new Set(['limit', 'startAfterCursor']);
  for (const key of Object.keys(safeInput)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`unexpected-input-field-${key}`);
    }
  }

  let limit = DEFAULT_LIST_LIMIT;
  if (safeInput.limit !== undefined && safeInput.limit !== null) {
    const parsedLimit = Number(safeInput.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIST_LIMIT) {
      throw new Error(`invalid-limit-must-be-integer-between-1-and-${MAX_LIST_LIMIT}`);
    }
    limit = parsedLimit;
  }

  let startAfterCursor = null;
  if (safeInput.startAfterCursor !== undefined && safeInput.startAfterCursor !== null) {
    if (typeof safeInput.startAfterCursor !== 'string') {
      throw new Error('invalid-cursor-must-be-string');
    }
    const formatCheck = validateManagementTokenIdFormat(safeInput.startAfterCursor);
    if (!formatCheck.valid) {
      throw new Error('invalid-cursor-format-must-match-management-id');
    }
    startAfterCursor = formatCheck.tokenId;
  }

  return { limit, startAfterCursor };
}

export function validateTokenRevokeInput(input) {
  if (!isPlainObject(input)) {
    throw new Error('invalid-input-object');
  }

  const allowedKeys = new Set(['tokenId']);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`unexpected-input-field-${key}`);
    }
  }

  const formatCheck = validateManagementTokenIdFormat(input.tokenId);
  if (!formatCheck.valid) {
    throw new Error(`invalid-token-id: ${formatCheck.reason}`);
  }

  return { tokenId: formatCheck.tokenId };
}

export function validateConsumedByActor(consumedBy) {
  if (typeof consumedBy !== 'string') {
    throw new Error('invalid-consumed-by-must-be-string');
  }
  const clean = consumedBy.trim();
  if (!clean) {
    throw new Error('invalid-consumed-by-empty');
  }
  if (clean.length > MAX_CONSUMED_BY_LENGTH) {
    throw new Error(`invalid-consumed-by-length-exceeds-${MAX_CONSUMED_BY_LENGTH}`);
  }
  if (CONTROL_CHARS_REGEX.test(clean)) {
    throw new Error('invalid-consumed-by-contains-control-characters');
  }
  return clean;
}
