import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as productionReaderModule from './inventory-tenant-memberships-production-readonly.mjs';

import {
  parseProductionCliArgs,
  validateProductionEnvironment,
  isRepositoryPath,
  writeProtectedAuditFile,
  inventoryFirestoreProductionReadOnlyInternal,
  runChunkedReferenceReads,
  runProductionInventoryCli,
  CONFIRMED_PRODUCTION_PROJECT_ID,
} from './inventory-tenant-memberships-production-readonly.mjs';

import {
  classifyMembershipInventory,
  sanitizeInventorySummary,
} from './lib/tenant-membership-inventory-core.mjs';

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

// 1. parsing is separate from mandatory execution acknowledgement
export async function testMissingReadOnlyFlag() {
  assert.deepEqual(parseProductionCliArgs([]), { readOnly: false, help: false });
  await assert.rejects(
    () => runProductionInventoryCli([], {}),
    (err) => err.message.includes('--read-only'),
  );
}

export async function testHelpSkipsEnvironmentAndSdkInitialization() {
  let environmentValidationCalls = 0;
  let inventoryExecutionCalls = 0;
  const stdout = [];
  const result = await runProductionInventoryCli(
    ['--help'],
    new Proxy({}, {
      get() {
        throw new Error('help must not inspect environment values');
      },
    }),
    {
      validateEnvironment() {
        environmentValidationCalls += 1;
        throw new Error('environment validation must not run for help');
      },
      executeInventory() {
        inventoryExecutionCalls += 1;
        throw new Error('SDK initialization boundary must not run for help');
      },
      writeStdout(value) {
        stdout.push(value);
      },
    },
  );

  assert.equal(result.status, 'HELP');
  assert.equal(environmentValidationCalls, 0);
  assert.equal(inventoryExecutionCalls, 0);
  assert.equal(stdout.length, 1);
  assert.ok(stdout[0].includes('Mandatory acknowledgement flag'));
}

