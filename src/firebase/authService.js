import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './config';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || '';

export function subscribeAdminAuth(onUserChange, onError) {
  if (!isFirebaseConfigured || !auth) {
    onUserChange(null);
    return () => {};
  }

  return onAuthStateChanged(
    auth,
    (user) => {
      const isAdminUser = Boolean(user && (!ADMIN_EMAIL || user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()));
      onUserChange(isAdminUser ? user : null);
    },
    onError,
  );
}

export async function signInAdmin({ email, password }) {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Το Firebase Auth δεν είναι ρυθμισμένο.');
  }

  await setPersistence(auth, browserLocalPersistence);
  const credentials = await signInWithEmailAndPassword(auth, email, password);

  if (ADMIN_EMAIL && credentials.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
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
