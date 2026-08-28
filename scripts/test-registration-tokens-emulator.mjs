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
  console.log('STARTING FINAL HARDENED REGISTRATION TOKEN EMULATOR INTEGRATION TESTS');
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
  // TEST 1: UNAUTHORIZED & FORGED ACTOR TOKEN GENERATION CHECKS
  // --------------------------------------------------------------------------
  console.log('\n--- 1. UNAUTHORIZED & FORGED ACTOR TOKEN GENERATION CHECKS ---');

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

  // Forged adminUid / actor override in payload must be REJECTED (Finding 1)
  const forgedGen = await callFunction(
    'generateRegistrationToken',
    { expiresInHours: 24, adminUid: 'forged-admin-uid' },
    platformAdminToken,
  );
  assert.equal(forgedGen.status, 400, 'Payload with adminUid must be rejected as invalid-argument');

  const forgedActorGen = await callFunction(
    'generateRegistrationToken',
    { expiresInHours: 24, actorUid: 'forged-actor-uid' },
    platformAdminToken,
  );
  assert.equal(forgedActorGen.status, 400, 'Payload with actorUid must be rejected as invalid-argument');

  console.log('✓ Unauthorized generation and forged adminUid/actorUid attempts are properly denied.');

  // --------------------------------------------------------------------------
  // TEST 2: AUTHORIZED GENERATION & CANONICAL EXPIRY PERSISTENCE
  // --------------------------------------------------------------------------
  console.log('\n--- 2. AUTHORIZED GENERATION & CANONICAL EXPIRY PERSISTENCE ---');

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

  // 1. tokenId MUST NOT equal tokenHash!
  assert.notEqual(tokenId, tokenHash, 'CRITICAL: tokenId must be opaque management ID, NOT tokenHash');
  // 2. Generation response must NOT contain tokenHash!
  assert.equal(genRes.body?.result?.tokenHash, undefined, 'tokenHash must NOT be in generation response');
  assert.equal(JSON.stringify(genRes.body).includes(tokenHash), false, 'tokenHash must not appear in generation body');

  // 3. Verify Firestore documents (Canonical expiresAt only)
  const tokenDocSnap = await adminDb.doc(`registrationTokens/${tokenId}`).get();
  assert.equal(tokenDocSnap.exists, true, 'registrationTokens doc must exist with tokenId');
  const tokenDoc = tokenDocSnap.data();

  assert.equal(tokenDoc.status, 'ACTIVE');
  assert.equal(tokenDoc.tokenId, tokenId);
  assert.equal(tokenDoc.createdBy, platformAdminUid, 'createdBy must strictly match authenticated admin UID');
  assert.equal(tokenDoc.label, 'BP Kallis Store 2');
  assert.equal(tokenDoc.businessCategoryHint, 'FUEL_STATION');
  assert.ok(tokenDoc.expiresAt, 'Canonical expiresAt must exist');
  assert.equal(tokenDoc.expiresAtMs, undefined, 'Duplicate expiresAtMs must NOT be persisted (Finding 3)');
  assert.equal(tokenDoc.tokenHash, undefined, 'tokenHash must NOT be stored in registrationTokens document');

  const lookupDocSnap = await adminDb.doc(`registrationTokenLookups/${tokenHash}`).get();
  assert.equal(lookupDocSnap.exists, true, 'registrationTokenLookups doc must exist with tokenHash');
  assert.equal(lookupDocSnap.data()?.tokenId, tokenId, 'Lookup doc must map to tokenId');

  // 4. Raw token must NEVER appear in Firestore!
  assert.equal(JSON.stringify(tokenDoc).includes(rawToken), false, 'Raw token NOT in registrationTokens');
  assert.equal(JSON.stringify(lookupDocSnap.data()).includes(rawToken), false, 'Raw token NOT in registrationTokenLookups');

  // 5. Check platformAuditLogs: uses opaque tokenId and authenticated actorUid
  const auditSnap = await adminDb
    .collection('platformAuditLogs')
    .where('action', '==', 'REGISTRATION_TOKEN_GENERATED')
    .where('tokenId', '==', tokenId)
    .get();
  assert.equal(auditSnap.empty, false, 'Audit log recorded with opaque tokenId');
  const auditDoc = auditSnap.docs[0].data();
  assert.equal(auditDoc.tokenId, tokenId);
  assert.equal(auditDoc.actorUid, platformAdminUid, 'Audit actorUid must strictly match authenticated admin UID');
  assert.equal(auditDoc.tokenHash, undefined, 'tokenHash must NOT be in audit log');
  assert.equal(JSON.stringify(auditDoc).includes(tokenHash), false, 'tokenHash must not appear in audit payload');

  console.log('✓ Generation creates opaque tokenId, server-only lookup, and canonical expiresAt.');

  // --------------------------------------------------------------------------
  // TEST 3: LIST TOKENS & STRICT CURSOR VALIDATION (Finding 2)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. LIST TOKENS & STRICT CURSOR VALIDATION ---');

  // Tenant owner denied
  const ownerList = await callFunction('listRegistrationTokens', {}, tenantOwnerToken);
  assert.equal(ownerList.status, 403, 'Tenant owner cannot list platform tokens');

  // Malformed cursor: rtok_123 -> rejected
  const shortCursorList = await callFunction('listRegistrationTokens', { startAfterCursor: 'rtok_123' }, platformAdminToken);
  assert.equal(shortCursorList.status, 400, 'Short cursor rtok_123 must be rejected');

  // Malformed cursor: slashes / tokenHash / rawToken -> rejected
  const slashCursorList = await callFunction('listRegistrationTokens', { startAfterCursor: 'rtok_12/34' }, platformAdminToken);
  assert.equal(slashCursorList.status, 400, 'Slash cursor must be rejected');

  const hashCursorList = await callFunction('listRegistrationTokens', { startAfterCursor: tokenHash }, platformAdminToken);
  assert.equal(hashCursorList.status, 400, 'TokenHash cursor must be rejected');

  // Valid format but non-existent cursor -> rejected as invalid-argument
  const nonExistentCursor = 'rtok_' + 'f'.repeat(32);
  const nonExistentCursorList = await callFunction('listRegistrationTokens', { startAfterCursor: nonExistentCursor }, platformAdminToken);
  assert.equal(nonExistentCursorList.status, 400, 'Nonexistent cursor must be rejected as invalid-argument');

  // Valid pagination with existing cursor
  const adminList = await callFunction('listRegistrationTokens', { limit: 10 }, platformAdminToken);
  assert.equal(adminList.status, 200);
  const tokens = adminList.body?.result?.tokens;
  assert.ok(Array.isArray(tokens) && tokens.length >= 1, 'Admin list must return tokens');

  const found = tokens.find((t) => t.tokenId === tokenId);
  assert.ok(found, 'Generated token must appear in admin list');
  assert.equal(found.status, 'ACTIVE');
  assert.equal(found.label, 'BP Kallis Store 2');
  assert.equal(found.businessCategoryHint, 'FUEL_STATION');

  console.log('✓ Strict management cursor format and non-existent cursor validation verified.');

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

  // CRITICAL: label, tokenId, tokenHash, createdBy are NOT returned
  assert.equal(validRes.body?.result?.label, undefined);
  assert.equal(validRes.body?.result?.tokenId, undefined);
  assert.equal(validRes.body?.result?.tokenHash, undefined);
  assert.equal(validRes.body?.result?.createdBy, undefined);

  // Missing / malformed / non-existent tokens return generic valid=false
  const missingRes = await callFunction('validateRegistrationToken', {});
  assert.equal(missingRes.body?.result?.valid, false);

  const malformedRes = await callFunction('validateRegistrationToken', { token: 'stx_malformed!' });
  assert.equal(malformedRes.body?.result?.valid, false);

  console.log('✓ Public validation returns minimal safe metadata and generic valid=false on invalid tokens.');

  // --------------------------------------------------------------------------
  // TEST 5: FAIL-CLOSED CANONICAL EXPIRY TESTS (Finding 3)
  // --------------------------------------------------------------------------
  console.log('\n--- 5. FAIL-CLOSED CANONICAL EXPIRY TESTS ---');

  // Token with missing canonical expiresAt BUT valid expiresAtMs -> MUST FAIL CLOSED AS INVALID!
  const fallbackRaw = 'stx_' + 'f'.repeat(43);
  const fallbackHash = hashRegistrationToken(fallbackRaw);
  const fallbackTokenId = 'rtok_' + 'f'.repeat(32);

  await adminDb.doc(`registrationTokens/${fallbackTokenId}`).set({
    tokenId: fallbackTokenId,
    status: 'ACTIVE',
    createdAt: Timestamp.now(),
    expiresAtMs: Date.now() + 1000000, // Valid future ms, but missing canonical expiresAt!
  });
  await adminDb.doc(`registrationTokenLookups/${fallbackHash}`).set({
    tokenId: fallbackTokenId,
  });

  const fallbackVal = await callFunction('validateRegistrationToken', { token: fallbackRaw });
  assert.equal(fallbackVal.body?.result?.valid, false, 'Missing canonical expiresAt MUST fail closed even if expiresAtMs is present');

  // Expired canonical token -> EXPIRED -> valid=false
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

  console.log('✓ Canonical expiresAt fail-closed integrity verified without secondary field fallback.');

  // --------------------------------------------------------------------------
  // TEST 6: REVOCATION & ACTOR INTEGRITY (Finding 1)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. REVOCATION & ACTOR INTEGRITY ---');

  // Forged adminUid in revocation payload must be rejected
  const forgedRevoke = await callFunction(
    'revokeRegistrationToken',
    { tokenId, adminUid: 'forged-admin-uid' },
    platformAdminToken,
  );
  assert.equal(forgedRevoke.status, 400, 'Revoke payload with adminUid must be rejected');

  // Platform admin revokes using opaque tokenId
  const adminRevoke = await callFunction('revokeRegistrationToken', { tokenId }, platformAdminToken);
  assert.equal(adminRevoke.status, 200);
  assert.equal(adminRevoke.body?.result?.status, 'REVOKED');

  // Token now validates as invalid
  const postRevokeVal = await callFunction('validateRegistrationToken', { token: rawToken });
  assert.equal(postRevokeVal.body?.result?.valid, false, 'Revoked token must validate as false');

  // Check revocation audit log uses authenticated actorUid
  const revokeAuditSnap = await adminDb
    .collection('platformAuditLogs')
    .where('action', '==', 'REGISTRATION_TOKEN_REVOKED')
    .where('tokenId', '==', tokenId)
    .get();
  assert.equal(revokeAuditSnap.empty, false, 'Revocation audit log must be recorded');
  const revokeAuditDoc = revokeAuditSnap.docs[0].data();
  assert.equal(revokeAuditDoc.tokenId, tokenId);
  assert.equal(revokeAuditDoc.actorUid, platformAdminUid, 'Revocation audit actorUid must match authenticated admin UID');

  console.log('✓ Revocation actor integrity and audit trail verified.');

  // --------------------------------------------------------------------------
  // TEST 7: ATOMIC CONSUMPTION & ACTOR BOUNDS (Finding 4)
  // --------------------------------------------------------------------------
  console.log('\n--- 7. ATOMIC CONSUMPTION & ACTOR BOUNDS ---');

  // Generate a fresh active token
  const freshGen = await callFunction(
    'generateRegistrationToken',
    { expiresInHours: 24, label: 'Actor Bounds Test' },
    platformAdminToken,
  );
  const actorToken = freshGen.body?.result?.token;
  const actorTokenId = freshGen.body?.result?.tokenId;

  // Rejection of invalid consumedBy actors
  await assert.rejects(
    () => adminDb.runTransaction((t) => consumeRegistrationToken(t, { db: adminDb, rawToken: actorToken, consumedBy: '' })),
    /invalid-consumed-by-empty/,
  );
  await assert.rejects(
    () => adminDb.runTransaction((t) => consumeRegistrationToken(t, { db: adminDb, rawToken: actorToken, consumedBy: { uid: 'hack' } })),
    /invalid-consumed-by-must-be-string/,
  );
  await assert.rejects(
    () => adminDb.runTransaction((t) => consumeRegistrationToken(t, { db: adminDb, rawToken: actorToken, consumedBy: 'a'.repeat(129) })),
    /invalid-consumed-by-length/,
  );
  await assert.rejects(
    () => adminDb.runTransaction((t) => consumeRegistrationToken(t, { db: adminDb, rawToken: actorToken, consumedBy: 'user\x00hack' })),
    /invalid-consumed-by-contains-control-characters/,
  );

  // 10 concurrent attempts with valid bounded actor
  const N = 10;
  const promises = [];
  for (let i = 0; i < N; i++) {
    promises.push(
      adminDb.runTransaction(async (transaction) => {
        return await consumeRegistrationToken(transaction, {
          db: adminDb,
          rawToken: actorToken,
          consumedBy: `valid-owner-uid-${i}`,
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

  const finalDoc = (await adminDb.doc(`registrationTokens/${actorTokenId}`).get()).data();
  assert.equal(finalDoc.status, 'CONSUMED');
  assert.ok(finalDoc.consumedBy.startsWith('valid-owner-uid-'));

  console.log('✓ ConsumedBy actor bounds and 10-way concurrency verified.');

  // --------------------------------------------------------------------------
  // TEST 8: RATE LIMIT STORAGE BOUND & SPOOFING RESISTANCE
  // --------------------------------------------------------------------------
  console.log('\n--- 8. RATE LIMIT STORAGE BOUND & SPOOFING RESISTANCE ---');

  for (let i = 0; i < 5; i++) {
    await callFunction(
      'validateRegistrationToken',
      { token: 'stx_test_spoof' },
      null,
      { 'X-Forwarded-For': `10.${i}.0.1, 192.168.1.1` },
    );
  }

  const rateLimitDocsSnap = await adminDb.collection('rateLimits').get();
  assert.equal(rateLimitDocsSnap.size, 1, 'rateLimits collection must contain exactly 1 stable document');
  assert.equal(rateLimitDocsSnap.docs[0].id, 'registration_token_public_validation');

  console.log('✓ Rate limit storage cardinality is strictly bounded to 1 single stable document.');

  // --------------------------------------------------------------------------
  // TEST 9: FIRESTORE SECURITY RULES REGRESSION
  // --------------------------------------------------------------------------
  console.log('\n--- 9. FIRESTORE SECURITY RULES REGRESSION ---');

  const clientReadTokens = await firestoreDirectRequest(`registrationTokens/${tokenId}`, { method: 'GET', idToken: tenantOwnerToken });
  assert.equal(clientReadTokens.status, 403);

  const clientReadLookups = await firestoreDirectRequest(`registrationTokenLookups/${tokenHash}`, { method: 'GET', idToken: tenantOwnerToken });
  assert.equal(clientReadLookups.status, 403);

  const clientReadAudit = await firestoreDirectRequest(`platformAuditLogs/any`, { method: 'GET', idToken: tenantOwnerToken });
  assert.equal(clientReadAudit.status, 403);

  const clientReadRate = await firestoreDirectRequest(`rateLimits/any`, { method: 'GET', idToken: tenantOwnerToken });
  assert.equal(clientReadRate.status, 403);

  console.log('✓ Firestore Security Rules strictly deny direct access to registrationTokens, registrationTokenLookups, platformAuditLogs, and rateLimits.');

  console.log('\n==========================================================');
  console.log('ALL FINAL HARDENED REGISTRATION TOKEN EMULATOR INTEGRATION TESTS PASSED 100%');
  console.log('==========================================================');
  await adminApp.delete();
}

runRegistrationTokenEmulatorTests().catch((err) => {
  console.error('REGISTRATION TOKEN EMULATOR TESTS FAILED:', err);
  process.exit(1);
});
