import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { hashRegistrationToken } from '../functions/src/registrationTokenCore.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-gasstation-auth-broker';
const REGION = 'us-central1';
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FIRESTORE_EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';
const FUNCTIONS_EMULATOR = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';

const firestoreBase = `http://${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const authBase = `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`;
const functionsBase = `http://${FUNCTIONS_EMULATOR}/${PROJECT_ID}/${REGION}`;

const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { Timestamp, getFirestore } = requireFromFunctions('firebase-admin/firestore');

const adminApp = initializeApp({ projectId: PROJECT_ID }, 'tenant-provisioning-emulator-test');
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

async function callFunction(name, data = {}, idToken = null, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
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

async function firestoreDirectRequest(path, { method = 'GET', idToken, data } = {}) {
  const headers = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  if (data) headers['Content-Type'] = 'application/json';

  return fetch(`${firestoreBase}/${path}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
}

async function runTenantProvisioningEmulatorTests() {
  console.log('==========================================================');
  console.log('STARTING PHASE 4 AUTOMATED TENANT PROVISIONING EMULATOR TESTS');
  console.log('==========================================================');

  // Setup identities
  const platformAdminUid = 'test-plat-admin-prov';
  const newOwnerUid = 'test-owner-prov-1';
  const secondOwnerUid = 'test-owner-prov-2';
  const regularUserUid = 'test-user-prov-3';

  const platformAdminToken = await createAuthUser({
    uid: platformAdminUid,
    email: 'admin@platform-prov.test',
    password: 'Password123!',
  });

  const newOwnerToken = await createAuthUser({
    uid: newOwnerUid,
    email: 'owner1@tenant-prov.test',
    password: 'Password123!',
  });

  const secondOwnerToken = await createAuthUser({
    uid: secondOwnerUid,
    email: 'owner2@tenant-prov.test',
    password: 'Password123!',
  });

  const regularUserToken = await createAuthUser({
    uid: regularUserUid,
    email: 'user@regular-prov.test',
    password: 'Password123!',
  });

  // Seed Platform Admin in Firestore
  await adminDb.doc(`platformAdmins/${platformAdminUid}`).set({
    uid: platformAdminUid,
    status: 'ACTIVE',
    createdAt: Timestamp.now(),
  });

  console.log('Test identities and Platform Admin setup completed.');

  // Helper to generate a token via Platform Admin callable
  async function generateToken({ label = 'Test Token', category = 'FUEL_STATION', expiresInHours = 24 } = {}) {
    const res = await callFunction(
      'generateRegistrationToken',
      { label, businessCategoryHint: category, expiresInHours },
      platformAdminToken,
    );
    assert.equal(res.status, 200, 'generateRegistrationToken must succeed');
    assert.ok(res.body?.result?.token, 'Response must include raw token');
    assert.ok(res.body?.result?.tokenId, 'Response must include tokenId');
    return {
      rawToken: res.body.result.token,
      tokenId: res.body.result.tokenId,
      expiresAt: res.body.result.expiresAt,
    };
  }

  // ==========================================================
  // TEST 1: Happy Path Provisioning
  // ==========================================================
  console.log('\n--- Test 1: Happy Path Tenant Provisioning ---');
  const token1 = await generateToken({ label: 'Happy Path', category: 'FUEL_STATION' });

  const provRes1 = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: token1.rawToken,
      slug: 'eko-kallis-auto',
      displayName: 'EKO Kallis Automated',
      businessCategory: 'FUEL_STATION',
    },
    newOwnerToken,
  );

  assert.equal(provRes1.status, 200, 'Provisioning must succeed with 200');
  assert.equal(provRes1.body?.result?.success, true);
  assert.equal(provRes1.body?.result?.tenantId, 'eko-kallis-auto');
  assert.equal(provRes1.body?.result?.role, 'OWNER');
  assert.equal(provRes1.body?.result?.status, 'ACTIVE');
  assert.equal(provRes1.body?.result?.businessCategory, 'FUEL_STATION');

  // Verify Firestore state
  const tenantSnap = await adminDb.doc('tenants/eko-kallis-auto').get();
  assert.ok(tenantSnap.exists, 'Tenant document must exist');
  const tenantData = tenantSnap.data();
  assert.equal(tenantData.slug, 'eko-kallis-auto');
  assert.equal(tenantData.domain, 'eko-kallis-auto.shiftoryx.gr');
  assert.equal(tenantData.displayName, 'EKO Kallis Automated');
  assert.equal(tenantData.status, 'ACTIVE');
  assert.equal(tenantData.businessCategory, 'FUEL_STATION');
  assert.equal(tenantData.templateId, 'fuel-station-default');
  assert.equal(tenantData.templateVersion, '1.0.0');
  assert.equal(tenantData.customizationMode, 'STANDARD');
  assert.equal(tenantData.createdBy, newOwnerUid);

  const membershipSnap = await adminDb.doc(`tenantMemberships/${newOwnerUid}_eko-kallis-auto`).get();
  assert.ok(membershipSnap.exists, 'Membership document must exist');
  const membershipData = membershipSnap.data();
  assert.equal(membershipData.uid, newOwnerUid);
  assert.equal(membershipData.tenantId, 'eko-kallis-auto');
  assert.equal(membershipData.role, 'OWNER');
  assert.equal(membershipData.status, 'ACTIVE');
  assert.equal(membershipData.email, 'owner1@tenant-prov.test');

  const userSnap = await adminDb.doc(`users/${newOwnerUid}`).get();
  assert.ok(userSnap.exists, 'User mirror document must exist');
  const userData = userSnap.data();
  assert.equal(userData.memberships?.['eko-kallis-auto']?.role, 'OWNER');
  assert.equal(userData.memberships?.['eko-kallis-auto']?.status, 'ACTIVE');

  const settingsSnap = await adminDb.doc('tenants/eko-kallis-auto/settings/scheduler').get();
  assert.ok(settingsSnap.exists, 'Scheduler settings document must exist');
  assert.equal(settingsSnap.data()?.generatorRules?.weeklyRotationEnabled, true);

  const subSnap = await adminDb.doc('tenants/eko-kallis-auto/subscription/current').get();
  assert.ok(subSnap.exists, 'Subscription document must exist');
  assert.equal(subSnap.data()?.plan, 'TRIAL');
  assert.equal(subSnap.data()?.status, 'TRIALING');

  // Verify token is CONSUMED
  const tokenDocSnap = await adminDb.doc(`registrationTokens/${token1.tokenId}`).get();
  assert.equal(tokenDocSnap.data()?.status, 'CONSUMED');
  assert.equal(tokenDocSnap.data()?.consumedBy, newOwnerUid);

  console.log('Happy Path Tenant Provisioning passed.');

  // ==========================================================
  // TEST 2: Token Failure Cases (Fail-Closed)
  // ==========================================================
  console.log('\n--- Test 2: Token Failure Cases ---');

  // 2a. Malformed token
  const malformedRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: 'not_a_valid_token',
      slug: 'malformed-test',
      displayName: 'Malformed Test',
    },
    secondOwnerToken,
  );
  assert.notEqual(malformedRes.status, 200, 'Malformed token must fail');

  // 2b. Nonexistent token
  const nonexistentRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: 'stx_abcdef1234567890abcdef1234567890abcdef12345678',
      slug: 'nonexistent-test',
      displayName: 'Nonexistent Test',
    },
    secondOwnerToken,
  );
  assert.notEqual(nonexistentRes.status, 200, 'Nonexistent token must fail');

  // 2c. Already consumed token reuse
  const reuseRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: token1.rawToken,
      slug: 'reused-token-test',
      displayName: 'Reused Token Test',
    },
    secondOwnerToken,
  );
  assert.notEqual(reuseRes.status, 200, 'Reused token must fail');

  // 2d. Revoked token
  const tokenToRevoke = await generateToken({ label: 'To Revoke' });
  const revokeRes = await callFunction('revokeRegistrationToken', { tokenId: tokenToRevoke.tokenId }, platformAdminToken);
  assert.equal(revokeRes.status, 200);

  const revokedProvRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: tokenToRevoke.rawToken,
      slug: 'revoked-token-test',
      displayName: 'Revoked Token Test',
    },
    secondOwnerToken,
  );
  assert.notEqual(revokedProvRes.status, 200, 'Revoked token must fail');

  // Verify none of the failed tenants were created
  for (const failedSlug of ['malformed-test', 'nonexistent-test', 'reused-token-test', 'revoked-token-test']) {
    const checkSnap = await adminDb.doc(`tenants/${failedSlug}`).get();
    assert.equal(checkSnap.exists, false, `Tenant "${failedSlug}" must not have been created`);
  }

  console.log('Token Failure Cases passed.');

  // ==========================================================
  // TEST 3: Authorization & Platform Admin Overlap Protection
  // ==========================================================
  console.log('\n--- Test 3: Authorization & Platform Admin Overlap Protection ---');

  const tokenAdminOverlap = await generateToken({ label: 'Admin Overlap' });

  // 3a. Unauthenticated caller
  const unauthRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: tokenAdminOverlap.rawToken,
      slug: 'unauth-test',
      displayName: 'Unauth Test',
    },
    null,
  );
  assert.notEqual(unauthRes.status, 200, 'Unauthenticated provisioning must fail');

  // 3b. ACTIVE Platform Admin calling provisioning
  const adminOverlapRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: tokenAdminOverlap.rawToken,
      slug: 'admin-overlap-test',
      displayName: 'Admin Overlap Test',
    },
    platformAdminToken,
  );
  assert.notEqual(adminOverlapRes.status, 200, 'Active Platform Admin provisioning must be denied');

  // Verify Platform Admin overlap: 0 memberships created
  const adminMembershipSnap = await adminDb.doc(`tenantMemberships/${platformAdminUid}_admin-overlap-test`).get();
  assert.equal(adminMembershipSnap.exists, false, 'Platform Admin must not receive a tenant membership');

  // Verify token is still ACTIVE (not consumed by aborted attempt)
  const tokenOverlapSnap = await adminDb.doc(`registrationTokens/${tokenAdminOverlap.tokenId}`).get();
  assert.equal(tokenOverlapSnap.data()?.status, 'ACTIVE', 'Token must remain ACTIVE after failed attempt');

  console.log('Authorization & Overlap Protection tests passed.');

  // ==========================================================
  // TEST 4: Input Tampering & Collision Protections
  // ==========================================================
  console.log('\n--- Test 4: Input Tampering & Collision Protections ---');

  const tokenTamper = await generateToken({ label: 'Tamper Test' });

  // 4a. Forged role=ADMIN
  const roleAdminRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: tokenTamper.rawToken,
      slug: 'role-tamper-admin',
      displayName: 'Role Tamper Admin',
      role: 'ADMIN',
    },
    secondOwnerToken,
  );
  assert.notEqual(roleAdminRes.status, 200, 'Role tampering must be rejected');

  // 4b. Forged ownerUid
  const uidTamperRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: tokenTamper.rawToken,
      slug: 'uid-tamper-test',
      displayName: 'UID Tamper Test',
      ownerUid: 'another-user-uid',
    },
    secondOwnerToken,
  );
  assert.notEqual(uidTamperRes.status, 200, 'ownerUid tampering must be rejected');

  // 4c. Reserved slug
  const reservedSlugRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: tokenTamper.rawToken,
      slug: 'admin',
      displayName: 'Reserved Admin Tenant',
    },
    secondOwnerToken,
  );
  assert.notEqual(reservedSlugRes.status, 200, 'Reserved slug must be rejected');

  // 4d. Prohibited prefix slug
  const prohibitedSlugRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: tokenTamper.rawToken,
      slug: 'gas-station-demo',
      displayName: 'Gas Station Demo',
    },
    secondOwnerToken,
  );
  assert.notEqual(prohibitedSlugRes.status, 200, 'Prohibited slug prefix must be rejected');

  // 4e. Slug collision with existing tenant
  const slugCollisionRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    {
      token: tokenTamper.rawToken,
      slug: 'eko-kallis-auto', // already created in Test 1
      displayName: 'Duplicate Slug Test',
    },
    secondOwnerToken,
  );
  assert.notEqual(slugCollisionRes.status, 200, 'Existing slug collision must fail');

  console.log('Input Tampering & Collision Protections passed.');

  // ==========================================================
  // TEST 5: Concurrency Race Test (10 parallel attempts, 1 token)
  // ==========================================================
  console.log('\n--- Test 5: 10-Way Concurrency Race Test ---');
  const raceToken = await generateToken({ label: 'Race Test' });

  // Create 10 distinct users
  const raceUsers = [];
  for (let i = 0; i < 10; i++) {
    const uid = `race-user-${i}`;
    const token = await createAuthUser({
      uid,
      email: `race-${i}@test.com`,
      password: 'Password123!',
    });
    raceUsers.push({ uid, token });
  }

  // Fire 10 parallel provisioning requests using the SAME token
  const racePromises = raceUsers.map((u, i) =>
    callFunction(
      'provisionTenantFromRegistrationToken',
      {
        token: raceToken.rawToken,
        slug: `race-tenant-${i}`,
        displayName: `Race Tenant ${i}`,
      },
      u.token,
    ),
  );

  const raceResults = await Promise.all(racePromises);
  const successCount = raceResults.filter((r) => r.status === 200 && r.body?.result?.success === true).length;
  const failureCount = raceResults.filter((r) => r.status !== 200).length;

  console.log(`Concurrency Results: Successes=${successCount}, Failures=${failureCount}`);
  assert.equal(successCount, 1, 'Exactly 1 concurrent attempt must succeed');
  assert.equal(failureCount, 9, 'Exactly 9 concurrent attempts must fail');

  // Verify token is consumed exactly once
  const raceTokenSnap = await adminDb.doc(`registrationTokens/${raceToken.tokenId}`).get();
  assert.equal(raceTokenSnap.data()?.status, 'CONSUMED');

  // Verify exactly 1 tenant created among the 10 candidates
  let createdCount = 0;
  for (let i = 0; i < 10; i++) {
    const tSnap = await adminDb.doc(`tenants/race-tenant-${i}`).get();
    if (tSnap.exists) createdCount++;
  }
  assert.equal(createdCount, 1, 'Exactly 1 race tenant must exist in Firestore');

  console.log('10-Way Concurrency Race Test passed.');

  // ==========================================================
  // TEST 6: Direct Client Security Rules Enforcement
  // ==========================================================
  console.log('\n--- Test 6: Direct Client Security Rules Enforcement ---');

  // 6a. Direct client create to tenantMemberships -> MUST BE DENIED (403)
  const clientMembershipRes = await firestoreDirectRequest('tenantMemberships/hacked_membership', {
    method: 'PATCH',
    idToken: regularUserToken,
    data: {
      fields: {
        uid: { stringValue: regularUserUid },
        tenantId: { stringValue: 'hacked-tenant' },
        role: { stringValue: 'OWNER' },
        status: { stringValue: 'ACTIVE' },
      },
    },
  });
  assert.equal(clientMembershipRes.status, 403, 'Direct client membership creation must return 403');

  // 6b. Direct client create to tenants/{slug} -> MUST BE DENIED (403)
  const clientTenantRes = await firestoreDirectRequest('tenants/hacked-tenant', {
    method: 'PATCH',
    idToken: regularUserToken,
    data: {
      fields: {
        slug: { stringValue: 'hacked-tenant' },
        displayName: { stringValue: 'Hacked Tenant' },
        status: { stringValue: 'ACTIVE' },
      },
    },
  });
  assert.equal(clientTenantRes.status, 403, 'Direct client tenant creation must return 403');

  // 6c. Direct client read of registrationTokenLookups -> MUST BE DENIED (403)
  const clientLookupRes = await firestoreDirectRequest(`registrationTokenLookups/${hashRegistrationToken(token1.rawToken)}`, {
    method: 'GET',
    idToken: regularUserToken,
  });
  assert.equal(clientLookupRes.status, 403, 'Direct client token lookup read must return 403');

  // 6d. Direct client read of registrationTokens -> MUST BE DENIED (403)
  const clientTokenRes = await firestoreDirectRequest(`registrationTokens/${token1.tokenId}`, {
    method: 'GET',
    idToken: regularUserToken,
  });
  assert.equal(clientTokenRes.status, 403, 'Direct client registrationTokens read must return 403');

  // 6e. Direct client write to platformAuditLogs -> MUST BE DENIED (403)
  const clientAuditRes = await firestoreDirectRequest('platformAuditLogs/hacked_log', {
    method: 'PATCH',
    idToken: regularUserToken,
    data: {
      fields: {
        action: { stringValue: 'HACKED' },
      },
    },
  });
  assert.equal(clientAuditRes.status, 403, 'Direct client audit log write must return 403');

  console.log('Direct Client Security Rules Enforcement passed.');

  console.log('\n==========================================================');
  console.log('ALL PHASE 4 TENANT PROVISIONING EMULATOR TESTS PASSED SUCCESSFULLY!');
  console.log('==========================================================');
}

runTenantProvisioningEmulatorTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Tenant Provisioning Emulator Tests FAILED:', err);
    process.exit(1);
  });
