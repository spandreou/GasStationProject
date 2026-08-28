import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  deriveEffectiveStatus,
  extractExpiresAtMs,
  generateManagementTokenId,
  generateRawRegistrationToken,
  hashRegistrationToken,
  validateConsumedByActor,
  validateRegistrationTokenFormat,
  validateTokenGenerationInput,
  validateTokenListInput,
  validateTokenRevokeInput,
} from './registrationTokenCore.js';

export const RATE_LIMIT_DOC_ID = 'registration_token_public_validation';
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
export const RATE_LIMIT_MAX_ATTEMPTS = 60; // 60 attempts / minute globally

export async function assertActivePlatformAdmin(db, uid) {
  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('unauthenticated', 'Απαιτείται ταυτοποίηση χρήστη.');
  }

  const adminSnap = await db.doc(`platformAdmins/${uid}`).get();
  if (!adminSnap.exists || adminSnap.data()?.status !== 'ACTIVE') {
    throw new HttpsError('permission-denied', 'Δεν έχετε δικαιώματα διαχειριστή πλατφόρμας.');
  }

  return adminSnap.data();
}

export async function checkGlobalValidationRateLimit(db, nowMs = Date.now()) {
  const rateLimitRef = db.doc(`rateLimits/${RATE_LIMIT_DOC_ID}`);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(rateLimitRef);
    if (!snap.exists) {
      transaction.set(rateLimitRef, {
        windowStartMs: nowMs,
        count: 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const data = snap.data();
    const windowStartMs = Number(data.windowStartMs) || 0;
    const currentCount = Number(data.count) || 0;

    if (nowMs - windowStartMs >= RATE_LIMIT_WINDOW_MS) {
      transaction.set(rateLimitRef, {
        windowStartMs: nowMs,
        count: 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    if (currentCount >= RATE_LIMIT_MAX_ATTEMPTS) {
      throw new HttpsError(
        'resource-exhausted',
        'Υπέρβαση ορίου αιτημάτων ελέγχου. Παρακαλώ δοκιμάστε ξανά σε λίγο.',
      );
    }

    transaction.update(rateLimitRef, {
      count: currentCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function generateTokenService(db, { adminUid, input }) {
  if (!adminUid || typeof adminUid !== 'string') {
    throw new HttpsError('unauthenticated', 'Απαιτείται ταυτοποίηση διαχειριστή.');
  }

  const validatedInput = validateTokenGenerationInput(input);

  const rawToken = generateRawRegistrationToken();
  const tokenHash = hashRegistrationToken(rawToken);
  const tokenId = generateManagementTokenId();

  const nowMs = Date.now();
  const expiresAtMs = nowMs + validatedInput.expiresInHours * 3600 * 1000;
  const auditId = randomUUID();

  const tokenRef = db.doc(`registrationTokens/${tokenId}`);
  const lookupRef = db.doc(`registrationTokenLookups/${tokenHash}`);
  const auditRef = db.doc(`platformAuditLogs/${auditId}`);

  await db.runTransaction(async (transaction) => {
    // 1. Create main management document (canonical expiresAt Timestamp only)
    transaction.set(tokenRef, {
      tokenId,
      status: 'ACTIVE',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAtMs),
      revokedAt: null,
      revokedBy: null,
      consumedAt: null,
      consumedBy: null,
      label: validatedInput.label,
      businessCategoryHint: validatedInput.businessCategoryHint,
      createdBy: adminUid,
    });

    // 2. Create server-only lookup link
    transaction.set(lookupRef, {
      tokenId,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(expiresAtMs),
    });

    // 3. Record sanitized audit log with opaque management tokenId
    transaction.set(auditRef, {
      action: 'REGISTRATION_TOKEN_GENERATED',
      tokenId,
      actorUid: adminUid,
      createdAt: FieldValue.serverTimestamp(),
      label: validatedInput.label,
      businessCategoryHint: validatedInput.businessCategoryHint,
      expiresAt: Timestamp.fromMillis(expiresAtMs),
    });
  });

  return {
    success: true,
    tokenId,
    token: rawToken,
    expiresAt: expiresAtMs,
  };
}

export async function listTokensService(db, { input }) {
  const validated = validateTokenListInput(input);

  let query = db.collection('registrationTokens').orderBy('createdAt', 'desc').limit(validated.limit);

  if (validated.startAfterCursor) {
    const cursorDoc = await db.doc(`registrationTokens/${validated.startAfterCursor}`).get();
    if (!cursorDoc.exists) {
      throw new HttpsError('invalid-argument', 'Invalid pagination cursor: token does not exist.');
    }
    query = query.startAfter(cursorDoc);
  }

  const snapshot = await query.get();
  const nowMs = Date.now();

  const tokens = snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    const status = deriveEffectiveStatus(data, nowMs);

    return {
      tokenId: docSnap.id,
      status,
      createdAt: data.createdAt?.toMillis?.() || null,
      expiresAt: extractExpiresAtMs(data),
      revokedAt: data.revokedAt?.toMillis?.() || null,
      consumedAt: data.consumedAt?.toMillis?.() || null,
      label: data.label || null,
      businessCategoryHint: data.businessCategoryHint || null,
    };
  });

  let nextCursor = null;
  if (snapshot.docs.length === validated.limit) {
    nextCursor = snapshot.docs[snapshot.docs.length - 1].id;
  }

  return {
    success: true,
    tokens,
    nextCursor,
  };
}

export async function revokeTokenService(db, { adminUid, input }) {
  if (!adminUid || typeof adminUid !== 'string') {
    throw new HttpsError('unauthenticated', 'Απαιτείται ταυτοποίηση διαχειριστή.');
  }

  const validated = validateTokenRevokeInput(input);
  const tokenRef = db.doc(`registrationTokens/${validated.tokenId}`);
  const auditId = randomUUID();
  const auditRef = db.doc(`platformAuditLogs/${auditId}`);

  let finalStatus = 'REVOKED';

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(tokenRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Το registration token δεν βρέθηκε.');
    }

    const tokenData = snap.data();
    if (tokenData.status === 'CONSUMED') {
      throw new HttpsError(
        'failed-precondition',
        'Το token έχει ήδη χρησιμοποιηθεί και δεν μπορεί να ανακληθεί.',
      );
    }

    // Idempotent revocation
    if (tokenData.status === 'REVOKED') {
      finalStatus = 'REVOKED';
      return;
    }

    transaction.update(tokenRef, {
      status: 'REVOKED',
      revokedAt: FieldValue.serverTimestamp(),
      revokedBy: adminUid,
    });

    transaction.set(auditRef, {
      action: 'REGISTRATION_TOKEN_REVOKED',
      tokenId: validated.tokenId,
      actorUid: adminUid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return {
    success: true,
    status: finalStatus,
  };
}

export async function validateTokenService(db, { rawToken }) {
  // 1. Enforce global bounded rate limit
  await checkGlobalValidationRateLimit(db);

  // 2. Syntax check
  const validation = validateRegistrationTokenFormat(rawToken);
  if (!validation.valid) {
    return { valid: false };
  }

  // 3. Hash computation
  const tokenHash = hashRegistrationToken(validation.token);

  // 4. Server-only lookup
  const lookupSnap = await db.doc(`registrationTokenLookups/${tokenHash}`).get();
  if (!lookupSnap.exists) {
    return { valid: false };
  }

  const tokenId = lookupSnap.data()?.tokenId;
  if (!tokenId) {
    return { valid: false };
  }

  // 5. Read management token doc
  const tokenSnap = await db.doc(`registrationTokens/${tokenId}`).get();
  if (!tokenSnap.exists) {
    return { valid: false };
  }

  const tokenData = tokenSnap.data();
  const nowMs = Date.now();
  const effectiveStatus = deriveEffectiveStatus(tokenData, nowMs);

  if (effectiveStatus !== 'ACTIVE') {
    return { valid: false };
  }

  const expiresAtMs = extractExpiresAtMs(tokenData);

  // Safe minimal public response
  return {
    valid: true,
    expiresAt: expiresAtMs,
    businessCategoryHint: tokenData.businessCategoryHint || null,
  };
}

export async function consumeRegistrationToken(transaction, { db, rawToken, consumedBy }) {
  const cleanConsumedBy = validateConsumedByActor(consumedBy);

  const validation = validateRegistrationTokenFormat(rawToken);
  if (!validation.valid) {
    throw new Error('registration-token-invalid-format');
  }

  const tokenHash = hashRegistrationToken(validation.token);
  const lookupRef = db.doc(`registrationTokenLookups/${tokenHash}`);
  const lookupSnap = await transaction.get(lookupRef);

  if (!lookupSnap.exists) {
    throw new Error('registration-token-not-found');
  }

  const tokenId = lookupSnap.data()?.tokenId;
  if (!tokenId) {
    throw new Error('registration-token-corrupt-lookup');
  }

  const tokenRef = db.doc(`registrationTokens/${tokenId}`);
  const tokenSnap = await transaction.get(tokenRef);

  if (!tokenSnap.exists) {
    throw new Error('registration-token-not-found');
  }

  const tokenData = tokenSnap.data();
  const nowMs = Date.now();
  const effectiveStatus = deriveEffectiveStatus(tokenData, nowMs);

  if (effectiveStatus === 'REVOKED') {
    throw new Error('registration-token-revoked');
  }
  if (effectiveStatus === 'EXPIRED') {
    throw new Error('registration-token-expired');
  }
  if (effectiveStatus === 'CONSUMED') {
    throw new Error('registration-token-already-consumed');
  }
  if (effectiveStatus !== 'ACTIVE') {
    throw new Error('registration-token-not-active');
  }

  // Atomically update token to CONSUMED
  transaction.update(tokenRef, {
    status: 'CONSUMED',
    consumedAt: FieldValue.serverTimestamp(),
    consumedBy: cleanConsumedBy,
  });

  // Record audit log
  const auditId = randomUUID();
  const auditRef = db.doc(`platformAuditLogs/${auditId}`);
  transaction.set(auditRef, {
    action: 'REGISTRATION_TOKEN_CONSUMED',
    tokenId,
    actorUid: cleanConsumedBy,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    tokenId,
    status: 'CONSUMED',
    businessCategoryHint: tokenData.businessCategoryHint || null,
  };
}
