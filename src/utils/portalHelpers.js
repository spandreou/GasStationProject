export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 40;
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export const RESERVED_SLUGS = Object.freeze([
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'gas',
  'gasstation',
  'help',
  'login',
  'mail',
  'portal',
  'register',
  'root',
  'select-tenant',
  'shiftoryx',
  'static',
  'stores',
  'support',
  'www',
]);

export const VALID_BUSINESS_CATEGORIES = Object.freeze([
  'FUEL_STATION',
  'CAFE',
  'RESTAURANT',
  'HAIR_SALON',
  'RETAIL',
  'OTHER',
]);

export const BUSINESS_CATEGORY_OPTIONS = Object.freeze([
  { id: 'OTHER', label: 'Άλλη Επιχείρηση' },
  { id: 'FUEL_STATION', label: 'Κατάστημα' },
  { id: 'CAFE', label: 'Καφέ / Bistro' },
  { id: 'RESTAURANT', label: 'Εστιατόριο / Εστίαση' },
  { id: 'HAIR_SALON', label: 'Κομμωτήριο / Barber' },
  { id: 'RETAIL', label: 'Λιανικό Εμπόριο / Κατάστημα' },
]);

export const DEFAULT_BUSINESS_CATEGORY = 'OTHER';
export const TRIAL_DURATION_DAYS = 7;

export const PROVISIONING_ERROR_REASONS = Object.freeze({
  PLATFORM_ADMIN_OVERLAP: 'platform-admin-overlap',
  EXISTING_MEMBERSHIP: 'existing-membership',
  TENANT_SLUG_TAKEN: 'tenant-slug-taken',
  REGISTRATION_TOKEN_EXPIRED: 'registration-token-expired',
  REGISTRATION_TOKEN_REVOKED: 'registration-token-revoked',
  REGISTRATION_TOKEN_CONSUMED: 'registration-token-consumed',
  REGISTRATION_TOKEN_INVALID: 'registration-token-invalid',
  PROVISIONING_INTERNAL: 'provisioning-internal',
  INVALID_ARGUMENT: 'invalid-argument',
  UNAUTHENTICATED: 'unauthenticated',
});

const GREEK_ERROR_MESSAGES = Object.freeze({
  [PROVISIONING_ERROR_REASONS.PLATFORM_ADMIN_OVERLAP]:
    'Οι διαχειριστές πλατφόρμας δεν επιτρέπεται να δημιουργούν καταστήματα.',
  [PROVISIONING_ERROR_REASONS.EXISTING_MEMBERSHIP]:
    'Ο λογαριασμός σας έχει ήδη συσχετισμένο κατάστημα ShiftOryx.',
  [PROVISIONING_ERROR_REASONS.TENANT_SLUG_TAKEN]:
    'Το αναγνωριστικό (slug) χρησιμοποιείται ήδη. Παρακαλώ επιλέξτε διαφορετικό.',
  [PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_EXPIRED]:
    'Το Registration Token έχει λήξει. Επικοινωνήστε με τον διαχειριστή.',
  [PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_REVOKED]:
    'Το Registration Token έχει ανακληθεί. Επικοινωνήστε με τον διαχειριστή.',
  [PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_CONSUMED]:
    'Το Registration Token έχει ήδη χρησιμοποιηθεί για τη δημιουργία καταστήματος.',
  [PROVISIONING_ERROR_REASONS.REGISTRATION_TOKEN_INVALID]:
    'Το Registration Token δεν είναι έγκυρο. Ελέγξτε την τιμή και δοκιμάστε ξανά.',
  [PROVISIONING_ERROR_REASONS.INVALID_ARGUMENT]:
    'Μη έγκυρα στοιχεία εγγραφής. Ελέγξτε τα πεδία της φόρμας.',
  [PROVISIONING_ERROR_REASONS.UNAUTHENTICATED]:
    'Απαιτείται σύνδεση για την ολοκλήρωση της ενέργειας.',
  [PROVISIONING_ERROR_REASONS.PROVISIONING_INTERNAL]:
    'Προέκυψε εσωτερικό σφάλμα κατά την αρχικοποίηση. Παρακαλώ δοκιμάστε ξανά.',
  UNKNOWN: 'Η ενέργεια δεν ήταν δυνατό να ολοκληρωθεί. Δοκιμάστε ξανά.',
});

export function validatePortalSlug(rawSlug) {
  if (typeof rawSlug !== 'string') {
    return {
      valid: false,
      reason: 'INVALID_TYPE',
      error: 'Το slug πρέπει να είναι συμβολοσειρά.',
    };
  }

  const slug = rawSlug.trim().toLowerCase();

  if (slug.length < SLUG_MIN_LENGTH) {
    return {
      valid: false,
      reason: 'TOO_SHORT',
      error: `Το slug πρέπει να έχει τουλάχιστον ${SLUG_MIN_LENGTH} χαρακτήρες.`,
    };
  }

  if (slug.length > SLUG_MAX_LENGTH) {
    return {
      valid: false,
      reason: 'TOO_LONG',
      error: `Το slug δεν μπορεί να υπερβαίνει τους ${SLUG_MAX_LENGTH} χαρακτήρες.`,
    };
  }

  if (!SLUG_REGEX.test(slug)) {
    return {
      valid: false,
      reason: 'INVALID_FORMAT',
      error: `Το slug πρέπει να αποτελείται από ${SLUG_MIN_LENGTH}-${SLUG_MAX_LENGTH} πεζούς λατινικούς χαρακτήρες, αριθμούς και παύλες (όχι παύλα στην αρχή ή στο τέλος).`,
    };
  }

  if (RESERVED_SLUGS.includes(slug)) {
    return {
      valid: false,
      reason: 'RESERVED_SLUG',
      error: 'Το slug είναι δεσμευμένο από το σύστημα. Παρακαλώ επιλέξτε διαφορετικό.',
    };
  }

  return {
    valid: true,
    slug,
  };
}

