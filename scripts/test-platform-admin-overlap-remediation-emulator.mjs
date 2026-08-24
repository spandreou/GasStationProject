import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RemediationPreconditionError,
  buildPlatformAdminOverlapRemediationPlan,
  classifyPlatformAdminMembership,
  platformAdminStatusGrantsTenantAccess,
} from './lib/platform-admin-overlap-remediation.mjs';
import { resolveTenantAdminAuthorization } from '../src/services/tenantAuthorization.js';

const APPROVED_PROJECT_ID = 'demo-shiftoryx-platform-admin-overlap';
const TEST_SCRIPT = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(TEST_SCRIPT), '..');
const FIREBASE_TEST_CONFIG = path.join(REPOSITORY_ROOT, 'firebase-test.json');
const SYNTHETIC = Object.freeze({
  platformUid: 'synthetic-platform-admin',
  ownerUid: 'synthetic-business-owner',
  employeeUid: 'synthetic-employee',
  tenantId: 'synthetic-store',
  otherTenantId: 'synthetic-other-store',
  overlapMembershipId: 'synthetic-platform-admin_synthetic-store',
  ownerMembershipId: 'synthetic-business-owner_synthetic-store',
});

function parseArgs(argv) {
  const parsed = { launch: false, projectId: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--launch') parsed.launch = true;
    else if (arg === '--project-id') parsed.projectId = String(argv[++index] || '');
    else throw new Error('UNSUPPORTED_TEST_ARGUMENT');
  }
  return parsed;
}

function assertSyntheticEmulatorTarget({ emulatorHost, projectId }) {
  assert.equal(projectId, APPROVED_PROJECT_ID, 'UNAPPROVED_EMULATOR_PROJECT');
  assert.match(emulatorHost, /^(127\.0\.0\.1|localhost):\d+$/u, 'LOCAL_FIRESTORE_EMULATOR_REQUIRED');
  assert.equal(
    emulatorHost,
    String(process.env.FIRESTORE_EMULATOR_HOST || ''),
    'FIRESTORE_EMULATOR_ENV_MISMATCH',
  );
}

