const SAFE_UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const SAFE_TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class OwnerIdentityValidationError extends Error {
  constructor(code, message) {
    super(`${code}: ${message || code}`);
    this.name = 'OwnerIdentityValidationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new OwnerIdentityValidationError(code, message);
}

/**
 * Validates human-provided OWNER confirmation inputs syntactically without network or external dependencies.
 *
 * @param {Object} input
 * @param {string} input.ownerUid - The exact Firebase Auth UID of the confirmed business owner
 * @param {string} input.tenantId - The tenant identifier slug (e.g. 'bp-kallis')
 * @returns {{ valid: boolean, ownerUid: string, tenantId: string, membershipId: string }}
 */
export function validateOwnerConfirmationInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_INPUT_OBJECT', 'Input must be a non-null object');
  }

  const { ownerUid, tenantId } = input;

  if (typeof ownerUid !== 'string' || !ownerUid.trim()) {
    fail('EMPTY_OWNER_UID', 'OWNER_UID must be a non-empty string');
  }

  const cleanOwnerUid = ownerUid.trim();

  if (FORBIDDEN_KEYS.has(cleanOwnerUid)) {
    fail('FORBIDDEN_UID_VALUE', 'OWNER_UID cannot be a reserved JavaScript prototype property');
  }

  if (cleanOwnerUid.includes('/') || cleanOwnerUid.includes('\\') || cleanOwnerUid.includes('..')) {
    fail('PATH_TRAVERSAL_IN_UID', 'OWNER_UID must not contain path delimiters or directory traversal sequences');
  }

  if (!SAFE_UID_PATTERN.test(cleanOwnerUid)) {
    fail(
      'INVALID_UID_FORMAT',
      'OWNER_UID contains invalid characters. Must contain only alphanumeric characters, dashes, and underscores (1-128 characters).'
    );
  }

  if (typeof tenantId !== 'string' || !tenantId.trim()) {
    fail('EMPTY_TENANT_ID', 'TENANT_ID must be a non-empty string');
  }

  const cleanTenantId = tenantId.trim().toLowerCase();

  if (FORBIDDEN_KEYS.has(cleanTenantId)) {
    fail('FORBIDDEN_TENANT_VALUE', 'TENANT_ID cannot be a reserved JavaScript prototype property');
  }

  if (cleanTenantId.includes('/') || cleanTenantId.includes('\\') || cleanTenantId.includes('..')) {
    fail('PATH_TRAVERSAL_IN_TENANT', 'TENANT_ID must not contain path delimiters or directory traversal sequences');
  }

  if (!SAFE_TENANT_ID_PATTERN.test(cleanTenantId)) {
    fail(
      'INVALID_TENANT_ID_FORMAT',
      'TENANT_ID must be a valid lowercase slug (3-64 alphanumeric characters, lowercase letters, numbers, and dashes).'
    );
  }

  const membershipId = `${cleanOwnerUid}_${cleanTenantId}`;

  return {
    valid: true,
    ownerUid: cleanOwnerUid,
    tenantId: cleanTenantId,
    membershipId,
  };
}