export function generateSlugFromDisplayName(val) {
  if (typeof val !== 'string') return '';
  return val
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);
}

export function resolveBusinessCategory(selectedCategory, hintCategory) {
  const normSelected = typeof selectedCategory === 'string'
    ? selectedCategory.trim().toUpperCase()
    : null;
  if (normSelected && VALID_BUSINESS_CATEGORIES.includes(normSelected)) {
    return normSelected;
  }

  const normHint = typeof hintCategory === 'string'
    ? hintCategory.trim().toUpperCase()
    : null;
  if (normHint && VALID_BUSINESS_CATEGORIES.includes(normHint)) {
    return normHint;
  }

  return DEFAULT_BUSINESS_CATEGORY;
}

export function normalizeRegistrationError(err) {
  const reason = err?.details?.reason || err?.reason || null;

  if (reason && GREEK_ERROR_MESSAGES[reason]) {
    return {
      reason,
      message: GREEK_ERROR_MESSAGES[reason],
      retryable: [
        PROVISIONING_ERROR_REASONS.TENANT_SLUG_TAKEN,
        PROVISIONING_ERROR_REASONS.INVALID_ARGUMENT,
        PROVISIONING_ERROR_REASONS.PROVISIONING_INTERNAL,
      ].includes(reason),
    };
  }

  // Legacy/fallback error code mapping
  const code = err?.code || err?.details?.code || '';
  if (code.includes('already-exists') || code === 'SLUG_ALREADY_EXISTS') {
    return {
      reason: PROVISIONING_ERROR_REASONS.TENANT_SLUG_TAKEN,
      message: GREEK_ERROR_MESSAGES[PROVISIONING_ERROR_REASONS.TENANT_SLUG_TAKEN],
      retryable: true,
    };
  }
  if (code.includes('already-has-membership') || code === 'USER_ALREADY_HAS_MEMBERSHIP') {
    return {
      reason: PROVISIONING_ERROR_REASONS.EXISTING_MEMBERSHIP,
      message: GREEK_ERROR_MESSAGES[PROVISIONING_ERROR_REASONS.EXISTING_MEMBERSHIP],
      retryable: false,
    };
  }
  if (code.includes('platform-admin') || code === 'PLATFORM_ADMIN_CANNOT_OWN_TENANT') {
    return {
      reason: PROVISIONING_ERROR_REASONS.PLATFORM_ADMIN_OVERLAP,
      message: GREEK_ERROR_MESSAGES[PROVISIONING_ERROR_REASONS.PLATFORM_ADMIN_OVERLAP],
      retryable: false,
    };
  }

  return {
    reason: 'UNKNOWN',
    message: GREEK_ERROR_MESSAGES.UNKNOWN,
    retryable: true,
  };
}

const FORBIDDEN_CLIENT_FIELDS = Object.freeze([
  'uid',
  'ownerUid',
  'actorUid',
  'role',
  'status',
  'email',
  'domain',
  'templateId',
  'templateVersion',
  'platformAdmin',
  'createdBy',
  'createdAt',
  'updatedAt',
]);

export function buildProvisioningPayload(input = {}) {
  if (!input || typeof input !== 'object') {
    throw new Error('Provisioning payload must be an object');
  }

  for (const forbidden of FORBIDDEN_CLIENT_FIELDS) {
    if (forbidden in input) {
      throw new Error(`Forbidden field "${forbidden}" detected in provisioning payload`);
    }
  }

  const slugValidation = validatePortalSlug(input.slug);
  if (!slugValidation.valid) {
    throw new Error(slugValidation.error || 'Invalid slug');
  }

  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (!displayName || displayName.length < 2) {
    throw new Error('Display name must have at least 2 characters');
  }

  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (!token) {
    throw new Error('Registration token is required');
  }

  const businessCategory = resolveBusinessCategory(input.businessCategory);

  return {
    token,
    slug: slugValidation.slug,
    displayName,
    businessCategory,
  };
}

export function determinePostLoginDestination({ isPlatformAdmin, authorizedReturnTo, centralDestination }) {
  if (isPlatformAdmin) {
    return { type: 'admin', url: '/admin' };
  }

  if (authorizedReturnTo && authorizedReturnTo.allowed && authorizedReturnTo.url) {
    return {
      type: 'authorizedReturnTo',
      url: authorizedReturnTo.url,
      tenantId: authorizedReturnTo.access?.tenant?.id,
    };
  }

  if (centralDestination && centralDestination.type === 'redirect' && centralDestination.url) {
    return {
      type: 'tenant',
      url: centralDestination.url,
      tenantId: centralDestination.tenant?.id,
    };
  }

  if (centralDestination && centralDestination.type === 'select') {
    return { type: 'select', url: '/select-tenant' };
  }

  return { type: 'stores', url: '/stores' };
}

export function resolveStoreSelectorState({ user, tenants = [] }) {
  if (!user) {
    return 'unauthenticated';
  }

  if (Array.isArray(tenants) && tenants.length > 0) {
    return 'ready';
  }

  return 'no-access';
}
