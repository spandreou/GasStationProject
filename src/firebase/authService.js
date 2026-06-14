import {
  browserLocalPersistence,
  confirmPasswordReset,
  getIdTokenResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  verifyPasswordResetCode,
} from 'firebase/auth';
import {
  adminEmail,
  auth,
  isAdminEmailConfigured,
  isDemoMode,
  isFirebaseConfigured,
} from './config';

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isAllowedAdminEmail(email) {
  return isDemoMode && isAdminEmailConfigured && normalizeEmail(email) === adminEmail;
}

async function hasAdminClaim(user) {
  if (!user) return false;
  const token = await getIdTokenResult(user);
  return token.claims?.admin === true;
}

async function isAuthorizedAdminUser(user) {
  if (!user) return false;
  if (await hasAdminClaim(user)) return true;
  return isAllowedAdminEmail(user.email);
}

function assertAdminAuthConfigured() {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Το Firebase Auth δεν είναι ρυθμισμένο. Έλεγξε τα env vars του Firebase.');
  }

  if (isDemoMode && !isAdminEmailConfigured) {
    throw new Error('Λείπει το VITE_ADMIN_EMAIL για το demo περιβάλλον. Δεν υπάρχει fallback admin.');
  }
}

export function getConfiguredAdminEmail() {
  return adminEmail;
}

export function getPublicConfiguredAdminEmail() {
  return isDemoMode ? adminEmail : '';
}

export function getAdminAuthModeLabel() {
  if (isDemoMode) {
    return 'Demo Admin Mode';
  }
  return 'Production Admin Mode';
}

export function subscribeAdminAuth(onUserChange, onError) {
  if (!isFirebaseConfigured || !auth || (isDemoMode && !isAdminEmailConfigured)) {
    onUserChange(null);
    return () => {};
  }

  return onAuthStateChanged(
    auth,
    async (user) => {
      const isAdminUser = await isAuthorizedAdminUser(user);
      onUserChange(isAdminUser ? user : null);
    },
    onError,
  );
}

export function subscribeAuth(onUserChange, onError) {
  if (!isFirebaseConfigured || !auth) {
    onUserChange(null);
    return () => {};
  }

  return onAuthStateChanged(auth, onUserChange, onError);
}

export async function signInAdmin({ email, password }) {
  assertAdminAuthConfigured();

  const normalizedEmail = normalizeEmail(email);
  if (isDemoMode && !isAllowedAdminEmail(normalizedEmail)) {
    throw new Error('Μη επιτρεπόμενο email διαχειριστή για το τρέχον demo περιβάλλον.');
  }

  await setPersistence(auth, browserLocalPersistence);
  const credentials = await signInWithEmailAndPassword(auth, normalizedEmail, password);

  if (!(await isAuthorizedAdminUser(credentials.user))) {
    await signOut(auth);
    throw new Error('Ο λογαριασμός δεν έχει δικαιώματα διαχειριστή. Στην παραγωγή απαιτείται Firebase custom claim admin=true.');
  }

  return credentials.user;
}

export async function signOutAdmin() {
  if (!isFirebaseConfigured || !auth) {
    return;
  }

  await signOut(auth);
}

export async function sendAdminPasswordResetEmail(email) {
  assertAdminAuthConfigured();

  if (!email?.trim()) {
    throw new Error('Συμπλήρωσε email για επαναφορά κωδικού.');
  }

  const normalizedEmail = normalizeEmail(email);
  if (isDemoMode && !isAllowedAdminEmail(normalizedEmail)) {
    throw new Error('Η επαναφορά επιτρέπεται μόνο για το configured demo admin email.');
  }

  await sendPasswordResetEmail(auth, normalizedEmail);
}

export async function verifyAdminPasswordResetCode(oobCode) {
  assertAdminAuthConfigured();

  if (!oobCode?.trim()) {
    throw new Error('Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει.');
  }

  return verifyPasswordResetCode(auth, oobCode);
}

export async function confirmAdminPasswordReset({ oobCode, newPassword }) {
  assertAdminAuthConfigured();

  if (!oobCode?.trim()) {
    throw new Error('Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει.');
  }

  if (!newPassword || newPassword.length < 8) {
    throw new Error('Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');
  }

  await confirmPasswordReset(auth, oobCode, newPassword);
}
