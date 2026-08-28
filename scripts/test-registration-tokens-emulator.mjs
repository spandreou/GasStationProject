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

async function runRegistrationTokenEmulatorTests() {
  console.log('==========================================================');
  console.log('STARTING HARDENED REGISTRATION TOKEN EMULATOR INTEGRATION TESTS');
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
  // TEST 1: UNAUTHORIZED TOKEN GENERATION CHECKS
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
  // TEST 2: AUTHORIZED TOKEN GENERATION & IDENTIFIER SEPARATION
  // --------------------------------------------------------------------------
  console.log('\n--- 2. AUTHORIZED GENERATION & IDENTIFIER SEPARATION ---');

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

  assert.ok(rawToken && rawToken.startsWith('stx_'), 'Raw token must start with stx_');
  assert.ok(tokenId && tokenId.startsWith('rtok_'), 'Management tokenId must start with rtok_');

  const tokenHash = hashRegistrationToken(rawToken);

  // CRITICAL SECURITY ASSERTIONS:
  // 1. tokenId MUST NOT equal tokenHash!
  assert.notEqual(tokenId, tokenHash, 'CRITICAL: tokenId must be opaque management ID, NOT tokenHash');
  // 2. Generation response must NOT contain tokenHash!
  assert.equal(genRes.body?.result?.tokenHash, undefined, 'tokenHash must NOT be in generation response');
  assert.equal(JSON.stringify(genRes.body).includes(tokenHash), false, 'tokenHash must not appear in generation body');

  // 3. Verify Firestore documents
  const tokenDocSnap = await adminDb.doc(`registrationTokens/${tokenId}`).get();
  assert.equal(tokenDocSnap.exists, true, 'registrationTokens doc must exist with tokenId');
  const tokenDoc = tokenDocSnap.data();

  assert.equal(tokenDoc.status, 'ACTIVE');
  assert.equal(tokenDoc.tokenId, tokenId);
  assert.equal(tokenDoc.createdBy, platformAdminUid);
  assert.equal(tokenDoc.label, 'BP Kallis Store 2');
  assert.equal(tokenDoc.businessCategoryHint, 'FUEL_STATION');
  assert.equal(tokenDoc.tokenHash, undefined, 'tokenHash must NOT be stored in registrationTokens document');

  const lookupDocSnap = await adminDb.doc(`registrationTokenLookups/${tokenHash}`).get();
  assert.equal(lookupDocSnap.exists, true, 'registrationTokenLookups doc must exist with tokenHash');
  assert.equal(lookupDocSnap.data()?.tokenId, tokenId, 'Lookup doc must map to tokenId');

  // 4. Raw token must NEVER appear in Firestore!
  assert.equal(JSON.stringify(tokenDoc).includes(rawToken), false, 'Raw token NOT in registrationTokens');
  assert.equal(JSON.stringify(lookupDocSnap.data()).includes(rawToken), false, 'Raw token NOT in registrationTokenLookups');

  // 5. Check platformAuditLogs: uses opaque tokenId, never tokenHash or rawToken!
  const auditSnap = await adminDb
    .collection('platformAuditLogs')
    .where('action', '==', 'REGISTRATION_TOKEN_GENERATED')
    .where('tokenId', '==', tokenId)
    .get();
  assert.equal(auditSnap.empty, false, 'Audit log recorded with opaque tokenId');
  const auditDoc = auditSnap.docs[0].data();
  assert.equal(auditDoc.tokenId, tokenId);
  assert.equal(auditDoc.actorUid, platformAdminUid);
  assert.equal(auditDoc.tokenHash, undefined, 'tokenHash must NOT be in audit log');
  assert.equal(JSON.stringify(auditDoc).includes(tokenHash), false, 'tokenHash must not appear in audit payload');
  assert.equal(JSON.stringify(auditDoc).includes(rawToken), false, 'Raw token must not appear in audit payload');

  console.log('✓ Generation creates opaque tokenId and server-only lookup. tokenHash and rawToken are protected.');

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

  // CRITICAL SECURITY: tokenHash, lookupHash, and rawToken must NOT be present in list response
  assert.equal(found.tokenHash, undefined, 'tokenHash must NOT be in list response');
  assert.equal(JSON.stringify(adminList.body).includes(tokenHash), false, 'tokenHash must not appear in list response');
  assert.equal(JSON.stringify(adminList.body).includes(rawToken), false, 'Raw token must not appear in list response');

  console.log('✓ Safe metadata listing verified without token hash exposure.');

  // --------------------------------------------------------------------------
  // TEST 4: PUBLIC VALIDATION & MINIMAL METADATA
  // --------------------------------------------------------------------------
  console.log('\n--- 4. PUBLIC VALIDATION & MINIMAL METADATA ---');

  // Valid token
  const validRes = await callFunction('validateRegistrationToken', { token: rawToken });
  assert.equal(validRes.status, 200);
  assert.equal(validRes.body?.result?.valid, true);
  assert.ok(validRes.body?.result?.expiresAt);
  assert.equal(validRes.body?.result?.businessCategoryHint, 'FUEL_STATION');

  // CRITICAL SECURITY: Public validation must NOT expose label, tokenId, tokenHash, createdBy, etc.
  assert.equal(validRes.body?.result?.label, undefined, 'label must NOT be in public validation response');
  assert.equal(validRes.body?.result?.tokenId, undefined, 'tokenId must NOT be in public validation response');
  assert.equal(validRes.body?.result?.tokenHash, undefined, 'tokenHash must NOT be in public validation response');
  assert.equal(validRes.body?.result?.createdBy, undefined, 'createdBy must NOT be in public validation response');

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

  console.log('✓ Public validation returns minimal safe metadata and generic valid=false on invalid tokens.');

  // --------------------------------------------------------------------------
  // TEST 5: FAIL-CLOSED EXPIRATION & MALFORMED RECORDS
  // --------------------------------------------------------------------------
  console.log('\n--- 5. FAIL-CLOSED EXPIRATION & MALFORMED RECORDS ---');

  // Token with missing expiresAt -> fail closed (INVALID -> validation valid=false)
  const malformedRaw = 'stx_' + 'm'.repeat(43);
  const malformedHash = hashRegistrationToken(malformedRaw);
  const malformedTokenId = 'rtok_' + 'm'.repeat(32);

  await adminDb.doc(`registrationTokens/${malformedTokenId}`).set({
    tokenId: malformedTokenId,
    status: 'ACTIVE',
    createdAt: Timestamp.now(),
    // MISSING expiresAt!
  });
  await adminDb.doc(`registrationTokenLookups/${malformedHash}`).set({
    tokenId: malformedTokenId,
  });

  const malformedVal = await callFunction('validateRegistrationToken', { token: malformedRaw });
  assert.equal(malformedVal.body?.result?.valid, false, 'Missing expiresAt must fail closed as valid=false');

  // Expired token -> EXPIRED -> validation valid=false
  const expiredRaw = 'stx_' + 'e'.repeat(43);
  const expiredHash = hashRegistrationToken(expiredRaw);
  const expiredTokenId = 'rtok_' + 'e'.repeat(32);

  await adminDb.doc(`registrationTokens/${expiredTokenId}`).set({
    tokenId: expiredTokenId,
    status: 'ACTIVE',
    createdAt: Timestamp.fromMillis(Date.now() - 100000),
    expiresAt: Timestamp.fromMillis(Date.now() - 5000),
  });
  await adminDb.doc(`registrationTokenLookups/${expiredHash}`).set({
    tokenId: expiredTokenId,
  });

  const expiredVal = await callFunction('validateRegistrationToken', { token: expiredRaw });
  assert.equal(expiredVal.body?.result?.valid, false, 'Expired token must validate as false');

  console.log('✓ Fail-closed expiration verified for missing, malformed, and expired tokens.');

  // --------------------------------------------------------------------------
  // TEST 6: REVOCATION USING OPAQUE TOKEN ID
  // --------------------------------------------------------------------------
  console.log('\n--- 6. REVOCATION USING OPAQUE MANAGEMENT TOKEN ID ---');

  // Tenant owner denied
  const ownerRevoke = await callFunction('revokeRegistrationToken', { tokenId }, tenantOwnerToken);
  assert.equal(ownerRevoke.status, 403, 'Tenant owner cannot revoke tokens');

  // Passing SHA-256 hash or raw token instead of opaque tokenId is rejected
  const hashRevoke = await callFunction('revokeRegistrationToken', { tokenId: tokenHash }, platformAdminToken);
  assert.equal(hashRevoke.status, 400, 'SHA256 hash must be rejected as tokenId');

  // Platform admin revokes using opaque tokenId
  const adminRevoke = await callFunction('revokeRegistrationToken', { tokenId }, platformAdminToken);
  assert.equal(adminRevoke.status, 200);
  assert.equal(adminRevoke.body?.result?.status, 'REVOKED');

  // Token now validates as invalid
  const postRevokeVal = await callFunction('validateRegistrationToken', { token: rawToken });
  assert.equal(postRevokeVal.body?.result?.valid, false, 'Revoked token must validate as false');

  // Second revocation is idempotent
  const adminRevoke2 = await callFunction('revokeRegistrationToken', { tokenId }, platformAdminToken);
  assert.equal(adminRevoke2.status, 200);

  // Check revocation audit log uses opaque tokenId
  const revokeAuditSnap = await adminDb
    .collection('platformAuditLogs')
    .where('action', '==', 'REGISTRATION_TOKEN_REVOKED')
    .where('tokenId', '==', tokenId)
    .get();
  assert.equal(revokeAuditSnap.empty, false, 'Revocation audit log must be recorded');
  const revokeAuditDoc = revokeAuditSnap.docs[0].data();
  assert.equal(revokeAuditDoc.tokenId, tokenId);
  assert.equal(JSON.stringify(revokeAuditDoc).includes(tokenHash), false, 'tokenHash must not appear in audit log');

  console.log('✓ Revocation using opaque tokenId enforced and audited.');

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
  assert.ok(finalDoc.consumedBy);
  assert.equal(finalDoc.metadata, undefined, 'Arbitrary metadata must NOT be persisted');

  // Attempting to revoke a CONSUMED token must fail closed
  const revokeConsumedRes = await callFunction(
    'revokeRegistrationToken',
    { tokenId: concurrentTokenId },
    platformAdminToken,
  );
  assert.equal(revokeConsumedRes.status, 400, 'Revoking a CONSUMED token must fail closed');

  console.log('✓ Concurrency test passed: exactly 1 success out of 10 concurrent attempts.');

  // --------------------------------------------------------------------------
  // TEST 8: RATE LIMIT STORAGE BOUND & SPOOFING RESISTANCE
  // --------------------------------------------------------------------------
  console.log('\n--- 8. RATE LIMIT STORAGE BOUND & SPOOFING RESISTANCE ---');

  // Test that sending arbitrary X-Forwarded-For headers does not create new rate limit documents
  for (let i = 0; i < 5; i++) {
    await callFunction(
      'validateRegistrationToken',
      { token: 'stx_test_spoof' },
      null,
      { 'X-Forwarded-For': `10.${i}.0.1, 192.168.1.1` },
    );
  }

  const rateLimitDocsSnap = await adminDb.collection('rateLimits').get();
  assert.equal(
    rateLimitDocsSnap.size,
    1,
    `rateLimits collection must contain exactly 1 stable document (found ${rateLimitDocsSnap.size})`,
  );
  assert.equal(
    rateLimitDocsSnap.docs[0].id,
    'registration_token_public_validation',
    'Document ID must be the stable global limiter doc',
  );

  console.log('✓ Rate limit storage cardinality is strictly bounded to 1 single stable document.');

  // --------------------------------------------------------------------------
  // TEST 9: FIRESTORE SECURITY RULES REGRESSION
  // --------------------------------------------------------------------------
  console.log('\n--- 9. FIRESTORE SECURITY RULES REGRESSION ---');

  // Direct client read on registrationTokens -> 403 Forbidden
  const clientReadTokens = await firestoreDirectRequest(`registrationTokens/${tokenId}`, {
    method: 'GET',
    idToken: tenantOwnerToken,
  });
  assert.equal(clientReadTokens.status, 403, 'Client read on registrationTokens must be 403');

  // Direct client read on registrationTokenLookups -> 403 Forbidden
  const clientReadLookups = await firestoreDirectRequest(`registrationTokenLookups/${tokenHash}`, {
    method: 'GET',
    idToken: tenantOwnerToken,
  });
  assert.equal(clientReadLookups.status, 403, 'Client read on registrationTokenLookups must be 403');

  // Direct client write on registrationTokenLookups -> 403 Forbidden
  const clientWriteLookups = await firestoreDirectRequest(`registrationTokenLookups/hack`, {
    method: 'PATCH',
    idToken: tenantOwnerToken,
    data: { fields: { tokenId: { stringValue: 'hack' } } },
  });
  assert.equal(clientWriteLookups.status, 403, 'Client write on registrationTokenLookups must be 403');

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

  console.log('✓ Firestore Security Rules strictly deny direct access to registrationTokens, registrationTokenLookups, platformAuditLogs, and rateLimits.');

  console.log('\n==========================================================');
  console.log('ALL HARDENED REGISTRATION TOKEN EMULATOR INTEGRATION TESTS PASSED 100%');
  console.log('==========================================================');
  await adminApp.delete();
}

runRegistrationTokenEmulatorTests().catch((err) => {
  console.error('REGISTRATION TOKEN EMULATOR TESTS FAILED:', err);
  process.exit(1);
});
