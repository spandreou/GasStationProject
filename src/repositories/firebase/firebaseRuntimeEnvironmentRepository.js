import {
  adminEmail,
  firebaseConfigErrorMessage,
  isDemoMode as isFirebaseDemoMode,
  isFirebaseConfigured,
} from '../../firebase/config';
import { getAdminAuthModeLabel } from '../../firebase/authService';

function getRuntimeEnvironment() {
  return {
    appMode: isFirebaseDemoMode ? 'demo' : 'production',
    persistenceProvider: 'firebase',
    authProvider: 'firebase',
    isDemo: isFirebaseDemoMode,
    isPersistenceConfigured: isFirebaseConfigured,
    configuredAdminEmail: adminEmail,
    persistenceErrorMessage: firebaseConfigErrorMessage,
  };
}

export const firebaseRuntimeEnvironmentRepository = {
  getRuntimeEnvironment,
  getAuthModeLabel: getAdminAuthModeLabel,
  getConfiguredAdminEmail: () => adminEmail,
  isPersistenceConfigured: () => isFirebaseConfigured,
  getPersistenceErrorMessage: () => firebaseConfigErrorMessage,
  isDemoMode: () => isFirebaseDemoMode,
};
