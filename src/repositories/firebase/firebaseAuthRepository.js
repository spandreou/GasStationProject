import {
  firebaseConfigErrorMessage,
  isFirebaseConfigured,
} from '../../firebase/config';
import {
  getAdminAuthModeLabel,
  getConfiguredAdminEmail,
  sendAdminPasswordResetEmail,
  signInAdmin,
  signOutAdmin,
  subscribeAdminAuth,
} from '../../firebase/authService';

export const firebaseAuthRepository = {
  subscribeAdminAuth,
  signInAdmin,
  signOutAdmin,
  sendAdminPasswordResetEmail,
  getConfiguredAdminEmail,
  getAuthModeLabel: getAdminAuthModeLabel,
  isPersistenceConfigured: () => isFirebaseConfigured,
  getPersistenceErrorMessage: () => firebaseConfigErrorMessage,
};
