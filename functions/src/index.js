import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from 'firebase-admin/firestore';
import { onInit } from 'firebase-functions/v2/core';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  AUTH_TICKET_STATUS,
  AUTH_TICKET_TTL_MS,
  buildAuthTicketDocument,
  buildTenantTicketRedirectUrl,
  generateAuthTicket,
  hashAuthTicket,
  isActiveBrokerMembership,
  isAllowedBrokerOrigin,
  isAllowedTenantOrigin,
  resolveTenantIdFromHostname,
  resolveValidatedTenantOrigin,
  validateBrokerReturnTo,
  validateTicketFormat,
} from './authBrokerCore.js';
import {
  assertActivePlatformAdmin,
  generateTokenService,
  listTokensService,
  revokeTokenService,
  validateTokenService,
} from './registrationTokenService.js';
import { provisionTenantService } from './provisioningService.js';

let db;

function getDb() {
  if (!db) {
    if (!getApps().length) {
      initializeApp();
    }
    db = getFirestore();
  }
  return db;
}

onInit(() => {
  getDb();
});

const DEFAULT_BASE_DOMAIN = 'homelabshare.gr';
const DEFAULT_CENTRAL_DOMAIN = 'gas.homelabshare.gr';
const DEFAULT_CENTRAL_ORIGIN = `https://${DEFAULT_CENTRAL_DOMAIN}`;
const DEFAULT_TENANT_SLUG = 'bp-kallis';
const DEFAULT_TENANT_ORIGIN = 'https://bp-kallis.homelabshare.gr';
const RETENTION_MS = 24 * 60 * 60 * 1000;

