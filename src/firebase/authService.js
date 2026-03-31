import {
  browserLocalPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './config';

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'admin123';

export function subscribeAdminAuth(onUserChange, onError) {
  if (!isFirebaseConfigured || !auth) {
    onUserChange(null);
    return () => {};
  }

  return onAuthStateChanged(
    auth,
    (user) => {
      const isAdminUser = Boolean(user && user.email?.toLowerCase() === ADMIN_EMAIL);
      onUserChange(isAdminUser ? user : null);
    },
    onError,
  );
}

export async function signInAdmin({ email, password }) {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Το Firebase Auth δεν είναι ρυθμισμένο.');
  }

  if (email?.trim().toLowerCase() !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    throw new Error('Μη έγκυρα στοιχεία διαχειριστή.');
  }

  await setPersistence(auth, browserLocalPersistence);
  const credentials = await signInWithEmailAndPassword(auth, email, password);

  if (credentials.user.email?.toLowerCase() !== ADMIN_EMAIL) {
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
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Το Firebase Auth δεν είναι ρυθμισμένο.');
  }

  if (!email?.trim()) {
    throw new Error('Συμπλήρωσε email για επαναφορά κωδικού.');
  }

  if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
    throw new Error('Η επαναφορά επιτρέπεται μόνο για το email διαχειριστή.');
  }

  await sendPasswordResetEmail(auth, email.trim());
}
