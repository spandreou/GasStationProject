import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const PROJECT_ID = 'demo-gasstation-auth-broker';
const BUCKET = `${PROJECT_ID}.appspot.com`;
const FIRESTORE_EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const STORAGE_EMULATOR = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';

const authBase = `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`;
const firestoreClearUrl = `http://${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const storageBase = `http://${STORAGE_EMULATOR}/v0/b/${BUCKET}/o`;

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const adminApp = initializeApp({ projectId: PROJECT_ID }, 'storage-rules-test');
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

async function clearEmulatorDb() {
  const res = await fetch(firestoreClearUrl, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Failed to clear Firestore emulator: ${res.statusText}`);
  }
}

async function setAdminDoc(pathStr, data) {
  await db.doc(pathStr).set(data);
}

async function uploadStorageObject(objectPath, { idToken, contentType = 'application/pdf', data = Buffer.from('%PDF-1.4 mock pdf content') } = {}) {
  const headers = { 'Content-Type': contentType };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  const url = `${storageBase}?name=${encodeURIComponent(objectPath)}&uploadType=media`;
  return fetch(url, {
    method: 'POST',
    headers,
    body: data,
  });
}

async function readStorageObject(objectPath, { idToken } = {}) {
  const headers = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  const url = `${storageBase}/${encodeURIComponent(objectPath)}?alt=media`;
  return fetch(url, {
    method: 'GET',
    headers,
  });
}

async function runTests() {
  console.log('Starting Storage Rules Emulator Tests...');

  await clearEmulatorDb();

  // Create Auth users
  const superAdmin = await createAuthUser({ uid: 'super-admin-uid', email: 'super@example.test' });
  const bpOwner = await createAuthUser({ uid: 'bp-owner-uid', email: 'bp-owner@example.test' });
  const bpAdmin = await createAuthUser({ uid: 'bp-admin-uid', email: 'bp-admin@example.test' });
  const bpManager = await createAuthUser({ uid: 'bp-manager-uid', email: 'bp-manager@example.test' });
  const bpSuspendedOwner = await createAuthUser({ uid: 'bp-suspended-uid', email: 'bp-suspended@example.test' });
  const ekoOwner = await createAuthUser({ uid: 'eko-owner-uid', email: 'eko-owner@example.test' });

  // Seed Firestore membership records
  await setAdminDoc('platformAdmins/super-admin-uid', {
    uid: 'super-admin-uid',
    role: 'SUPER_ADMIN',
    status: 'ACTIVE',
  });

  await setAdminDoc('tenantMemberships/bp-owner-uid_bp-kallis', {
    uid: 'bp-owner-uid',
    tenantId: 'bp-kallis',
    role: 'OWNER',
    status: 'ACTIVE',
  });

  await setAdminDoc('tenantMemberships/bp-admin-uid_bp-kallis', {
    uid: 'bp-admin-uid',
    tenantId: 'bp-kallis',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  await setAdminDoc('tenantMemberships/bp-manager-uid_bp-kallis', {
    uid: 'bp-manager-uid',
    tenantId: 'bp-kallis',
    role: 'MANAGER',
    status: 'ACTIVE',
  });

  await setAdminDoc('tenantMemberships/bp-suspended-uid_bp-kallis', {
    uid: 'bp-suspended-uid',
    tenantId: 'bp-kallis',
    role: 'OWNER',
    status: 'SUSPENDED',
  });

  // Synthetic overlap: super-admin has a synthetic active OWNER membership
  await setAdminDoc('tenantMemberships/super-admin-uid_bp-kallis', {
    uid: 'super-admin-uid',
    tenantId: 'bp-kallis',
    role: 'OWNER',
    status: 'ACTIVE',
  });

  await setAdminDoc('tenantMemberships/eko-owner-uid_eko-example', {
    uid: 'eko-owner-uid',
    tenantId: 'eko-example',
    role: 'OWNER',
    status: 'ACTIVE',
  });

  const validBpArchive = 'tenants/bp-kallis/monthly_schedule_pdfs/2026-08/program_month_2026-08.pdf';
  const validEkoArchive = 'tenants/eko-example/monthly_schedule_pdfs/2026-08/program_month_2026-08.pdf';

  // 1. OWNER ACTIVE (Platform Admin = NO) -> ALLOWED to write and read archive PDF
  const ownerUpload = await uploadStorageObject(validBpArchive, { idToken: bpOwner.idToken });
  assert.equal(ownerUpload.status, 200, `BP OWNER must be allowed to upload valid archive PDF (got ${ownerUpload.status})`);

  const ownerRead = await readStorageObject(validBpArchive, { idToken: bpOwner.idToken });
  assert.equal(ownerRead.status, 200, `BP OWNER must be allowed to read valid archive PDF (got ${ownerRead.status})`);

  // 2. ADMIN ACTIVE -> DENIED (OWNER-only runtime contract)
  const adminUpload = await uploadStorageObject(validBpArchive, { idToken: bpAdmin.idToken });
  assert.equal(adminUpload.status, 403, `Legacy ADMIN must be denied storage upload (got ${adminUpload.status})`);

  const adminRead = await readStorageObject(validBpArchive, { idToken: bpAdmin.idToken });
  assert.equal(adminRead.status, 403, `Legacy ADMIN must be denied storage read (got ${adminRead.status})`);

  // 3. MANAGER ACTIVE -> DENIED (OWNER-only runtime contract)
  const managerUpload = await uploadStorageObject(validBpArchive, { idToken: bpManager.idToken });
  assert.equal(managerUpload.status, 403, `Legacy MANAGER must be denied storage upload (got ${managerUpload.status})`);

  const managerRead = await readStorageObject(validBpArchive, { idToken: bpManager.idToken });
  assert.equal(managerRead.status, 403, `Legacy MANAGER must be denied storage read (got ${managerRead.status})`);

  // 4. OWNER INACTIVE (SUSPENDED) -> DENIED
  const suspendedUpload = await uploadStorageObject(validBpArchive, { idToken: bpSuspendedOwner.idToken });
  assert.equal(suspendedUpload.status, 403, `Suspended OWNER must be denied storage upload (got ${suspendedUpload.status})`);

  const suspendedRead = await readStorageObject(validBpArchive, { idToken: bpSuspendedOwner.idToken });
  assert.equal(suspendedRead.status, 403, `Suspended OWNER must be denied storage read (got ${suspendedRead.status})`);

  // 5. Platform Admin with synthetic OWNER membership -> DENIED (Hard Separation)
  const superAdminUpload = await uploadStorageObject(validBpArchive, { idToken: superAdmin.idToken });
  assert.equal(superAdminUpload.status, 403, `Platform Admin with synthetic membership must be denied storage upload (got ${superAdminUpload.status})`);

  const superAdminRead = await readStorageObject(validBpArchive, { idToken: superAdmin.idToken });
  assert.equal(superAdminRead.status, 403, `Platform Admin with synthetic membership must be denied storage read (got ${superAdminRead.status})`);

  // 6. Cross-tenant isolation: EKO OWNER cannot access BP Kallis storage
  const crossTenantUpload = await uploadStorageObject(validBpArchive, { idToken: ekoOwner.idToken });
  assert.equal(crossTenantUpload.status, 403, `EKO OWNER must be denied BP Kallis storage upload (got ${crossTenantUpload.status})`);

  const crossTenantRead = await readStorageObject(validBpArchive, { idToken: ekoOwner.idToken });
  assert.equal(crossTenantRead.status, 403, `EKO OWNER must be denied BP Kallis storage read (got ${crossTenantRead.status})`);

  // 7. EKO OWNER can access EKO storage
  const ekoUpload = await uploadStorageObject(validEkoArchive, { idToken: ekoOwner.idToken });
  assert.equal(ekoUpload.status, 200, `EKO OWNER must be allowed to upload EKO archive PDF (got ${ekoUpload.status})`);

  const ekoRead = await readStorageObject(validEkoArchive, { idToken: ekoOwner.idToken });
  assert.equal(ekoRead.status, 200, `EKO OWNER must be allowed to read EKO archive PDF (got ${ekoRead.status})`);

  // 8. Anonymous access -> DENIED
  const anonUpload = await uploadStorageObject(validBpArchive);
  assert.equal(anonUpload.status, 403, `Anonymous client must be denied storage upload (got ${anonUpload.status})`);

  const anonRead = await readStorageObject(validBpArchive);
  assert.equal(anonRead.status, 403, `Anonymous client must be denied storage read (got ${anonRead.status})`);

  // 9. Non-archive path -> DENIED
  const invalidPathUpload = await uploadStorageObject('tenants/bp-kallis/other_folder/test.pdf', { idToken: bpOwner.idToken });
  assert.equal(invalidPathUpload.status, 403, `Upload to non-archive path must be denied (got ${invalidPathUpload.status})`);

  // 10. Non-PDF content-type on archive path -> DENIED
  const invalidContentTypeUpload = await uploadStorageObject(validBpArchive, {
    idToken: bpOwner.idToken,
    contentType: 'text/plain',
    data: Buffer.from('plain text'),
  });
  assert.equal(invalidContentTypeUpload.status, 403, `Non-PDF content type upload must be denied (got ${invalidContentTypeUpload.status})`);

  // 11. Invalid filename pattern -> DENIED
  const invalidFilenameUpload = await uploadStorageObject('tenants/bp-kallis/monthly_schedule_pdfs/2026-08/wrong_name.pdf', {
    idToken: bpOwner.idToken,
  });
  assert.equal(invalidFilenameUpload.status, 403, `Invalid archive filename pattern must be denied (got ${invalidFilenameUpload.status})`);

  console.log('All Storage Rules Emulator Tests passed successfully!');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Storage rules emulator test failed: ${err.message}`);
    process.exit(1);
  });
