import { httpsCallable } from 'firebase/functions';
import { functions, isFirebaseConfigured } from './config';

const SAFE_CALLABLE_ERROR = 'Η ενέργεια δεν ήταν δυνατό να ολοκληρωθεί. Δοκίμασε ξανά.';

function assertFirebaseReady() {
  if (!isFirebaseConfigured || !functions) {
    throw new Error(SAFE_CALLABLE_ERROR);
  }
}

/**
 * Validates a registration token against the backend without persisting it.
 * @param {string} token
 * @returns {Promise<{valid: boolean, reason?: string, businessCategoryHint?: string}>}
 */
export async function validateTokenClient(token) {
  assertFirebaseReady();
  const rawToken = String(token || '').trim();
  if (!rawToken) {
    return { valid: false, reason: 'INVALID_FORMAT' };
  }

  try {
    const validateFn = httpsCallable(functions, 'validateRegistrationToken');
    const response = await validateFn({ token: rawToken });
    const data = response.data || {};
    return {
      valid: Boolean(data.valid),
      reason: data.reason || null,
      businessCategoryHint: data.businessCategoryHint || null,
      expiresAt: data.expiresAt || null,
    };
  } catch (err) {
    const errorDetails = err?.details || {};
    const errorCode = errorDetails?.code || err?.code || 'UNKNOWN';
    return {
      valid: false,
      reason: errorCode,
      message: err.message || SAFE_CALLABLE_ERROR,
    };
  }
}

/**
 * Invokes the atomic tenant provisioning Cloud Function with the validated token and business details.
 * Auth is derived securely from the authenticated caller's Firebase Auth token.
 * @param {object} params
 * @param {string} params.token
 * @param {string} params.slug
 * @param {string} params.displayName
 * @param {string} [params.businessCategory]
 * @returns {Promise<{success: boolean, tenantId: string, slug: string, displayName: string, businessCategory: string}>}
 */
export async function provisionTenantClient({ token, slug, displayName, businessCategory }) {
  assertFirebaseReady();
  const payload = {
    token: String(token || '').trim(),
    slug: String(slug || '').trim().toLowerCase(),
    displayName: String(displayName || '').trim(),
    businessCategory: businessCategory ? String(businessCategory).trim().toUpperCase() : 'OTHER',
  };

  try {
    const provisionFn = httpsCallable(functions, 'provisionTenantFromRegistrationToken');
    const response = await provisionFn(payload);
    const result = response.data?.result || response.data || {};
    return {
      success: Boolean(result.success),
      tenantId: String(result.tenantId || payload.slug),
      slug: String(result.slug || payload.slug),
      displayName: String(result.displayName || payload.displayName),
      businessCategory: String(result.businessCategory || payload.businessCategory),
    };
  } catch (err) {
    const errorDetails = err?.details || {};
    const message = err.message || SAFE_CALLABLE_ERROR;
    const error = new Error(message);
    error.code = err.code || 'internal';
    error.details = errorDetails;
    throw error;
  }
}
