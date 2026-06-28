import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const PROJECT_ID = 'demo-gasstation-migration';
const FIRESTORE_EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const authBase = `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`;
const emulatorClearUrl = `http://${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const adminApp = initializeApp({ projectId: PROJECT_ID }, 'migration-emulator-test');
const adminDb = getFirestore(adminApp);
const adminAuth = getAuth(adminApp);

function runMigrationScript(args, idToken) {
  return new Promise((resolve) => {
    const scriptPath = path.resolve('scripts/migrate-global-to-tenant.mjs');
    const child = fork(scriptPath, args, {
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR,
        FIREBASE_PROJECT_ID: PROJECT_ID,
        GOOGLE_OAUTH_ACCESS_TOKEN: idToken,
      },
      stdio: 'ignore', // Suppress console output from child script to keep test run clean
    });

    child.on('exit', (code) => {
      resolve(code);
    });
  });
}

async function clearEmulatorDb() {
  const res = await fetch(emulatorClearUrl, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Failed to clear Firestore emulator: ${res.statusText}`);
  }
}

async function setupAuthAdmin() {
  const email = 'migration-admin@example.test';
  const password = 'TestPassword123!';
  const uid = 'migration-admin-uid';

  try {
    await adminAuth.createUser({
      uid,
      email,
      password,
      emailVerified: true,
    });
  } catch (e) {
    // If user already exists in emulator, we can ignore or recreate
  }

  // Seed tenant and membership
  await adminDb.doc('tenants/bp-kallis').set({
    slug: 'bp-kallis',
    domain: 'bp-kallis.homelabshare.gr',
    displayName: 'BP Kallis',
    status: 'ACTIVE',
  });

  await adminDb.doc('tenantMemberships/migration-admin-uid_bp-kallis').set({
    uid,
    tenantId: 'bp-kallis',
    role: 'OWNER',
    status: 'ACTIVE',
  });

  // Get mock ID token via signInWithPassword REST API of Auth Emulator
  const res = await fetch(`${authBase}/accounts:signInWithPassword?key=fake-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`Auth emulator sign in failed: ${res.statusText}`);
  }

  const data = await res.json();
  return data.idToken;
}

async function runTests() {
  console.log('Starting Migration Script Emulator Tests...');
  const idToken = await setupAuthAdmin();

  // --- Test Case 1: Unknown tenant is rejected ---
  console.log('Test 1: Unknown tenant is rejected...');
  await clearEmulatorDb();
  await setupAuthAdmin(); // Need to re-setup auth since clear db clears firestore but not auth
  const code1 = await runMigrationScript(['--tenant', 'eko-example', '--dry-run'], idToken);
  assert.equal(code1, 1, 'Unknown tenant must return exit code 1');

  // --- Test Case 2: Dry-run performs no writes ---
  console.log('Test 2: Dry-run performs no writes...');
  await clearEmulatorDb();
  await setupAuthAdmin();
  await adminDb.doc('employees/emp-1').set({ fullName: 'John Doe' });

  const code2 = await runMigrationScript(['--tenant', 'bp-kallis', '--dry-run'], idToken);
  assert.equal(code2, 0, 'Dry-run must exit with code 0');

  const targetDocs2 = await adminDb.collection('tenants/bp-kallis/employees').get();
  assert.equal(targetDocs2.size, 0, 'Dry-run must not write any target documents');

  // --- Test Case 3: Running without --write does not mutate data (default is dry-run) ---
  console.log('Test 3: Default mode does not mutate data...');
  const code3 = await runMigrationScript(['--tenant', 'bp-kallis'], idToken);
  assert.equal(code3, 0, 'Default mode must exit with code 0');

  const targetDocs3 = await adminDb.collection('tenants/bp-kallis/employees').get();
  assert.equal(targetDocs3.size, 0, 'Default mode must not write any target documents');

  // --- Test Case 4: Write copies source docs to target paths ---
  console.log('Test 4: Write copies source docs to target paths...');
  await clearEmulatorDb();
  await setupAuthAdmin();
  await adminDb.doc('employees/emp-1').set({ fullName: 'John Doe' });
  await adminDb.doc('shifts/shift-1').set({
    employeeId: 'emp-1',
    date: '2026-06-28',
    startTime: '08:00',
    endTime: '16:00'
  });
  await adminDb.doc('scheduler_settings/default').set({
    generatorRules: {},
    specialDaysByDate: {}
  });

  const code4 = await runMigrationScript(['--tenant', 'bp-kallis', '--write'], idToken);
  assert.equal(code4, 0, 'Write migration must exit with code 0');

  const empDoc = await adminDb.doc('tenants/bp-kallis/employees/emp-1').get();
  assert.ok(empDoc.exists, 'Employee document must be copied');
  assert.equal(empDoc.data().fullName, 'John Doe', 'Copied employee data must match');

  const shiftDoc = await adminDb.doc('tenants/bp-kallis/shifts/shift-1').get();
  assert.ok(shiftDoc.exists, 'Shift document must be copied');

  const settingsDoc = await adminDb.doc('tenants/bp-kallis/settings/scheduler').get();
  assert.ok(settingsDoc.exists, 'Settings document must be mapped to target location');
  assert.deepEqual(settingsDoc.data().generatorRules, {}, 'Settings data must match');

  // --- Test Case 5: Verify mode passes when copied counts match ---
  console.log('Test 5: Verify mode passes when counts match...');
  const code5 = await runMigrationScript(['--tenant', 'bp-kallis', '--verify'], idToken);
  assert.equal(code5, 0, 'Verify mode must exit with code 0 when all counts match');

  // --- Test Case 6: Verify mode detects missing docs ---
  console.log('Test 6: Verify mode detects missing target docs...');
  await adminDb.doc('tenants/bp-kallis/shifts/shift-1').delete();

  const code6 = await runMigrationScript(['--tenant', 'bp-kallis', '--verify'], idToken);
  assert.equal(code6, 1, 'Verify mode must exit with code 1 when there is a mismatch');

  // --- Test Case 7: Existing target docs are not overwritten by default ---
  console.log('Test 7: Target docs are not overwritten by default...');
  await adminDb.doc('tenants/bp-kallis/shifts/shift-1').set({
    employeeId: 'emp-1',
    date: '2026-06-29',
    startTime: '08:00',
    endTime: '16:00'
  });

  const code7 = await runMigrationScript(['--tenant', 'bp-kallis', '--write'], idToken);
  assert.equal(code7, 0, 'Write must exit with code 0');

  const shiftDocAfter = await adminDb.doc('tenants/bp-kallis/shifts/shift-1').get();
  assert.equal(shiftDocAfter.data().date, '2026-06-29', 'Target doc must not be overwritten without --overwrite');

  // If we run with --overwrite, it SHOULD overwrite back to original
  console.log('Test 7b: Target docs are overwritten when --overwrite is set...');
  const code7b = await runMigrationScript(['--tenant', 'bp-kallis', '--write', '--overwrite'], idToken);
  assert.equal(code7b, 0, 'Write with overwrite must exit with code 0');

  const shiftDocAfterOverwrite = await adminDb.doc('tenants/bp-kallis/shifts/shift-1').get();
  assert.equal(shiftDocAfterOverwrite.data().date, '2026-06-28', 'Target doc must be overwritten when --overwrite is set');

  console.log('All emulator migration tests PASSED!');
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