function splitList(value, fallback = []) {
  const rows = String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return rows.length ? rows : fallback;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBrokerConfig() {
  const baseDomain = process.env.AUTH_BROKER_BASE_DOMAIN || DEFAULT_BASE_DOMAIN;
  const centralDomain = process.env.AUTH_BROKER_CENTRAL_DOMAIN || DEFAULT_CENTRAL_DOMAIN;
  const legacyBaseDomain =
    process.env.AUTH_BROKER_LEGACY_BASE_DOMAIN ||
    (baseDomain !== 'homelabshare.gr' ? 'homelabshare.gr' : '');
  const legacyCentralDomain =
    process.env.AUTH_BROKER_LEGACY_CENTRAL_DOMAIN ||
    (legacyBaseDomain ? 'gas.homelabshare.gr' : '');

  const domainFamilies = [
    {
      id: 'primary',
      baseDomain,
      centralDomain,
    },
  ];

  if (legacyBaseDomain && legacyCentralDomain && legacyBaseDomain !== baseDomain) {
    domainFamilies.push({
      id: 'legacy',
      baseDomain: legacyBaseDomain,
      centralDomain: legacyCentralDomain,
    });
  }

  const defaultCentralOrigins = domainFamilies.flatMap((f) => [
    `https://${f.centralDomain}`,
    ...(f.id === 'primary' ? [`https://www.${f.centralDomain}`] : []),
  ]);

  const centralOrigins = splitList(process.env.AUTH_BROKER_CENTRAL_ORIGINS, defaultCentralOrigins);
  const tenantOrigins = splitList(process.env.AUTH_BROKER_TENANT_ORIGINS, [
    `https://${DEFAULT_TENANT_SLUG}.${baseDomain}`,
    ...(legacyBaseDomain ? [`https://${DEFAULT_TENANT_SLUG}.${legacyBaseDomain}`] : []),
  ]);
  const production = process.env.AUTH_BROKER_ALLOW_LOCAL_DEV !== 'true';

  const tenantFamilyCorsRegexes = domainFamilies.map(
    (f) => new RegExp(`^https://[a-z0-9][a-z0-9-]{1,38}[a-z0-9]\\.${escapeRegex(f.baseDomain)}$`),
  );

  return {
    baseDomain,
    centralDomain,
    legacyBaseDomain,
    legacyCentralDomain,
    domainFamilies,
    centralOrigins,
    tenantOrigins,
    production,
    callableCorsOrigins: [
      ...new Set([...centralOrigins, ...tenantOrigins]),
      ...tenantFamilyCorsRegexes,
    ],
  };
}

function getRequestOrigin(request) {
  return String(request.rawRequest?.headers?.origin || '').trim();
}

function deny(reason = 'permission-denied') {
  throw new HttpsError('permission-denied', 'Δεν ήταν δυνατή η επιβεβαίωση πρόσβασης.', { reason });
}

function invalid(reason = 'invalid-argument') {
  throw new HttpsError('invalid-argument', 'Το αίτημα δεν είναι έγκυρο.', { reason });
}

function unavailable(reason = 'unavailable') {
  throw new HttpsError('unavailable', 'Η υπηρεσία σύνδεσης δεν είναι προσωρινά διαθέσιμη.', { reason });
}

async function getTenantOrDeny(tenantId) {
  const db = getDb();
  const snapshot = await db.doc(`tenants/${tenantId}`).get();
  if (!snapshot.exists) deny('tenant-not-found');
  const tenant = { id: snapshot.id, ...snapshot.data() };
  if (tenant.status && tenant.status !== 'ACTIVE') deny('tenant-inactive');
  return tenant;
}

function getTenantOriginFromTenant(tenant, fallbackTenantId, targetFamily) {
  const origin = resolveValidatedTenantOrigin({
    tenant,
    expectedTenantId: fallbackTenantId,
    targetFamily,
  });
  if (!origin) {
    deny('invalid-tenant-origin-configuration');
  }
  return origin;
}

async function getActiveMembershipOrDeny(uid, tenantId) {
  const db = getDb();
  const platformAdminSnap = await db.doc(`platformAdmins/${uid}`).get();
  if (platformAdminSnap.exists && platformAdminSnap.data()?.status === 'ACTIVE') {
    deny('platform-admin-tenant-access-forbidden');
  }
  const membershipId = `${uid}_${tenantId}`;
  const snapshot = await db.doc(`tenantMemberships/${membershipId}`).get();
  if (!snapshot.exists) deny('missing-membership');
  const membership = snapshot.data();
  if (membership.uid !== uid || membership.tenantId !== tenantId) deny('membership-mismatch');
  if (!isActiveBrokerMembership(membership)) deny('inactive-or-invalid-membership');
  return membership;
}

export const createAuthTicket = onCall(
  {
    cors: getBrokerConfig().callableCorsOrigins,
    region: process.env.AUTH_BROKER_FUNCTIONS_REGION || 'us-central1',
  },
  async (request) => {
    const config = getBrokerConfig();
    const origin = getRequestOrigin(request);

    if (!isAllowedBrokerOrigin(origin, config.centralOrigins)) {
      deny('invalid-central-origin');
    }

    const uid = request.auth?.uid;
    if (!uid) deny('missing-auth');

    const returnTo = String(request.data?.returnTo || '').trim();
    const requestedTenantId = String(request.data?.tenantId || '').trim().toLowerCase();
    if (!returnTo) invalid('missing-return-to');

    const validation = validateBrokerReturnTo({
      returnTo,
      expectedTenantId: requestedTenantId,
      domainFamilies: config.domainFamilies,
      callerOrigin: origin,
      allowedTenantIds: requestedTenantId ? [requestedTenantId] : [],
      production: config.production,
    });
    if (!validation.valid) invalid(validation.reason);

    const tenant = await getTenantOrDeny(validation.tenantId);
    const expectedOrigin = getTenantOriginFromTenant(tenant, validation.tenantId, validation.family);
    if (expectedOrigin !== validation.allowedTenantOrigin) {
      deny('tenant-origin-mismatch');
    }

    const membership = await getActiveMembershipOrDeny(uid, validation.tenantId);
    const ticket = generateAuthTicket();
    const ticketHash = hashAuthTicket(ticket);
    const nowMs = Date.now();
    const requestId = randomUUID();
    const ticketDoc = buildAuthTicketDocument({
      uid,
      tenantId: validation.tenantId,
      role: membership.role,
      returnTo: validation.url,
      returnToHost: validation.returnToHost,
      centralOrigin: origin,
      allowedTenantOrigin: validation.allowedTenantOrigin,
      requestId,
      nowMs,
    });

    const db = getDb();
    await db.doc(`authTickets/${ticketHash}`).set({
      ...ticketDoc,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(ticketDoc.expiresAtMs),
    });

    return {
      redirectUrl: buildTenantTicketRedirectUrl(validation.url, ticket),
      expiresAt: ticketDoc.expiresAtMs,
    };
  },
);

export const exchangeAuthTicket = onCall(
  {
    cors: getBrokerConfig().callableCorsOrigins,
    region: process.env.AUTH_BROKER_FUNCTIONS_REGION || 'us-central1',
  },
  async (request) => {
    const config = getBrokerConfig();
    const origin = getRequestOrigin(request);
    const isDynamicTenantOrigin = isAllowedTenantOrigin(origin, config.domainFamilies);
    const isStaticTenantOrigin = isAllowedBrokerOrigin(origin, config.tenantOrigins);
    if (!isDynamicTenantOrigin && !isStaticTenantOrigin) {
      deny('invalid-tenant-origin');
    }

    const ticketValidation = validateTicketFormat(request.data?.ticket);
    if (!ticketValidation.valid) invalid('invalid-ticket');

    const originUrl = new URL(origin);
    const originTenantId = resolveTenantIdFromHostname({
      hostname: originUrl.hostname,
      baseDomain: config.baseDomain,
      centralDomain: config.centralDomain,
      domainFamilies: config.domainFamilies,
    });
    if (!originTenantId) deny('invalid-tenant-host');

    const ticketHash = hashAuthTicket(ticketValidation.ticket);
    const db = getDb();
    const ticketRef = db.doc(`authTickets/${ticketHash}`);
    let consumedTicket = null;

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ticketRef);
      if (!snapshot.exists) deny('ticket-not-found');

      const ticket = snapshot.data();
      if (ticket.status !== AUTH_TICKET_STATUS.pending || ticket.usedAt) deny('ticket-used');
      if (ticket.expiresAt?.toMillis?.() <= Date.now()) deny('ticket-expired');
      if (ticket.allowedTenantOrigin !== origin) deny('ticket-origin-mismatch');
      if (ticket.tenantId !== originTenantId) deny('ticket-tenant-mismatch');

      const platformAdminRef = db.doc(`platformAdmins/${ticket.uid}`);
      const platformAdminSnapshot = await transaction.get(platformAdminRef);
      if (platformAdminSnapshot.exists && platformAdminSnapshot.data()?.status === 'ACTIVE') {
        deny('platform-admin-tenant-access-forbidden');
      }

      const membershipRef = db.doc(`tenantMemberships/${ticket.uid}_${ticket.tenantId}`);
      const membershipSnapshot = await transaction.get(membershipRef);
      if (!membershipSnapshot.exists) deny('missing-membership');
      const membership = membershipSnapshot.data();
      if (membership.uid !== ticket.uid || membership.tenantId !== ticket.tenantId) {
        deny('membership-mismatch');
      }
      if (!isActiveBrokerMembership(membership)) {
        deny('inactive-or-invalid-membership');
      }
      if (membership.role !== ticket.role) deny('membership-role-changed');

      transaction.update(ticketRef, {
        status: AUTH_TICKET_STATUS.used,
        usedAt: FieldValue.serverTimestamp(),
        usedByOrigin: origin,
      });

      consumedTicket = ticket;
    });

    if (!consumedTicket) unavailable('ticket-consume-failed');

    const customToken = await getAuth().createCustomToken(consumedTicket.uid, {
      tenantId: consumedTicket.tenantId,
      role: consumedTicket.role,
    });

    return {
      customToken,
      tenantId: consumedTicket.tenantId,
      role: consumedTicket.role,
    };
  },
);

