import {
  firebaseConfigErrorMessage,
  isFirebaseConfigured,
} from '../../firebase/config.js';
import {
  confirmAdminPasswordReset,
  createUserAccount,
  getAdminAuthModeLabel,
  getPublicConfiguredAdminEmail,
  isPlatformAdmin,
  sendAdminPasswordResetEmail,
  signInAdmin,
  signInWithBrokerCustomToken,
  signOutAdmin,
  subscribeAuth,
  subscribeAdminAuth,
  verifyAdminPasswordResetCode,
} from '../../firebase/authService.js';

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
  isPlatformAdmin,
  getConfiguredAdminEmail: getPublicConfiguredAdminEmail,
  getAuthModeLabel: getAdminAuthModeLabel,
  isPersistenceConfigured: () => isFirebaseConfigured,
  getPersistenceErrorMessage: () => firebaseConfigErrorMessage,
};

