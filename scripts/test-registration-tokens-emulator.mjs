import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  hashRegistrationToken,
} from '../functions/src/registrationTokenCore.js';
import {
  consumeRegistrationToken,
} from '../functions/src/registrationTokenService.js';

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

const adminApp = initializeApp({ projectId: PROJECT_ID }, 'reg-token-emulator-test');
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

async function callFunction(name, data = {}, idToken = null) {
  const headers = { 'Content-Type': 'application/json' };
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

async function runRegistrationTokenEmulatorTests() {
  console.log('==========================================================');
  console.log('STARTING REGISTRATION TOKEN EMULATOR INTEGRATION TESTS');
  console.log('==========================================================');

  // Setup test identities
  const platformAdminUid = 'test-platform-admin-reg-token';
  const inactiveAdminUid = 'test-inactive-admin-reg-token';
  const tenantOwnerUid = 'test-tenant-owner-reg-token';
  const regularUserUid = 'test-regular-user-reg-token';

  const platformAdminToken = await createAuthUser({
    uid: platformAdminUid,
    email: 'admin@platform.test',
    password: 'Password123!',
  });
  const inactiveAdminToken = await createAuthUser({
    uid: inactiveAdminUid,
    email: 'inactive@platform.test',
    password: 'Password123!',
  });
  const tenantOwnerToken = await createAuthUser({
    uid: tenantOwnerUid,
    email: 'owner@tenant.test',
    password: 'Password123!',
  });
  const regularUserToken = await createAuthUser({
    uid: regularUserUid,
    email: 'user@regular.test',
    password: 'Password123!',
  });

  // Seed Firestore roles
  await adminDb.doc(`platformAdmins/${platformAdminUid}`).set({
    status: 'ACTIVE',
    createdAt: Timestamp.now(),
  });
  await adminDb.doc(`platformAdmins/${inactiveAdminUid}`).set({
    status: 'REVOKED',
    createdAt: Timestamp.now(),
  });
  await adminDb.doc(`tenantMemberships/${tenantOwnerUid}_bp-kallis`).set({
    uid: tenantOwnerUid,
    tenantId: 'bp-kallis',
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: Timestamp.now(),
  });

  console.log('✓ Test identities and roles seeded.');

  // --------------------------------------------------------------------------
  // TEST 1: UNAUTHORIZED TOKEN GENERATION
  // --------------------------------------------------------------------------
  console.log('\n--- 1. UNAUTHORIZED TOKEN GENERATION CHECKS ---');

  // Anonymous
  const anonGen = await callFunction('generateRegistrationToken', { expiresInHours: 24 });
  assert.equal(anonGen.status, 401, 'Anonymous generation must be 401/unauthenticated');

  // Regular user (no platform admin)
  const regUserGen = await callFunction('generateRegistrationToken', { expiresInHours: 24 }, regularUserToken);
  assert.equal(regUserGen.status, 403, 'Regular user generation must be 403/permission-denied');

  // Inactive platform admin
  const inactiveGen = await callFunction('generateRegistrationToken', { expiresInHours: 24 }, inactiveAdminToken);
  assert.equal(inactiveGen.status, 403, 'Inactive platform admin generation must be 403/permission-denied');

  // Tenant OWNER (non-platform admin)
  const ownerGen = await callFunction('generateRegistrationToken', { expiresInHours: 24 }, tenantOwnerToken);
  assert.equal(ownerGen.status, 403, 'Tenant OWNER generation must be 403/permission-denied');

  console.log('✓ Anonymous, regular user, inactive admin, and tenant OWNER are properly denied.');

  // --------------------------------------------------------------------------
  // TEST 2: AUTHORIZED TOKEN GENERATION & INTEGRITY
  // --------------------------------------------------------------------------
  console.log('\n--- 2. AUTHORIZED TOKEN GENERATION & INTEGRITY ---');

  const genRes = await callFunction(
    'generateRegistrationToken',
    {
      expiresInHours: 72,
      label: 'BP Kallis Store 2',
      businessCategoryHint: 'FUEL_STATION',
    },
    platformAdminToken,
  );

  assert.equal(genRes.status, 200, `Generation failed: ${JSON.stringify(genRes.body)}`);
  assert.equal(genRes.body?.result?.success, true);
  const rawToken = genRes.body?.result?.token;
  const tokenId = genRes.body?.result?.tokenId;

  assert.ok(rawToken && rawToken.startsWith('stx_'), 'Raw token must be returned once on creation');
  assert.ok(tokenId && tokenId.length === 64, 'Token ID must be 64-char SHA256 hex string');

  // Verify Firestore document integrity
  const docSnap = await adminDb.doc(`registrationTokens/${tokenId}`).get();
  assert.equal(docSnap.exists, true, 'Token document must exist in Firestore');
  const tokenDoc = docSnap.data();

  assert.equal(tokenDoc.status, 'ACTIVE', 'Status must be ACTIVE');
  assert.equal(tokenDoc.tokenHash, tokenId, 'tokenHash must match document ID');
  assert.equal(tokenDoc.createdBy, platformAdminUid, 'createdBy must record admin UID');
  assert.equal(tokenDoc.label, 'BP Kallis Store 2');
  assert.equal(tokenDoc.businessCategoryHint, 'FUEL_STATION');

  // CRITICAL SECURITY ASSERTION: Raw token must NEVER be stored in Firestore!
  assert.equal(
    JSON.stringify(tokenDoc).includes(rawToken),
    false,
    'CRITICAL SECURITY: Raw token string must NOT appear anywhere in the Firestore document!',
  );

  // Check audit log
  const auditSnap = await adminDb
    .collection('platformAuditLogs')
    .where('action', '==', 'REGISTRATION_TOKEN_GENERATED')
    .where('tokenId', '==', tokenId)
    .get();
  assert.equal(auditSnap.empty, false, 'Platform audit log must be recorded');
  const auditDoc = auditSnap.docs[0].data();
  assert.equal(auditDoc.actorUid, platformAdminUid);
  assert.equal(
    JSON.stringify(auditDoc).includes(rawToken),
    false,
    'Raw token must NOT appear in audit logs',
  );

  console.log('✓ Token generated, stored securely as SHA-256 hash, raw token not stored in database.');

  // --------------------------------------------------------------------------
  // TEST 3: LIST REGISTRATION TOKENS (SAFE METADATA)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. LIST REGISTRATION TOKENS (SAFE METADATA) ---');

  // Tenant owner denied
  const ownerList = await callFunction('listRegistrationTokens', {}, tenantOwnerToken);
  assert.equal(ownerList.status, 403, 'Tenant owner cannot list platform tokens');

  // Platform admin allowed
  const adminList = await callFunction('listRegistrationTokens', { limit: 10 }, platformAdminToken);
  assert.equal(adminList.status, 200);
  const tokens = adminList.body?.result?.tokens;
  assert.ok(Array.isArray(tokens) && tokens.length >= 1, 'Admin list must return tokens');

  const found = tokens.find((t) => t.tokenId === tokenId);
  assert.ok(found, 'Generated token must appear in admin list');
  assert.equal(found.status, 'ACTIVE');
  assert.equal(found.label, 'BP Kallis Store 2');
  assert.equal(found.businessCategoryHint, 'FUEL_STATION');

  // CRITICAL SECURITY: tokenHash and rawToken must NOT be present in list response
  assert.equal(found.tokenHash, undefined, 'tokenHash must be stripped from list output');
  assert.equal(
    JSON.stringify(adminList.body).includes(rawToken),
    false,
    'Raw token must not appear in list output',
  );

  console.log('✓ Safe metadata listing verified without token hash exposure.');

  // --------------------------------------------------------------------------
  // TEST 4: PUBLIC VALIDATION & GENERIC INVALID RESPONSES
  // --------------------------------------------------------------------------
  console.log('\n--- 4. PUBLIC VALIDATION & GENERIC INVALID RESPONSES ---');

  // Valid token
  const validRes = await callFunction('validateRegistrationToken', { token: rawToken });
  assert.equal(validRes.status, 200);
  assert.equal(validRes.body?.result?.valid, true);
  assert.equal(validRes.body?.result?.label, 'BP Kallis Store 2');
  assert.equal(validRes.body?.result?.businessCategoryHint, 'FUEL_STATION');

  // Missing token
  const missingRes = await callFunction('validateRegistrationToken', {});
  assert.equal(missingRes.status, 200);
  assert.equal(missingRes.body?.result?.valid, false);

  // Malformed token
  const malformedRes = await callFunction('validateRegistrationToken', { token: 'stx_malformed!' });
  assert.equal(malformedRes.status, 200);
  assert.equal(malformedRes.body?.result?.valid, false);

  // Non-existent token
  const nonExistentRaw = 'stx_' + '0'.repeat(43);
  const nonExistentRes = await callFunction('validateRegistrationToken', { token: nonExistentRaw });
  assert.equal(nonExistentRes.status, 200);
  assert.equal(nonExistentRes.body?.result?.valid, false);

  console.log('✓ Public validation works and returns generic valid=false on invalid tokens.');

  // --------------------------------------------------------------------------
  // TEST 5: REVOCATION
  // --------------------------------------------------------------------------
  console.log('\n--- 5. REVOCATION CHECKS ---');

  // Tenant owner denied
  const ownerRevoke = await callFunction('revokeRegistrationToken', { tokenId }, tenantOwnerToken);
  assert.equal(ownerRevoke.status, 403, 'Tenant owner cannot revoke tokens');

  // Platform admin revokes
  const adminRevoke = await callFunction('revokeRegistrationToken', { tokenId }, platformAdminToken);
  assert.equal(adminRevoke.status, 200);
  assert.equal(adminRevoke.body?.result?.status, 'REVOKED');

  // Token now validates as invalid
  const postRevokeVal = await callFunction('validateRegistrationToken', { token: rawToken });
  assert.equal(postRevokeVal.body?.result?.valid, false, 'Revoked token must validate as false');

  // Second revocation is idempotent
  const adminRevoke2 = await callFunction('revokeRegistrationToken', { tokenId }, platformAdminToken);
  assert.equal(adminRevoke2.status, 200);

  console.log('✓ Revocation enforced; revoked tokens fail validation generically.');

  // --------------------------------------------------------------------------
  // TEST 6: EXPIRATION DERIVATION
  // --------------------------------------------------------------------------
  console.log('\n--- 6. EXPIRATION DERIVATION CHECKS ---');

  // Create an expired token manually in Firestore
  const expiredRaw = 'stx_' + 'e'.repeat(43);
  const expiredHash = hashRegistrationToken(expiredRaw);
  await adminDb.doc(`registrationTokens/${expiredHash}`).set({
    status: 'ACTIVE',
    tokenHash: expiredHash,
    createdAt: Timestamp.fromMillis(Date.now() - 100000),
    expiresAt: Timestamp.fromMillis(Date.now() - 5000),
    createdBy: platformAdminUid,
  });

  const expiredVal = await callFunction('validateRegistrationToken', { token: expiredRaw });
  assert.equal(expiredVal.body?.result?.valid, false, 'Expired token must validate as false');

  console.log('✓ Expired token validates as generic false.');

  // --------------------------------------------------------------------------
  // TEST 7: ATOMIC CONSUMPTION & CONCURRENCY
  // --------------------------------------------------------------------------
  console.log('\n--- 7. ATOMIC CONSUMPTION & CONCURRENCY CHECKS ---');

  // Generate a fresh active token for concurrency testing
  const freshGen = await callFunction(
    'generateRegistrationToken',
    { expiresInHours: 24, label: 'Concurrency Test' },
    platformAdminToken,
  );
  const concurrentToken = freshGen.body?.result?.token;
  const concurrentTokenId = freshGen.body?.result?.tokenId;

  // Run 10 concurrent consumption attempts simultaneously
  const N = 10;
  const promises = [];
  for (let i = 0; i < N; i++) {
    promises.push(
      adminDb.runTransaction(async (transaction) => {
        return await consumeRegistrationToken(transaction, {
          db: adminDb,
          rawToken: concurrentToken,
          consumedBy: `consumer-${i}`,
          metadata: { attempt: i },
        });
      }),
    );
  }

  const results = await Promise.allSettled(promises);
  const successCount = results.filter((r) => r.status === 'fulfilled').length;
  const failCount = results.filter((r) => r.status === 'rejected').length;

  console.log(`Concurrent results: ${successCount} succeeded, ${failCount} failed (total: ${N})`);
  assert.equal(successCount, 1, 'Exactly ONE concurrent consume attempt must succeed');
  assert.equal(failCount, N - 1, 'All other concurrent consume attempts must fail');

  // Verify final document state
  const finalDoc = (await adminDb.doc(`registrationTokens/${concurrentTokenId}`).get()).data();
  assert.equal(finalDoc.status, 'CONSUMED');
  assert.ok(finalDoc.consumedAt);

  // Validate consumed token
  const postConsumeVal = await callFunction('validateRegistrationToken', { token: concurrentToken });
  assert.equal(postConsumeVal.body?.result?.valid, false, 'Consumed token must validate as false');

  console.log('✓ Concurrency test passed: exactly 1 success out of 10 concurrent attempts.');

  // --------------------------------------------------------------------------
  // TEST 8: FIRESTORE SECURITY RULES REGRESSION
  // --------------------------------------------------------------------------
  console.log('\n--- 8. FIRESTORE SECURITY RULES REGRESSION ---');

  // Direct client read on registrationTokens -> 403 Forbidden
  const clientReadTokens = await firestoreDirectRequest(`registrationTokens/${tokenId}`, {
    method: 'GET',
    idToken: tenantOwnerToken,
  });
  assert.equal(clientReadTokens.status, 403, 'Client read on registrationTokens must be 403');

  // Direct client write on registrationTokens -> 403 Forbidden
  const clientWriteTokens = await firestoreDirectRequest(`registrationTokens/hack`, {
    method: 'PATCH',
    idToken: tenantOwnerToken,
    data: { fields: { status: { stringValue: 'ACTIVE' } } },
  });
  assert.equal(clientWriteTokens.status, 403, 'Client write on registrationTokens must be 403');

  // Direct client read on platformAuditLogs -> 403 Forbidden
  const clientReadAudit = await firestoreDirectRequest(`platformAuditLogs/any`, {
    method: 'GET',
    idToken: tenantOwnerToken,
  });
  assert.equal(clientReadAudit.status, 403, 'Client read on platformAuditLogs must be 403');

  // Direct client write on platformAuditLogs -> 403 Forbidden
  const clientWriteAudit = await firestoreDirectRequest(`platformAuditLogs/any`, {
    method: 'PATCH',
    idToken: tenantOwnerToken,
    data: { fields: { action: { stringValue: 'HACK' } } },
  });
  assert.equal(clientWriteAudit.status, 403, 'Client write on platformAuditLogs must be 403');

  // Direct client read on rateLimits -> 403 Forbidden
  const clientReadRate = await firestoreDirectRequest(`rateLimits/any`, {
    method: 'GET',
    idToken: tenantOwnerToken,
  });
  assert.equal(clientReadRate.status, 403, 'Client read on rateLimits must be 403');

  // Direct client write on rateLimits -> 403 Forbidden
  const clientWriteRate = await firestoreDirectRequest(`rateLimits/any`, {
    method: 'PATCH',
    idToken: tenantOwnerToken,
    data: { fields: { count: { integerValue: 1 } } },
  });
  assert.equal(clientWriteRate.status, 403, 'Client write on rateLimits must be 403');

  console.log('✓ Firestore Security Rules strictly deny client direct access to registrationTokens, platformAuditLogs, and rateLimits.');

  console.log('\n==========================================================');
  console.log('ALL REGISTRATION TOKEN EMULATOR INTEGRATION TESTS PASSED 100%');
  console.log('==========================================================');
  await adminApp.delete();
}

runRegistrationTokenEmulatorTests().catch((err) => {
  console.error('REGISTRATION TOKEN EMULATOR TESTS FAILED:', err);
  process.exit(1);
});
