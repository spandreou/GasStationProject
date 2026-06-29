import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const PROJECT_ID = 'demo-gasstation-auth-broker';
const REGION = 'us-central1';
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FIRESTORE_EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';
const FUNCTIONS_EMULATOR = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';
const CENTRAL_ORIGIN = 'https://gas.homelabshare.gr';
const TENANT_ORIGIN = 'https://bp-kallis.homelabshare.gr';
const TENANT_ID = 'bp-kallis';

const firestoreBase = `http://${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const authBase = `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`;
const functionsBase = `http://${FUNCTIONS_EMULATOR}/${PROJECT_ID}/${REGION}`;
const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { Timestamp, getFirestore } = requireFromFunctions('firebase-admin/firestore');
const adminApp = initializeApp({ projectId: PROJECT_ID }, 'auth-broker-emulator-test');
const adminDb = getFirestore(adminApp);
const adminAuth = getAuth(adminApp);

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function toFirestoreFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') fields[key] = { stringValue: value };
    else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
    else if (typeof value === 'number') fields[key] = Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
    else if (value === null) fields[key] = { nullValue: null };
    else if (Array.isArray(value)) fields[key] = { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
    else if (value && typeof value === 'object') fields[key] = { mapValue: toFirestoreFields(value) };
    else throw new Error(`Unsupported Firestore test value for ${key}`);
  }
  return { fields };
}

function toFirestoreValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
  if (value && typeof value === 'object') return { mapValue: toFirestoreFields(value) };
  throw new Error('Unsupported Firestore test value.');
}

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

async function firestoreRequest(path, { method = 'GET', idToken, data } = {}) {
  const headers = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  if (data) headers['Content-Type'] = 'application/json';

  return fetch(`${firestoreBase}/${path}`, {
    method,
    headers,
    body: data ? JSON.stringify(toFirestoreFields(data)) : undefined,
  });
}

async function expectFirestoreStatus(path, options, expectedStatus, message) {
  const response = await firestoreRequest(path, options);
  assert.equal(response.status, expectedStatus, message);
}

async function setAdminDoc(path, data) {
  await adminDb.doc(path).set(data);
}

