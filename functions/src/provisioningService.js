import { randomUUID } from 'node:crypto';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { consumeRegistrationToken } from './registrationTokenService.js';
import {
  DEFAULT_CUSTOMIZATION_MODE,
  PROVISIONING_ERROR_REASONS,
  TRIAL_DURATION_DAYS,
  resolveBusinessCategory,
  validateProvisioningInput,
} from './provisioningCore.js';

export async function provisionTenantService(db, { callerUid, callerEmail, input }) {
  if (!callerUid || typeof callerUid !== 'string') {
    throw new HttpsError('unauthenticated', 'Απαιτείται ταυτοποίηση χρήστη.', {
      reason: PROVISIONING_ERROR_REASONS.UNAUTHENTICATED,
    });
  }

  let validated;
  try {
    validated = validateProvisioningInput(input);
  } catch (err) {
    throw new HttpsError('invalid-argument', err.message, {
      reason: PROVISIONING_ERROR_REASONS.INVALID_ARGUMENT,
    });
  }

  try {
    return await db.runTransaction(async (transaction) => {
      // 1. Platform Admin Overlap Check
      const platformAdminRef = db.doc(`platformAdmins/${callerUid}`);
      const platformAdminSnap = await transaction.get(platformAdminRef);
      if (platformAdminSnap.exists && platformAdminSnap.data()?.status === 'ACTIVE') {
        throw new HttpsError(
          'permission-denied',
          'Οι διαχειριστές πλατφόρμας δεν επιτρέπεται να δημιουργούν ή να κατέχουν tenants.',
          { reason: PROVISIONING_ERROR_REASONS.PLATFORM_ADMIN_OVERLAP },
        );
      }

      // 2. Canonical Membership Check (Source of Truth)
      // Fail-closed policy: An actor with ANY existing canonical tenant membership cannot provision a new tenant in Phase 4 MVP.
      // Check both field-based query (uid == callerUid) and canonical doc ID prefix (${callerUid}_) to catch malformed legacy records.
      const canonicalMembershipsQuery = db.collection('tenantMemberships').where('uid', '==', callerUid).limit(1);
      const canonicalDocIdQuery = db.collection('tenantMemberships')
        .where(FieldPath.documentId(), '>=', `${callerUid}_`)
        .where(FieldPath.documentId(), '<=', `${callerUid}_\uf8ff`)
        .limit(1);

      const [canonicalMembershipsSnap, canonicalDocIdSnap] = await Promise.all([
        transaction.get(canonicalMembershipsQuery),
        transaction.get(canonicalDocIdQuery),
      ]);

      if (!canonicalMembershipsSnap.empty || !canonicalDocIdSnap.empty) {
        throw new HttpsError(
          'failed-precondition',
          'Ο χρήστης έχει ήδη συσχετισμό με tenant.',
          { reason: PROVISIONING_ERROR_REASONS.EXISTING_MEMBERSHIP },
        );
      }

      // 3. Compatibility Mirror Integrity Check (users/{uid}.memberships)
      const userRef = db.doc(`users/${callerUid}`);
      const userSnap = await transaction.get(userRef);
      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        if ('memberships' in userData) {
          const existingMemberships = userData.memberships;
          // Malformed memberships (null, non-object, array) or non-empty object must fail closed
          if (
            existingMemberships === null ||
            typeof existingMemberships !== 'object' ||
            Array.isArray(existingMemberships) ||
            Object.keys(existingMemberships).length > 0
          ) {
            throw new HttpsError(
              'failed-precondition',
              'Ο χρήστης έχει ήδη συσχετισμό με tenant.',
              { reason: PROVISIONING_ERROR_REASONS.EXISTING_MEMBERSHIP },
            );
          }
        }
      }

      // 4. Tenant Collision Check
      const tenantRef = db.doc(`tenants/${validated.slug}`);
      const tenantSnap = await transaction.get(tenantRef);
      if (tenantSnap.exists) {
        throw new HttpsError(
          'already-exists',
          'Το αναγνωριστικό tenant χρησιμοποιείται ήδη.',
          { reason: PROVISIONING_ERROR_REASONS.TENANT_SLUG_TAKEN },
        );
      }

      // 5. Slug Reservation Collision Check
      const reservationRef = db.doc(`slugReservations/${validated.slug}`);
      const reservationSnap = await transaction.get(reservationRef);
      if (reservationSnap.exists) {
        throw new HttpsError(
          'already-exists',
          'Το αναγνωριστικό tenant χρησιμοποιείται ήδη.',
          { reason: PROVISIONING_ERROR_REASONS.TENANT_SLUG_TAKEN },
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
          throw new HttpsError(
            'failed-precondition',
            'Το registration token έχει λήξει.',
            { reason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_EXPIRED },
          );
        }
        if (err.message === 'registration-token-revoked') {
          throw new HttpsError(
            'failed-precondition',
            'Το registration token έχει ανακληθεί.',
            { reason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_REVOKED },
          );
        }
        if (err.message === 'registration-token-already-consumed') {
          throw new HttpsError(
            'failed-precondition',
            'Το registration token έχει ήδη χρησιμοποιηθεί.',
            { reason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_CONSUMED },
          );
        }
        if (
          err.message === 'registration-token-not-found' ||
          err.message === 'registration-token-invalid-format' ||
          err.message === 'registration-token-corrupt-lookup' ||
          err.message === 'registration-token-not-active'
        ) {
          throw new HttpsError(
            'invalid-argument',
            'Το registration token δεν είναι έγκυρο.',
            { reason: PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_INVALID },
          );
        }
        throw new HttpsError(
          'internal',
          'Αποτυχία αρχικοποίησης tenant.',
          { reason: PROVISIONING_ERROR_REASONS.PROVISIONING_INTERNAL },
        );
      }

      // 7. Resolve business category precedence (valid client category -> token hint -> OTHER)
      const businessCategory = resolveBusinessCategory(
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

      // 9. Write tenant document (domain is null pending Phase 6 cutover; template runtime deferred)
      transaction.set(tenantRef, {
        slug: validated.slug,
        domain: null,
        displayName: validated.displayName,
        status: 'ACTIVE',
        businessCategory,
        brandingOverrides: {},
        customizationMode: DEFAULT_CUSTOMIZATION_MODE,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: callerUid,
      });

      // 10. Write tenantMemberships/{uid}_{tenantId} (authorization only, PII email removed)
      const membershipRef = db.doc(`tenantMemberships/${callerUid}_${validated.slug}`);
      transaction.set(membershipRef, {
        uid: callerUid,
        tenantId: validated.slug,
        role: 'OWNER',
        status: 'ACTIVE',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 11. Write/Update users/{uid} (user profile retains normalized auth token email if available)
      const newMemberships = {
        [validated.slug]: {
          role: 'OWNER',
          status: 'ACTIVE',
        },
      };

      const normalizedEmail = callerEmail && typeof callerEmail === 'string'
        ? callerEmail.trim().toLowerCase()
        : null;

      if (userSnap.exists) {
        const updatePayload = {
          memberships: newMemberships,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (normalizedEmail && !userSnap.data()?.email) {
          updatePayload.email = normalizedEmail;
        }
        transaction.update(userRef, updatePayload);
      } else {
        transaction.set(userRef, {
          uid: callerUid,
          email: normalizedEmail,
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

      // 13. Write default subscription: tenants/{slug}/subscription/current (7-day trial)
      const trialEndsAtMs = Date.now() + TRIAL_DURATION_DAYS * 24 * 3600 * 1000;
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
  } catch (err) {
    if (err instanceof HttpsError) {
      throw err;
    }
    throw new HttpsError(
      'internal',
      'Αποτυχία αρχικοποίησης tenant.',
      { reason: PROVISIONING_ERROR_REASONS.PROVISIONING_INTERNAL },
    );
  }
}
