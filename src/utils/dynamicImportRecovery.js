const RELOAD_STORAGE_KEY = 'gasstation-dynamic-import-reload-at';
const RELOAD_COOLDOWN_MS = 30_000;

export function isDynamicImportLoadError(error) {
  const reason = error?.reason || error;
  const message = String(reason?.message || reason || '');

  return [
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'error loading dynamically imported module',
    'dynamically imported module',
    'Loading chunk',
  ].some((pattern) => message.toLowerCase().includes(pattern.toLowerCase()));
}

export function requestDynamicImportRecovery(error) {
  if (!isDynamicImportLoadError(error) || typeof window === 'undefined') return false;

  try {
    const lastReloadAt = Number(window.sessionStorage.getItem(RELOAD_STORAGE_KEY) || 0);
    const now = Date.now();

    if (Number.isFinite(lastReloadAt) && now - lastReloadAt < RELOAD_COOLDOWN_MS) {
      return false;
    }

    window.sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now));
  } catch {
    // If storage is blocked, still prefer one refresh over leaving a stale chunk error.
  }

  window.location.reload();
  return true;
}

export function createDynamicImportRecoveryError() {
  return new Error('Η εφαρμογή ενημερώθηκε. Γίνεται ανανέωση και μετά μπορείς να δοκιμάσεις ξανά.');
}
