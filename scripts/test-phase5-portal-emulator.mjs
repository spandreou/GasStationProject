import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-gasstation-auth-broker';
const REGION = 'us-central1';
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FUNCTIONS_EMULATOR = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';

const authBase = `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`;
const functionsBase = `http://${FUNCTIONS_EMULATOR}/${PROJECT_ID}/${REGION}`;

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { Timestamp, getFirestore } = requireFromFunctions('firebase-admin/firestore');

const adminApp = initializeApp({ projectId: PROJECT_ID }, 'phase5-portal-test');
const adminDb = getFirestore(adminApp);
const adminAuth = getAuth(adminApp);

async function createAuthUser({ uid, email, password }) {
  try {
    await adminAuth.deleteUser(uid);
  } catch {}
  await adminAuth.createUser({ uid, email, password });

  const res = await fetch(`${authBase}/accounts:signInWithPassword?key=fake-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  return data.idToken;
}

async function callFunction(name, data = {}, idToken = null, origin = 'https://gas.homelabshare.gr') {
  const headers = {
    'Content-Type': 'application/json',
    Origin: origin,
  };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  const res = await fetch(`${functionsBase}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { rawText: text };
  }
  return { status: res.status, ok: res.ok, body: json };
}

async function runTests() {
  console.log('--- STARTING PHASE 5 PORTAL EMULATOR INTEGRATION TESTS ---');

  // Seed Platform Admin
  const platformAdminUid = 'admin-phase5-test';
  const platformAdminToken = await createAuthUser({
    uid: platformAdminUid,
    email: 'admin@portal.test',
    password: 'Password123!',
  });
  await adminDb.doc(`platformAdmins/${platformAdminUid}`).set({
    status: 'ACTIVE',
    createdAt: Timestamp.now(),
  });

  // TEST 1: Generate Token via Callable and Validate via Callable
  console.log('1. Generating registration token via callable...');
  const genRes = await callFunction(
    'generateRegistrationToken',
    {
      expiresInHours: 24,
      label: 'Phase 5 Test Token',
      businessCategoryHint: 'CAFE',
    },
    platformAdminToken,
  );
  assert.equal(genRes.status, 200, `Token generation should succeed: ${JSON.stringify(genRes.body)}`);
  const rawToken = genRes.body?.result?.token;
  const tokenId = genRes.body?.result?.tokenId;
  assert.ok(rawToken, 'rawToken must be returned');

  console.log('2. Validating registration token via validateRegistrationToken callable...');
  const valRes = await callFunction('validateRegistrationToken', { token: rawToken });
  assert.equal(valRes.status, 200);
  assert.equal(valRes.body?.result?.valid, true);
  assert.equal(valRes.body?.result?.businessCategoryHint, 'CAFE');
  console.log('✓ Token validation successful.');

  // TEST 2: Revoke token and verify validation failure
  console.log('3. Testing revoked token validation failure...');
  await callFunction('revokeRegistrationToken', { tokenId }, platformAdminToken);
  const revValRes = await callFunction('validateRegistrationToken', { token: rawToken });
  assert.equal(revValRes.status, 200);
  assert.equal(revValRes.body?.result?.valid, false);
  console.log('✓ Revoked token validation correctly returned valid: false.');

  // TEST 3: Create User & Provision Tenant
  console.log('4. Creating regular user and provisioning new tenant...');
  const activeGenRes = await callFunction(
    'generateRegistrationToken',
    {
      expiresInHours: 24,
      label: 'Phase 5 Active Token',
      businessCategoryHint: 'RESTAURANT',
    },
    platformAdminToken,
  );
  const activeToken = activeGenRes.body?.result?.token;
  const activeTokenId = activeGenRes.body?.result?.tokenId;

  const callerUid = `user-p5-${Date.now()}`;
  const callerEmail = `owner_${Date.now()}@example.com`;
  const callerToken = await createAuthUser({ uid: callerUid, email: callerEmail, password: 'Password123!' });

  const provRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: activeToken,
      slug: `store-${callerUid}`,
      displayName: 'Phase 5 Test Restaurant',
      businessCategory: 'RESTAURANT',
    },
    callerToken,
  );
  assert.equal(provRes.status, 200, `Provisioning should succeed: ${JSON.stringify(provRes.body)}`);
  assert.equal(provRes.body?.result?.success, true);
  assert.equal(provRes.body?.result?.tenantId, `store-${callerUid}`);
  assert.equal(provRes.body?.result?.role, 'OWNER');
  assert.equal(provRes.body?.result?.status, 'ACTIVE');
  assert.equal(provRes.body?.result?.businessCategory, 'RESTAURANT');

  // TEST 4: Verify Firestore State
  console.log('5. Verifying Firestore state...');
  const tenantSnap = await adminDb.doc(`tenants/store-${callerUid}`).get();
  assert.equal(tenantSnap.exists, true);
  assert.equal(tenantSnap.data().businessCategory, 'RESTAURANT');
  assert.equal(tenantSnap.data().domain, null);
  assert.equal(tenantSnap.data().createdBy, callerUid);

  const memSnap = await adminDb.doc(`tenantMemberships/${callerUid}_store-${callerUid}`).get();
  assert.equal(memSnap.exists, true);
  assert.equal(memSnap.data().role, 'OWNER');
  assert.equal(memSnap.data().status, 'ACTIVE');
  assert.equal('email' in memSnap.data(), false, 'Membership document must not contain email');

  const slugSnap = await adminDb.doc(`slugReservations/store-${callerUid}`).get();
  assert.equal(slugSnap.exists, true);
  assert.equal(slugSnap.data().tenantId, `store-${callerUid}`);

  const tokSnap = await adminDb.doc(`registrationTokens/${activeTokenId}`).get();
  assert.equal(tokSnap.data().status, 'CONSUMED');
  assert.equal(tokSnap.data().consumedBy, callerUid);
  console.log('✓ Firestore state verified.');

  // TEST 5: Consumed Token Validation
  console.log('6. Validating consumed token via callable...');
  const consumedValRes = await callFunction('validateRegistrationToken', { token: activeToken });
  assert.equal(consumedValRes.status, 200);
  assert.equal(consumedValRes.body?.result?.valid, false);
  console.log('✓ Consumed token validation correctly returned valid: false.');

  // TEST 6: Auth Ticket Creation for New Owner
  console.log('7. Testing createAuthTicket broker callable for new owner...');
  const ticketRes = await callFunction(
    'createAuthTicket',
    {
      tenantId: `store-${callerUid}`,
      returnTo: `https://store-${callerUid}.homelabshare.gr/app`,
    },
    callerToken,
  );
  assert.equal(ticketRes.status, 200, `Auth ticket creation should succeed: ${JSON.stringify(ticketRes.body)}`);
  assert.ok(ticketRes.body?.result?.redirectUrl, 'redirectUrl must be present in response');
  console.log('✓ Auth ticket redirect URL generated successfully.');

  console.log('--- ALL PHASE 5 PORTAL EMULATOR INTEGRATION TESTS PASSED ---');
}

runTests().catch((err) => {
  console.error('Phase 5 Emulator Integration Test FAILED:', err);
  process.exit(1);
});
