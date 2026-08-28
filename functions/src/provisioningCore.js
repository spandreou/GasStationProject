export const RESERVED_SLUGS = new Set([
  'gas',
  'www',
  'portal',
  'admin',
  'api',
  'auth',
  'status',
  'ops',
  'support',
  'billing',
  'dashboard',
  'shiftoryx',
  'app',
  'login',
  'register',
  'stores',
  'tenant',
  'root',
  'system',
  'null',
  'undefined',
]);

export const VALID_BUSINESS_CATEGORIES = Object.freeze([
  'FUEL_STATION',
  'CAFE',
  'RESTAURANT',
  'HAIR_SALON',
  'RETAIL',
  'OTHER',
]);

export const DEFAULT_BUSINESS_CATEGORY = 'OTHER';
export const DEFAULT_CUSTOMIZATION_MODE = 'STANDARD';

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
export const TOKEN_FORMAT_REGEX = /^stx_[a-zA-Z0-9_-]{43,64}$/;

export function validateTenantSlug(rawSlug) {
  if (typeof rawSlug !== 'string') {
    throw new Error('slug must be a string');
  }

  const slug = rawSlug.trim().toLowerCase();

  if (slug.length < 3 || slug.length > 64) {
    throw new Error('slug length must be between 3 and 64 characters');
  }

  if (!SLUG_REGEX.test(slug)) {
    throw new Error('slug must consist of lowercase alphanumeric characters and hyphens, and cannot start or end with a hyphen');
  }

  if (RESERVED_SLUGS.has(slug)) {
    throw new Error(`slug "${slug}" is reserved for platform services`);
  }

  if (slug.startsWith('gas-') || slug.endsWith('-gas')) {
    throw new Error('slug cannot start with "gas-" or end with "-gas"');
  }

  if (slug.startsWith('shiftoryx-') || slug.endsWith('-shiftoryx')) {
    throw new Error('slug cannot start with "shiftoryx-" or end with "-shiftoryx"');
  }

  return slug;
}

export function validateDisplayName(rawDisplayName) {
  if (typeof rawDisplayName !== 'string') {
    throw new Error('displayName must be a string');
  }

  const displayName = rawDisplayName.trim();

  if (displayName.length < 1 || displayName.length > 100) {
    throw new Error('displayName length must be between 1 and 100 characters');
  }

  // Reject ASCII control characters
  if (/[\x00-\x1F\x7F]/.test(displayName)) {
    throw new Error('displayName cannot contain control characters');
  }

  return displayName;
}

export function resolveBusinessCategory(rawCategory, tokenHint) {
  if (rawCategory !== undefined && rawCategory !== null) {
    if (typeof rawCategory !== 'string') {
      throw new Error('businessCategory must be a string if provided');
    }
    const normalized = rawCategory.trim().toUpperCase();
    if (!VALID_BUSINESS_CATEGORIES.includes(normalized)) {
      throw new Error(`businessCategory must be one of: ${VALID_BUSINESS_CATEGORIES.join(', ')}`);
    }
    return normalized;
  }

  if (tokenHint && typeof tokenHint === 'string') {
    const hintNormalized = tokenHint.trim().toUpperCase();
    if (VALID_BUSINESS_CATEGORIES.includes(hintNormalized)) {
      return hintNormalized;
    }
  }

  return DEFAULT_BUSINESS_CATEGORY;
}

const ALLOWED_PROVISIONING_INPUT_KEYS = new Set([
  'token',
  'slug',
  'displayName',
  'businessCategory',
]);

const FORBIDDEN_INPUT_KEYS = new Set([
  'role',
  'adminUid',
  'ownerUid',
  'actorUid',
  'status',
  'createdBy',
  'platformAdmin',
  'membershipRole',
  'memberships',
  'domain',
  'templateId',
  'templateVersion',
  'brandingOverrides',
  'customizationMode',
  'email',
]);

export function validateProvisioningInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    throw new Error('Input must be a non-null object');
  }

  const keys = Object.keys(rawInput);

  for (const key of keys) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) {
      throw new Error(`Forbidden field detected: "${key}"`);
    }
    if (!ALLOWED_PROVISIONING_INPUT_KEYS.has(key)) {
      throw new Error(`Unknown field detected: "${key}"`);
    }
  }

  if (!rawInput.token || typeof rawInput.token !== 'string') {
    throw new Error('token is required and must be a string');
  }

  const token = rawInput.token.trim();
  if (!TOKEN_FORMAT_REGEX.test(token)) {
    throw new Error('Invalid registration token format');
  }

  const slug = validateTenantSlug(rawInput.slug);
  const displayName = validateDisplayName(rawInput.displayName);

  let rawCategory = undefined;
  if (rawInput.businessCategory !== undefined && rawInput.businessCategory !== null) {
    if (typeof rawInput.businessCategory !== 'string') {
      throw new Error('businessCategory must be a string if provided');
    }
    const normalized = rawInput.businessCategory.trim().toUpperCase();
    if (!VALID_BUSINESS_CATEGORIES.includes(normalized)) {
      throw new Error(`businessCategory must be one of: ${VALID_BUSINESS_CATEGORIES.join(', ')}`);
    }
    rawCategory = normalized;
  }

  return {
    token,
    slug,
    displayName,
    businessCategory: rawCategory,
  };
}
