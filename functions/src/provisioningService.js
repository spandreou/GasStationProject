import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { consumeRegistrationToken } from './registrationTokenService.js';
import {
  resolveCategoryAndTemplate,
  validateProvisioningInput,
} from './provisioningCore.js';

export async function provisionTenantService(db, { callerUid, callerEmail, input }) {
  if (!callerUid || typeof callerUid !== 'string') {
    throw new HttpsError('unauthenticated', 'Απαιτείται ταυτοποίηση χρήστη.');
  }

  let validated;
  try {
    validated = validateProvisioningInput(input);
  } catch (err) {
    throw new HttpsError('invalid-argument', err.message);
  }

  return await db.runTransaction(async (transaction) => {
    // 1. Platform Admin Overlap Check
    const platformAdminRef = db.doc(`platformAdmins/${callerUid}`);
    const platformAdminSnap = await transaction.get(platformAdminRef);
    if (platformAdminSnap.exists && platformAdminSnap.data()?.status === 'ACTIVE') {
      throw new HttpsError(
        'permission-denied',
        'Οι διαχειριστές πλατφόρμας δεν επιτρέπεται να δημιουργούν ή να κατέχουν tenants.',
      );
    }

    // 2. Canonical Membership Check (Source of Truth)
    // Fail-closed policy: An actor with ANY existing tenant membership cannot provision a new tenant in Phase 4 MVP.
    const canonicalMembershipsQuery = db.collection('tenantMemberships').where('uid', '==', callerUid).limit(1);
    const canonicalMembershipsSnap = await transaction.get(canonicalMembershipsQuery);
    if (!canonicalMembershipsSnap.empty) {
      throw new HttpsError(
        'failed-precondition',
        'Ο χρήστης έχει ήδη συσχετισμό με tenant.',
      );
    }

    // 3. Compatibility Mirror Integrity Check (users/{uid}.memberships)
    const userRef = db.doc(`users/${callerUid}`);
    const userSnap = await transaction.get(userRef);
    if (userSnap.exists) {
      const existingMemberships = userSnap.data()?.memberships;
      if (existingMemberships && typeof existingMemberships === 'object' && Object.keys(existingMemberships).length > 0) {
        throw new HttpsError(
          'failed-precondition',
          'Ο χρήστης έχει ήδη συσχετισμό με tenant.',
        );
      }
    }

    // 4. Tenant Collision Check
    const tenantRef = db.doc(`tenants/${validated.slug}`);
    const tenantSnap = await transaction.get(tenantRef);
    if (tenantSnap.exists) {
      throw new HttpsError(
        'already-exists',
        'Το αναγνωριστικό tenant χρησιμοποιείται ήδη.',
      );
    }

    // 5. Slug Reservation Collision Check
    const reservationRef = db.doc(`slugReservations/${validated.slug}`);
    const reservationSnap = await transaction.get(reservationRef);
    if (reservationSnap.exists) {
      throw new HttpsError(
        'already-exists',
        'Το αναγνωριστικό tenant χρησιμοποιείται ήδη.',
      );
    }

    // 6. Check & consume token atomically within the transaction
    let consumedToken;
    try {
      consumedToken = await consumeRegistrationToken(transaction, {
        db,
        rawToken: validated.token,
        consumedBy: callerUid,
      });
    } catch (err) {
      if (err.message === 'registration-token-expired') {
        throw new HttpsError('failed-precondition', 'Το registration token έχει λήξει.');
      }
      if (err.message === 'registration-token-revoked') {
        throw new HttpsError('failed-precondition', 'Το registration token έχει ανακληθεί.');
      }
      if (err.message === 'registration-token-already-consumed') {
        throw new HttpsError('failed-precondition', 'Το registration token έχει ήδη χρησιμοποιηθεί.');
      }
      if (
        err.message === 'registration-token-not-found' ||
        err.message === 'registration-token-invalid-format' ||
        err.message === 'registration-token-corrupt-lookup' ||
        err.message === 'registration-token-not-active'
      ) {
        throw new HttpsError('invalid-argument', 'Το registration token δεν είναι έγκυρο.');
      }
      throw new HttpsError('internal', 'Αποτυχία αρχικοποίησης tenant.');
    }

    // 7. Resolve category and template compatibility
    const resolvedConfig = resolveCategoryAndTemplate(
      validated.businessCategory,
      consumedToken.businessCategoryHint,
    );

    // 8. Write slug reservation
    transaction.set(reservationRef, {
      slug: validated.slug,
      tenantId: validated.slug,
      status: 'ACTIVE',
      reservedBy: callerUid,
      createdAt: FieldValue.serverTimestamp(),
    });

    // 9. Write tenant document (domain is null pending Phase 6 cutover)
    transaction.set(tenantRef, {
      slug: validated.slug,
      domain: null,
      displayName: validated.displayName,
      status: 'ACTIVE',
      businessCategory: resolvedConfig.businessCategory,
      templateId: resolvedConfig.templateId,
      templateVersion: resolvedConfig.templateVersion,
      brandingOverrides: {},
      customizationMode: resolvedConfig.customizationMode,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: callerUid,
    });

    // 10. Write tenantMemberships/{uid}_{tenantId}
    const membershipRef = db.doc(`tenantMemberships/${callerUid}_${validated.slug}`);
    transaction.set(membershipRef, {
      uid: callerUid,
      tenantId: validated.slug,
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      email: callerEmail || null,
    });

    // 11. Write/Update users/{uid}
    const newMemberships = {
      [validated.slug]: {
        role: 'OWNER',
        status: 'ACTIVE',
      },
    };

    if (userSnap.exists) {
      const updatePayload = {
        memberships: newMemberships,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (callerEmail && !userSnap.data()?.email) {
        updatePayload.email = callerEmail.trim().toLowerCase();
      }
      transaction.update(userRef, updatePayload);
    } else {
      transaction.set(userRef, {
        uid: callerUid,
        email: callerEmail ? callerEmail.trim().toLowerCase() : null,
        status: 'ACTIVE',
        memberships: newMemberships,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // 12. Write default settings: tenants/{slug}/settings/scheduler
    const settingsRef = db.doc(`tenants/${validated.slug}/settings/scheduler`);
    transaction.set(settingsRef, {
      generatorRules: {
        weeklyRotationEnabled: true,
        avoidConsecutiveSundays: true,
        allowManualOverride: true,
        startWithCoreAMorning: true,
        generationMode: 'balanced',
      },
      specialDaysByDate: {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 13. Write default subscription: tenants/{slug}/subscription/current
    const trialEndsAtMs = Date.now() + 14 * 24 * 3600 * 1000;
    const subscriptionRef = db.doc(`tenants/${validated.slug}/subscription/current`);
    transaction.set(subscriptionRef, {
      plan: 'TRIAL',
      status: 'TRIALING',
      trialEndsAt: Timestamp.fromMillis(trialEndsAtMs),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 14. Write audit log: platformAuditLogs/{auditId}
    const auditId = randomUUID();
    const auditRef = db.doc(`platformAuditLogs/${auditId}`);
    transaction.set(auditRef, {
      action: 'TENANT_PROVISIONED',
      tenantId: validated.slug,
      tokenId: consumedToken.tokenId,
      actorUid: callerUid,
      role: 'OWNER',
      businessCategory: resolvedConfig.businessCategory,
      templateId: resolvedConfig.templateId,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      tenantId: validated.slug,
      role: 'OWNER',
      status: 'ACTIVE',
      businessCategory: resolvedConfig.businessCategory,
      templateId: resolvedConfig.templateId,
      templateVersion: resolvedConfig.templateVersion,
    };
  });
}
