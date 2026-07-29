import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertEmulatorReadOnlyTarget,
  buildPhase2BPlanningSummary,
  classifyMembershipInventory,
  inventoryFirestoreReadOnly,
  sanitizeInventorySummary,
} from './inventory-tenant-memberships.mjs';

const APPROVED_PROJECT_ID = 'demo-shiftoryx-owner-inventory';
const UNAPPROVED_PRODUCTION_LIKE_PROJECT_ID = 'shiftoryx-production-project';
const TEST_SCRIPT = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(TEST_SCRIPT), '..');
const INVENTORY_SCRIPT = path.join(REPOSITORY_ROOT, 'scripts', 'inventory-tenant-memberships.mjs');
const CREATED_AT = '2026-07-28T08:00:00.000Z';
const UPDATED_AT = '2026-07-28T09:00:00.000Z';

function membership(id, data) {
  return { id, data };
}

function buildClassifierFixture() {
  const memberships = [
    membership('fixture-owner-a_store-a', {
      uid: 'fixture-owner-a',
      tenantId: 'store-a',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      email: 'owner-a@example.test',
    }),
    membership('fixture-admin-b_store-b', {
      uid: 'fixture-admin-b',
      tenantId: 'store-b',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-manager-c_store-c', {
      uid: 'fixture-manager-c',
      tenantId: 'store-c',
      role: 'MANAGER',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-owner-revoked_store-revoked-owner', {
      uid: 'fixture-owner-revoked',
      tenantId: 'store-revoked-owner',
      role: 'OWNER',
      status: 'REVOKED',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-admin-revoked_store-revoked-admin', {
      uid: 'fixture-admin-revoked',
      tenantId: 'store-revoked-admin',
      role: 'ADMIN',
      status: 'REVOKED',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-unknown-role_store-unknown-role', {
      uid: 'fixture-unknown-role',
      tenantId: 'store-unknown-role',
      role: 'VIEWER',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-missing-role_store-missing-role', {
      uid: 'fixture-missing-role',
      tenantId: 'store-missing-role',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-missing-tenant', {
      uid: 'fixture-missing-tenant',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-missing-uid_store-missing-uid', {
      tenantId: 'store-missing-uid',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-mismatch-key_store-key', {
      uid: 'fixture-mismatch-fields',
      tenantId: 'store-key',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-duplicate_store-duplicate', {
      uid: 'fixture-duplicate',
      tenantId: 'store-duplicate',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-duplicate-shadow', {
      uid: 'fixture-duplicate',
      tenantId: 'store-duplicate',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-conflict-admin_store-conflict', {
      uid: 'fixture-conflict-admin',
      tenantId: 'store-conflict',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-conflict-owner_store-conflict', {
      uid: 'fixture-conflict-owner',
      tenantId: 'store-conflict',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-missing-tenant-ref_store-no-tenant', {
      uid: 'fixture-missing-tenant-ref',
      tenantId: 'store-no-tenant',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-missing-user_store-no-user', {
      uid: 'fixture-missing-user',
      tenantId: 'store-no-user',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-platform-member_store-platform', {
      uid: 'fixture-platform-member',
      tenantId: 'store-platform',
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-approved-admin_store-approved', {
      uid: 'fixture-approved-admin',
      tenantId: 'store-approved',
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
    membership('fixture-no-timestamps_store-no-timestamps', {
      uid: 'fixture-no-timestamps',
      tenantId: 'store-no-timestamps',
      role: 'ADMIN',
      status: 'ACTIVE',
    }),
    membership('fixture-invalid-status_store-invalid-status', {
      uid: 'fixture-invalid-status',
      tenantId: 'store-invalid-status',
      role: 'OWNER',
      status: 'UNKNOWN',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    }),
  ];

  const userIds = new Set([
    'fixture-owner-a',
    'fixture-admin-b',
    'fixture-manager-c',
    'fixture-owner-revoked',
    'fixture-admin-revoked',
    'fixture-unknown-role',
    'fixture-missing-role',
    'fixture-missing-tenant',
    'fixture-mismatch-fields',
    'fixture-duplicate',
    'fixture-conflict-admin',
    'fixture-conflict-owner',
    'fixture-missing-tenant-ref',
    'fixture-platform-member',
    'fixture-approved-admin',
    'fixture-no-timestamps',
    'fixture-invalid-status',
  ]);

  const tenantIds = new Set([
    'store-a',
    'store-b',
    'store-c',
    'store-revoked-owner',
    'store-revoked-admin',
    'store-unknown-role',
    'store-missing-role',
    'store-missing-uid',
    'store-key',
    'store-duplicate',
    'store-conflict',
    'store-no-user',
    'store-platform',
    'store-approved',
    'store-no-timestamps',
    'store-invalid-status',
  ]);

  return {
    memberships,
    userIds,
    tenantIds,
    platformAdminIds: new Set(['fixture-platform-only', 'fixture-platform-member']),
    approvedRoleChangeIds: new Set(['fixture-approved-admin_store-approved']),
  };
}

function classificationMap(result) {
  return Object.fromEntries(result.records.map((record) => [record.id, record.classification]));
}

function runClassifierBehaviorTests() {
  const fixture = buildClassifierFixture();
  const beforeInput = JSON.stringify(fixture.memberships);
  const first = classifyMembershipInventory(fixture);
  const second = classifyMembershipInventory(fixture);

  assert.deepEqual(second, first, 'repeating inventory with the same records must be deterministic');
  assert.equal(JSON.stringify(fixture.memberships), beforeInput, 'classification must not mutate input records');

  assert.deepEqual(first.counts, {
    NO_MIGRATION_REQUIRED: 1,
    SAFE_CANDIDATE: 1,
    MANUAL_REVIEW_REQUIRED: 6,
    INVALID_OR_MALFORMED: 6,
    REVOKED_OR_INACTIVE: 2,
    CONFLICT_OR_DUPLICATE: 4,
  });

  const byId = classificationMap(first);
  assert.equal(byId['fixture-owner-a_store-a'], 'NO_MIGRATION_REQUIRED');
  assert.equal(byId['fixture-admin-b_store-b'], 'MANUAL_REVIEW_REQUIRED');
  assert.equal(byId['fixture-manager-c_store-c'], 'MANUAL_REVIEW_REQUIRED');
  assert.equal(byId['fixture-owner-revoked_store-revoked-owner'], 'REVOKED_OR_INACTIVE');
  assert.equal(byId['fixture-admin-revoked_store-revoked-admin'], 'REVOKED_OR_INACTIVE');
  assert.equal(byId['fixture-unknown-role_store-unknown-role'], 'INVALID_OR_MALFORMED');
  assert.equal(byId['fixture-missing-role_store-missing-role'], 'INVALID_OR_MALFORMED');
  assert.equal(byId['fixture-missing-tenant'], 'INVALID_OR_MALFORMED');
  assert.equal(byId['fixture-missing-uid_store-missing-uid'], 'INVALID_OR_MALFORMED');
  assert.equal(byId['fixture-mismatch-key_store-key'], 'INVALID_OR_MALFORMED');
  assert.equal(byId['fixture-duplicate_store-duplicate'], 'CONFLICT_OR_DUPLICATE');
  assert.equal(byId['fixture-duplicate-shadow'], 'CONFLICT_OR_DUPLICATE');
  assert.equal(byId['fixture-conflict-admin_store-conflict'], 'CONFLICT_OR_DUPLICATE');
  assert.equal(byId['fixture-conflict-owner_store-conflict'], 'CONFLICT_OR_DUPLICATE');
  assert.equal(byId['fixture-missing-tenant-ref_store-no-tenant'], 'MANUAL_REVIEW_REQUIRED');
  assert.equal(byId['fixture-missing-user_store-no-user'], 'MANUAL_REVIEW_REQUIRED');
  assert.equal(byId['fixture-platform-member_store-platform'], 'MANUAL_REVIEW_REQUIRED');
  assert.equal(byId['fixture-approved-admin_store-approved'], 'SAFE_CANDIDATE');
  assert.equal(byId['fixture-no-timestamps_store-no-timestamps'], 'MANUAL_REVIEW_REQUIRED');
  assert.equal(byId['fixture-invalid-status_store-invalid-status'], 'INVALID_OR_MALFORMED');

  const revoked = first.records.filter((record) => record.classification === 'REVOKED_OR_INACTIVE');
  assert.ok(revoked.every((record) => record.proposedRole === null), 'revoked records must never receive a proposed role');
  assert.equal(first.diagnostics.platformAdminsWithoutTenantMembership, 1);
  assert.equal(first.diagnostics.platformAdminsWithExplicitTenantMembership, 1);

  const plan = buildPhase2BPlanningSummary(first);
  assert.deepEqual(plan, {
    sourceIsReadOnlyInventory: true,
    writeOperationsExecuted: 0,
    eligibleClassification: 'SAFE_CANDIDATE',
    eligibleCount: 1,
    manualApprovalCount: 10,
    excludedCount: 9,
  });

  const sanitized = sanitizeInventorySummary(first, { source: 'offline-fixture' });
  const sanitizedText = JSON.stringify(sanitized);
  assert.equal(sanitizedText.includes('fixture-owner-a'), false, 'aggregate output must not contain raw synthetic UIDs');
  assert.equal(sanitizedText.includes('store-a'), false, 'aggregate output must not contain raw synthetic tenant IDs');
  assert.equal(sanitizedText.includes('owner-a@example.test'), false, 'aggregate output must not contain emails');

  assert.throws(
    () => assertEmulatorReadOnlyTarget({ emulatorHost: '', projectId: APPROVED_PROJECT_ID }),
    /emulator host is required/i,
  );
  assert.throws(
    () =>
      assertEmulatorReadOnlyTarget({
        emulatorHost: '127.0.0.1:8088',
        projectId: UNAPPROVED_PRODUCTION_LIKE_PROJECT_ID,
      }),
    /project is not approved/i,
  );
  assert.doesNotThrow(() =>
    assertEmulatorReadOnlyTarget({
      emulatorHost: '127.0.0.1:8088',
      projectId: APPROVED_PROJECT_ID,
    }),
  );
}

async function runInventoryEndpointBindingTests() {
  const originalEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';

  try {
    const injectedDb = {
      collection() {
        throw new Error('Injected Firestore client was reached.');
      },
    };

    await assert.rejects(
      () =>
        inventoryFirestoreReadOnly({
          db: injectedDb,
          emulatorHost: '127.0.0.1:8088',
          projectId: APPROVED_PROJECT_ID,
        }),
      /does not accept injected Firestore clients/i,
      'inventory must reject a caller-supplied Firestore client',
    );

    delete process.env.FIRESTORE_EMULATOR_HOST;
    await assert.rejects(
      () =>
        inventoryFirestoreReadOnly({
          emulatorHost: '127.0.0.1:8088',
          projectId: APPROVED_PROJECT_ID,
        }),
      /must match FIRESTORE_EMULATOR_HOST/i,
      'inventory must bind its checked host to the Admin SDK emulator environment',
    );
  } finally {
    if (originalEmulatorHost === undefined) {
      delete process.env.FIRESTORE_EMULATOR_HOST;
    } else {
      process.env.FIRESTORE_EMULATOR_HOST = originalEmulatorHost;
    }
  }
}

function parseArgs(argv) {
  const parsed = { launch: false, offline: false, projectId: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--launch') parsed.launch = true;
    else if (arg === '--offline') parsed.offline = true;
    else if (arg === '--project-id') parsed.projectId = String(argv[++index] || '');
    else throw new Error('Unsupported test argument.');
  }
  return parsed;
}

function normalizeForSnapshot(value) {
  if (Array.isArray(value)) return value.map(normalizeForSnapshot);
  if (value && typeof value.toMillis === 'function') return { timestampMs: value.toMillis() };
  if (value instanceof Date) return { timestampMs: value.getTime() };
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeForSnapshot(value[key])]),
    );
  }
  return value;
}

