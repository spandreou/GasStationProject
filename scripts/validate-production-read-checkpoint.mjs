import assert from 'node:assert/strict';
import {
  classifyMembershipInventory,
  inventoryFirestoreReadOnly,
} from './inventory-tenant-memberships.mjs';

export const ROLE_POLICY_CONTRACT = Object.freeze({
  EXPECTED_LEGACY_ROLE: 'ADMIN',
  EXPECTED_MANAGER_COUNT: 0,
  TARGET_ROLE: 'OWNER',
  AUTO_MIGRATION_ALLOWED: false,
});

export function validateRolePolicyContract() {
  assert.equal(ROLE_POLICY_CONTRACT.EXPECTED_LEGACY_ROLE, 'ADMIN');
  assert.equal(ROLE_POLICY_CONTRACT.EXPECTED_MANAGER_COUNT, 0);
  assert.equal(ROLE_POLICY_CONTRACT.TARGET_ROLE, 'OWNER');
  assert.equal(ROLE_POLICY_CONTRACT.AUTO_MIGRATION_ALLOWED, false);
}

export function testSafetyInterpretation() {
  const legacyAdminRecord = {
    id: 'user-admin_store-1',
    data: {
      uid: 'user-admin',
      tenantId: 'store-1',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: '2026-07-28T08:00:00.000Z',
      updatedAt: '2026-07-28T09:00:00.000Z',
    },
  };

  const managerRecord = {
    id: 'user-manager_store-2',
    data: {
      uid: 'user-manager',
      tenantId: 'store-2',
      role: 'MANAGER',
      status: 'ACTIVE',
      createdAt: '2026-07-28T08:00:00.000Z',
      updatedAt: '2026-07-28T09:00:00.000Z',
    },
  };

  const fixture = {
    memberships: [legacyAdminRecord, managerRecord],
    userIds: new Set(['user-admin', 'user-manager']),
    tenantIds: new Set(['store-1', 'store-2']),
    platformAdminIds: new Set(),
  };

  const result = classifyMembershipInventory(fixture);

  // Legacy ADMIN must default to MANUAL_REVIEW_REQUIRED without explicit approval manifest
  const adminClassification = result.records.find((r) => r.id === 'user-admin_store-1');
  assert.equal(adminClassification.classification, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(adminClassification.currentRole, 'ADMIN');
  assert.equal(adminClassification.proposedRole, null);
  assert.ok(adminClassification.reasons.includes('legacy-admin-owner-semantics-not-approved'));

  // Discovered MANAGER is an unexpected anomaly and must default to MANUAL_REVIEW_REQUIRED
  const managerClassification = result.records.find((r) => r.id === 'user-manager_store-2');
  assert.equal(managerClassification.classification, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(managerClassification.currentRole, 'MANAGER');
  assert.equal(managerClassification.proposedRole, null);

  // SAFE_CANDIDATE should be 0 because no approval manifest is provided
  assert.equal(result.counts.SAFE_CANDIDATE, 0);
  assert.equal(result.counts.MANUAL_REVIEW_REQUIRED, 2);
}

export function testApprovalManifestRequirement() {
  const legacyAdminRecord = {
    id: 'user-approved-admin_store-1',
    data: {
      uid: 'user-approved-admin',
      tenantId: 'store-1',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: '2026-07-28T08:00:00.000Z',
      updatedAt: '2026-07-28T09:00:00.000Z',
    },
  };

  const fixture = {
    memberships: [legacyAdminRecord],
    userIds: new Set(['user-approved-admin']),
    tenantIds: new Set(['store-1']),
    platformAdminIds: new Set(),
    approvedRoleChangeIds: new Set(['user-approved-admin_store-1']),
  };

  const result = classifyMembershipInventory(fixture);
  const adminClassification = result.records.find((r) => r.id === 'user-approved-admin_store-1');
  assert.equal(adminClassification.classification, 'SAFE_CANDIDATE');
  assert.equal(adminClassification.proposedRole, 'OWNER');
}

export async function testProductionReadRejection() {
  // Verifies that inventoryFirestoreReadOnly rejects non-emulator or non-allowlisted targets
  await assert.rejects(
    async () => {
      await inventoryFirestoreReadOnly({
        emulatorHost: 'firestore.googleapis.com:443',
        projectId: 'shiftoryx-production',
      });
    },
    (err) => err.message.includes('Firestore emulator host must be an explicit local loopback address'),
  );

  await assert.rejects(
    async () => {
      await inventoryFirestoreReadOnly({
        emulatorHost: '127.0.0.1:8080',
        projectId: 'unapproved-project-id',
      });
    },
    (err) => err.message.includes('Emulator project is not approved for Phase 2A inventory'),
  );
}

async function run() {
  validateRolePolicyContract();
  testSafetyInterpretation();
  testApprovalManifestRequirement();
  await testProductionReadRejection();
  console.log('Production Read Approval Checkpoint validation passed cleanly.');
}

run().catch((error) => {
  console.error(`Production Read Approval Checkpoint validation failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
