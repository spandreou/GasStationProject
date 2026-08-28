import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { hashRegistrationToken } from '../functions/src/registrationTokenCore.js';
import { VALID_BUSINESS_CATEGORIES } from '../functions/src/provisioningCore.js';

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
  console.log('STARTING PHASE 4 FINAL ARCHITECTURE CLEANUP EMULATOR TESTS');
  console.log('==========================================================');

  // Setup identities
  const platformAdminUid = 'test-plat-admin-prov';
  const platformAdminToken = await createAuthUser({
    uid: platformAdminUid,
    email: 'admin@platform-prov.test',
    password: 'Password123!',
  });

  // Seed Platform Admin in Firestore
  await adminDb.doc(`platformAdmins/${platformAdminUid}`).set({
    uid: platformAdminUid,
    status: 'ACTIVE',
    createdAt: Timestamp.now(),
  });

  console.log('Platform Admin setup completed.');

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
  // TEST 1: Happy Path Provisioning Across All Supported Categories
  // ==========================================================
  console.log('\n--- Test 1: Happy Path Provisioning Across All Categories ---');

  for (const category of VALID_BUSINESS_CATEGORIES) {
    const userUid = `user-cat-${category.toLowerCase().replace('_', '-')}`;
    const userEmail = `${userUid}@test.com`;
    const userToken = await createAuthUser({
      uid: userUid,
      email: userEmail,
      password: 'Password123!',
    });

    const token = await generateToken({ label: `Token for ${category}`, category });
    const slug = `slug-${category.toLowerCase().replace('_', '-')}`;
    const displayName = `Store ${category}`;

    const provRes = await callFunction(
      'provisionTenantFromRegistrationToken',
      {
        token: token.rawToken,
        slug,
        displayName,
        businessCategory: category,
      },
      userToken,
    );

    assert.equal(provRes.status, 200, `Provisioning for ${category} must succeed with 200`);
    assert.equal(provRes.body?.result?.success, true);
    assert.equal(provRes.body?.result?.tenantId, slug);
    assert.equal(provRes.body?.result?.role, 'OWNER');
    assert.equal(provRes.body?.result?.status, 'ACTIVE');
    assert.equal(provRes.body?.result?.businessCategory, category);
    // Explicitly assert synthetic template fields are NOT returned
    assert.equal('templateId' in provRes.body.result, false, 'Callable response must not return synthetic templateId');
    assert.equal('templateVersion' in provRes.body.result, false, 'Callable response must not return synthetic templateVersion');

    // 1. Verify tenants/{slug} document
    const tenantSnap = await adminDb.doc(`tenants/${slug}`).get();
    assert.ok(tenantSnap.exists, `Tenant "${slug}" must exist`);
    const tenantData = tenantSnap.data();
    assert.equal(tenantData.slug, slug);
    assert.equal(tenantData.domain, null, 'domain must be null pending Phase 6 cutover');
    assert.equal(tenantData.displayName, displayName);
    assert.equal(tenantData.status, 'ACTIVE');
    assert.equal(tenantData.businessCategory, category);
    // Explicitly assert synthetic template IDs are NOT persisted
    assert.equal('templateId' in tenantData, false, 'Tenant doc must not persist synthetic templateId');
    assert.equal('templateVersion' in tenantData, false, 'Tenant doc must not persist synthetic templateVersion');
    assert.equal(tenantData.customizationMode, 'STANDARD');
    assert.equal(tenantData.createdBy, userUid);

    // 2. Verify slugReservations/{slug} document
    const reservationSnap = await adminDb.doc(`slugReservations/${slug}`).get();
    assert.ok(reservationSnap.exists, `Slug reservation for "${slug}" must exist`);
    const reservationData = reservationSnap.data();
    assert.equal(reservationData.slug, slug);
    assert.equal(reservationData.tenantId, slug);
    assert.equal(reservationData.status, 'ACTIVE');
    assert.equal(reservationData.reservedBy, userUid);

    // 3. Verify tenantMemberships/{uid}_{slug} (PII email must be absent)
    const membershipSnap = await adminDb.doc(`tenantMemberships/${userUid}_${slug}`).get();
    assert.ok(membershipSnap.exists, `Membership for "${userUid}_${slug}" must exist`);
    const membershipData = membershipSnap.data();
    assert.equal(membershipData.uid, userUid);
    assert.equal(membershipData.tenantId, slug);
    assert.equal(membershipData.role, 'OWNER');
    assert.equal(membershipData.status, 'ACTIVE');
    assert.equal('email' in membershipData, false, 'tenantMemberships must not contain email PII');

    // 4. Verify users/{uid} mirror & normalized email from Auth token
    const userSnap = await adminDb.doc(`users/${userUid}`).get();
    assert.ok(userSnap.exists, `User mirror for "${userUid}" must exist`);
    const userData = userSnap.data();
    assert.equal(userData.memberships?.[slug]?.role, 'OWNER');
    assert.equal(userData.memberships?.[slug]?.status, 'ACTIVE');
    assert.equal(userData.email, userEmail.toLowerCase(), 'users/{uid} stores normalized Auth token email');

    // 5. Verify settings and subscription
    const settingsSnap = await adminDb.doc(`tenants/${slug}/settings/scheduler`).get();
    assert.ok(settingsSnap.exists);
    const subSnap = await adminDb.doc(`tenants/${slug}/subscription/current`).get();
    assert.ok(subSnap.exists);
    assert.equal(subSnap.data()?.plan, 'TRIAL');
    assert.equal(subSnap.data()?.status, 'TRIALING');

    // 6. Verify token is CONSUMED
    const tokenSnap = await adminDb.doc(`registrationTokens/${token.tokenId}`).get();
    assert.equal(tokenSnap.data()?.status, 'CONSUMED');
    assert.equal(tokenSnap.data()?.consumedBy, userUid);

    // 7. Verify platformAuditLogs
    const auditQuery = await adminDb.collection('platformAuditLogs').where('tenantId', '==', slug).get();
    assert.equal(auditQuery.empty, false);
    const auditData = auditQuery.docs[0].data();
    assert.equal(auditData.action, 'TENANT_PROVISIONED');
    assert.equal(auditData.businessCategory, category);
    assert.equal('templateId' in auditData, false, 'Audit log must not contain templateId');
  }

  console.log('Happy Path across all categories passed (No synthetic template IDs, No membership email PII).');

  // ==========================================================
  // TEST 2: Registration Token Fail-Closed Matrix
  // ==========================================================
  console.log('\n--- Test 2: Registration Token Fail-Closed Matrix ---');

  const testUserToken2 = await createAuthUser({
    uid: 'test-failclosed-user-1',
    email: 'failclosed1@test.com',
    password: 'Password123!',
  });

  // 2a. Malformed token syntax
  const malformedRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: 'invalid_syntax', slug: 'fail-malformed', displayName: 'Fail' },
    testUserToken2,
  );
  assert.notEqual(malformedRes.status, 200, 'Malformed token must fail');

  // 2b. Nonexistent token
  const nonexistentRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: 'stx_abcdef1234567890abcdef1234567890abcdef12345678', slug: 'fail-nonexistent', displayName: 'Fail' },
    testUserToken2,
  );
  assert.notEqual(nonexistentRes.status, 200, 'Nonexistent token must fail');

  // 2c. Real expired token (seeded with expiresAt in past)
  const expiredRaw = 'stx_expiredtoken1234567890123456789012345678901';
  const expiredHash = hashRegistrationToken(expiredRaw);
  const expiredTokenId = 'rtok_expired00000000000000000000000';
  await adminDb.doc(`registrationTokenLookups/${expiredHash}`).set({
    tokenId: expiredTokenId,
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() - 10000),
  });
  await adminDb.doc(`registrationTokens/${expiredTokenId}`).set({
    tokenId: expiredTokenId,
    status: 'ACTIVE',
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() - 10000),
    createdBy: platformAdminUid,
  });

  const expiredRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: expiredRaw, slug: 'fail-expired', displayName: 'Fail Expired' },
    testUserToken2,
  );
  assert.notEqual(expiredRes.status, 200, 'Expired token must fail');

  // 2d. Real revoked token
  const revokedToken = await generateToken({ label: 'To Revoke' });
  await callFunction('revokeRegistrationToken', { tokenId: revokedToken.tokenId }, platformAdminToken);
  const revokedRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: revokedToken.rawToken, slug: 'fail-revoked', displayName: 'Fail Revoked' },
    testUserToken2,
  );
  assert.notEqual(revokedRes.status, 200, 'Revoked token must fail');

  // 2e. Real consumed token
  const consumedToken = await generateToken({ label: 'To Consume' });
  const firstProv = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: consumedToken.rawToken, slug: 'slug-consumed-first', displayName: 'First' },
    testUserToken2,
  );
  assert.equal(firstProv.status, 200);

  const anotherUserToken = await createAuthUser({
    uid: 'another-user-for-consumed',
    email: 'another@test.com',
    password: 'Password123!',
  });
  const secondProv = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: consumedToken.rawToken, slug: 'slug-consumed-second', displayName: 'Second' },
    anotherUserToken,
  );
  assert.notEqual(secondProv.status, 200, 'Already-consumed token must fail');

  // 2f. Active token with missing canonical expiresAt (null)
  const missingExpiryRaw = 'stx_missingexpiry123456789012345678901234567890';
  const missingExpiryHash = hashRegistrationToken(missingExpiryRaw);
  const missingExpiryId = 'rtok_missingexp000000000000000000000';
  await adminDb.doc(`registrationTokenLookups/${missingExpiryHash}`).set({
    tokenId: missingExpiryId,
    createdAt: Timestamp.now(),
  });
  await adminDb.doc(`registrationTokens/${missingExpiryId}`).set({
    tokenId: missingExpiryId,
    status: 'ACTIVE',
    expiresAt: null,
    createdBy: platformAdminUid,
  });

  const missingExpRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: missingExpiryRaw, slug: 'fail-missing-exp', displayName: 'Fail' },
    anotherUserToken,
  );
  assert.notEqual(missingExpRes.status, 200, 'Token with missing expiresAt must fail');

  // 2g. Active token with malformed canonical expiresAt
  const malformedExpiryRaw = 'stx_malformedexpiry123456789012345678901234567890';
  const malformedExpiryHash = hashRegistrationToken(malformedExpiryRaw);
  const malformedExpiryId = 'rtok_malformedexp00000000000000000000';
  await adminDb.doc(`registrationTokenLookups/${malformedExpiryHash}`).set({
    tokenId: malformedExpiryId,
    createdAt: Timestamp.now(),
  });
  await adminDb.doc(`registrationTokens/${malformedExpiryId}`).set({
    tokenId: malformedExpiryId,
    status: 'ACTIVE',
    expiresAt: 'not-a-valid-timestamp',
    createdBy: platformAdminUid,
  });

  const malformedExpRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: malformedExpiryRaw, slug: 'fail-malformed-exp', displayName: 'Fail' },
    anotherUserToken,
  );
  assert.notEqual(malformedExpRes.status, 200, 'Token with malformed expiresAt must fail');

  // Verify none of the failed tenants or reservations were created
  for (const failedSlug of ['fail-malformed', 'fail-nonexistent', 'fail-expired', 'fail-revoked', 'slug-consumed-second', 'fail-missing-exp', 'fail-malformed-exp']) {
    const tSnap = await adminDb.doc(`tenants/${failedSlug}`).get();
    const rSnap = await adminDb.doc(`slugReservations/${failedSlug}`).get();
    assert.equal(tSnap.exists, false, `Tenant "${failedSlug}" must not exist`);
    assert.equal(rSnap.exists, false, `Slug reservation "${failedSlug}" must not exist`);
  }

  console.log('Registration Token Fail-Closed Matrix passed.');

  // ==========================================================
  // TEST 3: Existing Membership Policy Matrix (Canonical + Mirror)
  // ==========================================================
  console.log('\n--- Test 3: Existing Membership Policy Matrix ---');

  // 3a. User with existing ACTIVE OWNER in another tenant
  const activeOwnerUid = 'user-has-active-owner';
  const activeOwnerToken = await createAuthUser({ uid: activeOwnerUid, email: 'activeowner@test.com', password: 'Password123!' });
  await adminDb.doc(`tenantMemberships/${activeOwnerUid}_existing-store-a`).set({
    uid: activeOwnerUid,
    tenantId: 'existing-store-a',
    role: 'OWNER',
    status: 'ACTIVE',
  });
  await adminDb.doc(`users/${activeOwnerUid}`).set({
    uid: activeOwnerUid,
    memberships: { 'existing-store-a': { role: 'OWNER', status: 'ACTIVE' } },
  });

  const tokActiveOwner = await generateToken({ label: 'Active Owner Attempt' });
  const activeOwnerRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokActiveOwner.rawToken, slug: 'new-store-active-owner', displayName: 'New Store' },
    activeOwnerToken,
  );
  assert.notEqual(activeOwnerRes.status, 200, 'User with existing ACTIVE OWNER must be rejected');

  // 3b. User with existing REVOKED OWNER in another tenant
  const revokedOwnerUid = 'user-has-revoked-owner';
  const revokedOwnerToken = await createAuthUser({ uid: revokedOwnerUid, email: 'revokedowner@test.com', password: 'Password123!' });
  await adminDb.doc(`tenantMemberships/${revokedOwnerUid}_existing-store-b`).set({
    uid: revokedOwnerUid,
    tenantId: 'existing-store-b',
    role: 'OWNER',
    status: 'REVOKED',
  });

  const tokRevokedOwner = await generateToken({ label: 'Revoked Owner Attempt' });
  const revokedOwnerRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokRevokedOwner.rawToken, slug: 'new-store-revoked-owner', displayName: 'New Store' },
    revokedOwnerToken,
  );
  assert.notEqual(revokedOwnerRes.status, 200, 'User with existing REVOKED membership must be rejected');

  // 3c. User with legacy ADMIN membership
  const legacyAdminUid = 'user-has-legacy-admin';
  const legacyAdminToken = await createAuthUser({ uid: legacyAdminUid, email: 'legacyadmin@test.com', password: 'Password123!' });
  await adminDb.doc(`tenantMemberships/${legacyAdminUid}_existing-store-c`).set({
    uid: legacyAdminUid,
    tenantId: 'existing-store-c',
    role: 'ADMIN',
    status: 'ACTIVE',
  });

  const tokLegacyAdmin = await generateToken({ label: 'Legacy Admin Attempt' });
  const legacyAdminRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokLegacyAdmin.rawToken, slug: 'new-store-legacy-admin', displayName: 'New Store' },
    legacyAdminToken,
  );
  assert.notEqual(legacyAdminRes.status, 200, 'User with legacy ADMIN membership must be rejected');

  // 3d. User with legacy MANAGER membership
  const legacyManagerUid = 'user-has-legacy-manager';
  const legacyManagerToken = await createAuthUser({ uid: legacyManagerUid, email: 'legacymanager@test.com', password: 'Password123!' });
  await adminDb.doc(`tenantMemberships/${legacyManagerUid}_existing-store-d`).set({
    uid: legacyManagerUid,
    tenantId: 'existing-store-d',
    role: 'MANAGER',
    status: 'ACTIVE',
  });

  const tokLegacyManager = await generateToken({ label: 'Legacy Manager Attempt' });
  const legacyManagerRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokLegacyManager.rawToken, slug: 'new-store-legacy-manager', displayName: 'New Store' },
    legacyManagerToken,
  );
  assert.notEqual(legacyManagerRes.status, 200, 'User with legacy MANAGER membership must be rejected');

  // 3e. User with unknown role
  const unknownRoleUid = 'user-has-unknown-role';
  const unknownRoleToken = await createAuthUser({ uid: unknownRoleUid, email: 'unknownrole@test.com', password: 'Password123!' });
  await adminDb.doc(`tenantMemberships/${unknownRoleUid}_existing-store-e`).set({
    uid: unknownRoleUid,
    tenantId: 'existing-store-e',
    role: 'CUSTOM_ROLE',
    status: 'ACTIVE',
  });

  const tokUnknownRole = await generateToken({ label: 'Unknown Role Attempt' });
  const unknownRoleRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokUnknownRole.rawToken, slug: 'new-store-unknown-role', displayName: 'New Store' },
    unknownRoleToken,
  );
  assert.notEqual(unknownRoleRes.status, 200, 'User with unknown role membership must be rejected');

  // 3f. Mirror-only membership in users/{uid}.memberships
  const mirrorOnlyUid = 'user-has-mirror-only';
  const mirrorOnlyToken = await createAuthUser({ uid: mirrorOnlyUid, email: 'mirroronly@test.com', password: 'Password123!' });
  await adminDb.doc(`users/${mirrorOnlyUid}`).set({
    uid: mirrorOnlyUid,
    memberships: { 'mirror-store': { role: 'OWNER', status: 'ACTIVE' } },
  });

  const tokMirrorOnly = await generateToken({ label: 'Mirror Only Attempt' });
  const mirrorOnlyRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokMirrorOnly.rawToken, slug: 'new-store-mirror-only', displayName: 'New Store' },
    mirrorOnlyToken,
  );
  assert.notEqual(mirrorOnlyRes.status, 200, 'User with mirror-only membership must be rejected');

  // 3g. Malformed Canonical Membership — Missing UID field
  const missingUidCaller = 'user-canonical-missing-uid';
  const missingUidToken = await createAuthUser({ uid: missingUidCaller, email: 'missinguid@test.com', password: 'Password123!' });
  await adminDb.doc(`tenantMemberships/${missingUidCaller}_existing-store-g`).set({
    tenantId: 'existing-store-g',
    role: 'OWNER',
    status: 'ACTIVE',
    // uid is deliberately omitted
  });
  const tokMissingUid = await generateToken({ label: 'Missing UID Doc ID Attempt' });
  const missingUidRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokMissingUid.rawToken, slug: 'new-store-missing-uid', displayName: 'New Store' },
    missingUidToken,
  );
  assert.notEqual(missingUidRes.status, 200, 'User with canonical doc ID matching prefix (missing uid field) must be rejected');

  // 3h. Malformed Canonical Membership — Wrong UID field
  const wrongUidCaller = 'user-canonical-wrong-uid';
  const wrongUidToken = await createAuthUser({ uid: wrongUidCaller, email: 'wronguid@test.com', password: 'Password123!' });
  await adminDb.doc(`tenantMemberships/${wrongUidCaller}_existing-store-h`).set({
    uid: 'different-user-uid',
    tenantId: 'existing-store-h',
    role: 'OWNER',
    status: 'ACTIVE',
  });
  const tokWrongUid = await generateToken({ label: 'Wrong UID Doc ID Attempt' });
  const wrongUidRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokWrongUid.rawToken, slug: 'new-store-wrong-uid', displayName: 'New Store' },
    wrongUidToken,
  );
  assert.notEqual(wrongUidRes.status, 200, 'User with canonical doc ID matching prefix (wrong internal uid) must be rejected');

  // 3i. Field-Only Legacy Membership (Non-canonical doc ID, valid uid field)
  const legacyFieldCaller = 'user-legacy-field-only';
  const legacyFieldToken = await createAuthUser({ uid: legacyFieldCaller, email: 'legacyfield@test.com', password: 'Password123!' });
  await adminDb.doc('tenantMemberships/legacy-doc-id-random-12345').set({
    uid: legacyFieldCaller,
    tenantId: 'existing-store-i',
    role: 'OWNER',
    status: 'ACTIVE',
  });
  const tokLegacyField = await generateToken({ label: 'Legacy Field Attempt' });
  const legacyFieldRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokLegacyField.rawToken, slug: 'new-store-legacy-field', displayName: 'New Store' },
    legacyFieldToken,
  );
  assert.notEqual(legacyFieldRes.status, 200, 'User with legacy non-canonical doc ID but matching uid field must be rejected');

  // 3j. Malformed Mirror String
  const malformedMirrorStrUid = 'user-mirror-str';
  const malformedMirrorStrToken = await createAuthUser({ uid: malformedMirrorStrUid, email: 'mirrorstr@test.com', password: 'Password123!' });
  await adminDb.doc(`users/${malformedMirrorStrUid}`).set({
    uid: malformedMirrorStrUid,
    memberships: 'corrupted-string-value',
  });
  const tokMirrorStr = await generateToken({ label: 'Mirror String Attempt' });
  const mirrorStrRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokMirrorStr.rawToken, slug: 'new-store-mirror-str', displayName: 'New Store' },
    malformedMirrorStrToken,
  );
  assert.notEqual(mirrorStrRes.status, 200, 'User with string memberships mirror must be rejected');

  // 3k. Malformed Mirror Array
  const malformedMirrorArrUid = 'user-mirror-arr';
  const malformedMirrorArrToken = await createAuthUser({ uid: malformedMirrorArrUid, email: 'mirrorarr@test.com', password: 'Password123!' });
  await adminDb.doc(`users/${malformedMirrorArrUid}`).set({
    uid: malformedMirrorArrUid,
    memberships: ['store-a', 'store-b'],
  });
  const tokMirrorArr = await generateToken({ label: 'Mirror Array Attempt' });
  const mirrorArrRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokMirrorArr.rawToken, slug: 'new-store-mirror-arr', displayName: 'New Store' },
    malformedMirrorArrToken,
  );
  assert.notEqual(mirrorArrRes.status, 200, 'User with array memberships mirror must be rejected');

  // 3l. Malformed Mirror Number
  const malformedMirrorNumUid = 'user-mirror-num';
  const malformedMirrorNumToken = await createAuthUser({ uid: malformedMirrorNumUid, email: 'mirrornum@test.com', password: 'Password123!' });
  await adminDb.doc(`users/${malformedMirrorNumUid}`).set({
    uid: malformedMirrorNumUid,
    memberships: 12345,
  });
  const tokMirrorNum = await generateToken({ label: 'Mirror Number Attempt' });
  const mirrorNumRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokMirrorNum.rawToken, slug: 'new-store-mirror-num', displayName: 'New Store' },
    malformedMirrorNumToken,
  );
  assert.notEqual(mirrorNumRes.status, 200, 'User with number memberships mirror must be rejected');

  // 3m. Malformed Mirror Boolean
  const malformedMirrorBoolUid = 'user-mirror-bool';
  const malformedMirrorBoolToken = await createAuthUser({ uid: malformedMirrorBoolUid, email: 'mirrorbool@test.com', password: 'Password123!' });
  await adminDb.doc(`users/${malformedMirrorBoolUid}`).set({
    uid: malformedMirrorBoolUid,
    memberships: true,
  });
  const tokMirrorBool = await generateToken({ label: 'Mirror Boolean Attempt' });
  const mirrorBoolRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokMirrorBool.rawToken, slug: 'new-store-mirror-bool', displayName: 'New Store' },
    malformedMirrorBoolToken,
  );
  assert.notEqual(mirrorBoolRes.status, 200, 'User with boolean memberships mirror must be rejected');

  // 3n. Malformed Mirror Null
  const malformedMirrorNullUid = 'user-mirror-null';
  const malformedMirrorNullToken = await createAuthUser({ uid: malformedMirrorNullUid, email: 'mirrornull@test.com', password: 'Password123!' });
  await adminDb.doc(`users/${malformedMirrorNullUid}`).set({
    uid: malformedMirrorNullUid,
    memberships: null,
  });
  const tokMirrorNull = await generateToken({ label: 'Mirror Null Attempt' });
  const mirrorNullRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokMirrorNull.rawToken, slug: 'new-store-mirror-null', displayName: 'New Store' },
    malformedMirrorNullToken,
  );
  assert.notEqual(mirrorNullRes.status, 200, 'User with null memberships mirror must be rejected');

  // 3o. Empty Mirror Object ({}) - Must be eligible and succeed!
  const emptyMirrorUid = 'user-mirror-empty-obj';
  const emptyMirrorToken = await createAuthUser({ uid: emptyMirrorUid, email: 'emptyobj@test.com', password: 'Password123!' });
  await adminDb.doc(`users/${emptyMirrorUid}`).set({
    uid: emptyMirrorUid,
    email: 'emptyobj@test.com',
    memberships: {},
  });
  const tokEmptyMirror = await generateToken({ label: 'Mirror Empty Obj Attempt' });
  const emptyMirrorRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokEmptyMirror.rawToken, slug: 'new-store-empty-obj', displayName: 'Empty Obj Store' },
    emptyMirrorToken,
  );
  assert.equal(emptyMirrorRes.status, 200, 'User with plain empty object memberships mirror must be eligible');
  assert.equal(emptyMirrorRes.body?.result?.success, true);

  // Verify tokens remain ACTIVE for all rejected tests
  const rejectedTokens = [
    tokActiveOwner,
    tokRevokedOwner,
    tokLegacyAdmin,
    tokLegacyManager,
    tokUnknownRole,
    tokMirrorOnly,
    tokMissingUid,
    tokWrongUid,
    tokLegacyField,
    tokMirrorStr,
    tokMirrorArr,
    tokMirrorNum,
    tokMirrorBool,
    tokMirrorNull,
  ];

  for (const t of rejectedTokens) {
    const tSnap = await adminDb.doc(`registrationTokens/${t.tokenId}`).get();
    assert.equal(tSnap.data()?.status, 'ACTIVE', 'Token must remain ACTIVE after rejected membership check');
  }

  // Verify no orphaned tenant was created for failed attempts
  for (const failedSlug of [
    'new-store-active-owner',
    'new-store-revoked-owner',
    'new-store-legacy-admin',
    'new-store-legacy-manager',
    'new-store-unknown-role',
    'new-store-mirror-only',
    'new-store-missing-uid',
    'new-store-wrong-uid',
    'new-store-legacy-field',
    'new-store-mirror-str',
    'new-store-mirror-arr',
    'new-store-mirror-num',
    'new-store-mirror-bool',
    'new-store-mirror-null',
  ]) {
    const tSnap = await adminDb.doc(`tenants/${failedSlug}`).get();
    const rSnap = await adminDb.doc(`slugReservations/${failedSlug}`).get();
    assert.equal(tSnap.exists, false, `Tenant "${failedSlug}" must not exist`);
    assert.equal(rSnap.exists, false, `Slug reservation "${failedSlug}" must not exist`);
  }

  console.log('Existing & Malformed Membership Policy Matrix passed.');

  // ==========================================================
  // TEST 4: Slug Reservation & Collision Matrix
  // ==========================================================
  console.log('\n--- Test 4: Slug Reservation & Collision Matrix ---');

  const collisionUserToken = await createAuthUser({
    uid: 'user-collision-tester',
    email: 'collision@test.com',
    password: 'Password123!',
  });

  // 4a. Existing tenant without reservation -> collision rejected
  await adminDb.doc('tenants/manual-orphan-tenant').set({
    slug: 'manual-orphan-tenant',
    displayName: 'Manual Orphan',
    status: 'ACTIVE',
  });
  const tokCollA = await generateToken({ label: 'Coll A' });
  const collARes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokCollA.rawToken, slug: 'manual-orphan-tenant', displayName: 'Test' },
    collisionUserToken,
  );
  assert.notEqual(collARes.status, 200, 'Existing tenant without reservation must fail');

  // 4b. Existing reservation without tenant -> collision rejected
  await adminDb.doc('slugReservations/pre-reserved-slug').set({
    slug: 'pre-reserved-slug',
    tenantId: 'pre-reserved-slug',
    status: 'ACTIVE',
    reservedBy: 'some-other-user',
  });
  const tokCollB = await generateToken({ label: 'Coll B' });
  const collBRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: tokCollB.rawToken, slug: 'pre-reserved-slug', displayName: 'Test' },
    collisionUserToken,
  );
  assert.notEqual(collBRes.status, 200, 'Existing slug reservation must fail');

  // 4c. Race test: 2 different valid tokens, 2 different users, same requested slug
  const raceUser1Token = await createAuthUser({ uid: 'race-slug-user-1', email: 'raceslug1@test.com', password: 'Password123!' });
  const raceUser2Token = await createAuthUser({ uid: 'race-slug-user-2', email: 'raceslug2@test.com', password: 'Password123!' });
  const tokRace1 = await generateToken({ label: 'Race 1' });
  const tokRace2 = await generateToken({ label: 'Race 2' });

  const [raceRes1, raceRes2] = await Promise.all([
    callFunction('provisionTenantFromRegistrationToken', { token: tokRace1.rawToken, slug: 'target-same-slug', displayName: 'Race 1' }, raceUser1Token),
    callFunction('provisionTenantFromRegistrationToken', { token: tokRace2.rawToken, slug: 'target-same-slug', displayName: 'Race 2' }, raceUser2Token),
  ]);

  const raceSuccessCount = [raceRes1, raceRes2].filter((r) => r.status === 200).length;
  const raceFailureCount = [raceRes1, raceRes2].filter((r) => r.status !== 200).length;
  assert.equal(raceSuccessCount, 1, 'Exactly 1 request must succeed for contested slug');
  assert.equal(raceFailureCount, 1, 'Exactly 1 request must fail for contested slug');

  // Verify exactly 1 tenant and 1 reservation created
  const targetTenantSnap = await adminDb.doc('tenants/target-same-slug').get();
  assert.ok(targetTenantSnap.exists);
  const targetResSnap = await adminDb.doc('slugReservations/target-same-slug').get();
  assert.ok(targetResSnap.exists);

  console.log('Slug Reservation & Collision Matrix passed.');

  // ==========================================================
  // TEST 5: 10-Way Concurrency Race Test (Same Token)
  // ==========================================================
  console.log('\n--- Test 5: 10-Way Concurrency Race Test ---');
  const sharedRaceToken = await generateToken({ label: 'Shared Token Race' });

  const tenUsers = [];
  for (let i = 0; i < 10; i++) {
    const uid = `shared-race-user-${i}`;
    const token = await createAuthUser({ uid, email: `${uid}@test.com`, password: 'Password123!' });
    tenUsers.push({ uid, token, slug: `shared-race-store-${i}` });
  }

  const parallelPromises = tenUsers.map((u) =>
    callFunction(
      'provisionTenantFromRegistrationToken',
      { token: sharedRaceToken.rawToken, slug: u.slug, displayName: `Store ${u.slug}` },
      u.token,
    ),
  );

  const parallelResults = await Promise.all(parallelPromises);
  const pSuccess = parallelResults.filter((r) => r.status === 200).length;
  const pFailure = parallelResults.filter((r) => r.status !== 200).length;

  console.log(`10-Way Parallel Concurrency Results: Successes=${pSuccess}, Failures=${pFailure}`);
  assert.equal(pSuccess, 1, 'Exactly 1 attempt must succeed');
  assert.equal(pFailure, 9, 'Exactly 9 attempts must fail');

  // Verify token status is CONSUMED
  const consumedCheck = await adminDb.doc(`registrationTokens/${sharedRaceToken.tokenId}`).get();
  assert.equal(consumedCheck.data()?.status, 'CONSUMED');

  // Verify exactly 1 tenant and 1 reservation created across all 10 candidates
  let tenantsCreated = 0;
  let reservationsCreated = 0;
  for (const u of tenUsers) {
    const tSnap = await adminDb.doc(`tenants/${u.slug}`).get();
    if (tSnap.exists) tenantsCreated++;
    const rSnap = await adminDb.doc(`slugReservations/${u.slug}`).get();
    if (rSnap.exists) reservationsCreated++;
  }
  assert.equal(tenantsCreated, 1, 'Exactly 1 tenant must be created');
  assert.equal(reservationsCreated, 1, 'Exactly 1 slug reservation must be created');

  console.log('10-Way Concurrency Race Test passed.');

  // ==========================================================
  // TEST 6: Exact Retry Contract Test
  // ==========================================================
  console.log('\n--- Test 6: Retry Contract Test ---');
  const retryUser = await createAuthUser({ uid: 'retry-user-test', email: 'retry@test.com', password: 'Password123!' });
  const retryToken = await generateToken({ label: 'Retry Token' });

  const firstCall = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: retryToken.rawToken, slug: 'store-retry-test', displayName: 'Retry Store' },
    retryUser,
  );
  assert.equal(firstCall.status, 200, 'First attempt must succeed');

  // Repeat exact same call
  const repeatCall = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: retryToken.rawToken, slug: 'store-retry-test', displayName: 'Retry Store' },
    retryUser,
  );
  assert.notEqual(repeatCall.status, 200, 'Repeated exact call must fail safely');

  console.log('Retry Contract Test passed.');

  // ==========================================================
  // TEST 7: Direct Client Security Rules Enforcement
  // ==========================================================
  console.log('\n--- Test 7: Direct Client Security Rules Enforcement ---');
  const clientTesterToken = await createAuthUser({ uid: 'client-rule-tester', email: 'client@test.com', password: 'Password123!' });

  // 7a. Direct client read slugReservations -> 403
  const clientReadRes = await firestoreDirectRequest('slugReservations/store-retry-test', {
    method: 'GET',
    idToken: clientTesterToken,
  });
  assert.equal(clientReadRes.status, 403, 'Direct client read of slugReservations must return 403');

  // 7b. Direct client write slugReservations -> 403
  const clientWriteRes = await firestoreDirectRequest('slugReservations/hacked-reservation', {
    method: 'PATCH',
    idToken: clientTesterToken,
    data: { fields: { slug: { stringValue: 'hacked-reservation' } } },
  });
  assert.equal(clientWriteRes.status, 403, 'Direct client write of slugReservations must return 403');

  // 7c. Direct client write tenants -> 403
  const clientTenantRes = await firestoreDirectRequest('tenants/hacked-tenant', {
    method: 'PATCH',
    idToken: clientTesterToken,
    data: { fields: { slug: { stringValue: 'hacked-tenant' } } },
  });
  assert.equal(clientTenantRes.status, 403, 'Direct client write of tenants must return 403');

  // 7d. Direct client write tenantMemberships -> 403
  const clientMembershipRes = await firestoreDirectRequest('tenantMemberships/hacked_membership', {
    method: 'PATCH',
    idToken: clientTesterToken,
    data: { fields: { role: { stringValue: 'OWNER' } } },
  });
  assert.equal(clientMembershipRes.status, 403, 'Direct client write of tenantMemberships must return 403');

  // 7e. Direct client read registrationTokens -> 403
  const clientTokenRes = await firestoreDirectRequest(`registrationTokens/${retryToken.tokenId}`, {
    method: 'GET',
    idToken: clientTesterToken,
  });
  assert.equal(clientTokenRes.status, 403, 'Direct client read of registrationTokens must return 403');

  // 7f. Direct client write platformAuditLogs -> 403
  const clientAuditRes = await firestoreDirectRequest('platformAuditLogs/hacked_log', {
    method: 'PATCH',
    idToken: clientTesterToken,
    data: { fields: { action: { stringValue: 'HACK' } } },
  });
  assert.equal(clientAuditRes.status, 403, 'Direct client write of platformAuditLogs must return 403');

  console.log('Direct Client Security Rules Enforcement passed.');

  // ==========================================================
  // TEST 8: Error Redaction Test
  // ==========================================================
  console.log('\n--- Test 8: Error Redaction Test ---');
  // Pass an invalid token that causes failure, verify response body doesn't leak paths or stack traces
  const badRes = await callFunction(
    'provisionTenantFromRegistrationToken',
    { token: 'stx_badtoken1234567890123456789012345678901234567', slug: 'bad-store', displayName: 'Bad Store' },
    clientTesterToken,
  );
  assert.notEqual(badRes.status, 200);
  const errorJsonStr = JSON.stringify(badRes.body);
  assert.equal(errorJsonStr.includes('registrationTokenLookups'), false, 'Error response must not expose internal lookup path');
  assert.equal(errorJsonStr.includes('registrationTokens'), false, 'Error response must not expose internal token path');
  assert.equal(errorJsonStr.includes('stack'), false, 'Error response must not expose stack traces');

  console.log('Error Redaction Test passed.');

  console.log('\n==========================================================');
  console.log('ALL PHASE 4 FINAL ARCHITECTURE CLEANUP EMULATOR TESTS PASSED 100%');
  console.log('==========================================================');
}

runTenantProvisioningEmulatorTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Tenant Provisioning Emulator Tests FAILED:', err);
    process.exit(1);
  });