export async function testRuntimeErrorsAreRedactedAtEntrypoint() {
  assert.equal(typeof productionReaderModule.runProductionInventoryEntrypoint, 'function');
  const stderr = [];
  const exitCode = await productionReaderModule.runProductionInventoryEntrypoint({
    argv: ['--read-only'],
    env: {},
    dependencies: {
      validateEnvironment: () => syntheticConfig(os.tmpdir()),
      executeInventory: async () => {
        throw new Error('ADC failed at C:\\secret\\service-account.json for private@example.test');
      },
      writeStdout() {
        throw new Error('stdout must not be written for runtime failure');
      },
    },
    writeStderr(value) {
      stderr.push(value);
    },
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(stderr, ['PRODUCTION_READ_RUNTIME_FAILURE']);
  assert.equal(stderr.join('\n').includes('service-account.json'), false);
  assert.equal(stderr.join('\n').includes('private@example.test'), false);
}

export async function testSdkInitializationRemainsZeroForFailedGuards() {
  const tempDir = createTempOutputDir();
  try {
    const lockedEnvironment = {
      SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
      SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'ops-review-1',
      SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'synthetic-project',
      SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: tempDir,
    };
    const cases = [
      { argv: [], env: {} },
      { argv: ['--read-only', '--write'], env: {} },
      { argv: ['--read-only'], env: {} },
      { argv: ['--read-only'], env: { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' } },
      { argv: ['--read-only'], env: lockedEnvironment },
    ];

    for (const testCase of cases) {
      let sdkBoundaryCalls = 0;
      await assert.rejects(
        () => runProductionInventoryCli(testCase.argv, testCase.env, {
          async executeInventory() {
            sdkBoundaryCalls += 1;
            throw new Error('SDK boundary must remain unreachable');
          },
          writeStdout() {},
        }),
      );
      assert.equal(sdkBoundaryCalls, 0);
    }
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

export async function testMembershipQueryProjectionAndBound() {
  assert.equal(typeof productionReaderModule.readProjectedMembershipSnapshot, 'function');
  const observations = { fields: null, limit: null, getCalls: 0 };
  const firestore = {
    collection(name) {
      assert.equal(name, 'tenantMemberships');
      return {
        select(...fields) {
          observations.fields = fields;
          return this;
        },
        limit(value) {
          observations.limit = value;
          return this;
        },
        async get() {
          observations.getCalls += 1;
          return { docs: [] };
        },
      };
    },
  };

  const snapshot = await productionReaderModule.readProjectedMembershipSnapshot(firestore, 100);
  assert.deepEqual(observations.fields, ['uid', 'tenantId', 'role', 'status', 'createdAt', 'updatedAt']);
  assert.equal(observations.limit, 101);
  assert.equal(observations.getCalls, 1);
  assert.deepEqual(snapshot, { docs: [] });
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
        SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: os.tmpdir(),
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

export function testSymlinkAncestorOutputDirRejection() {
  const realParent = createTempOutputDir();
  const realChild = path.join(realParent, 'child');
  fs.mkdirSync(realChild);
  const linkParent = path.join(os.tmpdir(), `shiftoryx-prod-inv-parent-link-${Date.now()}`);
  try {
    fs.symlinkSync(realParent, linkParent, 'junction');
    assert.throws(
      () =>
        validateProductionEnvironment({
          SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
          SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'ops-review-1',
          SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'confirmed-proj',
          SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: path.join(linkParent, 'child'),
        }),
      (err) => /symbolic link|junction|reparse/u.test(err.message),
    );
  } finally {
    if (fs.existsSync(linkParent)) fs.unlinkSync(linkParent);
    cleanTempOutputDir(realParent);
  }
}

export function testMissingAndNonDirectoryOutputRejection() {
  const tempDir = createTempOutputDir();
  const filePath = path.join(tempDir, 'not-a-directory.txt');
  fs.writeFileSync(filePath, 'synthetic', 'utf8');
  try {
    assert.throws(
      () =>
        validateProductionEnvironment({
          SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
          SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'ops-review-1',
          SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'confirmed-proj',
          SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: path.join(tempDir, 'missing'),
        }),
      (err) => err.message.includes('does not exist'),
    );
    assert.throws(
      () =>
        validateProductionEnvironment({
          SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
          SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'ops-review-1',
          SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'confirmed-proj',
          SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: filePath,
        }),
      (err) => err.message.includes('not a directory'),
    );
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

export function testProtectedWriterRevalidatesCanonicalOutputDirectory() {
  const realDir = createTempOutputDir();
  const linkDir = path.join(os.tmpdir(), `shiftoryx-prod-inv-writer-link-${Date.now()}`);
  try {
    fs.symlinkSync(realDir, linkDir, 'junction');
    assert.throws(
      () =>
        writeProtectedAuditFile({
          outputDir: linkDir,
          correlationId: 'writer-path-recheck',
          reviewer: 'ops-review-1',
          projectId: 'synthetic-project',
          retentionHours: 24,
          inventory: classifyMembershipInventory({ memberships: [] }),
          mirrorDetails: [],
          productionReadPerformed: false,
          recordSnapshots: [],
        }),
      (err) => /symbolic link|junction|reparse/u.test(err.message),
    );
  } finally {
    if (fs.existsSync(linkDir)) fs.unlinkSync(linkDir);
    cleanTempOutputDir(realDir);
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

export function testStrictNumericEnvironmentParsing() {
  const base = {
    SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
    SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: 'ops-review-1',
    SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'confirmed-proj',
    SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: os.tmpdir(),
  };

  for (const value of ['24hours', '10.5', '1e3', ' 24x', '0', '721']) {
    assert.throws(
      () => validateProductionEnvironment({ ...base, SHIFTORYX_PRODUCTION_INVENTORY_RETENTION_HOURS: value }),
      (err) => err.message.includes('Retention hours'),
      `retention value ${JSON.stringify(value)} must be rejected strictly`,
    );
  }

  for (const value of ['10items', '10.5', '1e3', ' 10x', '0', '1001']) {
    assert.throws(
      () => validateProductionEnvironment({ ...base, SHIFTORYX_PRODUCTION_INVENTORY_MAX_MEMBERSHIPS: value }),
      (err) => err.message.includes('Max memberships'),
      `membership maximum ${JSON.stringify(value)} must be rejected strictly`,
    );
  }

  for (const value of ['1', '720']) {
    assert.throws(
      () => validateProductionEnvironment({ ...base, SHIFTORYX_PRODUCTION_INVENTORY_RETENTION_HOURS: value }),
      (err) => err.message.includes('EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION'),
    );
  }
  for (const value of ['1', '1000']) {
    assert.throws(
      () => validateProductionEnvironment({ ...base, SHIFTORYX_PRODUCTION_INVENTORY_MAX_MEMBERSHIPS: value }),
      (err) => err.message.includes('EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION'),
    );
  }
}

export function testReviewerLabelValidation() {
  const base = {
    SHIFTORYX_PRODUCTION_READ_APPROVED: 'YES_READ_ONLY_INVENTORY',
    SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID: 'confirmed-proj',
    SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR: os.tmpdir(),
  };
  for (const reviewer of [
    'line\nbreak',
    'path/segment',
    'path\\segment',
    'person@example.test',
    'x'.repeat(65),
  ]) {
    assert.throws(
      () => validateProductionEnvironment({ ...base, SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: reviewer }),
      (err) => err.message.includes('reviewer label'),
    );
  }

  assert.throws(
    () => validateProductionEnvironment({ ...base, SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER: '  ops-review-1  ' }),
    (err) => err.message.includes('EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION'),
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

function createReferenceReadFirestoreSpy() {
  const requests = [];
  let activeOperations = 0;
  let maximumActiveOperations = 0;

  const firestore = {
    collection(collectionName) {
      return {
        doc(id) {
          return { id, path: `${collectionName}/${id}`, collectionName };
        },
      };
    },
    async getAll(...args) {
      const options = args.pop();
      const refs = args;
      requests.push({
        paths: refs.map((ref) => ref.path),
        fieldMask: [...(options?.fieldMask || [])],
      });
      activeOperations += 1;
      maximumActiveOperations = Math.max(maximumActiveOperations, activeOperations);
      await new Promise((resolve) => setImmediate(resolve));
      activeOperations -= 1;
      return refs.map((ref) => ({
        id: ref.id,
        ref,
        exists: ref.collectionName !== 'platformAdmins' || ref.id === 'user-b',
        data() {
          if (ref.collectionName !== 'users') {
            throw new Error(`payload access forbidden for ${ref.collectionName}`);
          }
          const payload = { memberships: {} };
          Object.defineProperty(payload, 'email', {
            enumerable: true,
            get() {
              throw new Error('unrelated user field accessed');
            },
          });
          return payload;
        },
      }));
    },
  };

  return {
    firestore,
    requests,
    getMaximumActiveOperations: () => maximumActiveOperations,
  };
}

// Exact document IDs, official getAll field masks and bounded operations.
export async function testMinimizedReferenceReadContract() {
  const spy = createReferenceReadFirestoreSpy();
  const result = await runChunkedReferenceReads(
    spy.firestore,
    new Set(['user-a', 'user-b']),
    new Set(['tenant-a', 'tenant-b']),
    1,
  );

  assert.deepEqual(spy.requests, [
    { paths: ['users/user-a'], fieldMask: ['memberships'] },
    { paths: ['users/user-b'], fieldMask: ['memberships'] },
    { paths: ['platformAdmins/user-a'], fieldMask: [] },
    { paths: ['platformAdmins/user-b'], fieldMask: [] },
    { paths: ['tenants/tenant-a'], fieldMask: [] },
    { paths: ['tenants/tenant-b'], fieldMask: [] },
  ]);
  assert.equal(spy.getMaximumActiveOperations(), 1);
  assert.equal(result.userResults.get('user-a').exists, true);
  assert.equal(result.tenantResults.get('tenant-a'), true);
  assert.equal(result.platformAdminResults.get('user-a'), false);
  assert.equal(result.platformAdminResults.get('user-b'), true);

  await assert.rejects(
    () => runChunkedReferenceReads(spy.firestore, new Set(['user-a']), new Set(), 26),
    (error) => error.message.includes('between 1 and 25'),
  );

  const boundedSpy = createReferenceReadFirestoreSpy();
  const boundedUids = new Set(Array.from({ length: 26 }, (_, index) => `bounded-user-${index}`));
  await runChunkedReferenceReads(boundedSpy.firestore, boundedUids, new Set(), 25);
  assert.deepEqual(boundedSpy.requests.map((request) => request.paths.length), [25, 1, 25, 1]);
  assert.ok(boundedSpy.requests.every((request) => request.paths.length <= 25));
  assert.equal(boundedSpy.getMaximumActiveOperations(), 1);
}

function firestoreTimestamp(seconds, nanoseconds = 0) {
  return {
    seconds,
    nanoseconds,
    toMillis() {
      return seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
    },
  };
}

function syntheticMembership({
  uid,
  tenantId,
  role = 'OWNER',
  status = 'ACTIVE',
  createdAt = firestoreTimestamp(1_700_000_000, 123_000_000),
  updatedAt = firestoreTimestamp(1_700_000_100, 456_000_000),
  updateTime = firestoreTimestamp(1_700_000_200, 789_000_000),
} = {}) {
  const id = `${uid}_${tenantId}`;
  return {
    id,
    path: `tenantMemberships/${id}`,
    updateTime,
    data: { uid, tenantId, role, status, createdAt, updatedAt },
  };
}

function syntheticConfig(outputDir, maxMemberships = 100) {
  return {
    projectId: 'synthetic-project',
    reviewer: 'ops-review-1',
    outputDir,
    retentionHours: 24,
    maxMemberships,
  };
}

export async function testMultiStoreReferenceCounts() {
  const tempDir = createTempOutputDir();
  try {
    const membershipsData = [
      syntheticMembership({ uid: 'owner-a', tenantId: 'tenant-a' }),
      syntheticMembership({ uid: 'owner-a', tenantId: 'tenant-b' }),
    ];
    const result = await inventoryFirestoreProductionReadOnlyInternal({
      config: syntheticConfig(tempDir),
      fakeAdapter: async () => ({
        membershipsData,
        userResults: new Map([
          ['owner-a', {
            exists: true,
            memberships: {
              'tenant-a': { role: 'OWNER', status: 'ACTIVE' },
              'tenant-b': { role: 'OWNER', status: 'ACTIVE' },
            },
          }],
        ]),
        tenantResults: new Map([['tenant-a', true], ['tenant-b', true]]),
        platformAdminResults: new Map([['owner-a', false]]),
        productionReadPerformed: false,
      }),
    });

    assert.equal(result.sanitizedConsoleOutput.missingUserReferenceCount, 0);
    assert.equal(result.sanitizedConsoleOutput.missingTenantReferenceCount, 0);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

export async function testUniqueMissingReferenceCounts() {
  const tempDir = createTempOutputDir();
  try {
    const membershipsData = [
      syntheticMembership({ uid: 'missing-owner', tenantId: 'tenant-a' }),
      syntheticMembership({ uid: 'missing-owner', tenantId: 'tenant-b' }),
    ];
    const result = await inventoryFirestoreProductionReadOnlyInternal({
      config: syntheticConfig(tempDir),
      fakeAdapter: async () => ({
        membershipsData,
        userResults: new Map([['missing-owner', { exists: false, memberships: null }]]),
        tenantResults: new Map([['tenant-a', true], ['tenant-b', true]]),
        platformAdminResults: new Map([['missing-owner', false]]),
        productionReadPerformed: false,
      }),
    });

    assert.equal(result.sanitizedConsoleOutput.missingUserReferenceCount, 1);
    assert.equal(result.sanitizedConsoleOutput.missingTenantReferenceCount, 0);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

export async function testExpectedPolicyManualReviewDoesNotFailCheckpoint() {
  const tempDir = createTempOutputDir();
  try {
    const membership = syntheticMembership({ uid: 'legacy-admin', tenantId: 'tenant-a', role: 'ADMIN' });
    const result = await inventoryFirestoreProductionReadOnlyInternal({
      config: syntheticConfig(tempDir),
      fakeAdapter: async () => ({
        membershipsData: [membership],
        userResults: new Map([['legacy-admin', {
          exists: true,
          memberships: { 'tenant-a': { role: 'ADMIN', status: 'ACTIVE' } },
        }]]),
        tenantResults: new Map([['tenant-a', true]]),
        platformAdminResults: new Map([['legacy-admin', false]]),
        productionReadPerformed: false,
      }),
    });

    assert.equal(result.sanitizedConsoleOutput.expectedPolicyManualReviewCount, 1);
    assert.equal(result.sanitizedConsoleOutput.structuralOrSecurityManualReviewCount, 0);
    assert.equal(result.sanitizedConsoleOutput.finalCheckpointVerdict, 'EXPECTED_POLICY_MANUAL_REVIEW');
    assert.equal(result.hasAnomalies, false);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

export async function testPlatformAdminOverlapForcesStructuralVerdict() {
  const tempDir = createTempOutputDir();
  try {
    const membership = syntheticMembership({ uid: 'platform-owner', tenantId: 'tenant-a' });
    const result = await inventoryFirestoreProductionReadOnlyInternal({
      config: syntheticConfig(tempDir),
      fakeAdapter: async () => ({
        membershipsData: [membership],
        userResults: new Map([['platform-owner', {
          exists: true,
          memberships: { 'tenant-a': { role: 'OWNER', status: 'ACTIVE' } },
        }]]),
        tenantResults: new Map([['tenant-a', true]]),
        platformAdminResults: new Map([['platform-owner', true]]),
        productionReadPerformed: false,
      }),
    });

    assert.equal(result.sanitizedConsoleOutput.structuralOrSecurityManualReviewCount, 1);
    assert.equal(result.sanitizedConsoleOutput.finalCheckpointVerdict, 'STRUCTURAL_OR_SECURITY_MANUAL_REVIEW');
    assert.equal(result.hasAnomalies, true);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

export async function testMissingTimestampForcesStructuralVerdict() {
  const tempDir = createTempOutputDir();
  try {
    const membership = syntheticMembership({ uid: 'owner-a', tenantId: 'tenant-a', createdAt: null });
    const result = await inventoryFirestoreProductionReadOnlyInternal({
      config: syntheticConfig(tempDir),
      fakeAdapter: async () => ({
        membershipsData: [membership],
        userResults: new Map([['owner-a', {
          exists: true,
          memberships: { 'tenant-a': { role: 'OWNER', status: 'ACTIVE' } },
        }]]),
        tenantResults: new Map([['tenant-a', true]]),
        platformAdminResults: new Map([['owner-a', false]]),
        productionReadPerformed: false,
      }),
    });

    assert.equal(result.sanitizedConsoleOutput.structuralOrSecurityManualReviewCount, 1);
    assert.equal(result.sanitizedConsoleOutput.finalCheckpointVerdict, 'STRUCTURAL_OR_SECURITY_MANUAL_REVIEW');
    assert.equal(result.hasAnomalies, true);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

export async function testInactiveMembershipForcesStructuralVerdict() {
  const tempDir = createTempOutputDir();
  try {
    const membership = syntheticMembership({
      uid: 'inactive-owner',
      tenantId: 'tenant-a',
      status: 'INACTIVE',
    });
    const result = await inventoryFirestoreProductionReadOnlyInternal({
      config: syntheticConfig(tempDir),
      fakeAdapter: async () => ({
        membershipsData: [membership],
        userResults: new Map([['inactive-owner', {
          exists: true,
          memberships: { 'tenant-a': { role: 'OWNER', status: 'INACTIVE' } },
        }]]),
        tenantResults: new Map([['tenant-a', true]]),
        platformAdminResults: new Map([['inactive-owner', false]]),
        productionReadPerformed: false,
      }),
    });

    assert.equal(result.sanitizedConsoleOutput.inactiveOrRevokedCount, 1);
    assert.equal(result.sanitizedConsoleOutput.structuralOrSecurityManualReviewCount, 1);
    assert.equal(result.sanitizedConsoleOutput.finalCheckpointVerdict, 'STRUCTURAL_OR_SECURITY_MANUAL_REVIEW');
    assert.equal(result.hasAnomalies, true);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

export async function testAuditFileTruthAndUpdateTimeSnapshot() {
  const tempDir = createTempOutputDir();
  try {
    const membership = syntheticMembership({ uid: 'owner-a', tenantId: 'tenant-a' });
    const result = await inventoryFirestoreProductionReadOnlyInternal({
      config: syntheticConfig(tempDir),
      fakeAdapter: async () => ({
        membershipsData: [membership],
        userResults: new Map([['owner-a', {
          exists: true,
          memberships: { 'tenant-a': { role: 'OWNER', status: 'ACTIVE' } },
        }]]),
        tenantResults: new Map([['tenant-a', true]]),
        platformAdminResults: new Map([['owner-a', false]]),
        productionReadPerformed: true,
      }),
    });

    const audit = JSON.parse(fs.readFileSync(result.auditFilePath, 'utf8'));
    assert.equal(result.sanitizedConsoleOutput.productionReadPerformed, true);
    assert.equal(audit.productionReadPerformed, true);
    assert.equal(audit.inventorySummary.productionReadPerformed, true);
    assert.equal('productionAccessPerformed' in audit.inventorySummary, false);
    assert.equal(audit.writeOperationsExecuted, 0);
    assert.deepEqual(audit.recordSnapshots, [{
      documentId: 'owner-a_tenant-a',
      documentPath: 'tenantMemberships/owner-a_tenant-a',
      uid: 'owner-a',
      tenantId: 'tenant-a',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: { seconds: '1700000000', nanoseconds: 123000000 },
      updatedAt: { seconds: '1700000100', nanoseconds: 456000000 },
      firestoreDocumentUpdateTime: { seconds: '1700000200', nanoseconds: 789000000 },
      classification: 'NO_MIGRATION_REQUIRED',
      classificationReasons: ['active-owner-record-is-canonical'],
      mirrorState: 'MIRROR_CONSISTENT',
      platformAdminOverlap: false,
    }]);
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

export async function testRecordSnapshotOrderingIsStable() {
  const tempDir = createTempOutputDir();
  try {
    const membershipsData = [
      syntheticMembership({ uid: 'owner-b', tenantId: 'tenant-b' }),
      syntheticMembership({ uid: 'owner-a', tenantId: 'tenant-a' }),
    ];
    const result = await inventoryFirestoreProductionReadOnlyInternal({
      config: syntheticConfig(tempDir),
      fakeAdapter: async () => ({
        membershipsData,
        userResults: new Map([
          ['owner-a', { exists: true, memberships: { 'tenant-a': { role: 'OWNER', status: 'ACTIVE' } } }],
          ['owner-b', { exists: true, memberships: { 'tenant-b': { role: 'OWNER', status: 'ACTIVE' } } }],
        ]),
        tenantResults: new Map([['tenant-a', true], ['tenant-b', true]]),
        platformAdminResults: new Map([['owner-a', false], ['owner-b', false]]),
        productionReadPerformed: false,
      }),
    });
    const audit = JSON.parse(fs.readFileSync(result.auditFilePath, 'utf8'));
    assert.deepEqual(
      audit.recordSnapshots.map((record) => record.documentId),
      ['owner-a_tenant-a', 'owner-b_tenant-b'],
    );
  } finally {
    cleanTempOutputDir(tempDir);
  }
}

// 22. user mirror consistency checks
export async function testUserMirrorConsistencyChecks() {
  const tempDir = createTempOutputDir();
  try {
    const fakeAdapter = async () => {
      return {
        membershipsData: [
          syntheticMembership({ uid: 'user-a', tenantId: 'tenant-a' }),
          syntheticMembership({ uid: 'user-b', tenantId: 'tenant-b' }),
          syntheticMembership({ uid: 'user-c', tenantId: 'tenant-c' }),
          syntheticMembership({ uid: 'user-d', tenantId: 'tenant-d' }),
          syntheticMembership({ uid: 'user-e', tenantId: 'tenant-e' }),
        ],
        userResults: new Map([
          ['user-a', { exists: true, memberships: { 'tenant-a': { role: 'OWNER', status: 'ACTIVE' } } }],
          ['user-b', { exists: true, memberships: {} }],
          ['user-c', { exists: true, memberships: { 'tenant-c': { role: 'ADMIN', status: 'ACTIVE' } } }],
          ['user-d', { exists: true, memberships: { 'tenant-d': { role: 'OWNER', status: 'INACTIVE' } } }],
          ['user-e', { exists: true, memberships: { 'tenant-e': 'malformed' } }],
        ]),
        tenantResults: new Map([
          ['tenant-a', true],
          ['tenant-b', true],
          ['tenant-c', true],
          ['tenant-d', true],
          ['tenant-e', true],
        ]),
        platformAdminResults: new Map([
          ['user-a', false],
          ['user-b', false],
          ['user-c', false],
          ['user-d', false],
          ['user-e', false],
        ]),
        productionReadPerformed: false,
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
    assert.equal(res.sanitizedConsoleOutput.mirrorMismatchCount, 4);
    assert.equal(res.sanitizedConsoleOutput.structuralOrSecurityManualReviewCount, 4);
    assert.equal(res.sanitizedConsoleOutput.finalCheckpointVerdict, 'STRUCTURAL_OR_SECURITY_MANUAL_REVIEW');
    assert.equal(res.hasAnomalies, true);
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
        membershipsData: [syntheticMembership({ uid: 'legacy-admin', tenantId: 'tenant-a', role: 'ADMIN' })],
        userResults: new Map([['legacy-admin', { exists: true, memberships: { 'tenant-a': { role: 'ADMIN', status: 'ACTIVE' } } }]]),
        tenantResults: new Map([['tenant-a', true]]),
        platformAdminResults: new Map([['legacy-admin', false]]),
        productionReadPerformed: false,
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
        membershipsData: [syntheticMembership({ uid: 'legacy-admin', tenantId: 'tenant-a', role: 'ADMIN' })],
        userResults: new Map([['legacy-admin', { exists: true, memberships: { 'tenant-a': { role: 'ADMIN', status: 'ACTIVE' } } }]]),
        tenantResults: new Map([['tenant-a', true]]),
        platformAdminResults: new Map([['legacy-admin', false]]),
        productionReadPerformed: false,
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
        membershipsData: [syntheticMembership({ uid: 'legacy-manager', tenantId: 'tenant-a', role: 'MANAGER' })],
        userResults: new Map([['legacy-manager', { exists: true, memberships: { 'tenant-a': { role: 'MANAGER', status: 'ACTIVE' } } }]]),
        tenantResults: new Map([['tenant-a', true]]),
        platformAdminResults: new Map([['legacy-manager', false]]),
        productionReadPerformed: false,
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
    assert.equal(res.sanitizedConsoleOutput.finalCheckpointVerdict, 'STRUCTURAL_OR_SECURITY_MANUAL_REVIEW');
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
    assert.equal(res.sanitizedConsoleOutput.finalCheckpointVerdict, 'STRUCTURAL_OR_SECURITY_MANUAL_REVIEW');
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
        productionReadPerformed: false,
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
  const sourceWithoutAllowlistedContainerMutations = scriptContent
    .replace(/\b(?:userResults|tenantResults|platformAdminResults)\.set\s*\(/gu, '')
    .replace(/\b(?:expectedPolicyRecordIds|structuralOrSecurityRecordIds)\.(?:add|delete)\s*\(/gu, '');
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
    assert.ok(
      !pattern.test(sourceWithoutAllowlistedContainerMutations),
      `Found forbidden write pattern: ${pattern}`,
    );
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
        productionReadPerformed: false,
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

export async function runAllGuardTests() {
  const tests = [
    ['missing read-only execution acknowledgement', testMissingReadOnlyFlag],
    ['help bypasses environment and SDK initialization', testHelpSkipsEnvironmentAndSdkInitialization],
    ['runtime errors are redacted', testRuntimeErrorsAreRedactedAtEntrypoint],
    ['failed guards keep SDK initialization at zero', testSdkInitializationRemainsZeroForFailedGuards],
    ['membership query projection and bound', testMembershipQueryProjectionAndBound],
    ['unknown CLI argument', testUnknownCliArgument],
    ['missing approval environment', testMissingApprovalEnv],
    ['wrong approval environment', testWrongApprovalEnv],
    ['missing project environment', testMissingProjectIdEnv],
    ['project confirmation lock', testExecutionLockedWithoutConfirmedProject],
    ['emulator environment rejection', testEmulatorEnvPresentRejection],
    ['missing reviewer label', testMissingReviewerEnv],
    ['missing output directory', testMissingOutputDirEnv],
    ['relative output directory', testRelativeOutputDirRejection],
    ['repository-contained output directory', testRepoContainedOutputDirRejection],
    ['symlink output directory', testSymlinkOutputDirRejection],
    ['redirected output ancestor', testSymlinkAncestorOutputDirRejection],
    ['missing and non-directory output paths', testMissingAndNonDirectoryOutputRejection],
    ['writer canonical path revalidation', testProtectedWriterRevalidatesCanonicalOutputDirectory],
    ['exclusive output-file collision', testPreExistingOutputFileRefusal],
    ['invalid retention range', testInvalidRetentionHours],
    ['invalid membership maximum', testInvalidMembershipMaximum],
    ['strict numeric environment parsing', testStrictNumericEnvironmentParsing],
    ['reviewer label validation', testReviewerLabelValidation],
    ['maximum enforced before reference reads', testMaximumExceededBeforeReferenceReads],
    ['SDK boundary guard', testSdkInitBoundaryGuards],
    ['minimized reference reads', testMinimizedReferenceReadContract],
    ['multi-store reference counts', testMultiStoreReferenceCounts],
    ['unique missing-reference counts', testUniqueMissingReferenceCounts],
    ['expected policy manual review', testExpectedPolicyManualReviewDoesNotFailCheckpoint],
    ['platform-admin structural verdict', testPlatformAdminOverlapForcesStructuralVerdict],
    ['missing-timestamp structural verdict', testMissingTimestampForcesStructuralVerdict],
    ['inactive membership structural verdict', testInactiveMembershipForcesStructuralVerdict],
    ['audit truth and update-time snapshot', testAuditFileTruthAndUpdateTimeSnapshot],
    ['stable record snapshot ordering', testRecordSnapshotOrderingIsStable],
    ['user mirror consistency', testUserMirrorConsistencyChecks],
    ['no approved role changes supplied', testNoApprovedRoleChangeIdsSupplied],
    ['ADMIN remains manual review', testAdminRemainsManualReviewRequired],
    ['MANAGER is structural anomaly', testManagerProducesAnomalyVerdict],
    ['malformed membership is structural anomaly', testMalformedProducesFailureVerdict],
    ['console contains no raw identifiers', testConsoleContainsZeroRawIdentifiers],
    ['protected output creation flags', testProtectedOutputUsesExclusiveCreation],
    ['static no-write defense', testStaticNoWriteVerification],
    ['no write/apply/execute flags', testNoWriteApplyExecuteFlags],
    ['synthetic production-read evidence is false', testTruthfulProductionReadPerformed],
  ];

  let passed = 0;
  for (const [name, test] of tests) {
    try {
      await test();
      passed += 1;
    } catch (error) {
      error.message = `${name}: ${error.message}`;
      throw error;
    }
  }
  console.log(`${passed}/${tests.length} production read-only inventory guard tests passed cleanly.`);
  return { passed, total: tests.length };
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