async function snapshotFirestore(db) {
  const rows = [];
  const collections = (await db.listCollections()).sort((left, right) => left.id.localeCompare(right.id));
  for (const collection of collections) {
    const snapshot = await collection.get();
    for (const document of [...snapshot.docs].sort((left, right) => left.id.localeCompare(right.id))) {
      rows.push({
        path: document.ref.path,
        data: normalizeForSnapshot(document.data()),
      });
    }
  }
  return rows;
}

async function seedSyntheticFixture(db, fixture) {
  const batch = db.batch();

  for (const userId of fixture.userIds) {
    batch.set(db.doc(`users/${userId}`), { uid: userId, status: 'ACTIVE' });
  }
  for (const tenantId of fixture.tenantIds) {
    batch.set(db.doc(`tenants/${tenantId}`), { slug: tenantId, status: 'ACTIVE' });
  }
  for (const platformAdminId of fixture.platformAdminIds) {
    batch.set(db.doc(`platformAdmins/${platformAdminId}`), {
      uid: platformAdminId,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });
  }
  for (const record of fixture.memberships) {
    batch.set(db.doc(`tenantMemberships/${record.id}`), record.data);
  }

  await batch.commit();
}

function runInventoryCli({ projectId, emulatorHost }) {
  return spawnSync(
    process.execPath,
    [
      INVENTORY_SCRIPT,
      '--read-only',
      '--source',
      'emulator',
      '--project-id',
      projectId,
    ],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: emulatorHost,
      },
    },
  );
}

