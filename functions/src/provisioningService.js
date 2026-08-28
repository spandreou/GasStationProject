import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { consumeRegistrationToken } from './registrationTokenService.js';
import {
  DEFAULT_CUSTOMIZATION_MODE,
  DEFAULT_TEMPLATE_ID,
  DEFAULT_TEMPLATE_VERSION,
  validateBusinessCategory,
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

    // 2. Tenant collision check
    const tenantRef = db.doc(`tenants/${validated.slug}`);
    const tenantSnap = await transaction.get(tenantRef);
    if (tenantSnap.exists) {
      throw new HttpsError(
        'already-exists',
        `Το αναγνωριστικό "${validated.slug}" χρησιμοποιείται ήδη.`,
      );
    }

    // 3. User document and membership collision check
    const userRef = db.doc(`users/${callerUid}`);
    const userSnap = await transaction.get(userRef);
    const existingMemberships = userSnap.exists ? userSnap.data()?.memberships || {} : {};

    if (existingMemberships[validated.slug]) {
      throw new HttpsError(
        'already-exists',
        `Έχετε ήδη συσχετισμό με το tenant "${validated.slug}".`,
      );
    }

    const membershipRef = db.doc(`tenantMemberships/${callerUid}_${validated.slug}`);
    const membershipSnap = await transaction.get(membershipRef);
    if (membershipSnap.exists) {
      throw new HttpsError(
        'already-exists',
        `Υπάρχει ήδη membership για τον χρήστη στο tenant "${validated.slug}".`,
      );
    }

    // 4. Check & consume token atomically within the transaction
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
      throw new HttpsError('internal', `Αποτυχία εξαργύρωσης token: ${err.message}`);
    }

    const businessCategory = validateBusinessCategory(
      validated.businessCategory,
      consumedToken.businessCategoryHint,
    );

    // 5. Write tenant document
    transaction.set(tenantRef, {
      slug: validated.slug,
      domain: `${validated.slug}.shiftoryx.gr`,
      displayName: validated.displayName,
      status: 'ACTIVE',
      businessCategory,
      templateId: DEFAULT_TEMPLATE_ID,
      templateVersion: DEFAULT_TEMPLATE_VERSION,
      brandingOverrides: {},
      customizationMode: DEFAULT_CUSTOMIZATION_MODE,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: callerUid,
    });

    // 6. Write tenantMemberships/{uid}_{tenantId}
    transaction.set(membershipRef, {
      uid: callerUid,
      tenantId: validated.slug,
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      email: callerEmail || null,
    });

    // 7. Write/Update users/{uid}
    const nextMemberships = {
      ...existingMemberships,
      [validated.slug]: {
        role: 'OWNER',
        status: 'ACTIVE',
      },
    };

    if (userSnap.exists) {
      const updatePayload = {
        memberships: nextMemberships,
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
        memberships: nextMemberships,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // 8. Write default settings: tenants/{slug}/settings/scheduler
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

    // 9. Write default subscription: tenants/{slug}/subscription/current
    const trialEndsAtMs = Date.now() + 14 * 24 * 3600 * 1000;
    const subscriptionRef = db.doc(`tenants/${validated.slug}/subscription/current`);
    transaction.set(subscriptionRef, {
      plan: 'TRIAL',
      status: 'TRIALING',
      trialEndsAt: Timestamp.fromMillis(trialEndsAtMs),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 10. Write audit log: platformAuditLogs/{auditId}
    const auditId = randomUUID();
    const auditRef = db.doc(`platformAuditLogs/${auditId}`);
    transaction.set(auditRef, {
      action: 'TENANT_PROVISIONED',
      tenantId: validated.slug,
      tokenId: consumedToken.tokenId,
      actorUid: callerUid,
      role: 'OWNER',
      businessCategory,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      tenantId: validated.slug,
      role: 'OWNER',
      status: 'ACTIVE',
      businessCategory,
    };
  });
}
