import {
  firebaseConfigErrorMessage,
  isFirebaseConfigured,
} from '../../firebase/config';
import {
  getAdminAuthModeLabel,
  getPublicConfiguredAdminEmail,
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
  getConfiguredAdminEmail: getPublicConfiguredAdminEmail,
  getAuthModeLabel: getAdminAuthModeLabel,
  isPersistenceConfigured: () => isFirebaseConfigured,
  getPersistenceErrorMessage: () => firebaseConfigErrorMessage,
};
