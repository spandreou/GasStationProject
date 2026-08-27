import {
  OwnerIdentityValidationError,
  validateOwnerConfirmationInput,
} from './owner-identity-validator.mjs';

const TENANT_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER']);
const ACTIVE_STATUS = 'ACTIVE';
const INACTIVE_MEMBERSHIP_STATUSES = new Set(['INACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED']);
const SAFE_IDENTIFIER = /^[^/\u0000-\u001f\u007f\s][^/\u0000-\u001f\u007f]{0,126}[^/\u0000-\u001f\u007f\s]$|^[^/\u0000-\u001f\u007f\s]$/u;
const FIRESTORE_SECONDS = /^-?(0|[1-9]\d*)$/u;

export class RemediationPreconditionError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RemediationPreconditionError';
    this.code = code;
  }
}

function fail(code) {
  throw new RemediationPreconditionError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isIdentifier(value) {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value);
}

function isTimestampToken(value) {
  return (
    isPlainObject(value) &&
    Object.keys(value).length === 2 &&
    typeof value.seconds === 'string' &&
    FIRESTORE_SECONDS.test(value.seconds) &&
    Number.isInteger(value.nanoseconds) &&
    value.nanoseconds >= 0 &&
    value.nanoseconds <= 999_999_999
  );
}

function sameTimestampToken(left, right) {
  return (
    isTimestampToken(left) &&
    isTimestampToken(right) &&
    left.seconds === right.seconds &&
    left.nanoseconds === right.nanoseconds
  );
}

function isMembershipState(value) {
  return (
    isPlainObject(value) &&
    TENANT_ROLES.has(value.role) &&
    (value.status === ACTIVE_STATUS || INACTIVE_MEMBERSHIP_STATUSES.has(value.status))
  );
}

function isCanonicalOwnerMembership(value, expected) {
  return (
    isPlainObject(value) &&
    value.id === expected.ownerMembershipId &&
    value.uid === expected.ownerUid &&
    value.tenantId === expected.tenantId &&
    value.role === 'OWNER' &&
    value.status === ACTIVE_STATUS
  );
}

function getMembershipMirror(user, tenantId) {
  if (!isPlainObject(user) || !isPlainObject(user.memberships)) return undefined;
  return user.memberships[tenantId];
}

function sameMembershipState(left, right) {
  return (
    isMembershipState(left) &&
    isMembershipState(right) &&
    left.role === right.role &&
    left.status === right.status
  );
}

function validateExpected(expected) {
  if (!isPlainObject(expected)) fail('INVALID_REMEDIATION_INPUT');

  try {
    validateOwnerConfirmationInput({
      ownerUid: expected.ownerUid,
      tenantId: expected.tenantId,
    });
  } catch (error) {
    if (error instanceof OwnerIdentityValidationError) {
      fail('INVALID_REMEDIATION_INPUT');
    }
    throw error;
  }

  const identifiers = [
    expected.projectId,
    expected.platformUid,
    expected.tenantId,
    expected.overlapMembershipId,
    expected.ownerUid,
    expected.ownerMembershipId,
  ];
  if (!identifiers.every(isIdentifier)) fail('INVALID_REMEDIATION_INPUT');
  if (!TENANT_ROLES.has(expected.overlapRole) || expected.overlapStatus !== ACTIVE_STATUS) {
    fail('INVALID_REMEDIATION_INPUT');
  }
  if (!isTimestampToken(expected.overlapUpdateTime)) fail('INVALID_REMEDIATION_INPUT');
  if (!isMembershipState(expected.platformMirror)) fail('INVALID_REMEDIATION_INPUT');
  if (
    expected.overlapMembershipId !== `${expected.platformUid}_${expected.tenantId}` ||
    expected.ownerMembershipId !== `${expected.ownerUid}_${expected.tenantId}`
  ) {
    fail('INVALID_REMEDIATION_INPUT');
  }
  if (expected.ownerUid === expected.platformUid) fail('OWNER_MUST_BE_SEPARATE_IDENTITY');
}

