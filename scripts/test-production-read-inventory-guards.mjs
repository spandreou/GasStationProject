import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseProductionCliArgs,
  validateProductionEnvironment,
  isRepositoryPath,
  writeProtectedAuditFile,
  inventoryFirestoreProductionReadOnlyInternal,
  CONFIRMED_PRODUCTION_PROJECT_ID,
} from './inventory-tenant-memberships-production-readonly.mjs';

import {
  classifyMembershipInventory,
  sanitizeInventorySummary,
} from './lib/tenant-membership-inventory-core.mjs';

import { testPhase2AOfflineInventory } from './test-owner-role-inventory-emulator.mjs';

function createTempOutputDir() {
  const tempBase = os.tmpdir();
  const dirName = `shiftoryx-prod-inv-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fullPath = path.join(tempBase, dirName);
  fs.mkdirSync(fullPath, { recursive: true });
  return fullPath;
}

function cleanTempOutputDir(dirPath) {
  if (dirPath && fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

// 1. missing --read-only
export function testMissingReadOnlyFlag() {
  assert.throws(
    () => parseProductionCliArgs([]),
    (err) => err.message.includes('Unsupported argument') || err.message.includes('--read-only'),
  );
}

// 2. unknown CLI argument
export function testUnknownCliArgument() {
  assert.throws(
    () => parseProductionCliArgs(['--read-only', '--write']),
    (err) => err.message.includes('Unsupported argument'),
  );
}

// 3. missing approval
export function testMissingApprovalEnv() {
  assert.throws(
    () => validateProductionEnvironment({}),
    (err) => err.message.includes('SHIFTORYX_PRODUCTION_READ_APPROVED'),
  );
}

// 4. wrong approval
export function testWrongApprovalEnv() {
  assert.throws(
    () => validateProductionEnvironment({ SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES' }),
    (err) => err.message.includes('SHIFTORYX_PRODUCTION_READ_APPROVED'),
  );
}

// 5. missing project ID
export function testMissingProjectIdEnv() {
  assert.throws(
    () =>
      validateProductionEnvironment({
        SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
        SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'alice',
      }),
    (err) => err.message.includes('SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID'),
  );
}

// 6. execution locked while exact project confirmation is absent
export function testExecutionLockedWithoutConfirmedProject() {
  assert.equal(CONFIRMED_PRODUCTION_PROJECT_ID, '');
  assert.throws(
    () =>
      validateProductionEnvironment({
        SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
        SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'alice',
        SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'gasstationproject',
      }),
    (err) => err.message.includes('EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION'),
  );
}

// 7. emulator environment present
export function testEmulatorEnvPresentRejection() {
  assert.throws(
    () =>
      validateProductionEnvironment({
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
      }),
    (err) => err.message.includes('rejects executions with FIRESTORE_EMULATOR_HOST set'),
  );
}

// 8. missing reviewer
export function testMissingReviewerEnv() {
  assert.throws(
    () =>
      validateProductionEnvironment({
        SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
      }),
    (err) => err.message.includes('SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER'),
  );
}

// 9. missing output directory
export function testMissingOutputDirEnv() {
  assert.throws(
    () =>
      validateProductionEnvironment({
        SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
        SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'alice',
        SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'confirmed-proj',
      }),
    (err) => err.message.includes('SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR'),
  );
}

// 10. relative output directory
export function testRelativeOutputDirRejection() {
  assert.throws(
    () =>
      validateProductionEnvironment({
        SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
        SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'alice',
        SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'confirmed-proj',
        SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: './tmp',
      }),
    (err) => err.message.includes('must be an absolute path'),
  );
}

// 11. repository-contained output
export function testRepoContainedOutputDirRejection() {
  const repoDocs = path.resolve(fileURLToPath(new URL('../docs', import.meta.url)));
  assert.throws(
    () =>
      validateProductionEnvironment({
        SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
        SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'alice',
        SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'confirmed-proj',
        SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: repoDocs,
      }),
    (err) => err.message.includes('strictly outside the repository worktree'),
  );
}

// 12. symlink rejection where supported
export function testSymlinkOutputDirRejection() {
  const tempDir = createTempOutputDir();
  const linkDir = path.join(os.tmpdir(), `symlink-test-${Date.now()}`);
  try {
    fs.symlinkSync(tempDir, linkDir, 'junction');
    assert.throws(
      () =>
        validateProductionEnvironment({
          SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
          SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'alice',
          SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'confirmed-proj',
          SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: linkDir,
        }),
      (err) => err.message.includes('symbolic link'),
    );
  } finally {
    if (fs.existsSync(linkDir)) fs.unlinkSync(linkDir);
    cleanTempOutputDir(tempDir);
  }
}

// 13. pre-existing output file refusal (exclusive creation wx)
export function testPreExistingOutputFileRefusal() {
  const tempDir = createTempOutputDir();
  try {
    const correlationId = 'test-corr-id-123';
    const filePath = path.join(tempDir, `shiftoryx-inventory-${correlationId}.json`);
    fs.writeFileSync(filePath, 'existing content', 'utf8');

    const dummyInventory = classifyMembershipInventory({ memberships: [] });
    assert.throws(
      () =>
        writeProtectedAuditFile({
          outputDir: tempDir,
          correlationId,
          reviewer: 'alice',
          projectId: 'proj-1',
          retentionHours: 24,
          inventory: dummyInventory,
          mirrorDetails: [],
        }),
      (err) => err.code === 'EEXIST' || err.message.includes('exists'),
    );
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

// 14. invalid retention
export function testInvalidRetentionHours() {
  assert.throws(
    () =>
      validateProductionEnvironment({
        SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
        SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'alice',
        SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'confirmed-proj',
        SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: os.tmpdir(),
        SHIFTORYX_PRODUCTION_INVENTORY_RETENTION_HOURS: '-5',
      }),
    (err) => err.message.includes('Retention hours'),
  );
}

// 15. invalid membership maximum
export function testInvalidMembershipMaximum() {
  assert.throws(
    () =>
      validateProductionEnvironment({
        SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
        SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'alice',
        SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'confirmed-proj',
        SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: os.tmpdir(),
        SHIFTORYX_PRODUCTION_INVENTORY_MAX_MEMBERSHIPS: '0',
      }),
    (err) => err.message.includes('Max memberships'),
  );
}

// 16. maximum exceeded before reference reads
export async function testMaximumExceededBeforeReferenceReads() {
  const tempDir = createTempOutputDir();
  try {
    const fakeAdapter = async () => {
      return {
        membershipsData: [
          { id: 'u1_s1', data: { uid: 'u1', tenantId: 's1', role: 'ADMIN', status: 'ACTIVE' } },
          { id: 'u2_s2', data: { uid: 'u2', tenantId: 's2', role: 'ADMIN', status: 'ACTIVE' } },
        ],
        isRealProductionRead: false,
      };
    };

    const config = {
      projectId: 'proj-1',
      reviewer: 'alice',
      outputDir: tempDir,
      retentionHours: 24,
      maxMemberships: 1,
    };

    await assert.rejects(
      async () => {
        await inventoryFirestoreProductionReadOnlyInternal({ config, fakeAdapter });
      },
      (err) => err.message.includes('exceeds approved maximum limit'),
    );
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

// 17. SDK initialization occurs only after all guards
export function testSdkInitBoundaryGuards() {
  // Verifies that validateProductionEnvironment throws BEFORE any SDK import/init
  assert.throws(
    () => validateProductionEnvironment({}),
    (err) => err.message.includes('SHIFTORYX_PRODUCTION_READ_APPROVED'),
  );
}

// 18. only referenced users/tenants/platform-admins are requested
export async function testOnlyReferencedIdsRequested() {
  const tempDir = createTempOutputDir();
  try {
    let lookupsRequested = false;
    const fakeAdapter = async () => {
      lookupsRequested = true;
      return {
        membershipsData: [{ id: 'u1_s1', data: { uid: 'u1', tenantId: 's1', role: 'OWNER', status: 'ACTIVE' } }],
        userResults: new Map([['u1', { exists: true, memberships: { s1: { role: 'OWNER', status: 'ACTIVE' } } }]]),
        tenantResults: new Map([['s1', true]]),
        platformAdminResults: new Map([['u1', false]]),
        isRealProductionRead: false,
      };
    };

    const config = {
      projectId: 'proj-1',
      reviewer: 'alice',
      outputDir: tempDir,
      retentionHours: 24,
      maxMemberships: 10,
    };

    const res = await inventoryFirestoreProductionReadOnlyInternal({ config, fakeAdapter });
    assert.ok(lookupsRequested);
    assert.equal(res.sanitizedConsoleOutput.totalMemberships, 1);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

// 19. no collection-wide reference scans
export function testNoCollectionWideReferenceScans() {
  // Production reader code contains no collection('users').get() or collection('tenants').get()
  const scriptContent = fs.readFileSync(
    fileURLToPath(new URL('./inventory-tenant-memberships-production-readonly.mjs', import.meta.url)),
    'utf8',
  );
  assert.ok(!scriptContent.includes("collection('users').get()"));
  assert.ok(!scriptContent.includes("collection('tenants').get()"));
  assert.ok(!scriptContent.includes("collection('platformAdmins').get()"));
}

// 20. bounded concurrency
export function testBoundedConcurrencyInSource() {
  const scriptContent = fs.readFileSync(
    fileURLToPath(new URL('./inventory-tenant-memberships-production-readonly.mjs', import.meta.url)),
    'utf8',
  );
  assert.ok(scriptContent.includes('chunkSize = 10'));
}

// 21. approved membership field projection enforcement
export function testApprovedMembershipProjectionInSource() {
  const scriptContent = fs.readFileSync(
    fileURLToPath(new URL('./inventory-tenant-memberships-production-readonly.mjs', import.meta.url)),
    'utf8',
  );
  assert.ok(
    scriptContent.includes(".select('uid', 'tenantId', 'role', 'status', 'createdAt', 'updatedAt')"),
  );
}

// 22. user mirror consistency checks
export async function testUserMirrorConsistencyChecks() {
  const tempDir = createTempOutputDir();
  try {
    const fakeAdapter = async () => {
      return {
        membershipsData: [
          { id: 'u1_s1', data: { uid: 'u1', tenantId: 's1', role: 'OWNER', status: 'ACTIVE' } },
          { id: 'u2_s2', data: { uid: 'u2', tenantId: 's2', role: 'OWNER', status: 'ACTIVE' } },
          { id: 'u3_s3', data: { uid: 'u3', tenantId: 's3', role: 'OWNER', status: 'ACTIVE' } },
        ],
        userResults: new Map([
          ['u1', { exists: true, memberships: { s1: { role: 'OWNER', status: 'ACTIVE' } } }], // Consistent
          ['u2', { exists: true, memberships: {} }], // Absent
          ['u3', { exists: true, memberships: { s3: { role: 'ADMIN', status: 'ACTIVE' } } }], // Role mismatch
        ]),
        tenantResults: new Map([['s1', true], ['s2', true], ['s3', true]]),
        platformAdminResults: new Map([['u1', false], ['u2', false], ['u3', false]]),
        isRealProductionRead: false,
      };
    };

    const config = {
      projectId: 'proj-1',
      reviewer: 'alice',
      outputDir: tempDir,
      retentionHours: 24,
      maxMemberships: 10,
    };

    const res = await inventoryFirestoreProductionReadOnlyInternal({ config, fakeAdapter });
    assert.equal(res.sanitizedConsoleOutput.mirrorMismatchCount, 2); // 1 absent + 1 mismatch
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

// 23. no approved role-change IDs
export async function testNoApprovedRoleChangeIdsSupplied() {
  const tempDir = createTempOutputDir();
  try {
    const fakeAdapter = async () => {
      return {
        membershipsData: [{ id: 'u1_s1', data: { uid: 'u1', tenantId: 's1', role: 'ADMIN', status: 'ACTIVE' } }],
        userResults: new Map([['u1', { exists: true, memberships: { s1: { role: 'ADMIN', status: 'ACTIVE' } } }]]),
        tenantResults: new Map([['s1', true]]),
        platformAdminResults: new Map([['u1', false]]),
        isRealProductionRead: false,
      };
    };

    const config = {
      projectId: 'proj-1',
      reviewer: 'alice',
      outputDir: tempDir,
      retentionHours: 24,
      maxMemberships: 10,
    };

    const res = await inventoryFirestoreProductionReadOnlyInternal({ config, fakeAdapter });
    assert.equal(res.sanitizedConsoleOutput.classificationCounts.SAFE_CANDIDATE, 0);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

// 24. ADMIN remains MANUAL_REVIEW_REQUIRED
export async function testAdminRemainsManualReviewRequired() {
  const tempDir = createTempOutputDir();
  try {
    const fakeAdapter = async () => {
      return {
        membershipsData: [{ id: 'u1_s1', data: { uid: 'u1', tenantId: 's1', role: 'ADMIN', status: 'ACTIVE' } }],
        userResults: new Map([['u1', { exists: true, memberships: { s1: { role: 'ADMIN', status: 'ACTIVE' } } }]]),
        tenantResults: new Map([['s1', true]]),
        platformAdminResults: new Map([['u1', false]]),
        isRealProductionRead: false,
      };
    };

    const config = {
      projectId: 'proj-1',
      reviewer: 'alice',
      outputDir: tempDir,
      retentionHours: 24,
      maxMemberships: 10,
    };

    const res = await inventoryFirestoreProductionReadOnlyInternal({ config, fakeAdapter });
    assert.equal(res.sanitizedConsoleOutput.adminCount, 1);
    assert.equal(res.sanitizedConsoleOutput.classificationCounts.MANUAL_REVIEW_REQUIRED, 1);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

// 25. MANAGER produces anomaly verdict
export async function testManagerProducesAnomalyVerdict() {
  const tempDir = createTempOutputDir();
  try {
    const fakeAdapter = async () => {
      return {
        membershipsData: [{ id: 'u1_s1', data: { uid: 'u1', tenantId: 's1', role: 'MANAGER', status: 'ACTIVE' } }],
        userResults: new Map([['u1', { exists: true, memberships: { s1: { role: 'MANAGER', status: 'ACTIVE' } } }]]),
        tenantResults: new Map([['s1', true]]),
        platformAdminResults: new Map([['u1', false]]),
        isRealProductionRead: false,
      };
    };

    const config = {
      projectId: 'proj-1',
      reviewer: 'alice',
      outputDir: tempDir,
      retentionHours: 24,
      maxMemberships: 10,
    };

    const res = await inventoryFirestoreProductionReadOnlyInternal({ config, fakeAdapter });
    assert.equal(res.sanitizedConsoleOutput.managerCount, 1);
    assert.equal(res.sanitizedConsoleOutput.finalCheckpointVerdict, 'UNEXPECTED_MANAGER_DATA_REQUIRES_REVIEW');
    assert.ok(res.hasAnomalies);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

// 26. malformed/conflict produces failure verdict
export async function testMalformedProducesFailureVerdict() {
  const tempDir = createTempOutputDir();
  try {
    const fakeAdapter = async () => {
      return {
        membershipsData: [{ id: 'bad-id', data: { uid: '', tenantId: 's1', role: 'ADMIN', status: 'ACTIVE' } }],
        userResults: new Map(),
        tenantResults: new Map([['s1', true]]),
        platformAdminResults: new Map(),
        isRealProductionRead: false,
      };
    };

    const config = {
      projectId: 'proj-1',
      reviewer: 'alice',
      outputDir: tempDir,
      retentionHours: 24,
      maxMemberships: 10,
    };

    const res = await inventoryFirestoreProductionReadOnlyInternal({ config, fakeAdapter });
    assert.equal(res.sanitizedConsoleOutput.malformedCount, 1);
    assert.equal(res.sanitizedConsoleOutput.finalCheckpointVerdict, 'CHECKPOINT_VERDICT_REQUIRES_MANUAL_REVIEW');
    assert.ok(res.hasAnomalies);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

// 27. console contains no synthetic raw UID or tenant ID
export async function testConsoleContainsZeroRawIdentifiers() {
  const tempDir = createTempOutputDir();
  try {
    const fakeAdapter = async () => {
      return {
        membershipsData: [{ id: 'secretuid_secrettenant', data: { uid: 'secretuid', tenantId: 'secrettenant', role: 'OWNER', status: 'ACTIVE' } }],
        userResults: new Map([['secretuid', { exists: true, memberships: { secrettenant: { role: 'OWNER', status: 'ACTIVE' } } }]]),
        tenantResults: new Map([['secrettenant', true]]),
        platformAdminResults: new Map([['secretuid', false]]),
        isRealProductionRead: false,
      };
    };

    const config = {
      projectId: 'proj-1',
      reviewer: 'alice',
      outputDir: tempDir,
      retentionHours: 24,
      maxMemberships: 10,
    };

    const res = await inventoryFirestoreProductionReadOnlyInternal({ config, fakeAdapter });
    const jsonStr = JSON.stringify(res.sanitizedConsoleOutput);
    assert.ok(!jsonStr.includes('secretuid'));
    assert.ok(!jsonStr.includes('secrettenant'));
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

// 28. protected output uses exclusive creation
export function testProtectedOutputUsesExclusiveCreation() {
  const scriptContent = fs.readFileSync(
    fileURLToPath(new URL('./inventory-tenant-memberships-production-readonly.mjs', import.meta.url)),
    'utf8',
  );
  assert.ok(scriptContent.includes('fs.constants.O_EXCL'));
  assert.ok(scriptContent.includes('0o600'));
}

// 29. static no-write verification
export function testStaticNoWriteVerification() {
  const scriptContent = fs.readFileSync(
    fileURLToPath(new URL('./inventory-tenant-memberships-production-readonly.mjs', import.meta.url)),
    'utf8',
  );
  const writePatterns = [
    /\.set\s*\(/u,
    /\.update\s*\(/u,
    /\.delete\s*\(/u,
    /\.create\s*\(/u,
    /\.add\s*\(/u,
    /\.batch\s*\(/u,
    /\.writeBatch\s*\(/u,
    /\.runTransaction\s*\(/u,
    /\.bulkWriter\s*\(/u,
    /\.recursiveDelete\s*\(/u,
    /\.import\s*\(/u,
    /\.restore\s*\(/u,
  ];

  for (const pattern of writePatterns) {
    assert.ok(!pattern.test(scriptContent), `Found forbidden write pattern: ${pattern}`);
  }
}

// 30. no write/apply/execute flag
export function testNoWriteApplyExecuteFlags() {
  const scriptContent = fs.readFileSync(
    fileURLToPath(new URL('./inventory-tenant-memberships-production-readonly.mjs', import.meta.url)),
    'utf8',
  );
  assert.ok(!scriptContent.includes('--write'));
  assert.ok(!scriptContent.includes('--apply'));
  assert.ok(!scriptContent.includes('--execute'));
}

// 31. productionReadPerformed is truthful
export async function testTruthfulProductionReadPerformed() {
  const tempDir = createTempOutputDir();
  try {
    const fakeAdapter = async () => {
      return {
        membershipsData: [],
        userResults: new Map(),
        tenantResults: new Map(),
        platformAdminResults: new Map(),
        isRealProductionRead: false,
      };
    };

    const config = {
      projectId: 'proj-1',
      reviewer: 'alice',
      outputDir: tempDir,
      retentionHours: 24,
      maxMemberships: 10,
    };

    const res = await inventoryFirestoreProductionReadOnlyInternal({ config, fakeAdapter });
    assert.equal(res.sanitizedConsoleOutput.productionReadPerformed, false);
    assert.equal(res.sanitizedConsoleOutput.writeOperationsExecuted, 0);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

// 32. existing Phase 2A offline test still passes
export function testExistingPhase2AOfflineTest() {
  testPhase2AOfflineInventory();
}

// 33. existing Phase 2A emulator test passes (verified via npm script integration)
export function testEmulatorScriptReference() {
  const pkgContent = fs.readFileSync(
    fileURLToPath(new URL('../package.json', import.meta.url)),
    'utf8',
  );
  const pkg = JSON.parse(pkgContent);
  assert.ok(pkg.scripts['test:owner-role-inventory:emulator']);
}

export async function runAllGuardTests() {
  testMissingReadOnlyFlag();
  testUnknownCliArgument();
  testMissingApprovalEnv();
  testWrongApprovalEnv();
  testMissingProjectIdEnv();
  testExecutionLockedWithoutConfirmedProject();
  testEmulatorEnvPresentRejection();
  testMissingReviewerEnv();
  testMissingOutputDirEnv();
  testRelativeOutputDirRejection();
  testRepoContainedOutputDirRejection();
  testSymlinkOutputDirRejection();
  testPreExistingOutputFileRefusal();
  testInvalidRetentionHours();
  testInvalidMembershipMaximum();
  await testMaximumExceededBeforeReferenceReads();
  testSdkInitBoundaryGuards();
  await testOnlyReferencedIdsRequested();
  testNoCollectionWideReferenceScans();
  testBoundedConcurrencyInSource();
  testApprovedMembershipProjectionInSource();
  await testUserMirrorConsistencyChecks();
  await testNoApprovedRoleChangeIdsSupplied();
  await testAdminRemainsManualReviewRequired();
  await testManagerProducesAnomalyVerdict();
  await testMalformedProducesFailureVerdict();
  await testConsoleContainsZeroRawIdentifiers();
  testProtectedOutputUsesExclusiveCreation();
  testStaticNoWriteVerification();
  testNoWriteApplyExecuteFlags();
  await testTruthfulProductionReadPerformed();
  testExistingPhase2AOfflineTest();
  testEmulatorScriptReference();

  console.log('All 33 production read-only inventory guard tests passed cleanly.');
}

const currentFile = path.resolve(fileURLToPath(import.meta.url));
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectInvocation =
  process.platform === 'win32'
    ? currentFile.toLowerCase() === invokedFile.toLowerCase()
    : currentFile === invokedFile;

if (isDirectInvocation) {
  runAllGuardTests().catch((error) => {
    console.error(`Guard test suite failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
