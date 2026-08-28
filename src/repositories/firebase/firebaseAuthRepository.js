import {
  firebaseConfigErrorMessage,
  isFirebaseConfigured,
} from '../../firebase/config';
import {
  confirmAdminPasswordReset,
  createUserAccount,
  getAdminAuthModeLabel,
  getPublicConfiguredAdminEmail,
  sendAdminPasswordResetEmail,
  signInAdmin,
  signInWithBrokerCustomToken,
  signOutAdmin,
  subscribeAuth,
  subscribeAdminAuth,
  verifyAdminPasswordResetCode,
} from '../../firebase/authService';

export const firebaseAuthRepository = {
  subscribeAuth,
  subscribeAdminAuth,
  signInAdmin,
  createUserAccount,
  signInWithBrokerCustomToken,
  signOutAdmin,
  sendAdminPasswordResetEmail,
  verifyAdminPasswordResetCode,
  confirmAdminPasswordReset,
  getConfiguredAdminEmail: getPublicConfiguredAdminEmail,
  getAuthModeLabel: getAdminAuthModeLabel,
  isPersistenceConfigured: () => isFirebaseConfigured,
  getPersistenceErrorMessage: () => firebaseConfigErrorMessage,
};