function validateSnapshotEnvelope(snapshot) {
  if (!isPlainObject(snapshot) || !isIdentifier(snapshot.projectId)) {
    fail('INVALID_REMEDIATION_INPUT');
  }
  if (
    !Object.hasOwn(snapshot, 'ownerMembership') ||
    !(snapshot.ownerMembership === null || isPlainObject(snapshot.ownerMembership))
  ) {
    fail('INVALID_REMEDIATION_INPUT');
  }
  if (
    !Object.hasOwn(snapshot, 'ownerPlatformAdmin') ||
    !(snapshot.ownerPlatformAdmin === null || isPlainObject(snapshot.ownerPlatformAdmin))
  ) {
    fail('INVALID_REMEDIATION_INPUT');
  }
  if (!Array.isArray(snapshot.competingActiveMemberships)) {
    fail('INVALID_REMEDIATION_INPUT');
  }
  if (!Array.isArray(snapshot.platformTenantMemberships)) {
    fail('INVALID_REMEDIATION_INPUT');
  }
}

function isAlreadyApplied(snapshot, expected) {
  const ownerMirror = getMembershipMirror(snapshot.ownerCandidate, expected.tenantId);
  const platformMirror = getMembershipMirror(snapshot.platformUser, expected.tenantId);
  return (
    snapshot.overlapMembership === null &&
    snapshot.platformTenantMemberships.length === 0 &&
    isPlainObject(snapshot.platformUser) &&
    isPlainObject(snapshot.platformUser.memberships) &&
    Object.keys(snapshot.platformUser.memberships).length === 0 &&
    platformMirror === undefined &&
    isCanonicalOwnerMembership(snapshot.ownerMembership, expected) &&
    sameMembershipState(ownerMirror, { role: 'OWNER', status: ACTIVE_STATUS })
  );
}

/**
 * Classifies the policy state of one active platform admin against one optional
 * tenant membership. This function describes the target invariant only. It does
 * not inspect Firebase and it never treats platform status as tenant authority.
 */
export function classifyPlatformAdminMembership({ platformAdmin, membership = null } = {}) {
  if (
    !isPlainObject(platformAdmin) ||
    !isIdentifier(platformAdmin.uid) ||
    typeof platformAdmin.status !== 'string'
  ) {
    fail('INVALID_PLATFORM_ADMIN');
  }
  if (platformAdmin.status !== ACTIVE_STATUS) fail('PLATFORM_ADMIN_NOT_ACTIVE');

  if (membership === null || membership === undefined) {
    return {
      classification: 'VALID_PLATFORM_ADMIN',
      tenantAccessGranted: false,
      remediationRequired: false,
    };
  }

  if (
    !isPlainObject(membership) ||
    !isIdentifier(membership.uid) ||
    !isIdentifier(membership.tenantId) ||
    !TENANT_ROLES.has(membership.role) ||
    !(
      membership.status === ACTIVE_STATUS ||
      INACTIVE_MEMBERSHIP_STATUSES.has(membership.status)
    )
  ) {
    fail('INVALID_MEMBERSHIP');
  }
  if (membership.uid !== platformAdmin.uid) fail('MEMBERSHIP_UID_MISMATCH');

  if (membership.status === ACTIVE_STATUS) {
    return {
      classification: 'PLATFORM_ADMIN_TENANT_MEMBERSHIP_FORBIDDEN',
      tenantAccessGranted: false,
      remediationRequired: true,
    };
  }

  return {
    classification: 'MANUAL_REVIEW_REQUIRED',
    tenantAccessGranted: false,
    remediationRequired: true,
  };
}

/** Platform-admin status is deliberately irrelevant to tenant authorization. */
export function platformAdminStatusGrantsTenantAccess() {
  return false;
}

/**
 * Builds a deterministic, pure-data remediation plan after validating an exact
 * caller-provided snapshot. The returned retry policy is intentionally closed:
 * a caller must surface any failed precondition and must not retry automatically.
 */
