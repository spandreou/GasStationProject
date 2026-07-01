import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const PROJECT_ID = 'demo-gasstation-auth-broker';
const FIRESTORE_EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

const firestoreBase = `http://${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const authBase = `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`;
const emulatorClearUrl = `http://${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const adminApp = initializeApp({ projectId: PROJECT_ID }, 'platform-admin-test');
const db = getFirestore(adminApp);
const auth = getAuth(adminApp);

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body?.error?.message || body?.error?.status || response.statusText;
    throw new Error(`Request failed ${response.status}: ${message}`);
  }
  return body;
}

async function createAuthUser({ uid, email }) {
  const password = 'password123';
  await auth.createUser({
    uid,
    email,
    password,
    emailVerified: true,
  });

  const signInRes = await requestJson(`${authBase}/accounts:signInWithPassword?key=fake-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  return { uid, idToken: signInRes.idToken };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, val] of Object.entries(obj)) {
    fields[key] = toFirestoreValue(val);
  }
  return { fields };
}

function toFirestoreValue(value) {
  if (value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
  if (value && typeof value === 'object') return { mapValue: toFirestoreFields(value) };
  throw new Error('Unsupported Firestore test value.');
}

async function firestoreRequest(pathStr, { method = 'GET', idToken, data } = {}) {
  const headers = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  if (data) headers['Content-Type'] = 'application/json';

  return fetch(`${firestoreBase}/${pathStr}`, {
    method,
    headers,
    body: data ? JSON.stringify(toFirestoreFields(data)) : undefined,
  });
}

async function expectFirestoreStatus(pathStr, options, expectedStatus, message) {
  const response = await firestoreRequest(pathStr, options);
  assert.equal(response.status, expectedStatus, `${message} (Expected ${expectedStatus}, got ${response.status})`);
}

function runBootstrapScript(args) {
  return new Promise((resolve) => {
    const scriptPath = path.resolve('scripts/bootstrap-platform-admin.mjs');
    const child = fork(scriptPath, args, {
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: FIRESTORE_EMULATOR,
      },
      stdio: 'ignore',
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

async function setAdminDoc(pathStr, data) {
  await db.doc(pathStr).set(data);
}

async function runTests() {
  console.log('Starting Platform Super-Admin Decoupling Emulator Tests...');

  // Setup emulator state
  await clearEmulatorDb();

  // Create Auth users
  const superAdmin = await createAuthUser({ uid: 'super-admin-uid', email: 'super@example.test' });
  const suspendedAdmin = await createAuthUser({ uid: 'suspended-admin-uid', email: 'suspended@example.test' });
  const bpAdmin = await createAuthUser({ uid: 'bp-admin-uid', email: 'bp-admin@example.test' });
  const ekoAdmin = await createAuthUser({ uid: 'eko-admin-uid', email: 'eko-admin@example.test' });

  // 1. Bootstrap script validates and writes active super admin
  const code = await runBootstrapScript([
    '--uid', 'super-admin-uid',
    '--write',
    '--emulator'
  ]);
  assert.equal(code, 0, 'Bootstrap script must exit with 0');

  // Verify bootsrapped document properties via admin connection
  const superSnap = await db.doc('platformAdmins/super-admin-uid').get();
  assert.ok(superSnap.exists, 'platformAdmins/super-admin-uid must exist');
  assert.equal(superSnap.data().role, 'SUPER_ADMIN');
  assert.equal(superSnap.data().status, 'ACTIVE');

  // Seed remaining database states
  await setAdminDoc('platformAdmins/suspended-admin-uid', {
    uid: 'suspended-admin-uid',
    role: 'SUPER_ADMIN',
    status: 'SUSPENDED',
  });

  await setAdminDoc('tenants/bp-kallis', {
    slug: 'bp-kallis',
    displayName: 'BP Kallis',
  });
  await setAdminDoc('tenantMemberships/bp-admin-uid_bp-kallis', {
    uid: 'bp-admin-uid',
    tenantId: 'bp-kallis',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  await setAdminDoc('tenants/eko-example', {
    slug: 'eko-example',
    displayName: 'EKO Example',
  });
  await setAdminDoc('tenantMemberships/eko-admin-uid_eko-example', {
    uid: 'eko-admin-uid',
    tenantId: 'eko-example',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  // --- Rule Testing ---

  // A. Platform Admin Rights
  // 1. Super admin can create new tenants
  await expectFirestoreStatus(
    'tenants/shell-example',
    { method: 'PATCH', idToken: superAdmin.idToken, data: { slug: 'shell-example', displayName: 'Shell' } },
    200,
    'Active platform admin must write tenant metadata'
  );

  // 2. Super admin can write user profiles
  await expectFirestoreStatus(
    'users/external-uid',
    { method: 'PATCH', idToken: superAdmin.idToken, data: { uid: 'external-uid', status: 'ACTIVE' } },
    200,
    'Active platform admin must write user profiles'
  );

  // B. Platform Admin Lockdown Blocks
  // 1. BP Admin (tenant-only) cannot create new tenants
  await expectFirestoreStatus(
    'tenants/shell-fail',
    { method: 'PATCH', idToken: bpAdmin.idToken, data: { slug: 'shell-fail', displayName: 'Shell' } },
    403,
    'Tenant admin must not write tenant metadata'
  );

  // 2. BP Admin cannot write other user profiles
  await expectFirestoreStatus(
    'users/external-uid',
    { method: 'PATCH', idToken: bpAdmin.idToken, data: { uid: 'external-uid', status: 'REVOKED' } },
    403,
    'Tenant admin must not write other user profiles'
  );

  // 3. Suspended platform admin is blocked
  await expectFirestoreStatus(
    'tenants/suspended-fail',
    { method: 'PATCH', idToken: suspendedAdmin.idToken, data: { slug: 'suspended-fail', displayName: 'Fail' } },
    403,
    'Suspended platform admin must not perform platform writes'
  );

  // C. platformAdmins Access Rights
  // 1. User can read own platformAdmins doc
  await expectFirestoreStatus(
    'platformAdmins/super-admin-uid',
    { idToken: superAdmin.idToken },
    200,
    'Platform admin must read own platform admin doc'
  );

  // 2. User cannot read another user's platformAdmins doc
  await expectFirestoreStatus(
    'platformAdmins/suspended-admin-uid',
    { idToken: superAdmin.idToken },
    403,
    'Platform admin must not read other platform admin docs'
  );

  // 3. Regular users cannot read platformAdmins docs
  await expectFirestoreStatus(
    'platformAdmins/super-admin-uid',
    { idToken: bpAdmin.idToken },
    403,
    'Regular user must not read platform admin docs'
  );

  // 4. Clients cannot write to platformAdmins collection
  await expectFirestoreStatus(
    'platformAdmins/super-admin-uid',
    { method: 'PATCH', idToken: superAdmin.idToken, data: { status: 'ACTIVE' } },
    403,
    'Clients must never write to platformAdmins collection'
  );

  // D. Tenant-Scoped Separation remains operational
  // 1. BP Admin can access BP data
  await setAdminDoc('tenants/bp-kallis/employees/emp-bp', { fullName: 'BP Employee' });
  await expectFirestoreStatus(
    'tenants/bp-kallis/employees/emp-bp',
    { idToken: bpAdmin.idToken },
    200,
    'BP admin must read BP employees'
  );

  // 2. BP Admin cannot access EKO data
  await setAdminDoc('tenants/eko-example/employees/emp-eko', { fullName: 'EKO Employee' });
  await expectFirestoreStatus(
    'tenants/eko-example/employees/emp-eko',
    { idToken: bpAdmin.idToken },
    403,
    'BP admin must not read EKO employees'
  );

  // 3. EKO Admin can access EKO data
  await expectFirestoreStatus(
    'tenants/eko-example/employees/emp-eko',
    { idToken: ekoAdmin.idToken },
    200,
    'EKO admin must read EKO employees'
  );

  // 4. Client cannot write tenantMemberships
  await expectFirestoreStatus(
    'tenantMemberships/hacker-uid_bp-kallis',
    { method: 'PATCH', idToken: bpAdmin.idToken, data: { role: 'OWNER' } },
    403,
    'Clients must not write tenantMemberships'
  );

  console.log('All Platform Super-Admin Decoupling Emulator Tests passed successfully!');
}

runTests().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
