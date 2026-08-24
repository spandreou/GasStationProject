import assert from 'node:assert/strict';
import {
  RemediationPreconditionError,
  buildPlatformAdminOverlapRemediationPlan,
  classifyPlatformAdminMembership,
  platformAdminStatusGrantsTenantAccess,
} from './lib/platform-admin-overlap-remediation.mjs';

const SYNTHETIC = Object.freeze({
  projectId: 'demo-shiftoryx-platform-overlap',
  platformUid: 'synthetic-platform-admin',
  ownerUid: 'synthetic-business-owner',
  tenantId: 'synthetic-store',
  overlapMembershipId: 'synthetic-platform-admin_synthetic-store',
  ownerMembershipId: 'synthetic-business-owner_synthetic-store',
  overlapUpdateTime: Object.freeze({
    seconds: '1786264200',
    nanoseconds: 100_000,
  }),
});

function buildValidInput() {
  return {
    expected: {
      projectId: SYNTHETIC.projectId,
      platformUid: SYNTHETIC.platformUid,
      tenantId: SYNTHETIC.tenantId,
      overlapMembershipId: SYNTHETIC.overlapMembershipId,
      overlapRole: 'OWNER',
      overlapStatus: 'ACTIVE',
      overlapUpdateTime: SYNTHETIC.overlapUpdateTime,
      platformMirror: { role: 'OWNER', status: 'ACTIVE' },
      ownerUid: SYNTHETIC.ownerUid,
      ownerMembershipId: SYNTHETIC.ownerMembershipId,
    },
    snapshot: {
      projectId: SYNTHETIC.projectId,
      platformAdmin: {
        uid: SYNTHETIC.platformUid,
        status: 'ACTIVE',
      },
      tenant: {
        tenantId: SYNTHETIC.tenantId,
        exists: true,
      },
      overlapMembership: {
        id: SYNTHETIC.overlapMembershipId,
        uid: SYNTHETIC.platformUid,
        tenantId: SYNTHETIC.tenantId,
        role: 'OWNER',
        status: 'ACTIVE',
        updateTime: SYNTHETIC.overlapUpdateTime,
      },
      platformTenantMemberships: [
        {
          id: SYNTHETIC.overlapMembershipId,
          uid: SYNTHETIC.platformUid,
          tenantId: SYNTHETIC.tenantId,
          role: 'OWNER',
          status: 'ACTIVE',
          updateTime: SYNTHETIC.overlapUpdateTime,
        },
      ],
      platformUser: {
        uid: SYNTHETIC.platformUid,
        exists: true,
        memberships: {
          [SYNTHETIC.tenantId]: { role: 'OWNER', status: 'ACTIVE' },
        },
      },
      ownerEvidence: {
        authoritative: true,
        decision: 'APPROVED_OWNER',
        ownerUid: SYNTHETIC.ownerUid,
        tenantId: SYNTHETIC.tenantId,
      },
      ownerCandidate: {
        uid: SYNTHETIC.ownerUid,
        exists: true,
        memberships: {},
      },
      ownerPlatformAdmin: null,
      ownerMembership: null,
      competingActiveMemberships: [],
    },
  };
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof RemediationPreconditionError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

function runClassificationTests() {
  assert.deepEqual(
    classifyPlatformAdminMembership({
      platformAdmin: { uid: SYNTHETIC.platformUid, status: 'ACTIVE' },
      membership: null,
    }),
    {
      classification: 'VALID_PLATFORM_ADMIN',
      tenantAccessGranted: false,
      remediationRequired: false,
    },
  );

  for (const role of ['OWNER', 'ADMIN', 'MANAGER']) {
    assert.deepEqual(
      classifyPlatformAdminMembership({
        platformAdmin: { uid: SYNTHETIC.platformUid, status: 'ACTIVE' },
        membership: {
          uid: SYNTHETIC.platformUid,
          tenantId: SYNTHETIC.tenantId,
          role,
          status: 'ACTIVE',
        },
      }),
      {
        classification: 'PLATFORM_ADMIN_TENANT_MEMBERSHIP_FORBIDDEN',
        tenantAccessGranted: false,
        remediationRequired: true,
      },
    );
  }

  for (const status of ['INACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED']) {
    assert.deepEqual(
      classifyPlatformAdminMembership({
        platformAdmin: { uid: SYNTHETIC.platformUid, status: 'ACTIVE' },
        membership: {
          uid: SYNTHETIC.platformUid,
          tenantId: SYNTHETIC.tenantId,
          role: 'OWNER',
          status,
        },
      }),
      {
        classification: 'MANUAL_REVIEW_REQUIRED',
        tenantAccessGranted: false,
        remediationRequired: true,
      },
    );
  }

  assert.equal(platformAdminStatusGrantsTenantAccess(), false);
  assert.equal(platformAdminStatusGrantsTenantAccess({ status: 'ACTIVE' }), false);

  expectCode('INVALID_PLATFORM_ADMIN', () =>
    classifyPlatformAdminMembership({ platformAdmin: { uid: '', status: 'ACTIVE' } }),
  );
  expectCode('PLATFORM_ADMIN_NOT_ACTIVE', () =>
    classifyPlatformAdminMembership({
      platformAdmin: { uid: SYNTHETIC.platformUid, status: 'SUSPENDED' },
    }),
  );
  expectCode('INVALID_MEMBERSHIP', () =>
    classifyPlatformAdminMembership({
      platformAdmin: { uid: SYNTHETIC.platformUid, status: 'ACTIVE' },
      membership: {
        uid: SYNTHETIC.platformUid,
        tenantId: SYNTHETIC.tenantId,
        role: 'VIEWER',
        status: 'ACTIVE',
      },
    }),
  );
  expectCode('MEMBERSHIP_UID_MISMATCH', () =>
    classifyPlatformAdminMembership({
      platformAdmin: { uid: SYNTHETIC.platformUid, status: 'ACTIVE' },
      membership: {
        uid: SYNTHETIC.ownerUid,
        tenantId: SYNTHETIC.tenantId,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    }),
  );
}

function runPlanTests() {
  const input = buildValidInput();
  const before = structuredClone(input);
  const plan = buildPlatformAdminOverlapRemediationPlan(input);

  assert.deepEqual(input, before, 'the pure planner must not mutate its input');
  assert.deepEqual(plan, {
    mode: 'EMULATOR_REHEARSAL_PLAN',
    retryPolicy: 'NO_AUTOMATIC_RETRY',
    projectId: SYNTHETIC.projectId,
    operations: [
      {
        type: 'DELETE_TENANT_MEMBERSHIP',
        collection: 'tenantMemberships',
        documentId: SYNTHETIC.overlapMembershipId,
      },
      {
        type: 'REMOVE_USER_MEMBERSHIP_MIRROR',
        collection: 'users',
        documentId: SYNTHETIC.platformUid,
        tenantId: SYNTHETIC.tenantId,
      },
      {
        type: 'CREATE_OWNER_MEMBERSHIP',
        collection: 'tenantMemberships',
        documentId: SYNTHETIC.ownerMembershipId,
        data: {
          uid: SYNTHETIC.ownerUid,
          tenantId: SYNTHETIC.tenantId,
          role: 'OWNER',
          status: 'ACTIVE',
        },
        serverTimestampFields: ['createdAt', 'updatedAt'],
      },
      {
        type: 'CREATE_OWNER_MEMBERSHIP_MIRROR',
        collection: 'users',
        documentId: SYNTHETIC.ownerUid,
        tenantId: SYNTHETIC.tenantId,
        data: { role: 'OWNER', status: 'ACTIVE' },
      },
    ],
    untouched: [
      { collection: 'platformAdmins', documentId: SYNTHETIC.platformUid },
      { collection: 'platformAdmins', documentId: SYNTHETIC.ownerUid },
      { collection: 'tenants', documentId: SYNTHETIC.tenantId },
    ],
  });

  const wrongProject = buildValidInput();
  wrongProject.snapshot.projectId = 'demo-shiftoryx-wrong-project';
  expectCode('PROJECT_ID_MISMATCH', () => buildPlatformAdminOverlapRemediationPlan(wrongProject));

  const inactiveAdmin = buildValidInput();
  inactiveAdmin.snapshot.platformAdmin.status = 'SUSPENDED';
  expectCode('PLATFORM_ADMIN_NOT_ACTIVE', () => buildPlatformAdminOverlapRemediationPlan(inactiveAdmin));

  const equivalentTimestampValue = buildValidInput();
  equivalentTimestampValue.snapshot.overlapMembership.updateTime = {
    seconds: '1786264200',
    nanoseconds: 100_000,
  };
  equivalentTimestampValue.snapshot.platformTenantMemberships[0].updateTime = {
    seconds: '1786264200',
    nanoseconds: 100_000,
  };
  assert.doesNotThrow(() =>
    buildPlatformAdminOverlapRemediationPlan(equivalentTimestampValue),
  );

  const stale = buildValidInput();
  stale.snapshot.overlapMembership.updateTime = {
    seconds: '1786264200',
    nanoseconds: 200_000,
  };
  stale.snapshot.platformTenantMemberships[0].updateTime = {
    seconds: '1786264200',
    nanoseconds: 200_000,
  };
  expectCode('STALE_OVERLAP_MEMBERSHIP', () => buildPlatformAdminOverlapRemediationPlan(stale));

  const wrongRole = buildValidInput();
  wrongRole.snapshot.overlapMembership.role = 'ADMIN';
  expectCode('OVERLAP_MEMBERSHIP_MISMATCH', () => buildPlatformAdminOverlapRemediationPlan(wrongRole));

  const wrongMirror = buildValidInput();
  wrongMirror.snapshot.platformUser.memberships[SYNTHETIC.tenantId].status = 'REVOKED';
  expectCode('PLATFORM_MIRROR_MISMATCH', () => buildPlatformAdminOverlapRemediationPlan(wrongMirror));

  const missingOwnerEvidence = buildValidInput();
  missingOwnerEvidence.snapshot.ownerEvidence = null;
  expectCode('OWNER_EVIDENCE_MISSING', () =>
    buildPlatformAdminOverlapRemediationPlan(missingOwnerEvidence),
  );

  const wrongOwnerEvidence = buildValidInput();
  wrongOwnerEvidence.snapshot.ownerEvidence.ownerUid = 'synthetic-unapproved-owner';
  expectCode('OWNER_EVIDENCE_MISMATCH', () =>
    buildPlatformAdminOverlapRemediationPlan(wrongOwnerEvidence),
  );

  const missingOwner = buildValidInput();
  missingOwner.snapshot.ownerCandidate.exists = false;
  expectCode('OWNER_CANDIDATE_MISSING', () => buildPlatformAdminOverlapRemediationPlan(missingOwner));

  const ownerIsActivePlatformAdmin = buildValidInput();
  ownerIsActivePlatformAdmin.snapshot.ownerPlatformAdmin = {
    uid: SYNTHETIC.ownerUid,
    status: 'ACTIVE',
  };
  expectCode('OWNER_PLATFORM_ADMIN_CONFLICT', () =>
    buildPlatformAdminOverlapRemediationPlan(ownerIsActivePlatformAdmin),
  );

  const sameIdentity = buildValidInput();
  sameIdentity.expected.ownerUid = SYNTHETIC.platformUid;
  sameIdentity.expected.ownerMembershipId = SYNTHETIC.overlapMembershipId;
  sameIdentity.snapshot.ownerEvidence.ownerUid = SYNTHETIC.platformUid;
  sameIdentity.snapshot.ownerCandidate.uid = SYNTHETIC.platformUid;
  expectCode('OWNER_MUST_BE_SEPARATE_IDENTITY', () =>
    buildPlatformAdminOverlapRemediationPlan(sameIdentity),
  );

  const conflictingMembership = buildValidInput();
  conflictingMembership.snapshot.ownerMembership = {
    id: SYNTHETIC.ownerMembershipId,
    uid: SYNTHETIC.ownerUid,
    tenantId: SYNTHETIC.tenantId,
    role: 'MANAGER',
    status: 'ACTIVE',
  };
  expectCode('OWNER_MEMBERSHIP_CONFLICT', () =>
    buildPlatformAdminOverlapRemediationPlan(conflictingMembership),
  );

  const conflictingMirror = buildValidInput();
  conflictingMirror.snapshot.ownerCandidate.memberships[SYNTHETIC.tenantId] = {
    role: 'ADMIN',
    status: 'ACTIVE',
  };
  expectCode('OWNER_MIRROR_CONFLICT', () =>
    buildPlatformAdminOverlapRemediationPlan(conflictingMirror),
  );

  const additionalPlatformMembership = buildValidInput();
  additionalPlatformMembership.snapshot.platformTenantMemberships.push({
    id: 'synthetic-platform-admin_synthetic-other-store',
    uid: SYNTHETIC.platformUid,
    tenantId: 'synthetic-other-store',
    role: 'MANAGER',
    status: 'REVOKED',
    updateTime: { seconds: '1786264140', nanoseconds: 0 },
  });
  expectCode('PLATFORM_ADDITIONAL_MEMBERSHIP_CONFLICT', () =>
    buildPlatformAdminOverlapRemediationPlan(additionalPlatformMembership),
  );

  const additionalPlatformMirror = buildValidInput();
  additionalPlatformMirror.snapshot.platformUser.memberships['synthetic-other-store'] = {
    role: 'MANAGER',
    status: 'REVOKED',
  };
  expectCode('PLATFORM_ADDITIONAL_MIRROR_CONFLICT', () =>
    buildPlatformAdminOverlapRemediationPlan(additionalPlatformMirror),
  );

  const competingActiveMembership = buildValidInput();
  competingActiveMembership.snapshot.competingActiveMemberships = [
    {
      id: 'synthetic-other-owner_synthetic-store',
      uid: 'synthetic-other-owner',
      tenantId: SYNTHETIC.tenantId,
      role: 'OWNER',
      status: 'ACTIVE',
    },
  ];
  expectCode('COMPETING_ACTIVE_MEMBERSHIP_CONFLICT', () =>
    buildPlatformAdminOverlapRemediationPlan(competingActiveMembership),
  );

  const repeated = buildValidInput();
  repeated.snapshot.overlapMembership = null;
  repeated.snapshot.platformTenantMemberships = [];
  repeated.snapshot.platformUser.memberships = {};
  repeated.snapshot.ownerMembership = {
    id: SYNTHETIC.ownerMembershipId,
    uid: SYNTHETIC.ownerUid,
    tenantId: SYNTHETIC.tenantId,
    role: 'OWNER',
    status: 'ACTIVE',
  };
  repeated.snapshot.ownerCandidate.memberships[SYNTHETIC.tenantId] = {
    role: 'OWNER',
    status: 'ACTIVE',
  };
  expectCode('REMEDIATION_ALREADY_APPLIED', () =>
    buildPlatformAdminOverlapRemediationPlan(repeated),
  );

  const malformed = buildValidInput();
  malformed.expected.overlapUpdateTime = '';
  expectCode('INVALID_REMEDIATION_INPUT', () =>
    buildPlatformAdminOverlapRemediationPlan(malformed),
  );

  const unobservedOwnerMembership = buildValidInput();
  delete unobservedOwnerMembership.snapshot.ownerMembership;
  expectCode('INVALID_REMEDIATION_INPUT', () =>
    buildPlatformAdminOverlapRemediationPlan(unobservedOwnerMembership),
  );

  const unobservedOwnerPlatformAdmin = buildValidInput();
  delete unobservedOwnerPlatformAdmin.snapshot.ownerPlatformAdmin;
  expectCode('INVALID_REMEDIATION_INPUT', () =>
    buildPlatformAdminOverlapRemediationPlan(unobservedOwnerPlatformAdmin),
  );

  const unobservedCompetingMemberships = buildValidInput();
  delete unobservedCompetingMemberships.snapshot.competingActiveMemberships;
  expectCode('INVALID_REMEDIATION_INPUT', () =>
    buildPlatformAdminOverlapRemediationPlan(unobservedCompetingMemberships),
  );

  const unobservedPlatformMemberships = buildValidInput();
  delete unobservedPlatformMemberships.snapshot.platformTenantMemberships;
  expectCode('INVALID_REMEDIATION_INPUT', () =>
    buildPlatformAdminOverlapRemediationPlan(unobservedPlatformMemberships),
  );
}

runClassificationTests();
runPlanTests();
console.log('PLATFORM_ADMIN_OVERLAP_OFFLINE_TESTS_PASSED');
