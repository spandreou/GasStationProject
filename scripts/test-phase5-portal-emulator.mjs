import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-gasstation-auth-broker';
const REGION = 'us-central1';
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FUNCTIONS_EMULATOR = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';
const FIRESTORE_EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';

const authBase = `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`;
const functionsBase = `http://${FUNCTIONS_EMULATOR}/${PROJECT_ID}/${REGION}`;
const firestoreBase = `http://${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

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
  console.log('--- STARTING PHASE 5 PORTAL EMULATOR INTEGRATION & FAILURE MATRIX TESTS ---');

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

  const testSlug = `p5-res-${Date.now().toString(36).slice(-6)}`;
  const callerUid = `user-p5-${Date.now()}`;
  const callerEmail = `owner_${Date.now()}@example.com`;
  const callerToken = await createAuthUser({ uid: callerUid, email: callerEmail, password: 'Password123!' });

  const provRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: activeToken,
      slug: testSlug,
      displayName: 'Phase 5 Test Restaurant',
      businessCategory: 'RESTAURANT',
    },
    callerToken,
  );
  assert.equal(provRes.status, 200, `Provisioning should succeed: ${JSON.stringify(provRes.body)}`);
  assert.equal(provRes.body?.result?.success, true);
  assert.equal(provRes.body?.result?.tenantId, testSlug);
  assert.equal(provRes.body?.result?.role, 'OWNER');
  assert.equal(provRes.body?.result?.status, 'ACTIVE');
  assert.equal(provRes.body?.result?.businessCategory, 'RESTAURANT');

  // TEST 4: Verify Firestore State
  console.log('5. Verifying Firestore state...');
  const tenantSnap = await adminDb.doc(`tenants/${testSlug}`).get();
  assert.equal(tenantSnap.exists, true);
  assert.equal(tenantSnap.data().businessCategory, 'RESTAURANT');
  assert.equal(tenantSnap.data().domain, null, 'Tenant domain must be null pending Phase 6');
  assert.equal(tenantSnap.data().createdBy, callerUid);

  const memSnap = await adminDb.doc(`tenantMemberships/${callerUid}_${testSlug}`).get();
  assert.equal(memSnap.exists, true);
  assert.equal(memSnap.data().role, 'OWNER');
  assert.equal(memSnap.data().status, 'ACTIVE');
  assert.equal('email' in memSnap.data(), false, 'Membership document must not contain email');

  const slugSnap = await adminDb.doc(`slugReservations/${testSlug}`).get();
  assert.equal(slugSnap.exists, true);
  assert.equal(slugSnap.data().tenantId, testSlug);

  const subSnap = await adminDb.doc(`tenants/${testSlug}/subscription/current`).get();
  assert.equal(subSnap.exists, true);
  assert.equal(subSnap.data().plan, 'TRIAL');
  assert.equal(subSnap.data().status, 'TRIALING');
  const trialEndsAtMs = subSnap.data().trialEndsAt.toMillis();
  const nowMs = Date.now();
  const sevenDaysMs = 7 * 24 * 3600 * 1000;
  assert.ok(trialEndsAtMs > nowMs + sevenDaysMs - 60000, 'Trial must be configured for 7 days');
  assert.ok(trialEndsAtMs < nowMs + sevenDaysMs + 60000, 'Trial must not exceed 7 days');

  const tokSnap = await adminDb.doc(`registrationTokens/${activeTokenId}`).get();
  assert.equal(tokSnap.data().status, 'CONSUMED');
  assert.equal(tokSnap.data().consumedBy, callerUid);
  console.log('✓ Firestore state and 7-day trial verified.');

  // TEST 5: Consumed Token Validation
  console.log('6. Validating consumed token via callable...');
  const consumedValRes = await callFunction('validateRegistrationToken', { token: activeToken });
  assert.equal(consumedValRes.status, 200);
  assert.equal(consumedValRes.body?.result?.valid, false);
  console.log('✓ Consumed token validation correctly returned valid: false.');

  // TEST 6: Failure Matrix
  console.log('7. Testing provisioning failure matrix...');

  // 7a. Consumed token retry
  const failConsumedRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: activeToken,
      slug: `diff-slug-${Date.now().toString(36).slice(-4)}`,
      displayName: 'Another Store',
      businessCategory: 'CAFE',
    },
    callerToken,
  );
  assert.notEqual(failConsumedRes.status, 200, 'Consumed token must fail');

  // 7b. Existing membership
  const freshTokenRes = await callFunction(
    'generateRegistrationToken',
    { expiresInHours: 24, label: 'Fresh Token' },
    platformAdminToken,
  );
  const freshToken = freshTokenRes.body?.result?.token;

  const failExistingMemRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: freshToken,
      slug: `another-slug-${Date.now().toString(36).slice(-4)}`,
      displayName: 'Second Store Attempt',
      businessCategory: 'OTHER',
    },
    callerToken, // caller already owns testSlug
  );
  assert.notEqual(failExistingMemRes.status, 200, 'User with existing membership must fail');

  // 7c. Platform Admin overlap
  const failPlatformAdminRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: freshToken,
      slug: `admin-tenant-${Date.now().toString(36).slice(-4)}`,
      displayName: 'Admin Store Attempt',
      businessCategory: 'OTHER',
    },
    platformAdminToken, // platform admin
  );
  assert.notEqual(failPlatformAdminRes.status, 200, 'Platform admin must not receive tenant');

  // 7d. Slug collision
  const freshUserUid = `fresh-user-${Date.now()}`;
  const freshUserToken = await createAuthUser({ uid: freshUserUid, email: `fresh_${Date.now()}@example.com`, password: 'Password123!' });
  const failSlugCollisionRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: freshToken,
      slug: testSlug, // already taken
      displayName: 'Collision Store',
      businessCategory: 'OTHER',
    },
    freshUserToken,
  );
  assert.notEqual(failSlugCollisionRes.status, 200, 'Taken slug must fail');
  console.log('✓ Failure matrix verified.');

  // TEST 7: Platform Admin Repository Method direct Firestore check
  console.log('8. Testing Platform Admin Firestore document resolution...');
  const adminDoc = await adminDb.doc(`platformAdmins/${platformAdminUid}`).get();
  assert.equal(adminDoc.exists, true);
  assert.equal(adminDoc.data()?.status, 'ACTIVE');

  const regularDoc = await adminDb.doc(`platformAdmins/${callerUid}`).get();
  assert.equal(regularDoc.exists, false);
  console.log('✓ Platform Admin Firestore isolation verified.');

  // TEST 8: Auth Ticket Creation for New Owner
  console.log('9. Testing createAuthTicket broker callable for new owner...');
  const ticketRes = await callFunction(
    'createAuthTicket',
    {
      tenantId: testSlug,
      returnTo: `https://${testSlug}.homelabshare.gr/app`,
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
