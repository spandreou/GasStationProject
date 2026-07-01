import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const PROJECT_ID = 'demo-gasstation-auth-broker';
const FIRESTORE_EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';
const emulatorClearUrl = `http://${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const adminApp = initializeApp({ projectId: PROJECT_ID }, 'provision-test');
const db = getFirestore(adminApp);

function runCliScript(args) {
  return new Promise((resolve) => {
    const scriptPath = path.resolve('scripts/provision-tenant.mjs');
    const child = fork(scriptPath, args, {
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR,
      },
      stdio: 'ignore', // Suppress console logs to keep test runs clean
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

async function checkDocExists(pathStr) {
  const snap = await db.doc(pathStr).get();
  return snap.exists;
}

async function runTests() {
  console.log('Starting Tenant Provisioning CLI Emulator Tests...');

  // 1. Dry-run performs zero writes
  await clearEmulatorDb();
  const dryRunCode = await runCliScript([
    '--tenant', 'eko-example',
    '--admin-uid', 'eko-admin-uid',
    '--dry-run'
  ]);
  assert.equal(dryRunCode, 0, 'Dry-run must exit with 0');
  const existsAfterDryRun = await checkDocExists('tenants/eko-example');
  assert.equal(existsAfterDryRun, false, 'Dry-run must not write anything to Firestore');

  // 2. Invalid tenant ID fails (exits with 1)
  const invalidIdCode = await runCliScript([
    '--tenant', 'bp/kallis',
    '--admin-uid', 'eko-admin-uid',
    '--dry-run'
  ]);
  assert.equal(invalidIdCode, 1, 'Invalid tenant ID must exit with 1');

  // 3. Reserved tenant ID fails (exits with 1)
  const reservedIdCode = await runCliScript([
    '--tenant', 'gas',
    '--admin-uid', 'eko-admin-uid',
    '--dry-run'
  ]);
  assert.equal(reservedIdCode, 1, 'Reserved tenant ID must exit with 1');

  // 4. Missing admin UID fails (exits with 1)
  const missingUidCode = await runCliScript([
    '--tenant', 'eko-example',
    '--dry-run'
  ]);
  assert.equal(missingUidCode, 1, 'Missing admin UID must exit with 1');

  // 5. Write creates expected tenant docs in emulator
  await clearEmulatorDb();
  const writeCode = await runCliScript([
    '--tenant', 'eko-example',
    '--admin-uid', 'eko-admin-uid',
    '--admin-email', 'eko@example.test',
    '--display-name', 'EKO Example',
    '--write',
    '--emulator'
  ]);
  assert.equal(writeCode, 0, 'Emulator write must exit with 0');

  const tenantExists = await checkDocExists('tenants/eko-example');
  const userExists = await checkDocExists('users/eko-admin-uid');
  const membershipExists = await checkDocExists('tenantMemberships/eko-admin-uid_eko-example');
  const settingsExists = await checkDocExists('tenants/eko-example/settings/scheduler');

  assert.ok(tenantExists, 'Tenant document must exist');
  assert.ok(userExists, 'User document must exist');
  assert.ok(membershipExists, 'Membership document must exist');
  assert.ok(settingsExists, 'Scheduler settings document must exist');

  // 6. Verify passes after write
  const verifyCode = await runCliScript([
    '--tenant', 'eko-example',
    '--admin-uid', 'eko-admin-uid',
    '--verify',
    '--emulator'
  ]);
  assert.equal(verifyCode, 0, 'Verify must exit with 0 when documents exist');

  // 7. Verify fails before write (or for missing documents)
  await clearEmulatorDb();
  const verifyFailCode = await runCliScript([
    '--tenant', 'eko-example',
    '--admin-uid', 'eko-admin-uid',
    '--verify',
    '--emulator'
  ]);
  assert.equal(verifyFailCode, 1, 'Verify must exit with 1 when documents do not exist');

  // 8. Existing tenant is not overwritten by default
  // Write first
  await runCliScript([
    '--tenant', 'eko-example',
    '--admin-uid', 'eko-admin-uid',
    '--write',
    '--emulator'
  ]);
  // Write second time (should fail due to conflict)
  const doubleWriteCode = await runCliScript([
    '--tenant', 'eko-example',
    '--admin-uid', 'eko-admin-uid',
    '--write',
    '--emulator'
  ]);
  assert.equal(doubleWriteCode, 1, 'Writing over existing tenant must fail without --overwrite');

  // 9. Existing tenant can be overwritten only with --overwrite
  const overwriteCode = await runCliScript([
    '--tenant', 'eko-example',
    '--admin-uid', 'eko-admin-uid',
    '--write',
    '--overwrite',
    '--emulator'
  ]);
  assert.equal(overwriteCode, 0, 'Overwrite must succeed when --overwrite is provided');

  // 10. Production write without --emulator is blocked (fails with 1)
  const prodWriteCode = await runCliScript([
    '--tenant', 'eko-example',
    '--admin-uid', 'eko-admin-uid',
    '--write'
  ]);
  assert.equal(prodWriteCode, 1, 'Production write without --emulator must be blocked');

  console.log('All Tenant Provisioning CLI Emulator Tests passed successfully!');
}

runTests().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
