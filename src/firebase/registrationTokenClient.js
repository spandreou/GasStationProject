import { httpsCallable } from 'firebase/functions';
import { functions, isFirebaseConfigured } from './config';
import { buildProvisioningPayload } from '../utils/portalHelpers';

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
      message: SAFE_CALLABLE_ERROR,
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
export async function provisionTenantClient(input) {
  assertFirebaseReady();
  const payload = buildProvisioningPayload(input);

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
    const error = new Error(SAFE_CALLABLE_ERROR);
    error.code = err.code || 'internal';
    error.details = errorDetails;
    error.reason = errorDetails.reason || null;
    throw error;
  }
}