export function buildPlatformAdminOverlapRemediationPlan(input) {
  if (!isPlainObject(input)) fail('INVALID_REMEDIATION_INPUT');
  const { expected, snapshot } = input;
  validateExpected(expected);
  validateSnapshotEnvelope(snapshot);

  if (snapshot.projectId !== expected.projectId) fail('PROJECT_ID_MISMATCH');

  if (
    !isPlainObject(snapshot.platformAdmin) ||
    !isIdentifier(snapshot.platformAdmin.uid)
  ) {
    fail('PLATFORM_ADMIN_MISSING');
  }
  if (snapshot.platformAdmin.uid !== expected.platformUid) {
    fail('PLATFORM_ADMIN_ID_MISMATCH');
  }
  if (snapshot.platformAdmin.status !== ACTIVE_STATUS) fail('PLATFORM_ADMIN_NOT_ACTIVE');

  if (
    !isPlainObject(snapshot.tenant) ||
    snapshot.tenant.exists !== true ||
    !isIdentifier(snapshot.tenant.tenantId)
  ) {
    fail('TENANT_MISSING');
  }
  if (snapshot.tenant.tenantId !== expected.tenantId) fail('TENANT_ID_MISMATCH');

  if (snapshot.ownerPlatformAdmin !== null) {
    if (
      !isIdentifier(snapshot.ownerPlatformAdmin.uid) ||
      typeof snapshot.ownerPlatformAdmin.status !== 'string'
    ) {
      fail('INVALID_REMEDIATION_INPUT');
    }
    if (snapshot.ownerPlatformAdmin.uid !== expected.ownerUid) {
      fail('OWNER_PLATFORM_ADMIN_MISMATCH');
    }
    if (snapshot.ownerPlatformAdmin.status === ACTIVE_STATUS) {
      fail('OWNER_PLATFORM_ADMIN_CONFLICT');
    }
  }

  if (
    !snapshot.competingActiveMemberships.every(
      (membership) =>
        isPlainObject(membership) &&
        isIdentifier(membership.id) &&
        isIdentifier(membership.uid) &&
        membership.tenantId === expected.tenantId &&
        TENANT_ROLES.has(membership.role) &&
        membership.status === ACTIVE_STATUS,
    )
  ) {
    fail('INVALID_REMEDIATION_INPUT');
  }
  if (snapshot.competingActiveMemberships.length > 0) {
    fail('COMPETING_ACTIVE_MEMBERSHIP_CONFLICT');
  }

  if (
    !snapshot.platformTenantMemberships.every(
      (membership) =>
        isPlainObject(membership) &&
        isIdentifier(membership.id) &&
        membership.uid === expected.platformUid &&
        isIdentifier(membership.tenantId) &&
        isMembershipState(membership) &&
        isTimestampToken(membership.updateTime),
    )
  ) {
    fail('INVALID_REMEDIATION_INPUT');
  }
  if (
    snapshot.platformTenantMemberships.length > 1 ||
    (snapshot.platformTenantMemberships.length === 1 &&
      snapshot.platformTenantMemberships[0].id !== expected.overlapMembershipId)
  ) {
    fail('PLATFORM_ADDITIONAL_MEMBERSHIP_CONFLICT');
  }

  if (
    !isPlainObject(snapshot.platformUser) ||
    snapshot.platformUser.exists !== true ||
    snapshot.platformUser.uid !== expected.platformUid ||
    !isPlainObject(snapshot.platformUser.memberships)
  ) {
    fail('PLATFORM_USER_MISSING');
  }
  const platformMirrorKeys = Object.keys(snapshot.platformUser.memberships);
  if (platformMirrorKeys.some((tenantId) => tenantId !== expected.tenantId)) {
    fail('PLATFORM_ADDITIONAL_MIRROR_CONFLICT');
  }

  if (isAlreadyApplied(snapshot, expected)) fail('REMEDIATION_ALREADY_APPLIED');
  if (snapshot.platformTenantMemberships.length !== 1) {
    fail('OVERLAP_MEMBERSHIP_MISSING');
  }
  if (!isPlainObject(snapshot.overlapMembership)) fail('OVERLAP_MEMBERSHIP_MISSING');

  const overlap = snapshot.overlapMembership;
  if (
    overlap.id !== expected.overlapMembershipId ||
    overlap.uid !== expected.platformUid ||
    overlap.tenantId !== expected.tenantId ||
    overlap.role !== expected.overlapRole ||
    overlap.status !== expected.overlapStatus
  ) {
    fail('OVERLAP_MEMBERSHIP_MISMATCH');
  }
  if (!isTimestampToken(overlap.updateTime)) fail('INVALID_REMEDIATION_INPUT');
  if (!sameTimestampToken(overlap.updateTime, expected.overlapUpdateTime)) {
    fail('STALE_OVERLAP_MEMBERSHIP');
  }
  const observedPlatformMembership = snapshot.platformTenantMemberships[0];
  if (
    observedPlatformMembership.uid !== overlap.uid ||
    observedPlatformMembership.tenantId !== overlap.tenantId ||
    observedPlatformMembership.role !== overlap.role ||
    observedPlatformMembership.status !== overlap.status ||
    !sameTimestampToken(observedPlatformMembership.updateTime, overlap.updateTime)
  ) {
    fail('OVERLAP_MEMBERSHIP_MISMATCH');
  }

  const platformMirror = getMembershipMirror(snapshot.platformUser, expected.tenantId);
  if (platformMirror === undefined) fail('PLATFORM_MIRROR_MISSING');
  if (!sameMembershipState(platformMirror, expected.platformMirror)) {
    fail('PLATFORM_MIRROR_MISMATCH');
  }

  const evidence = snapshot.ownerEvidence;
  if (!isPlainObject(evidence) || evidence.authoritative !== true) {
    fail('OWNER_EVIDENCE_MISSING');
  }
  if (
    evidence.decision !== 'APPROVED_OWNER' ||
    evidence.ownerUid !== expected.ownerUid ||
    evidence.tenantId !== expected.tenantId
  ) {
    fail('OWNER_EVIDENCE_MISMATCH');
  }

  const ownerCandidate = snapshot.ownerCandidate;
  if (
    !isPlainObject(ownerCandidate) ||
    ownerCandidate.exists !== true ||
    !isPlainObject(ownerCandidate.memberships)
  ) {
    fail('OWNER_CANDIDATE_MISSING');
  }
  if (ownerCandidate.uid !== expected.ownerUid) fail('OWNER_CANDIDATE_MISMATCH');

  if (snapshot.ownerMembership !== null && snapshot.ownerMembership !== undefined) {
    fail('OWNER_MEMBERSHIP_CONFLICT');
  }
  if (getMembershipMirror(ownerCandidate, expected.tenantId) !== undefined) {
    fail('OWNER_MIRROR_CONFLICT');
  }

  return {
    mode: 'EMULATOR_REHEARSAL_PLAN',
    retryPolicy: 'NO_AUTOMATIC_RETRY',
    projectId: expected.projectId,
    operations: [
      {
        type: 'DELETE_TENANT_MEMBERSHIP',
        collection: 'tenantMemberships',
        documentId: expected.overlapMembershipId,
      },
      {
        type: 'REMOVE_USER_MEMBERSHIP_MIRROR',
        collection: 'users',
        documentId: expected.platformUid,
        tenantId: expected.tenantId,
      },
      {
        type: 'CREATE_OWNER_MEMBERSHIP',
        collection: 'tenantMemberships',
        documentId: expected.ownerMembershipId,
        data: {
          uid: expected.ownerUid,
          tenantId: expected.tenantId,
          role: 'OWNER',
          status: ACTIVE_STATUS,
        },
        serverTimestampFields: ['createdAt', 'updatedAt'],
      },
      {
        type: 'CREATE_OWNER_MEMBERSHIP_MIRROR',
        collection: 'users',
        documentId: expected.ownerUid,
        tenantId: expected.tenantId,
        data: { role: 'OWNER', status: ACTIVE_STATUS },
      },
    ],
    untouched: [
      { collection: 'platformAdmins', documentId: expected.platformUid },
      { collection: 'platformAdmins', documentId: expected.ownerUid },
      { collection: 'tenants', documentId: expected.tenantId },
    ],
  };
}
