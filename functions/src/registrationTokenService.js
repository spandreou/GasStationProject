import { createHash } from 'node:crypto';
import {
  FieldValue,
  Timestamp,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  REGISTRATION_TOKEN_STATUS,
  deriveEffectiveStatus,
  generateRawRegistrationToken,
  hashRegistrationToken,
  validateRegistrationTokenFormat,
  validateTokenGenerationInput,
} from './registrationTokenCore.js';

export async function assertActivePlatformAdmin(db, uid) {
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Απαιτείται ταυτοποίηση.');
  }

  const snapshot = await db.doc(`platformAdmins/${uid}`).get();
  if (!snapshot.exists || snapshot.data()?.status !== 'ACTIVE') {
    throw new HttpsError('permission-denied', 'Απαιτούνται δικαιώματα διαχειριστή πλατφόρμας.');
  }

  return snapshot.data();
}

export async function checkRateLimit(db, clientIdentifier, options = {}) {
  const maxAttempts = options.maxAttempts || 15;
  const windowMs = options.windowMs || 5 * 60 * 1000; // 5 minutes
  const safeIdentifier = String(clientIdentifier || 'unknown').trim();
  const bucket = Math.floor(Date.now() / windowMs);
  const rateLimitKey = createHash('sha256')
    .update(`rl_val_${safeIdentifier}_${bucket}`)
    .digest('hex');

  const ref = db.doc(`rateLimits/${rateLimitKey}`);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      transaction.set(ref, {
        count: 1,
        expiresAt: Timestamp.fromMillis(Date.now() + windowMs * 2),
      });
    } else {
      const currentCount = snap.data()?.count || 0;
      if (currentCount >= maxAttempts) {
        throw new HttpsError(
          'resource-exhausted',
          'Υπέρβαση ορίου αιτημάτων. Παρακαλώ δοκιμάστε ξανά αργότερα.',
          { reason: 'rate-limit-exceeded' },
        );
      }
      transaction.update(ref, {
        count: FieldValue.increment(1),
      });
    }
  });
}

export async function generateTokenService(db, { adminUid, expiresInHours, label, businessCategoryHint }) {
  const validated = validateTokenGenerationInput({ expiresInHours, label, businessCategoryHint });
  const rawToken = generateRawRegistrationToken();
  const tokenHash = hashRegistrationToken(rawToken);
  const ttlMs = validated.expiresInHours * 60 * 60 * 1000;
  const expiresAt = Timestamp.fromMillis(Date.now() + ttlMs);

  const tokenRef = db.doc(`registrationTokens/${tokenHash}`);
  const auditRef = db.collection('platformAuditLogs').doc();

  const batch = db.batch();
  batch.set(tokenRef, {
    status: REGISTRATION_TOKEN_STATUS.active,
    tokenHash,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    createdBy: adminUid,
    label: validated.label,
    businessCategoryHint: validated.businessCategoryHint,
    revokedAt: null,
    revokedBy: null,
    consumedAt: null,
    consumedBy: null,
    consumptionMetadata: null,
  });

  batch.set(auditRef, {
    action: 'REGISTRATION_TOKEN_GENERATED',
    tokenId: tokenHash,
    actorUid: adminUid,
    timestamp: FieldValue.serverTimestamp(),
    details: {
      expiresAt: expiresAt.toDate().toISOString(),
      label: validated.label,
      businessCategoryHint: validated.businessCategoryHint,
    },
  });

  await batch.commit();

  return {
    success: true,
    token: rawToken,
    tokenId: tokenHash,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toDate().toISOString(),
    label: validated.label,
    businessCategoryHint: validated.businessCategoryHint,
  };
}

export async function listTokensService(db, { limit = 20, startAfterCursor } = {}) {
  const pageSize = Math.min(Math.max(Number.isInteger(limit) ? limit : 20, 1), 100);

  let query = db.collection('registrationTokens').orderBy('createdAt', 'desc').limit(pageSize);

  if (startAfterCursor && typeof startAfterCursor === 'string') {
    const cursorDoc = await db.doc(`registrationTokens/${startAfterCursor}`).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  const snapshot = await query.get();

  const tokens = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      tokenId: doc.id,
      status: deriveEffectiveStatus(data),
      rawStatus: data.status || 'UNKNOWN',
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
      expiresAt: data.expiresAt?.toDate?.()?.toISOString?.() || null,
      revokedAt: data.revokedAt?.toDate?.()?.toISOString?.() || null,
      consumedAt: data.consumedAt?.toDate?.()?.toISOString?.() || null,
      createdBy: data.createdBy || null,
      label: data.label || null,
      businessCategoryHint: data.businessCategoryHint || null,
    };
  });

  const nextCursor =
    snapshot.docs.length === pageSize ? snapshot.docs[snapshot.docs.length - 1].id : null;

  return {
    success: true,
    tokens,
    nextCursor,
  };
}