async function launchEmulatorTest() {
  const externalWorkingDirectory = await mkdtemp(
    path.join(tmpdir(), 'shiftoryx-phase-2a-emulator-'),
  );
  let firebaseExecutable = 'firebase';
  let firebasePrefixArgs = [];
  if (process.platform === 'win32') {
    const appDataDirectory = String(process.env.APPDATA || '');
    assert.ok(appDataDirectory, 'APPDATA is required to locate the installed Firebase CLI');
    const firebaseCliModule = path.join(
      appDataDirectory,
      'npm',
      'node_modules',
      'firebase-tools',
      'lib',
      'bin',
      'firebase.js',
    );
    assert.ok(existsSync(firebaseCliModule), 'the existing global Firebase CLI module was not found');
    firebaseExecutable = process.execPath;
    firebasePrefixArgs = [firebaseCliModule];
  }
  const innerCommand = `"${process.execPath}" "${TEST_SCRIPT}" --project-id ${APPROVED_PROJECT_ID}`;

  try {
    const result = spawnSync(
      firebaseExecutable,
      [
        ...firebasePrefixArgs,
        'emulators:exec',
        '--config',
        path.join(REPOSITORY_ROOT, 'firebase-test.json'),
        '--project',
        APPROVED_PROJECT_ID,
        '--only',
        'firestore',
        innerCommand,
      ],
      {
        cwd: externalWorkingDirectory,
        encoding: 'utf8',
        env: { ...process.env },
      },
    );

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'Firebase emulator execution must complete successfully');
  } finally {
    const resolvedTemporaryDirectory = path.resolve(externalWorkingDirectory);
    const resolvedSystemTemporaryRoot = path.resolve(tmpdir());
    assert.ok(
      resolvedTemporaryDirectory.startsWith(`${resolvedSystemTemporaryRoot}${path.sep}`),
      'temporary emulator directory must remain inside the system temporary root',
    );
    await rm(resolvedTemporaryDirectory, { recursive: true, force: true });
  }
}

