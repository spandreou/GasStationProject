import {
  browserLocalPersistence,
  browserSessionPersistence,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  verifyPasswordResetCode,
} from 'firebase/auth';
import {
  adminEmail,
  auth,
  isDemoMode,
  isFirebaseConfigured,
} from './config';

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function assertAdminAuthConfigured() {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Το Firebase Auth δεν είναι ρυθμισμένο. Έλεγξε τα env vars του Firebase.');
  }
}

export function getConfiguredAdminEmail() {
  return adminEmail;
}

export function getPublicConfiguredAdminEmail() {
  return '';
}

export function getAdminAuthModeLabel() {
  if (isDemoMode) {
    return 'Demo Tenant Login';
  }
  return 'Tenant Login';
}

export function subscribeAdminAuth(onUserChange, onError) {
  if (!isFirebaseConfigured || !auth) {
    onUserChange(null);
    return () => {};
  }

  return onAuthStateChanged(auth, onUserChange, onError);
}

export function subscribeAuth(onUserChange, onError) {
  if (!isFirebaseConfigured || !auth) {
    onUserChange(null);
    return () => {};
  }

  return onAuthStateChanged(auth, onUserChange, onError);
}

export async function signInAdmin({ email, password, rememberDevice = true }) {
  assertAdminAuthConfigured();

  const normalizedEmail = normalizeEmail(email);
  await setPersistence(auth, rememberDevice ? browserLocalPersistence : browserSessionPersistence);
  const credentials = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  return credentials.user;
}

export async function createUserAccount({ email, password }) {
  assertAdminAuthConfigured();

  const normalizedEmail = normalizeEmail(email);
  await setPersistence(auth, browserLocalPersistence);
  const credentials = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  return credentials.user;
}

export async function signInWithBrokerCustomToken({ customToken }) {
  assertAdminAuthConfigured();

  if (!customToken?.trim()) {
    throw new Error('Δεν ήταν δυνατή η ασφαλής μεταφορά σύνδεσης.');
  }

  const credentials = await signInWithCustomToken(auth, customToken);
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
