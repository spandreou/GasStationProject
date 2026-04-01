import {
  browserLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  adminEmail,
  adminPassword,
  auth,
  isAdminEmailConfigured,
  isDemoMode,
  isFirebaseConfigured,
  isUsingDemoAdminFallback,
  isUsingDemoPasswordFallback,
} from './config';

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isAllowedAdminEmail(email) {
  return normalizeEmail(email) === adminEmail;
}

function assertAdminAuthConfigured() {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Το Firebase Auth δεν είναι ρυθμισμένο. Έλεγξε τα env vars του Firebase.');
  }

  if (!isAdminEmailConfigured) {
    throw new Error('Λείπει το VITE_ADMIN_EMAIL. Ορίσε email admin για το demo περιβάλλον.');
  }
}

export function getConfiguredAdminEmail() {
  return adminEmail;
}

export function getAdminAuthModeLabel() {
  if (isDemoMode) {
    if (isUsingDemoAdminFallback || isUsingDemoPasswordFallback) {
      return 'Demo Admin Mode (fallback credentials)';
    }
    return 'Demo Admin Mode';
  }
  return 'Admin Mode';
}

export function subscribeAdminAuth(onUserChange, onError) {
  if (!isFirebaseConfigured || !auth || !isAdminEmailConfigured) {
    onUserChange(null);
    return () => {};
  }

  return onAuthStateChanged(
    auth,
    (user) => {
      const isAdminUser = Boolean(user && isAllowedAdminEmail(user.email));
      onUserChange(isAdminUser ? user : null);
    },
    onError,
  );
}

export async function signInAdmin({ email, password }) {
  assertAdminAuthConfigured();

  const normalizedEmail = normalizeEmail(email);
  if (!isAllowedAdminEmail(normalizedEmail)) {
    throw new Error('Μη επιτρεπόμενο email διαχειριστή για το τρέχον demo περιβάλλον.');
  }
  if (isDemoMode && String(password || '') !== String(adminPassword || '')) {
    throw new Error('Λάθος demo κωδικός. Χρησιμοποίησε τον configured admin κωδικό.');
  }

  await setPersistence(auth, browserLocalPersistence);
  const credentials = await signInWithEmailAndPassword(auth, normalizedEmail, password);

  if (!isAllowedAdminEmail(credentials.user.email)) {
    await signOut(auth);
    throw new Error('Ο λογαριασμός δεν έχει δικαιώματα διαχειριστή.');
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
  if (!isAllowedAdminEmail(normalizedEmail)) {
    throw new Error('Η επαναφορά επιτρέπεται μόνο για το demo admin email.');
  }

  await sendPasswordResetEmail(auth, normalizedEmail);
}