async function runEmulatorTests(projectId) {
  const emulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || '');
  assertEmulatorReadOnlyTarget({ emulatorHost, projectId });

  const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
  const { deleteApp, initializeApp } = requireFromFunctions('firebase-admin/app');
  const { getFirestore } = requireFromFunctions('firebase-admin/firestore');
  const app = initializeApp({ projectId }, 'phase-2a-owner-inventory-test');
  const db = getFirestore(app);

  try {
    const fixture = buildClassifierFixture();
    await seedSyntheticFixture(db, fixture);

    const beforeAll = await snapshotFirestore(db);
    const beforeMemberships = beforeAll.filter((row) => row.path.startsWith('tenantMemberships/'));
    assert.equal(beforeAll.length, 55, 'the synthetic emulator fixture must contain exactly 55 documents');
    assert.equal(beforeMemberships.length, 20, 'the synthetic fixture must contain exactly 20 memberships');

    const first = await inventoryFirestoreReadOnly({ emulatorHost, projectId });
    const second = await inventoryFirestoreReadOnly({ emulatorHost, projectId });
    assert.deepEqual(second, first, 'repeated emulator inventory must return the same classification result');
    assert.deepEqual(first.counts, {
      NO_MIGRATION_REQUIRED: 1,
      SAFE_CANDIDATE: 0,
      MANUAL_REVIEW_REQUIRED: 7,
      INVALID_OR_MALFORMED: 6,
      REVOKED_OR_INACTIVE: 2,
      CONFLICT_OR_DUPLICATE: 4,
    });
    assert.equal(first.diagnostics.platformAdminsWithoutTenantMembership, 1);
    assert.equal(first.diagnostics.platformAdminsWithExplicitTenantMembership, 1);

    const plan = buildPhase2BPlanningSummary(first);
    assert.equal(plan.writeOperationsExecuted, 0, 'Phase 2B planning output must never execute writes');

    const cli = runInventoryCli({ projectId, emulatorHost });
    assert.equal(cli.status, 0, `read-only inventory CLI must succeed: ${cli.stderr}`);
    assert.equal(cli.stdout.includes('fixture-'), false, 'CLI output must not expose fixture UIDs or tenant IDs');
    assert.equal(cli.stdout.includes('@example.test'), false, 'CLI output must not expose fixture emails');
    const cliSummary = JSON.parse(cli.stdout);
    assert.deepEqual(cliSummary.counts, first.counts, 'CLI aggregate counts must match the direct read-only inventory');
    assert.equal(cliSummary.writeOperationsExecuted, 0);
    assert.equal(cliSummary.productionAccessPerformed, false);

    const afterAll = await snapshotFirestore(db);
    const afterMemberships = afterAll.filter((row) => row.path.startsWith('tenantMemberships/'));
    assert.deepEqual(afterMemberships, beforeMemberships, 'inventory must not modify any membership document');
    assert.deepEqual(afterAll, beforeAll, 'the emulator must contain exactly the same documents before and after inventory');
  } finally {
    await deleteApp(app);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.launch) {
    await launchEmulatorTest();
    return;
  }

  runClassifierBehaviorTests();
  await runInventoryEndpointBindingTests();

  if (args.offline) {
    console.log('Phase 2A owner-role inventory offline tests passed.');
    return;
  }

  await runEmulatorTests(args.projectId);
  console.log('Phase 2A owner-role inventory emulator tests passed; before/after snapshots are identical.');
}

main().catch((error) => {
  console.error(`Phase 2A owner-role inventory test failed: ${error.message}`);
  process.exitCode = 1;
});
