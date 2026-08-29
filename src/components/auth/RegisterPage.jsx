import { useState, useEffect } from 'react';
import { authRepository } from '../../repositories';
import { validateTokenClient, provisionTenantClient } from '../../firebase/registrationTokenClient';
import { createTenantAuthTicketRedirect } from '../../firebase/authBrokerService';
import { resolveCentralTenantDestination } from '../../services/tenantAccessService';
import { getCurrentTenantHostContext } from '../../utils/tenantHostContext';
import {
  BUSINESS_CATEGORY_OPTIONS,
  DEFAULT_BUSINESS_CATEGORY,
  generateSlugFromDisplayName,
  normalizeRegistrationError,
  resolveBusinessCategory,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  TRIAL_DURATION_DAYS,
  validatePortalSlug,
} from '../../utils/portalHelpers';
import AuthPageShell from './AuthPageShell';

const isAuthBrokerEnabled = String(import.meta.env.VITE_ENABLE_AUTH_BROKER || '').trim().toLowerCase() === 'true';

export default function RegisterPage() {
  // Step state: 1 = TOKEN, 2 = ACCOUNT, 3 = BUSINESS, 4 = PROVISIONING, 5 = SUCCESS
  const [step, setStep] = useState(1);
  const [currentUser, setCurrentUser] = useState(null);

  // Form Fields (in transient memory only)
  const [token, setToken] = useState('');
  const [tokenInfo, setTokenInfo] = useState(null);

  // Account Fields
  const [authMode, setAuthMode] = useState('signup'); // 'signup' | 'signin'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Business Fields
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [businessCategory, setBusinessCategory] = useState(DEFAULT_BUSINESS_CATEGORY);

  // UI state
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [createdTenant, setCreatedTenant] = useState(null);

  useEffect(() => {
    const unsubscribe = authRepository.subscribeAuth((user) => {
      setCurrentUser(user);
      if (user && step === 2) {
        setStep(3);
      }
    });
    return () => unsubscribe?.();
  }, [step]);

  // Stage 1: Validate Token
  async function handleValidateToken(e) {
    e.preventDefault();
    setErrorMessage('');
    const rawToken = token.trim();
    if (!rawToken) {
      setErrorMessage('Παρακαλώ εισάγετε το Registration Token.');
      return;
    }

    setStatus('loading');
    try {
      const res = await validateTokenClient(rawToken);
      if (!res.valid) {
        setStatus('error');
        setErrorMessage(
          res.reason === 'EXPIRED'
            ? 'Το Registration Token έχει λήξει.'
            : res.reason === 'REVOKED'
            ? 'Το Registration Token έχει ανακληθεί.'
            : res.reason === 'CONSUMED'
            ? 'Το Registration Token έχει ήδη χρησιμοποιηθεί.'
            : 'Το Registration Token δεν είναι έγκυρο. Ελέγξτε την τιμή και δοκιμάστε ξανά.',
        );
        return;
      }

      setTokenInfo(res);
      if (res.businessCategoryHint) {
        setBusinessCategory(resolveBusinessCategory(res.businessCategoryHint));
      }

      setStatus('idle');
      if (currentUser) {
        setStep(3);
      } else {
        setStep(2);
      }
    } catch {
      setStatus('error');
      setErrorMessage('Αποτυχία επαλήθευσης token. Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.');
    }
  }

  // Stage 2: Firebase Auth Account
  async function handleAuthSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    const normEmail = email.trim();
    if (!normEmail || !password) {
      setErrorMessage('Παρακαλώ συμπληρώστε email και κωδικό πρόσβασης.');
      return;
    }

    if (authMode === 'signup') {
      if (password.length < 6) {
        setErrorMessage('Ο κωδικός πρόσβασης πρέπει να έχει τουλάχιστον 6 χαρακτήρες.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Οι κωδικοί πρόσβασης δεν ταιριάζουν.');
        return;
      }
    }

    setStatus('loading');
    try {
      if (authMode === 'signup') {
        const user = await authRepository.createUserAccount?.({ email: normEmail, password });
        setCurrentUser(user);
      } else {
        const user = await authRepository.signInAdmin({ email: normEmail, password });
        setCurrentUser(user);
      }
      setStatus('idle');
      setStep(3);
    } catch (err) {
      setStatus('error');
      const errCode = err?.code || '';
      if (errCode.includes('email-already-in-use')) {
        setErrorMessage('Το email χρησιμοποιείται ήδη. Συνδεθείτε με τον υπάρχοντα λογαριασμό σας.');
      } else if (errCode.includes('wrong-password') || errCode.includes('invalid-credential')) {
        setErrorMessage('Λάθος κωδικός πρόσβασης ή στοιχεία σύνδεσης.');
      } else if (errCode.includes('weak-password')) {
        setErrorMessage('Ο κωδικός πρόσβασης είναι πολύ αδύναμος.');
      } else {
        setErrorMessage('Αποτυχία αυθεντικοποίησης. Δοκιμάστε ξανά.');
      }
    }
  }

  // Auto-generate slug from display name if empty
  function handleDisplayNameChange(val) {
    setDisplayName(val);
    if (!slug) {
      const generated = generateSlugFromDisplayName(val);
      if (generated.length >= SLUG_MIN_LENGTH) {
        setSlug(generated);
      }
    }
  }

  // Stage 3: Provision Tenant
  async function handleProvisionSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    const normName = displayName.trim();
    const slugValidation = validatePortalSlug(slug);

    if (!normName || normName.length < 2) {
      setErrorMessage('Παρακαλώ εισάγετε μια έγκυρη επωνυμία καταστήματος (τουλάχιστον 2 χαρακτήρες).');
      return;
    }

    if (!slugValidation.valid) {
      setErrorMessage(slugValidation.error || 'Μη έγκυρο αναγνωριστικό URL.');
      return;
    }

    setStep(4);
    setStatus('loading');

    try {
      const result = await provisionTenantClient({
        token,
        slug: slugValidation.slug,
        displayName: normName,
        businessCategory,
      });

      setCreatedTenant(result);
      setToken(''); // Clear raw token from memory immediately on success
      setStep(5);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setStep(3);
      const normalized = normalizeRegistrationError(err);
      setErrorMessage(normalized.message);
    }
  }

  // Step 5: Transition / Navigation
  async function handleNavigateToTenant() {
    if (!currentUser) {
      window.location.assign('/login');
      return;
    }

    const hostContext = getCurrentTenantHostContext();
    if (hostContext.mode === 'central') {
      try {
        const dest = await resolveCentralTenantDestination(currentUser.uid);
        if (dest.type === 'redirect' && dest.url) {
          if (isAuthBrokerEnabled) {
            const redirectUrl = await createTenantAuthTicketRedirect({
              returnTo: dest.url,
              tenantId: dest.tenant?.id,
            });
            window.location.assign(redirectUrl);
            return;
          }
          window.location.assign(dest.url);
          return;
        }
      } catch {
        // Fallback to /stores
      }
    }

    window.location.assign('/stores');
  }

  return (
    <AuthPageShell
      title="Εγγραφή & Ενεργοποίηση"
      subtitle="ShiftOryx Tenant Provisioning Portal"
      footerText="Έχετε ήδη κατάστημα;"
      footerLinkText="Σύνδεση στο Portal"
      footerLinkHref="/login"
    >
      {/* Stepper Header */}
      <div className="mb-6 flex items-center justify-between border-b border-slate-800 pb-4 text-xs font-semibold text-slate-400">
        <span className={step >= 1 ? 'text-cyan-400 font-bold' : ''}>1. Token</span>
        <span className="text-slate-600">→</span>
        <span className={step >= 2 ? 'text-cyan-400 font-bold' : ''}>2. Λογαριασμός</span>
        <span className="text-slate-600">→</span>
        <span className={step >= 3 ? 'text-cyan-400 font-bold' : ''}>3. Στοιχεία</span>
        <span className="text-slate-600">→</span>
        <span className={step >= 4 ? 'text-cyan-400 font-bold' : ''}>4. Ολοκλήρωση</span>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-rose-500/40 bg-rose-950/40 p-3.5 text-xs font-medium leading-5 text-rose-200"
        >
          {errorMessage}
        </div>
      )}

      {/* STEP 1: TOKEN */}
      {step === 1 && (
        <form onSubmit={handleValidateToken} className="space-y-4">
          <div>
            <label htmlFor="token-input" className="block text-xs font-medium text-slate-300">
              Registration Token <span className="text-cyan-400">*</span>
            </label>
            <input
              id="token-input"
              type="text"
              required
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="stx_..."
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 font-mono text-sm text-slate-100 placeholder-slate-500 shadow-inner focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">
              Εισάγετε το μυστικό token εγγραφής που λάβατε από τον διαχειριστή.
            </p>
          </div>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-950/50 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
          >
            {status === 'loading' ? 'Επαλήθευση...' : 'Συνέχεια'}
          </button>
        </form>
      )}

      {/* STEP 2: ACCOUNT */}
      {step === 2 && (
        <form onSubmit={handleAuthSubmit} className="space-y-4">
          <div className="flex rounded-xl bg-slate-900/80 p-1 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setErrorMessage('');
              }}
              className={`flex-1 py-1.5 font-medium rounded-lg transition ${
                authMode === 'signup' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Νέος Λογαριασμός
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signin');
                setErrorMessage('');
              }}
              className={`flex-1 py-1.5 font-medium rounded-lg transition ${
                authMode === 'signin' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Υπάρχον Λογαριασμός
            </button>
          </div>

          <div>
            <label htmlFor="email-input" className="block text-xs font-medium text-slate-300">
              Email <span className="text-cyan-400">*</span>
            </label>
            <input
              id="email-input"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@example.com"
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label htmlFor="password-input" className="block text-xs font-medium text-slate-300">
              Κωδικός Πρόσβασης <span className="text-cyan-400">*</span>
            </label>
            <input
              id="password-input"
              type="password"
              required
              autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          {authMode === 'signup' && (
            <div>
              <label htmlFor="confirm-password-input" className="block text-xs font-medium text-slate-300">
                Επιβεβαίωση Κωδικού <span className="text-cyan-400">*</span>
              </label>
              <input
                id="confirm-password-input"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Πίσω
            </button>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-cyan-950/50 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
            >
              {status === 'loading' ? 'Σύνδεση...' : 'Συνέχεια στα Στοιχεία'}
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: BUSINESS INFO */}
      {step === 3 && (
        <form onSubmit={handleProvisionSubmit} className="space-y-4">
          <div>
            <label htmlFor="display-name-input" className="block text-xs font-medium text-slate-300">
              Επωνυμία Επιχείρησης / Καταστήματος <span className="text-cyan-400">*</span>
            </label>
            <input
              id="display-name-input"
              type="text"
              required
              autoFocus
              value={displayName}
              onChange={(e) => handleDisplayNameChange(e.target.value)}
              placeholder="π.χ. BP Κάλλης ή Coffee Lab"
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label htmlFor="slug-input" className="block text-xs font-medium text-slate-300">
              Αναγνωριστικό URL (Slug) <span className="text-cyan-400">*</span>
            </label>
            <div className="mt-1.5 flex rounded-xl border border-slate-700 bg-slate-900/90 focus-within:border-cyan-500 focus-within:ring-1 focus-within:ring-cyan-500">
              <span className="flex items-center pl-3.5 text-xs text-slate-500 font-mono">https://</span>
              <input
                id="slug-input"
                type="text"
                required
                maxLength={SLUG_MAX_LENGTH}
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
                placeholder="bp-kallis"
                className="w-full bg-transparent px-2 py-2.5 font-mono text-sm text-cyan-300 placeholder-slate-600 focus:outline-none"
              />
              <span className="flex items-center pr-3.5 text-xs text-slate-500 font-mono">.shiftoryx.gr</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Πεζά λατινικά, αριθμοί και παύλες ({SLUG_MIN_LENGTH}-{SLUG_MAX_LENGTH} χαρακτήρες, π.χ. bp-kallis, my-cafe).
            </p>
          </div>

          <div>
            <label htmlFor="category-select" className="block text-xs font-medium text-slate-300">
              Κατηγορία Επιχείρησης <span className="text-cyan-400">*</span>
            </label>
            <select
              id="category-select"
              value={businessCategory}
              onChange={(e) => setBusinessCategory(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              {BUSINESS_CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(currentUser ? 1 : 2)}
              className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Πίσω
            </button>
            <button
              type="submit"
              disabled={status === 'loading'}
              className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-950/50 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
            >
              {status === 'loading' ? 'Δημιουργία Καταστήματος...' : 'Ενεργοποίηση & Δημιουργία'}
            </button>
          </div>
        </form>
      )}

      {/* STEP 4: PROVISIONING SPINNER */}
      {step === 4 && (
        <div className="py-8 text-center space-y-4">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-cyan-500/20 border-t-cyan-400" />
          <h2 className="text-base font-bold text-slate-100">Αρχικοποίηση Καταστήματος...</h2>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Δεσμεύουμε το slug, ρυθμίζουμε τα δικαιώματα διαχειριστή (OWNER) και δημιουργούμε το πρόγραμμα βαρδιών σας.
          </p>
        </div>
      )}

      {/* STEP 5: SUCCESS */}
      {step === 5 && (
        <div className="py-4 text-center space-y-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-xl font-bold">
            ✓
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Το κατάστημα δημιουργήθηκε με επιτυχία!</h2>
            <p className="mt-1 text-xs text-slate-300 font-mono">
              {createdTenant?.displayName} ({createdTenant?.slug})
            </p>
          </div>

          <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3.5 text-left text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-cyan-200">Στοιχεία Πρόσβασης:</p>
            <p>• Ρόλος: <span className="text-white font-mono font-bold">OWNER</span></p>
            <p>• Κατηγορία: <span className="text-white">{BUSINESS_CATEGORY_OPTIONS.find(c => c.id === createdTenant?.businessCategory)?.label || createdTenant?.businessCategory}</span></p>
            <p>• Δοκιμαστική Περίοδος: <span className="text-emerald-400 font-semibold">Ενεργή ({TRIAL_DURATION_DAYS} ημέρες)</span></p>
          </div>

          <button
            type="button"
            onClick={handleNavigateToTenant}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-950/50 hover:from-emerald-400 hover:to-teal-500"
          >
            Είσοδος στον Πίνακα Ελέγχου →
          </button>
        </div>
      )}
    </AuthPageShell>
  );
}