async function getAdminDoc(path) {
  const snapshot = await adminDb.doc(path).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function createAuthUser({ uid, email }) {
  const password = 'TestPassword123!';
  await adminAuth.createUser({
    uid,
    email,
    password,
    emailVerified: true,
  });

  const response = await requestJson(`${authBase}/accounts:signInWithPassword?key=fake-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  return {
    uid: response.localId,
    idToken: response.idToken,
  };
}

async function seedTenant() {
  await setAdminDoc(`tenants/${TENANT_ID}`, {
    slug: TENANT_ID,
    domain: 'bp-kallis.homelabshare.gr',
    displayName: 'BP Kallis',
    status: 'ACTIVE',
  });

  await setAdminDoc('users/test-owner-uid', {
    uid: 'test-owner-uid',
    email: 'owner@example.test',
    displayName: 'Test Owner',
    status: 'ACTIVE',
  });

  await setAdminDoc(`tenantMemberships/test-owner-uid_${TENANT_ID}`, {
    uid: 'test-owner-uid',
    tenantId: TENANT_ID,
    role: 'OWNER',
    status: 'ACTIVE',
  });

  await setAdminDoc(`tenantMemberships/test-inactive-uid_${TENANT_ID}`, {
    uid: 'test-inactive-uid',
    tenantId: TENANT_ID,
    role: 'OWNER',
    status: 'SUSPENDED',
  });

  await setAdminDoc(`tenantMemberships/test-invalid-role-uid_${TENANT_ID}`, {
    uid: 'test-invalid-role-uid',
    tenantId: TENANT_ID,
    role: 'VIEWER',
    status: 'ACTIVE',
  });

  await setAdminDoc('tenants/eko-example', {
    slug: 'eko-example',
    domain: 'eko-example.homelabshare.gr',
    displayName: 'EKO Example',
    status: 'ACTIVE',
  });

  await setAdminDoc('tenantMemberships/other-uid_eko-example', {
    uid: 'other-uid',
    tenantId: 'eko-example',
    role: 'OWNER',
    status: 'ACTIVE',
  });

  await setAdminDoc(`tenantMemberships/delete-target-uid_${TENANT_ID}`, {
    uid: 'delete-target-uid',
    tenantId: TENANT_ID,
    role: 'MANAGER',
    status: 'ACTIVE',
  });
}

async function callFunction(name, { data, origin, idToken }) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: origin,
  };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  const response = await fetch(`${functionsBase}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

function getFunctionResult(call) {
  assertCondition(call.ok, `Callable failed: ${JSON.stringify(call.body)}`);
  return call.body.result;
}

async function expectFunctionFailure(name, args, expectedReason) {
  const call = await callFunction(name, args);
  assert.equal(call.ok, false, `${name} should fail`);
  const reason = call.body?.error?.details?.reason || call.body?.error?.message || '';
  assert.equal(reason, expectedReason, `${name} should fail with ${expectedReason}`);
}

async function createTicket({ idToken, returnTo = `${TENANT_ORIGIN}/app`, tenantId = TENANT_ID } = {}) {
  const call = await callFunction('createAuthTicket', {
    origin: CENTRAL_ORIGIN,
    idToken,
    data: { returnTo, tenantId },
  });
  const result = getFunctionResult(call);
  const redirectUrl = new URL(result.redirectUrl);
  const params = new URLSearchParams(redirectUrl.hash.slice(1));
  const ticket = params.get('authTicket');
  assert.match(ticket, /^[a-f0-9]{64}$/i, 'redirect URL must contain a hex auth ticket in fragment');
  return { ticket, redirectUrl: result.redirectUrl, expiresAt: result.expiresAt };
}

async function run() {
  assertCondition(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator host must be set.');
  assertCondition(process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth emulator host must be set.');

  await seedTenant();

  const owner = await createAuthUser({ uid: 'test-owner-uid', email: 'owner@example.test' });
  assert.equal(owner.uid, 'test-owner-uid', 'Auth emulator should create the expected owner uid');

  const ownMembershipRead = await fetch(`${firestoreBase}/tenantMemberships/test-owner-uid_${TENANT_ID}`, {
    headers: { Authorization: `Bearer ${owner.idToken}` },
  });
  assert.equal(ownMembershipRead.status, 200, 'client may read its own active tenant membership');

  const crossTenantMembershipRead = await fetch(`${firestoreBase}/tenantMemberships/other-uid_eko-example`, {
    headers: { Authorization: `Bearer ${owner.idToken}` },
  });
  assert.equal(crossTenantMembershipRead.status, 403, 'client must not read memberships from another tenant');

  const crossTenantMembershipCreate = await fetch(`${firestoreBase}/tenantMemberships/escalated-uid_eko-example`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${owner.idToken}`,
    },
    body: JSON.stringify(
      toFirestoreFields({
        uid: 'escalated-uid',
        tenantId: 'eko-example',
        role: 'OWNER',
        status: 'ACTIVE',
      }),
    ),
  });
  assert.equal(crossTenantMembershipCreate.status, 403, 'client tenant admin must not create tenantMemberships for another tenant');

  const ownMembershipUpdate = await fetch(`${firestoreBase}/tenantMemberships/test-owner-uid_${TENANT_ID}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${owner.idToken}`,
    },
    body: JSON.stringify(
      toFirestoreFields({
        uid: 'test-owner-uid',
        tenantId: TENANT_ID,
        role: 'ADMIN',
        status: 'ACTIVE',
      }),
    ),
  });
  assert.equal(ownMembershipUpdate.status, 403, 'client must not update tenantMemberships');

  const sameTenantMembershipDelete = await fetch(`${firestoreBase}/tenantMemberships/delete-target-uid_${TENANT_ID}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${owner.idToken}` },
  });
  assert.equal(sameTenantMembershipDelete.status, 403, 'client tenant admin must not delete tenantMemberships');

  const legacyCollections = [
    'employees',
    'shifts',
    'shiftTemplates',
    'employeeAbsences',
    'employeeAbsencesPublic',
    'attendance_history',
    'week_locks',
    'week_history',
    'week_templates',
    'scheduler_settings',
    'announcements',
    'audit_logs',
    'published_schedules',
  ];
  for (const collectionName of legacyCollections) {
    await expectFirestoreStatus(
      `${collectionName}/lockdown-test`,
      { idToken: owner.idToken },
      403,
      `admin client must not read legacy global ${collectionName}`,
    );
    await expectFirestoreStatus(
      `${collectionName}/lockdown-test`,
      { method: 'PATCH', idToken: owner.idToken, data: { title: 'denied' } },
      403,
      `admin client must not write legacy global ${collectionName}`,
    );
    await expectFirestoreStatus(
      `${collectionName}/lockdown-test`,
      {},
      403,
      `anonymous client must not read legacy global ${collectionName}`,
    );
  }

  const tenantWriteCases = [
    ['employees/lockdown-employee', { fullName: 'Lockdown Employee' }],
    ['shifts/lockdown-shift', { employeeId: 'lockdown-employee', date: '2026-01-05', startTime: '08:00', endTime: '16:00' }],
    ['absences/lockdown-absence', { employeeId: 'lockdown-employee', type: 'LEAVE', startDate: '2026-01-06', endDate: '2026-01-06', replacementMode: 'AUTO' }],
    ['settings/scheduler', { generatorRules: {} }],
    ['announcements/lockdown-announcement', { title: 'Lockdown Announcement', body: 'Tenant-scoped rules test.' }],
  ];
  for (const [path, data] of tenantWriteCases) {
    await expectFirestoreStatus(
      `tenants/${TENANT_ID}/${path}`,
      { method: 'PATCH', idToken: owner.idToken, data },
      200,
      `bp-kallis admin must write tenant-scoped ${path}`,
    );
    await expectFirestoreStatus(
      `tenants/${TENANT_ID}/${path}`,
      { idToken: owner.idToken },
      200,
      `bp-kallis admin must read tenant-scoped ${path}`,
    );
  }

  await setAdminDoc(`tenants/${TENANT_ID}/publicSchedules/2026-01-05`, {
    tenantId: TENANT_ID,
    weekStart: '2026-01-05',
    weekEnd: '2026-01-11',
    shiftCount: 0,
    shifts: [],
  });
  await setAdminDoc(`tenants/${TENANT_ID}/publicMonths/2026-01`, {
    tenantId: TENANT_ID,
    yearMonth: '2026-01',
    monthStart: '2026-01-01',
    monthEnd: '2026-01-31',
    shiftCount: 0,
    shifts: [],
  });
  await setAdminDoc(`tenants/${TENANT_ID}/publicEmployees/lockdown-employee`, {
    tenantId: TENANT_ID,
    fullName: 'Lockdown Employee',
  });
  await setAdminDoc(`tenants/${TENANT_ID}/publicAnnouncements/lockdown-announcement`, {
    tenantId: TENANT_ID,
    title: 'Public',
    body: 'Public tenant announcement.',
  });

  for (const path of [
    'publicSchedules/2026-01-05',
    'publicMonths/2026-01',
    'publicEmployees/lockdown-employee',
    'publicAnnouncements/lockdown-announcement',
  ]) {
    await expectFirestoreStatus(
      `tenants/${TENANT_ID}/${path}`,
      {},
      200,
      `anonymous client must read sanitized tenant public ${path}`,
    );
  }
  for (const path of ['employees/lockdown-employee', 'shifts/lockdown-shift', 'absences/lockdown-absence']) {
    await expectFirestoreStatus(
      `tenants/${TENANT_ID}/${path}`,
      {},
      403,
      `anonymous client must not read raw tenant ${path}`,
    );
  }
  for (const path of ['employees/lockdown-employee', 'shifts/lockdown-shift', 'absences/lockdown-absence']) {
    await expectFirestoreStatus(
      `tenants/eko-example/${path}`,
      { idToken: owner.idToken },
      403,
      `bp-kallis admin must not read cross-tenant ${path}`,
    );
    await expectFirestoreStatus(
      `tenants/eko-example/${path}`,
      { method: 'PATCH', idToken: owner.idToken, data: { fullName: 'Denied' } },
      403,
      `bp-kallis admin must not write cross-tenant ${path}`,
    );
  }

  const { ticket, redirectUrl, expiresAt } = await createTicket({ idToken: owner.idToken });
  assert.ok(redirectUrl.startsWith(`${TENANT_ORIGIN}/app#authTicket=`), 'redirect must target tenant fragment');
  assert.ok(expiresAt > Date.now(), 'ticket expiry must be in the future');

  const rawTicketDoc = await getAdminDoc(`authTickets/${ticket}`);
  assert.equal(rawTicketDoc, null, 'raw ticket must not be stored as a Firestore document id');

  const crypto = await import('node:crypto');
  const ticketHash = crypto.createHash('sha256').update(ticket, 'utf8').digest('hex');
  const ticketDoc = await getAdminDoc(`authTickets/${ticketHash}`);
  assert.ok(ticketDoc, 'hashed ticket document must exist');
  assert.equal(ticketDoc.status, 'PENDING', 'new ticket must be PENDING');
  assert.equal(ticketDoc.tenantId, TENANT_ID, 'ticket tenant id must be stored');
  assert.equal(ticketDoc.role, 'OWNER', 'ticket role must be stored');
  assert.equal(ticketDoc.allowedTenantOrigin, TENANT_ORIGIN, 'tenant origin must be bound to ticket');
  const ttlMs = ticketDoc.expiresAt.toMillis() - ticketDoc.createdAtMs;
  assert.equal(ttlMs, 60_000, 'ticket TTL must be 60 seconds');

  const exchange = await callFunction('exchangeAuthTicket', {
    origin: TENANT_ORIGIN,
    data: { ticket },
  });
  const exchangeResult = getFunctionResult(exchange);
  assert.ok(exchangeResult.customToken, 'exchange must return a custom token');
  assert.equal(exchangeResult.tenantId, TENANT_ID, 'exchange returns tenant id');
  assert.equal(exchangeResult.role, 'OWNER', 'exchange returns role');

  const usedTicketDoc = await getAdminDoc(`authTickets/${ticketHash}`);
  assert.equal(usedTicketDoc.status, 'USED', 'ticket must become USED');
  assert.equal(usedTicketDoc.usedByOrigin, TENANT_ORIGIN, 'used origin must be recorded');

  await expectFunctionFailure('exchangeAuthTicket', {
    origin: TENANT_ORIGIN,
    data: { ticket },
  }, 'ticket-used');

  const wrongOriginTicket = await createTicket({ idToken: owner.idToken });
  await expectFunctionFailure('exchangeAuthTicket', {
    origin: 'https://eko-example.homelabshare.gr',
    data: { ticket: wrongOriginTicket.ticket },
  }, 'invalid-tenant-origin');

  await expectFunctionFailure('exchangeAuthTicket', {
    origin: TENANT_ORIGIN,
    data: { ticket: 'bad-ticket' },
  }, 'invalid-ticket');

  await expectFunctionFailure('exchangeAuthTicket', {
    origin: TENANT_ORIGIN,
    data: { ticket: 'c'.repeat(64) },
  }, 'ticket-not-found');

  const expired = await createTicket({ idToken: owner.idToken });
  const expiredHash = crypto.createHash('sha256').update(expired.ticket, 'utf8').digest('hex');
  await setAdminDoc(`authTickets/${expiredHash}`, {
    uid: 'test-owner-uid',
    tenantId: TENANT_ID,
    role: 'OWNER',
    status: 'PENDING',
    returnTo: `${TENANT_ORIGIN}/app`,
    returnToHost: 'bp-kallis.homelabshare.gr',
    centralOrigin: CENTRAL_ORIGIN,
    allowedTenantOrigin: TENANT_ORIGIN,
    createdAtMs: Date.now() - 120_000,
    expiresAt: Timestamp.fromMillis(946_684_800_000),
    requestId: 'expired-test',
  });
  await expectFunctionFailure('exchangeAuthTicket', {
    origin: TENANT_ORIGIN,
    data: { ticket: expired.ticket },
  }, 'ticket-expired');

  const inactive = await createAuthUser({ uid: 'test-inactive-uid', email: 'inactive@example.test' });
  await expectFunctionFailure('createAuthTicket', {
    origin: CENTRAL_ORIGIN,
    idToken: inactive.idToken,
    data: { returnTo: `${TENANT_ORIGIN}/app`, tenantId: TENANT_ID },
  }, 'inactive-or-invalid-membership');

  const invalidRole = await createAuthUser({ uid: 'test-invalid-role-uid', email: 'viewer@example.test' });
  await expectFunctionFailure('createAuthTicket', {
    origin: CENTRAL_ORIGIN,
    idToken: invalidRole.idToken,
    data: { returnTo: `${TENANT_ORIGIN}/app`, tenantId: TENANT_ID },
  }, 'inactive-or-invalid-membership');

  const missingMembership = await createAuthUser({ uid: 'test-missing-uid', email: 'missing@example.test' });
  await expectFunctionFailure('createAuthTicket', {
    origin: CENTRAL_ORIGIN,
    idToken: missingMembership.idToken,
    data: { returnTo: `${TENANT_ORIGIN}/app`, tenantId: TENANT_ID },
  }, 'missing-membership');

  await expectFunctionFailure('createAuthTicket', {
    origin: CENTRAL_ORIGIN,
    idToken: owner.idToken,
    data: { returnTo: 'https://unknown.homelabshare.gr/app', tenantId: 'unknown' },
  }, 'tenant-not-found');

  for (const [returnTo, expectedReason] of [
    ['https://evil.com', 'unknown-tenant-host'],
    ['javascript:alert(1)', 'invalid-protocol'],
    ['data:text/html,hi', 'invalid-protocol'],
    ['https://user:pass@bp-kallis.homelabshare.gr/app', 'url-credentials-not-allowed'],
    ['https://unknown.homelabshare.gr/app', 'tenant-mismatch'],
    ['https://gas.homelabshare.gr/login', 'central-return-not-allowed'],
  ]) {
    await expectFunctionFailure('createAuthTicket', {
      origin: CENTRAL_ORIGIN,
      idToken: owner.idToken,
      data: { returnTo, tenantId: TENANT_ID },
    }, expectedReason);
  }

  await expectFunctionFailure('createAuthTicket', {
    origin: 'https://evil.com',
    idToken: owner.idToken,
    data: { returnTo: `${TENANT_ORIGIN}/app`, tenantId: TENANT_ID },
  }, 'invalid-central-origin');

  const authTicketClientRead = await fetch(`${firestoreBase}/authTickets/${ticketHash}`, {
    headers: { Authorization: `Bearer ${owner.idToken}` },
  });
  assert.equal(authTicketClientRead.status, 403, 'client must not read authTickets through Firestore rules');

  const authTicketClientWrite = await fetch(`${firestoreBase}/authTickets/client-write-test`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${owner.idToken}`,
    },
    body: JSON.stringify(toFirestoreFields({ status: 'PENDING' })),
  });
  assert.equal(authTicketClientWrite.status, 403, 'client must not write authTickets through Firestore rules');

  console.log('Auth broker emulator checks passed');
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