function runTargetGuardTests() {
  assert.throws(
    () => assertSyntheticEmulatorTarget({ emulatorHost: '', projectId: APPROVED_PROJECT_ID }),
    /LOCAL_FIRESTORE_EMULATOR_REQUIRED/u,
  );
  assert.throws(
    () =>
      assertSyntheticEmulatorTarget({
        emulatorHost: '127.0.0.1:8088',
        projectId: 'non-demo-project',
      }),
    /UNAPPROVED_EMULATOR_PROJECT/u,
  );

  const ambientEnvironment = {
    APPDATA: 'original-appdata',
    CLOUDSDK_CONFIG: 'original-cloudsdk-config',
    FIRESTORE_PREFER_REST: 'true',
    GOOGLE_APPLICATION_CREDENTIALS: 'uppercase-credential-path',
    google_application_credentials: 'lowercase-credential-path',
    PATH: 'synthetic-path',
  };
  const isolatedConfigDirectory = path.resolve('synthetic-isolated-config');
  const childEnvironment = buildEmulatorChildEnvironment(
    ambientEnvironment,
    isolatedConfigDirectory,
  );
  assert.equal(childEnvironment.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(childEnvironment.google_application_credentials, undefined);
  assert.equal(childEnvironment.FIRESTORE_PREFER_REST, 'false');
  assert.equal(childEnvironment.METADATA_SERVER_DETECTION, 'none');
  assert.equal(childEnvironment.GOOGLE_CLOUD_UNIVERSE_DOMAIN, 'googleapis.com');
  assert.equal(childEnvironment.APPDATA, isolatedConfigDirectory);
  assert.equal(childEnvironment.CLOUDSDK_CONFIG, isolatedConfigDirectory);
  assert.equal(childEnvironment.PATH, 'synthetic-path');
  assert.equal(childEnvironment.SHIFTORYX_HERMETIC_EMULATOR_CHILD, 'YES');
  assert.equal(ambientEnvironment.FIRESTORE_PREFER_REST, 'true');
  assert.equal(ambientEnvironment.GOOGLE_APPLICATION_CREDENTIALS, 'uppercase-credential-path');
  assert.doesNotThrow(() => assertHermeticEmulatorEnvironment(childEnvironment));
  assert.throws(
    () =>
      assertHermeticEmulatorEnvironment({
        ...childEnvironment,
        FIRESTORE_PREFER_REST: 'true',
      }),
    /HERMETIC_FIRESTORE_GRPC_REQUIRED/u,
  );
}

function buildEmulatorChildEnvironment(sourceEnvironment, isolatedConfigDirectory) {
  assert.ok(path.isAbsolute(isolatedConfigDirectory), 'ABSOLUTE_ISOLATED_CONFIG_DIRECTORY_REQUIRED');
  const childEnvironment = { ...sourceEnvironment };
  delete childEnvironment.GOOGLE_APPLICATION_CREDENTIALS;
  delete childEnvironment.google_application_credentials;
  childEnvironment.FIRESTORE_PREFER_REST = 'false';
  childEnvironment.METADATA_SERVER_DETECTION = 'none';
  childEnvironment.GOOGLE_CLOUD_UNIVERSE_DOMAIN = 'googleapis.com';
  childEnvironment.CLOUDSDK_CONFIG = isolatedConfigDirectory;
  childEnvironment.APPDATA = isolatedConfigDirectory;
  childEnvironment.CI = 'true';
  childEnvironment.SHIFTORYX_HERMETIC_EMULATOR_CHILD = 'YES';
  return childEnvironment;
}

function assertHermeticEmulatorEnvironment(environment) {
  assert.equal(
    environment.SHIFTORYX_HERMETIC_EMULATOR_CHILD,
    'YES',
    'HERMETIC_EMULATOR_LAUNCH_REQUIRED',
  );
  assert.equal(environment.GOOGLE_APPLICATION_CREDENTIALS, undefined, 'UPPERCASE_ADC_ENV_FORBIDDEN');
  assert.equal(environment.google_application_credentials, undefined, 'LOWERCASE_ADC_ENV_FORBIDDEN');
  assert.equal(environment.FIRESTORE_PREFER_REST, 'false', 'HERMETIC_FIRESTORE_GRPC_REQUIRED');
  assert.equal(environment.METADATA_SERVER_DETECTION, 'none', 'METADATA_CREDENTIAL_DISCOVERY_FORBIDDEN');
  assert.equal(
    environment.GOOGLE_CLOUD_UNIVERSE_DOMAIN,
    'googleapis.com',
    'EXPLICIT_GOOGLE_UNIVERSE_DOMAIN_REQUIRED',
  );
  assert.ok(path.isAbsolute(environment.APPDATA || ''), 'ISOLATED_APPDATA_REQUIRED');
  assert.equal(environment.CLOUDSDK_CONFIG, environment.APPDATA, 'ISOLATED_CLOUDSDK_CONFIG_REQUIRED');
}

function createSyntheticEmulatorCredential(certFactory) {
  assert.equal(typeof certFactory, 'function', 'FIREBASE_CERT_FACTORY_REQUIRED');
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return certFactory({
    projectId: APPROVED_PROJECT_ID,
    clientEmail: `synthetic-emulator@${APPROVED_PROJECT_ID}.iam.gserviceaccount.com`,
    privateKey,
  });
}

function updateTimeToken(snapshot) {
  assert.ok(snapshot.updateTime, 'DOCUMENT_UPDATE_TIME_REQUIRED');
  const seconds = snapshot.updateTime.seconds;
  const nanoseconds = snapshot.updateTime.nanoseconds;
  assert.ok(
    typeof seconds === 'number' || typeof seconds === 'bigint',
    'DOCUMENT_UPDATE_TIME_SECONDS_REQUIRED',
  );
  assert.ok(
    Number.isInteger(nanoseconds) && nanoseconds >= 0 && nanoseconds <= 999_999_999,
    'DOCUMENT_UPDATE_TIME_NANOSECONDS_REQUIRED',
  );
  return {
    seconds: String(seconds),
    nanoseconds,
  };
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

async function collectCollectionSnapshot(collectionReference, rows) {
  const snapshot = await collectionReference.get();
  for (const document of [...snapshot.docs].sort((left, right) => left.id.localeCompare(right.id))) {
    rows.push({
      path: document.ref.path,
      data: normalizeForSnapshot(document.data()),
    });
    const children = (await document.ref.listCollections()).sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    for (const child of children) await collectCollectionSnapshot(child, rows);
  }
}

async function snapshotFirestore(db) {
  const rows = [];
  const collections = (await db.listCollections()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  for (const collection of collections) await collectCollectionSnapshot(collection, rows);
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

function changedDocumentPaths(before, after) {
  const beforeMap = new Map(before.map((row) => [row.path, JSON.stringify(row.data)]));
  const afterMap = new Map(after.map((row) => [row.path, JSON.stringify(row.data)]));
  return [...new Set([...beforeMap.keys(), ...afterMap.keys()])]
    .filter((documentPath) => beforeMap.get(documentPath) !== afterMap.get(documentPath))
    .sort();
}

async function clearEmulator(emulatorHost, projectId) {
  const response = await fetch(
    `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.equal(response.ok, true, 'FIRESTORE_EMULATOR_CLEAR_FAILED');
}

async function seedSyntheticFixture(db) {
  const batch = db.batch();
  batch.set(db.doc(`platformAdmins/${SYNTHETIC.platformUid}`), {
    uid: SYNTHETIC.platformUid,
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  });
  batch.set(db.doc(`tenants/${SYNTHETIC.tenantId}`), {
    slug: SYNTHETIC.tenantId,
    status: 'ACTIVE',
  });
  batch.set(db.doc(`tenants/${SYNTHETIC.otherTenantId}`), {
    slug: SYNTHETIC.otherTenantId,
    status: 'ACTIVE',
  });
  batch.set(db.doc(`users/${SYNTHETIC.platformUid}`), {
    uid: SYNTHETIC.platformUid,
    status: 'ACTIVE',
    memberships: {
      [SYNTHETIC.tenantId]: { role: 'OWNER', status: 'ACTIVE' },
    },
  });
  batch.set(db.doc(`users/${SYNTHETIC.ownerUid}`), {
    uid: SYNTHETIC.ownerUid,
    status: 'ACTIVE',
    memberships: {},
  });
  batch.set(db.doc(`tenantMemberships/${SYNTHETIC.overlapMembershipId}`), {
    uid: SYNTHETIC.platformUid,
    tenantId: SYNTHETIC.tenantId,
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: '2026-08-09T08:00:00.000Z',
    updatedAt: '2026-08-09T08:30:00.000Z',
  });
  batch.set(db.doc(`tenants/${SYNTHETIC.tenantId}/employees/${SYNTHETIC.employeeUid}`), {
    fullName: 'Synthetic Employee',
    isActive: true,
  });
  batch.set(db.doc(`tenants/${SYNTHETIC.tenantId}/publicSchedules/2026-08-03`), {
    tenantId: SYNTHETIC.tenantId,
    published: true,
  });
  batch.set(db.doc('employee_absences_private/synthetic-absence'), {
    tenantId: SYNTHETIC.tenantId,
    reason: 'synthetic-only',
    internalComments: 'unchanged boundary sentinel',
  });
  batch.set(db.doc('remediationSentinels/unrelated'), {
    value: 'must-remain-unchanged',
  });
  await batch.commit();
}

function membershipsOf(snapshot) {
  return snapshot.exists && snapshot.data().memberships && typeof snapshot.data().memberships === 'object'
    ? structuredClone(snapshot.data().memberships)
    : {};
}

function ownerEvidence() {
  return {
    authoritative: true,
    decision: 'APPROVED_OWNER',
    ownerUid: SYNTHETIC.ownerUid,
    tenantId: SYNTHETIC.tenantId,
  };
}

function expectedFrom(overlapSnapshot) {
  return {
    projectId: APPROVED_PROJECT_ID,
    platformUid: SYNTHETIC.platformUid,
    tenantId: SYNTHETIC.tenantId,
    overlapMembershipId: SYNTHETIC.overlapMembershipId,
    overlapRole: 'OWNER',
    overlapStatus: 'ACTIVE',
    overlapUpdateTime: updateTimeToken(overlapSnapshot),
    platformMirror: { role: 'OWNER', status: 'ACTIVE' },
    ownerUid: SYNTHETIC.ownerUid,
    ownerMembershipId: SYNTHETIC.ownerMembershipId,
  };
}

function plannerSnapshot({
  projectId,
  platformAdminSnapshot,
  tenantSnapshot,
  overlapSnapshot,
  platformUserSnapshot,
  ownerUserSnapshot,
  ownerPlatformAdminSnapshot,
  ownerMembershipSnapshot,
  tenantMembershipsSnapshot,
  platformMembershipsSnapshot,
  approvedOwnerEvidence,
}) {
  return {
    projectId,
    platformAdmin: platformAdminSnapshot.exists
      ? {
          uid: platformAdminSnapshot.data().uid,
          status: platformAdminSnapshot.data().status,
        }
      : null,
    tenant: {
      tenantId: SYNTHETIC.tenantId,
      exists: tenantSnapshot.exists,
    },
    overlapMembership: overlapSnapshot.exists
      ? {
          id: overlapSnapshot.id,
          ...overlapSnapshot.data(),
          updateTime: updateTimeToken(overlapSnapshot),
        }
      : null,
    platformTenantMemberships: platformMembershipsSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
      updateTime: updateTimeToken(document),
    })),
    platformUser: {
      uid: SYNTHETIC.platformUid,
      exists: platformUserSnapshot.exists,
      memberships: membershipsOf(platformUserSnapshot),
    },
    ownerEvidence: approvedOwnerEvidence,
    ownerCandidate: {
      uid: SYNTHETIC.ownerUid,
      exists: ownerUserSnapshot.exists,
      memberships: membershipsOf(ownerUserSnapshot),
    },
    ownerPlatformAdmin: ownerPlatformAdminSnapshot.exists
      ? {
          uid: ownerPlatformAdminSnapshot.data().uid,
          status: ownerPlatformAdminSnapshot.data().status,
        }
      : null,
    ownerMembership: ownerMembershipSnapshot.exists
      ? {
          id: ownerMembershipSnapshot.id,
          ...ownerMembershipSnapshot.data(),
        }
      : null,
    competingActiveMemberships: tenantMembershipsSnapshot.docs
      .filter(
        (document) =>
          document.id !== SYNTHETIC.overlapMembershipId &&
          document.id !== SYNTHETIC.ownerMembershipId &&
          document.data().status === 'ACTIVE',
      )
      .map((document) => ({ id: document.id, ...document.data() })),
  };
}

async function captureExpected(db) {
  const overlapSnapshot = await db
    .doc(`tenantMemberships/${SYNTHETIC.overlapMembershipId}`)
    .get();
  assert.equal(overlapSnapshot.exists, true, 'SYNTHETIC_OVERLAP_REQUIRED');
  return expectedFrom(overlapSnapshot);
}

async function rehearseRemediation(
  db,
  { expected, serverTimestamp, approvedOwnerEvidence = ownerEvidence() },
) {
  assert.equal(typeof serverTimestamp, 'function', 'SERVER_TIMESTAMP_FACTORY_REQUIRED');
  return db.runTransaction(
    async (transaction) => {
      const platformAdminRef = db.doc(`platformAdmins/${SYNTHETIC.platformUid}`);
      const tenantRef = db.doc(`tenants/${SYNTHETIC.tenantId}`);
      const overlapRef = db.doc(`tenantMemberships/${SYNTHETIC.overlapMembershipId}`);
      const platformUserRef = db.doc(`users/${SYNTHETIC.platformUid}`);
      const ownerUserRef = db.doc(`users/${SYNTHETIC.ownerUid}`);
      const ownerPlatformAdminRef = db.doc(`platformAdmins/${SYNTHETIC.ownerUid}`);
      const ownerMembershipRef = db.doc(`tenantMemberships/${SYNTHETIC.ownerMembershipId}`);
      const tenantMembershipsQuery = db
        .collection('tenantMemberships')
        .where('tenantId', '==', SYNTHETIC.tenantId);
      const platformMembershipsQuery = db
        .collection('tenantMemberships')
        .where('uid', '==', SYNTHETIC.platformUid);

      const platformAdminSnapshot = await transaction.get(platformAdminRef);
      const tenantSnapshot = await transaction.get(tenantRef);
      const overlapSnapshot = await transaction.get(overlapRef);
      const platformUserSnapshot = await transaction.get(platformUserRef);
      const ownerUserSnapshot = await transaction.get(ownerUserRef);
      const ownerPlatformAdminSnapshot = await transaction.get(ownerPlatformAdminRef);
      const ownerMembershipSnapshot = await transaction.get(ownerMembershipRef);
      const tenantMembershipsSnapshot = await transaction.get(tenantMembershipsQuery);
      const platformMembershipsSnapshot = await transaction.get(platformMembershipsQuery);

      const plan = buildPlatformAdminOverlapRemediationPlan({
        expected,
        snapshot: plannerSnapshot({
          projectId: APPROVED_PROJECT_ID,
          platformAdminSnapshot,
          tenantSnapshot,
          overlapSnapshot,
          platformUserSnapshot,
          ownerUserSnapshot,
          ownerPlatformAdminSnapshot,
          ownerMembershipSnapshot,
          tenantMembershipsSnapshot,
          platformMembershipsSnapshot,
          approvedOwnerEvidence,
        }),
      });
      assert.equal(plan.retryPolicy, 'NO_AUTOMATIC_RETRY');
      assert.deepEqual(
        plan.untouched,
        [
          { collection: 'platformAdmins', documentId: SYNTHETIC.platformUid },
          { collection: 'platformAdmins', documentId: SYNTHETIC.ownerUid },
          { collection: 'tenants', documentId: SYNTHETIC.tenantId },
        ],
      );

      const platformMemberships = membershipsOf(platformUserSnapshot);
      delete platformMemberships[SYNTHETIC.tenantId];
      const ownerMemberships = membershipsOf(ownerUserSnapshot);
      ownerMemberships[SYNTHETIC.tenantId] = { role: 'OWNER', status: 'ACTIVE' };
      const ownerMembershipOperation = plan.operations.find(
        (operation) => operation.type === 'CREATE_OWNER_MEMBERSHIP',
      );
      assert.ok(ownerMembershipOperation, 'OWNER_MEMBERSHIP_OPERATION_REQUIRED');
      assert.deepEqual(ownerMembershipOperation.serverTimestampFields, ['createdAt', 'updatedAt']);

      transaction.delete(overlapRef);
      transaction.update(platformUserRef, { memberships: platformMemberships });
      transaction.create(ownerMembershipRef, {
        ...ownerMembershipOperation.data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.update(ownerUserRef, { memberships: ownerMemberships });
      return plan;
    },
    { maxAttempts: 1 },
  );
}

function expectPreconditionCode(code, operation) {
  return assert.rejects(operation, (error) => {
    assert.ok(error instanceof RemediationPreconditionError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
}

function assertAuthorizationBehavior({ beforeOverlapMembership, afterOwnerMembership }) {
  const tenant = { id: SYNTHETIC.tenantId };
  const platformUser = { uid: SYNTHETIC.platformUid, platformAdminStatus: 'ACTIVE' };
  const ownerUser = { uid: SYNTHETIC.ownerUid };

  assert.equal(platformAdminStatusGrantsTenantAccess({ status: 'ACTIVE' }), false);
  assert.equal(
    resolveTenantAdminAuthorization({
      user: platformUser,
      tenant,
      membership: beforeOverlapMembership,
    }).allowed,
    true,
    'the invalid starting state grants access only because an explicit membership exists',
  );
  assert.equal(
    resolveTenantAdminAuthorization({ user: platformUser, tenant, membership: null }).allowed,
    false,
    'platform-admin status must not substitute for tenant membership',
  );
  assert.equal(
    resolveTenantAdminAuthorization({
      user: ownerUser,
      tenant,
      membership: afterOwnerMembership,
    }).allowed,
    true,
    'the separate OWNER membership must authorize the synthetic tenant',
  );
  assert.equal(
    resolveTenantAdminAuthorization({
      user: ownerUser,
      tenant: { id: SYNTHETIC.otherTenantId },
      membership: afterOwnerMembership,
    }).allowed,
    false,
    'OWNER of tenant A must not access tenant B',
  );
}

async function resetFixture(db, emulatorHost) {
  await clearEmulator(emulatorHost, APPROVED_PROJECT_ID);
  await seedSyntheticFixture(db);
}

async function runEmulatorTests(projectId) {
  const emulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || '');
  assertSyntheticEmulatorTarget({ emulatorHost, projectId });
  assertHermeticEmulatorEnvironment(process.env);

  const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
  const { cert, deleteApp, initializeApp } = requireFromFunctions('firebase-admin/app');
  const { FieldValue, getFirestore } = requireFromFunctions('firebase-admin/firestore');
  const credential = createSyntheticEmulatorCredential(cert);
  const app = initializeApp(
    { projectId, credential },
    'platform-admin-overlap-remediation-test',
  );
  const db = getFirestore(app);
  const serverTimestamp = () => FieldValue.serverTimestamp();

  try {
    await resetFixture(db, emulatorHost);
    const before = await snapshotFirestore(db);
    const expected = await captureExpected(db);
    const beforeOverlapMembership = (
      await db.doc(`tenantMemberships/${SYNTHETIC.overlapMembershipId}`).get()
    ).data();
    const classification = classifyPlatformAdminMembership({
      platformAdmin: { uid: SYNTHETIC.platformUid, status: 'ACTIVE' },
      membership: beforeOverlapMembership,
    });
    assert.equal(classification.classification, 'PLATFORM_ADMIN_TENANT_MEMBERSHIP_FORBIDDEN');

    const plan = await rehearseRemediation(db, { expected, serverTimestamp });
    assert.equal(plan.mode, 'EMULATOR_REHEARSAL_PLAN');
    const after = await snapshotFirestore(db);
    const expectedChangedPaths = [
      `tenantMemberships/${SYNTHETIC.overlapMembershipId}`,
      `tenantMemberships/${SYNTHETIC.ownerMembershipId}`,
      `users/${SYNTHETIC.ownerUid}`,
      `users/${SYNTHETIC.platformUid}`,
    ].sort();
    assert.deepEqual(changedDocumentPaths(before, after), expectedChangedPaths);

    const platformAdminAfter = await db.doc(`platformAdmins/${SYNTHETIC.platformUid}`).get();
    const platformUserAfter = await db.doc(`users/${SYNTHETIC.platformUid}`).get();
    const overlapAfter = await db
      .doc(`tenantMemberships/${SYNTHETIC.overlapMembershipId}`)
      .get();
    const ownerUserAfter = await db.doc(`users/${SYNTHETIC.ownerUid}`).get();
    const ownerMembershipAfter = await db
      .doc(`tenantMemberships/${SYNTHETIC.ownerMembershipId}`)
      .get();
    const platformMembershipsAfter = await db
      .collection('tenantMemberships')
      .where('uid', '==', SYNTHETIC.platformUid)
      .get();
    assert.equal(platformAdminAfter.exists, true);
    assert.equal(platformAdminAfter.data().status, 'ACTIVE');
    assert.deepEqual(membershipsOf(platformUserAfter), {});
    assert.equal(platformMembershipsAfter.empty, true);
    assert.equal(overlapAfter.exists, false);
    const ownerMembershipData = ownerMembershipAfter.data();
    assert.deepEqual(
      {
        uid: ownerMembershipData.uid,
        tenantId: ownerMembershipData.tenantId,
        role: ownerMembershipData.role,
        status: ownerMembershipData.status,
      },
      {
      uid: SYNTHETIC.ownerUid,
      tenantId: SYNTHETIC.tenantId,
      role: 'OWNER',
      status: 'ACTIVE',
      },
    );
    assert.ok(Number.isFinite(ownerMembershipData.createdAt?.toMillis()));
    assert.ok(Number.isFinite(ownerMembershipData.updatedAt?.toMillis()));
    assert.deepEqual(membershipsOf(ownerUserAfter)[SYNTHETIC.tenantId], {
      role: 'OWNER',
      status: 'ACTIVE',
    });
    assertAuthorizationBehavior({
      beforeOverlapMembership,
      afterOwnerMembership: ownerMembershipAfter.data(),
    });
    const employeeMemberships = await db
      .collection('tenantMemberships')
      .where('uid', '==', SYNTHETIC.employeeUid)
      .get();
    assert.equal(employeeMemberships.empty, true, 'remediation must not introduce employee authentication');
    assert.equal(
      classifyPlatformAdminMembership({
        platformAdmin: { uid: SYNTHETIC.platformUid, status: platformAdminAfter.data().status },
        membership: null,
      }).classification,
      'VALID_PLATFORM_ADMIN',
    );

    const beforeRepeatedRun = await snapshotFirestore(db);
    await expectPreconditionCode('REMEDIATION_ALREADY_APPLIED', () =>
      rehearseRemediation(db, { expected, serverTimestamp }),
    );
    assert.deepEqual(await snapshotFirestore(db), beforeRepeatedRun);

    await resetFixture(db, emulatorHost);
    const staleExpected = await captureExpected(db);
    await db.doc(`tenantMemberships/${SYNTHETIC.overlapMembershipId}`).set(
      { updatedAt: '2026-08-09T08:31:00.000Z' },
      { merge: true },
    );
    const beforeStaleAttempt = await snapshotFirestore(db);
    await expectPreconditionCode('STALE_OVERLAP_MEMBERSHIP', () =>
      rehearseRemediation(db, { expected: staleExpected, serverTimestamp }),
    );
    assert.deepEqual(await snapshotFirestore(db), beforeStaleAttempt);

    await resetFixture(db, emulatorHost);
    const missingOwnerExpected = await captureExpected(db);
    await db.doc(`users/${SYNTHETIC.ownerUid}`).delete();
    const beforeMissingOwnerAttempt = await snapshotFirestore(db);
    await expectPreconditionCode('OWNER_CANDIDATE_MISSING', () =>
      rehearseRemediation(db, { expected: missingOwnerExpected, serverTimestamp }),
    );
    assert.deepEqual(await snapshotFirestore(db), beforeMissingOwnerAttempt);

    await resetFixture(db, emulatorHost);
    const conflictExpected = await captureExpected(db);
    await db.doc(`tenantMemberships/${SYNTHETIC.ownerMembershipId}`).set({
      uid: SYNTHETIC.ownerUid,
      tenantId: SYNTHETIC.tenantId,
      role: 'MANAGER',
      status: 'ACTIVE',
    });
    await db.doc(`users/${SYNTHETIC.ownerUid}`).set(
      {
        memberships: {
          [SYNTHETIC.tenantId]: { role: 'MANAGER', status: 'ACTIVE' },
        },
      },
      { merge: true },
    );
    const beforeConflictAttempt = await snapshotFirestore(db);
    await expectPreconditionCode('OWNER_MEMBERSHIP_CONFLICT', () =>
      rehearseRemediation(db, { expected: conflictExpected, serverTimestamp }),
    );
    assert.deepEqual(await snapshotFirestore(db), beforeConflictAttempt);

    await resetFixture(db, emulatorHost);
    const competingClaimExpected = await captureExpected(db);
    await db.doc('tenantMemberships/synthetic-competing-owner_synthetic-store').set({
      uid: 'synthetic-competing-owner',
      tenantId: SYNTHETIC.tenantId,
      role: 'OWNER',
      status: 'ACTIVE',
    });
    const beforeCompetingClaimAttempt = await snapshotFirestore(db);
    await expectPreconditionCode('COMPETING_ACTIVE_MEMBERSHIP_CONFLICT', () =>
      rehearseRemediation(db, { expected: competingClaimExpected, serverTimestamp }),
    );
    assert.deepEqual(await snapshotFirestore(db), beforeCompetingClaimAttempt);

    await resetFixture(db, emulatorHost);
    const ownerPlatformConflictExpected = await captureExpected(db);
    await db.doc(`platformAdmins/${SYNTHETIC.ownerUid}`).set({
      uid: SYNTHETIC.ownerUid,
      status: 'ACTIVE',
    });
    const beforeOwnerPlatformConflictAttempt = await snapshotFirestore(db);
    await expectPreconditionCode('OWNER_PLATFORM_ADMIN_CONFLICT', () =>
      rehearseRemediation(db, { expected: ownerPlatformConflictExpected, serverTimestamp }),
    );
    assert.deepEqual(await snapshotFirestore(db), beforeOwnerPlatformConflictAttempt);

    await resetFixture(db, emulatorHost);
    const additionalPlatformMembershipExpected = await captureExpected(db);
    await db.doc('tenantMemberships/synthetic-platform-admin_synthetic-other-store').set({
      uid: SYNTHETIC.platformUid,
      tenantId: SYNTHETIC.otherTenantId,
      role: 'MANAGER',
      status: 'REVOKED',
    });
    await db.doc(`users/${SYNTHETIC.platformUid}`).set(
      {
        memberships: {
          [SYNTHETIC.tenantId]: { role: 'OWNER', status: 'ACTIVE' },
          [SYNTHETIC.otherTenantId]: { role: 'MANAGER', status: 'REVOKED' },
        },
      },
      { merge: true },
    );
    const beforeAdditionalPlatformMembershipAttempt = await snapshotFirestore(db);
    await expectPreconditionCode('PLATFORM_ADDITIONAL_MEMBERSHIP_CONFLICT', () =>
      rehearseRemediation(db, {
        expected: additionalPlatformMembershipExpected,
        serverTimestamp,
      }),
    );
    assert.deepEqual(
      await snapshotFirestore(db),
      beforeAdditionalPlatformMembershipAttempt,
    );

    console.log(
      JSON.stringify({
        status: 'PLATFORM_ADMIN_OVERLAP_EMULATOR_REHEARSAL_PASSED',
        project: 'SYNTHETIC_DEMO_ONLY',
        credentialMode: 'EPHEMERAL_SYNTHETIC_IN_MEMORY',
        retryPolicy: 'NO_AUTOMATIC_RETRY',
        successfulChangedDocumentCount: expectedChangedPaths.length,
        unrelatedDocumentsChanged: 0,
        repeatedRun: 'REMEDIATION_ALREADY_APPLIED',
        stalePrecondition: 'STALE_OVERLAP_MEMBERSHIP',
        missingOwner: 'OWNER_CANDIDATE_MISSING',
        conflictingOwner: 'OWNER_MEMBERSHIP_CONFLICT',
        competingActiveMembership: 'COMPETING_ACTIVE_MEMBERSHIP_CONFLICT',
        ownerPlatformAdminConflict: 'OWNER_PLATFORM_ADMIN_CONFLICT',
        additionalPlatformMembership: 'PLATFORM_ADDITIONAL_MEMBERSHIP_CONFLICT',
      }),
    );
  } finally {
    await deleteApp(app);
  }
}

async function launchEmulatorTest() {
  const externalWorkingDirectory = await mkdtemp(
    path.join(tmpdir(), 'shiftoryx-platform-admin-overlap-emulator-'),
  );
  const isolatedConfigDirectory = path.join(externalWorkingDirectory, 'isolated-config');
  let firebaseExecutable = 'firebase';
  let firebasePrefixArgs = [];
  if (process.platform === 'win32') {
    const appDataDirectory = String(process.env.APPDATA || '');
    assert.ok(appDataDirectory, 'APPDATA_REQUIRED_FOR_FIREBASE_CLI');
    const firebaseCliModule = path.join(
      appDataDirectory,
      'npm',
      'node_modules',
      'firebase-tools',
      'lib',
      'bin',
      'firebase.js',
    );
    assert.ok(existsSync(firebaseCliModule), 'EXISTING_FIREBASE_CLI_REQUIRED');
    firebaseExecutable = process.execPath;
    firebasePrefixArgs = [firebaseCliModule];
  }
  const innerCommand = `\"${process.execPath}\" \"${TEST_SCRIPT}\" --project-id ${APPROVED_PROJECT_ID}`;
  await mkdir(isolatedConfigDirectory, { recursive: false });
  const childEnvironment = buildEmulatorChildEnvironment(
    process.env,
    isolatedConfigDirectory,
  );

  try {
    const result = spawnSync(
      firebaseExecutable,
      [
        ...firebasePrefixArgs,
        'emulators:exec',
        '--config',
        FIREBASE_TEST_CONFIG,
        '--project',
        APPROVED_PROJECT_ID,
        '--only',
        'firestore',
        innerCommand,
      ],
      {
        cwd: externalWorkingDirectory,
        encoding: 'utf8',
        env: childEnvironment,
      },
    );
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'FIREBASE_EMULATOR_EXECUTION_FAILED');
  } finally {
    const resolvedTemporaryDirectory = path.resolve(externalWorkingDirectory);
    const resolvedSystemTemporaryRoot = path.resolve(tmpdir());
    assert.ok(
      resolvedTemporaryDirectory.startsWith(`${resolvedSystemTemporaryRoot}${path.sep}`),
      'TEMPORARY_EMULATOR_DIRECTORY_OUTSIDE_TEMP_ROOT',
    );
    await rm(resolvedTemporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  runTargetGuardTests();
  if (args.launch) {
    await launchEmulatorTest();
    return;
  }
  await runEmulatorTests(args.projectId);
}

main().catch((error) => {
  console.error(`PLATFORM_ADMIN_OVERLAP_EMULATOR_REHEARSAL_FAILED:${error.message}`);
  process.exitCode = 1;
});