export const cleanupAuthTickets = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: process.env.AUTH_BROKER_FUNCTIONS_REGION || 'us-central1',
  },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - RETENTION_MS);
    const expiredCutoff = Timestamp.fromMillis(Date.now() - AUTH_TICKET_TTL_MS);
    const refs = new Map();
    const db = getDb();

    const expired = await db.collection('authTickets').where('expiresAt', '<', expiredCutoff).limit(250).get();
    expired.docs.forEach((doc) => refs.set(doc.ref.path, doc.ref));

    const used = await db
      .collection('authTickets')
      .where('status', '==', AUTH_TICKET_STATUS.used)
      .where('usedAt', '<', cutoff)
      .limit(250)
      .get();
    used.docs.forEach((doc) => refs.set(doc.ref.path, doc.ref));

    if (refs.size === 0) return;

    const batch = db.batch();
    refs.forEach((ref) => batch.delete(ref));
    await batch.commit();
  },
);

export const generateRegistrationToken = onCall(
  {
    region: process.env.AUTH_BROKER_FUNCTIONS_REGION || 'us-central1',
  },
  async (request) => {
    const uid = request.auth?.uid;
    const db = getDb();
    await assertActivePlatformAdmin(db, uid);

    try {
      return await generateTokenService(db, {
        adminUid: uid,
        input: request.data,
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('invalid-argument', err.message || 'Αποτυχία δημιουργίας registration token.');
    }
  },
);

export const listRegistrationTokens = onCall(
  {
    region: process.env.AUTH_BROKER_FUNCTIONS_REGION || 'us-central1',
  },
  async (request) => {
    const uid = request.auth?.uid;
    const db = getDb();
    await assertActivePlatformAdmin(db, uid);

    try {
      return await listTokensService(db, {
        input: request.data,
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('invalid-argument', err.message || 'Αποτυχία ανάκτησης registration tokens.');
    }
  },
);

export const revokeRegistrationToken = onCall(
  {
    region: process.env.AUTH_BROKER_FUNCTIONS_REGION || 'us-central1',
  },
  async (request) => {
    const uid = request.auth?.uid;
    const db = getDb();
    await assertActivePlatformAdmin(db, uid);

    try {
      return await revokeTokenService(db, {
        adminUid: uid,
        input: request.data,
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('invalid-argument', err.message || 'Αποτυχία ανάκλησης registration token.');
    }
  },
);

export const validateRegistrationToken = onCall(
  {
    region: process.env.AUTH_BROKER_FUNCTIONS_REGION || 'us-central1',
  },
  async (request) => {
    const rawToken = request.data?.token;
    const db = getDb();
    try {
      return await validateTokenService(db, {
        rawToken,
      });
    } catch (err) {
      if (err instanceof HttpsError && err.code === 'resource-exhausted') {
        throw err;
      }
      return { valid: false };
    }
  },
);

export const provisionTenantFromRegistrationToken = onCall(
  {
    region: process.env.AUTH_BROKER_FUNCTIONS_REGION || 'us-central1',
  },
  async (request) => {
    const uid = request.auth?.uid;
    const email = request.auth?.token?.email;
    const db = getDb();

    if (!uid) {
      throw new HttpsError('unauthenticated', 'Απαιτείται ταυτοποίηση χρήστη.');
    }

    try {
      return await provisionTenantService(db, {
        callerUid: uid,
        callerEmail: email,
        input: request.data,
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      throw new HttpsError('internal', 'Αποτυχία αρχικοποίησης tenant.');
    }
  },
);


