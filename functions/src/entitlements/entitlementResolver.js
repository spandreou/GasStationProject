/**
 * ShiftOryx Phase 7 — Pure Server-Trusted Entitlement Resolver Foundation
 *
 * Designed for server-side authority (Cloud Functions, Security Rules, and Client projection).
 * Fails closed on missing, malformed, expired, or suspended state.
 */

export const SUBSCRIPTION_STATUS = {
  active: 'ACTIVE',
  trialing: 'TRIALING',
  pastDue: 'PAST_DUE',
  canceled: 'CANCELED',
  suspended: 'SUSPENDED',
};

export const PLANS = {
  starter: 'STARTER',
  professional: 'PROFESSIONAL',
  enterprise: 'ENTERPRISE',
  pilot: 'PILOT_FREE',
};

export const DEFAULT_PLAN_LIMITS = {
  [PLANS.pilot]: {
    maxEmployees: 15,
    maxWorkspaces: 1,
    maxMonthlyPdfExports: 10,
    enableAdvancedSolver: true,
    enableMultiWindow: true,
    enableAuditLogs: true,
  },
  [PLANS.starter]: {
    maxEmployees: 10,
    maxWorkspaces: 1,
    maxMonthlyPdfExports: 5,
    enableAdvancedSolver: false,
    enableMultiWindow: false,
    enableAuditLogs: false,
  },
  [PLANS.professional]: {
    maxEmployees: 35,
    maxWorkspaces: 3,
    maxMonthlyPdfExports: 50,
    enableAdvancedSolver: true,
    enableMultiWindow: true,
    enableAuditLogs: true,
  },
  [PLANS.enterprise]: {
    maxEmployees: 250,
    maxWorkspaces: 20,
    maxMonthlyPdfExports: 1000,
    enableAdvancedSolver: true,
    enableMultiWindow: true,
    enableAuditLogs: true,
  },
};

const FAIL_CLOSED_ENTITLEMENTS = {
  valid: false,
  reason: 'invalid-or-suspended-subscription',
  planId: null,
  status: SUBSCRIPTION_STATUS.suspended,
  limits: {
    maxEmployees: 0,
    maxWorkspaces: 0,
    maxMonthlyPdfExports: 0,
    enableAdvancedSolver: false,
    enableMultiWindow: false,
    enableAuditLogs: false,
  },
};

/**
 * Pure function to resolve and normalize tenant entitlements.
 *
 * @param {Object} params
 * @param {Object} params.tenant Tenant document data
 * @param {Object} [params.subscription] Subscription document data
 * @param {number|Date} [params.now] Current timestamp (ms or Date)
 * @returns {Object} Normalized entitlement object
 */
export function resolveTenantEntitlements({ tenant, subscription, now = Date.now() }) {
  const currentTimestamp = typeof now === 'number' ? now : now instanceof Date ? now.getTime() : Date.now();

  // 1. Tenant must exist and be ACTIVE
  if (!tenant || tenant.status !== 'ACTIVE') {
    return {
      ...FAIL_CLOSED_ENTITLEMENTS,
      reason: !tenant ? 'tenant-not-found' : `tenant-status-${tenant.status || 'unknown'}`,
    };
  }

  // 2. If subscription object is missing, check if tenant has legacy/pilot bypass flag
  if (!subscription) {
    if (tenant.tier === 'PILOT' || tenant.planId === PLANS.pilot) {
      return {
        valid: true,
        reason: 'pilot-complimentary-grant',
        planId: PLANS.pilot,
        status: SUBSCRIPTION_STATUS.active,
        limits: { ...DEFAULT_PLAN_LIMITS[PLANS.pilot] },
        effectiveAt: tenant.createdAt || null,
        expiresAt: null,
      };
    }
    return {
      ...FAIL_CLOSED_ENTITLEMENTS,
      reason: 'missing-subscription',
    };
  }

  // 3. Subscription status validation
  const status = String(subscription.status || '').toUpperCase();
  if (status !== SUBSCRIPTION_STATUS.active && status !== SUBSCRIPTION_STATUS.trialing) {
    return {
      ...FAIL_CLOSED_ENTITLEMENTS,
      status,
      reason: `subscription-${status.toLowerCase() || 'inactive'}`,
    };
  }

  // 4. Time boundaries (effectiveAt & expiresAt)
  const effectiveAtMs = subscription.effectiveAtMs ?? (subscription.effectiveAt ? new Date(subscription.effectiveAt).getTime() : null);
  const expiresAtMs = subscription.expiresAtMs ?? (subscription.expiresAt ? new Date(subscription.expiresAt).getTime() : null);

  if (effectiveAtMs && !Number.isNaN(effectiveAtMs) && currentTimestamp < effectiveAtMs) {
    return {
      ...FAIL_CLOSED_ENTITLEMENTS,
      reason: 'subscription-not-yet-effective',
    };
  }

  if (expiresAtMs && !Number.isNaN(expiresAtMs) && currentTimestamp > expiresAtMs) {
    return {
      ...FAIL_CLOSED_ENTITLEMENTS,
      reason: 'subscription-expired',
    };
  }

  // 5. Plan recognition
  const planId = String(subscription.planId || '').toUpperCase();
  const baseLimits = DEFAULT_PLAN_LIMITS[planId];
  if (!baseLimits) {
    return {
      ...FAIL_CLOSED_ENTITLEMENTS,
      reason: `unknown-plan-${planId}`,
    };
  }

  // 6. Custom limit overrides from subscription document (if server configured)
  const limits = {
    ...baseLimits,
    ...(subscription.limitOverrides || {}),
  };

  return {
    valid: true,
    reason: 'subscription-active',
    planId,
    status,
    limits,
    effectiveAtMs,
    expiresAtMs,
  };
}

/**
 * Checks whether an employee creation or count is within the tenant's entitlements.
 */
export function canAddEmployee({ activeEmployeeCount, entitlements }) {
  if (!entitlements || !entitlements.valid) return false;
  return activeEmployeeCount < (entitlements.limits?.maxEmployees ?? 0);
}

/**
 * Checks whether a feature flag is entitled.
 */
export function isFeatureEntitled(featureName, entitlements) {
  if (!entitlements || !entitlements.valid) return false;
  return Boolean(entitlements.limits?.[featureName]);
}