export async function revokeTokenService(db, { adminUid, tokenId }) {
  if (!tokenId || typeof tokenId !== 'string') {
    throw new HttpsError('invalid-argument', 'Το tokenId είναι απαραίτητο.');
  }

  const tokenRef = db.doc(`registrationTokens/${tokenId.trim()}`);

  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(tokenRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Το registration token δεν βρέθηκε.');
    }

    const data = snap.data();
    if (data.status === REGISTRATION_TOKEN_STATUS.consumed) {
      throw new HttpsError(
        'failed-precondition',
        'Το registration token έχει ήδη καταναλωθεί και δεν μπορεί να ανακληθεί.',
      );
    }

    if (data.status === REGISTRATION_TOKEN_STATUS.revoked) {
      return { success: true, tokenId: snap.id, status: 'REVOKED', idempotent: true };
    }

    transaction.update(tokenRef, {
      status: REGISTRATION_TOKEN_STATUS.revoked,
      revokedAt: FieldValue.serverTimestamp(),
      revokedBy: adminUid,
    });

    const auditRef = db.collection('platformAuditLogs').doc();
    transaction.set(auditRef, {
      action: 'REGISTRATION_TOKEN_REVOKED',
      tokenId: snap.id,
      actorUid: adminUid,
      timestamp: FieldValue.serverTimestamp(),
      details: {
        label: data.label || null,
        businessCategoryHint: data.businessCategoryHint || null,
      },
    });

    return { success: true, tokenId: snap.id, status: 'REVOKED' };
  });
}

export async function validateTokenService(db, { rawToken, clientIdentifier }) {
  if (clientIdentifier) {
    await checkRateLimit(db, clientIdentifier);
  }

  const validation = validateRegistrationTokenFormat(rawToken);
  if (!validation.valid) {
    return { valid: false };
  }

  const tokenHash = hashRegistrationToken(validation.token);
  const snap = await db.doc(`registrationTokens/${tokenHash}`).get();

  if (!snap.exists) {
    return { valid: false };
  }

  const data = snap.data();
  const effectiveStatus = deriveEffectiveStatus(data);

  if (effectiveStatus !== 'ACTIVE') {
    return { valid: false };
  }

  return {
    valid: true,
    expiresAt: data.expiresAt?.toDate?.()?.toISOString?.() || null,
    label: data.label || null,
    businessCategoryHint: data.businessCategoryHint || null,
  };
}

export async function consumeRegistrationToken(
  transaction,
  { db, rawToken, consumedBy = null, metadata = null },
) {
  const validation = validateRegistrationTokenFormat(rawToken);
  if (!validation.valid) {
    const error = new Error('invalid-registration-token-format');
    error.code = 'INVALID_FORMAT';
    throw error;
  }

  const tokenHash = hashRegistrationToken(validation.token);
  const tokenRef = db.doc(`registrationTokens/${tokenHash}`);
  const snap = await transaction.get(tokenRef);

  if (!snap.exists) {
    const error = new Error('registration-token-not-found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const data = snap.data();
  const effectiveStatus = deriveEffectiveStatus(data);

  if (data.status === REGISTRATION_TOKEN_STATUS.consumed) {
    const error = new Error('registration-token-already-consumed');
    error.code = 'ALREADY_CONSUMED';
    throw error;
  }

  if (data.status === REGISTRATION_TOKEN_STATUS.revoked) {
    const error = new Error('registration-token-revoked');
    error.code = 'REVOKED';
    throw error;
  }

  if (effectiveStatus === 'EXPIRED') {
    const error = new Error('registration-token-expired');
    error.code = 'EXPIRED';
    throw error;
  }

  if (effectiveStatus !== 'ACTIVE') {
    const error = new Error('registration-token-inactive');
    error.code = 'INACTIVE';
    throw error;
  }

  transaction.update(tokenRef, {
    status: REGISTRATION_TOKEN_STATUS.consumed,
    consumedAt: FieldValue.serverTimestamp(),
    consumedBy: consumedBy || null,
    consumptionMetadata: metadata || null,
  });

  const auditRef = db.collection('platformAuditLogs').doc();
  transaction.set(auditRef, {
    action: 'REGISTRATION_TOKEN_CONSUMED',
    tokenId: tokenHash,
    actorUid: consumedBy || null,
    timestamp: FieldValue.serverTimestamp(),
    details: {
      label: data.label || null,
      businessCategoryHint: data.businessCategoryHint || null,
      metadata: metadata || null,
    },
  });

  return {
    success: true,
    tokenId: tokenHash,
    label: data.label || null,
    businessCategoryHint: data.businessCategoryHint || null,
  };
}
