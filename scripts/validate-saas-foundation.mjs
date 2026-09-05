import { existsSync, readFileSync } from 'node:fs';
import {
  getTenantMembershipPath,
  getTenantPath,
  getTenantScopedCollectionPath,
  getTenantScopedDocumentPath,
  getUserPath,
  TENANT_SCOPED_COLLECTIONS,
} from '../src/utils/tenantDataPaths.js';
import { resolveTenantHostContext } from '../src/utils/tenantHostContext.js';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message} Expected "${expected}", got "${actual}".`);
  }
}

function assertThrows(fn, message) {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

[
  'Dockerfile',
  'docker-compose.yml',
  'nginx.conf',
  '.env.example',
  'docs/self-hosting-bp-kallis.md',
  'docs/saas-tenant-foundation.md',
  'docs/saas-security-qa-checklist.md',
  'src/utils/tenantHostContext.js',
  'src/repositories/firebase/firebaseTenantsRepository.js',
  'src/repositories/firebase/firebaseTenantMembershipsRepository.js',
  'src/repositories/firebase/firebaseTenantSubscriptionRepository.js',
  'src/repositories/firebase/firebaseTenantTokenRequestsRepository.js',
  'src/components/auth/ForgotPasswordPage.jsx',
  'src/components/auth/CentralLandingPage.jsx',
  'src/components/auth/LoginPage.jsx',
  'src/components/auth/ResetPasswordPage.jsx',
  'src/components/auth/SelectTenantPage.jsx',
  'src/components/auth/TenantGate.jsx',
  'src/components/auth/RouteNoticePage.jsx',
  'src/services/tenantAccessService.js',
  'src/utils/tenantDataPaths.js',
  'scripts/seed-bp-kallis-tenant.mjs',
].forEach((path) => assert(existsSync(new URL(`../${path}`, import.meta.url)), `Missing SaaS foundation file: ${path}`));

const dockerfile = read('Dockerfile');
const compose = read('docker-compose.yml');
const nginx = read('nginx.conf');
const saasSecurityChecklist = read('docs/saas-security-qa-checklist.md');
const app = read('src/App.jsx');
const authService = read('src/firebase/authService.js');
const tenantHostContext = read('src/utils/tenantHostContext.js');
const repositories = read('src/repositories/index.js');
const loginPage = read('src/components/auth/LoginPage.jsx');
const centralLandingPage = read('src/components/auth/CentralLandingPage.jsx');
const forgotPassword = read('src/components/auth/ForgotPasswordPage.jsx');
const resetPassword = read('src/components/auth/ResetPasswordPage.jsx');
const selectTenant = read('src/components/auth/SelectTenantPage.jsx');
const tenantGate = read('src/components/auth/TenantGate.jsx');
const tenantAccessService = read('src/services/tenantAccessService.js');
const tenantAuthorization = read('src/services/tenantAuthorization.js');
const tenantDataPaths = read('src/utils/tenantDataPaths.js');
const tenantSubscriptionRepository = read('src/repositories/firebase/firebaseTenantSubscriptionRepository.js');
const tenantTokenRequestsRepository = read('src/repositories/firebase/firebaseTenantTokenRequestsRepository.js');
const envExample = read('.env.example');
const packageJson = read('package.json');
const seedTenant = read('scripts/seed-bp-kallis-tenant.mjs');

assert(dockerfile.includes('npm ci'), 'Dockerfile must use npm ci for reproducible installs.');
assert(dockerfile.includes('npm run build'), 'Dockerfile must build the Vite app.');
assert(dockerfile.includes('nginx'), 'Dockerfile must serve the production build with nginx.');
assert(compose.includes('gasstation-frontend'), 'docker-compose must define the frontend service.');
assert(nginx.includes('try_files $uri $uri/ /index.html'), 'Nginx must provide SPA fallback.');
assert(saasSecurityChecklist.includes('Αν υπάρχει λογαριασμός με αυτό το email'), 'SaaS security QA must cover generic forgot-password messaging.');
assert(saasSecurityChecklist.includes('Δεν υπάρχει ενεργό κατάστημα'), 'SaaS security QA must cover no-access messaging.');
assert(saasSecurityChecklist.includes('Δεν έχετε πρόσβαση σε αυτό το κατάστημα'), 'SaaS security QA must cover tenant denied messaging.');
assert(saasSecurityChecklist.includes('tenantMemberships/{uid}_{tenantId}'), 'SaaS security QA must cover uid-based memberships.');
assert(saasSecurityChecklist.includes('VITE_ENABLE_TENANT_GATE=false'), 'SaaS security QA must document the pilot-safe tenant gate flag.');
assert(saasSecurityChecklist.includes('No service account JSON'), 'SaaS security QA must cover secret commit prevention.');

assert(app.includes('/forgot-password'), 'App must route /forgot-password.');
assert(app.includes('/login'), 'App must route /login.');
assert(app.includes('/reset-password'), 'App must route /reset-password.');
assert(app.includes('/select-tenant'), 'App must prepare /select-tenant.');
assert(app.includes('/request-token'), 'App must prepare /request-token.');
assert(app.includes('/admin-console'), 'App must prepare /admin-console.');
assert(app.includes('/app'), 'App must prepare /app.');
assert(app.includes('SelectTenantPage'), 'App must route /select-tenant to the tenant selection page.');
assert(app.includes('CentralLandingPage'), 'App must route central portal root to the SaaS landing page.');
assert(app.includes('LoginPage'), 'App must route /login to a dedicated login page.');
assert(app.includes('TenantGate'), 'App must wrap tenant views in the tenant gate foundation.');
assert(app.includes('routePath={routePath}'), 'App must pass current route to TenantGate.');
assert(authService.includes('verifyPasswordResetCode'), 'Auth service must verify Firebase reset codes.');
assert(authService.includes('confirmPasswordReset'), 'Auth service must confirm Firebase password reset.');
assert(authService.includes('subscribeAuth'), 'Auth service must expose raw Firebase auth for uid-based tenant membership checks.');
assert(loginPage.includes('authRepository.signInAdmin'), 'Login page must use Firebase admin auth repository.');
assert(loginPage.includes('resolveCentralTenantDestination'), 'Login page must use central tenant membership routing.');
assert(loginPage.includes("new URL('/select-tenant'"), 'Login page must route multi-tenant users to /select-tenant.');
assert(loginPage.includes("selectUrl.searchParams.set('returnTo', returnTo)"), 'Login page must preserve returnTo for tenant selection.');
assert(loginPage.includes('resolveAuthorizedReturnTo'), 'Login page must validate returnTo against tenant membership before redirecting.');
assert(loginPage.includes("window.location.assign('/app')"), 'Login page must route tenant/local login to /app.');
assert(loginPage.includes('rememberDevice'), 'Login page must expose remember-device persistence choice.');
assert(loginPage.includes('MAX_EMAIL_LENGTH'), 'Login page must bound email input length.');
assert(loginPage.includes('MAX_PASSWORD_LENGTH'), 'Login page must bound password input length.');
assert(!loginPage.includes('console.log') && !loginPage.includes('console.error'), 'Login page must not log auth failures.');
assert(centralLandingPage.includes('ShiftOryx'), 'Central landing page must present the ShiftOryx product.');
assert(centralLandingPage.includes('/login'), 'Central landing page must link to login.');
assert(centralLandingPage.includes('Request Demo'), 'Central landing page must include a request-demo placeholder.');
assert(forgotPassword.includes('Αν υπάρχει λογαριασμός με αυτό το email'), 'Forgot password must use a generic response.');
assert(forgotPassword.includes('MAX_EMAIL_LENGTH'), 'Forgot password must bound email input length.');
assert(forgotPassword.includes('email.trim()'), 'Forgot password must trim email before sending reset requests.');
assert(!forgotPassword.includes('console.log') && !resetPassword.includes('console.log'), 'Auth pages must not log reset data.');
assert(resetPassword.includes('MIN_PASSWORD_LENGTH'), 'Reset password must enforce a minimum password length.');
assert(resetPassword.includes('MAX_PASSWORD_LENGTH'), 'Reset password must bound password input length.');
assert(resetPassword.includes("window.history.replaceState({}, '', '/login')"), 'Reset success must remove reset query params.');
assert(resetPassword.includes("window.location.assign('/login')"), 'Reset success must redirect to login.');

assert(tenantHostContext.includes('VITE_CENTRAL_PORTAL_DOMAIN'), 'Tenant host resolver must support central portal domain.');
assert(tenantHostContext.includes('VITE_PUBLIC_APP_BASE_DOMAIN'), 'Tenant host resolver must support configurable base domain.');
assert(repositories.includes('tenantMembershipsRepository'), 'Repository exports must include tenant memberships.');
assert(repositories.includes('tenantsRepository'), 'Repository exports must include tenants.');
assert(repositories.includes('tenantSubscriptionRepository'), 'Repository exports must include tenant subscription.');
assert(repositories.includes('tenantTokenRequestsRepository'), 'Repository exports must include tenant token requests.');
assert(tenantAccessService.includes('listActiveTenantAccessForUser'), 'Tenant access service must load active memberships by uid.');
assert(tenantAccessService.includes('verifyTenantAccessForHost'), 'Tenant access service must prepare tenant host membership checks.');
assert(tenantAccessService.includes('getTenantById(hostContext.tenantSlug)'), 'Tenant host access must read tenants/{tenantSlug} directly to satisfy membership-based Firestore rules.');
assert(tenantAccessService.includes('Δεν υπάρχει ενεργό κατάστημα'), 'Tenant access service must include safe no-access message.');
assert(
  tenantAccessService.includes('TENANT_ACCESS_DENIED_MESSAGE') &&
    tenantAuthorization.includes('Δεν έχετε πρόσβαση σε αυτό το κατάστημα'),
  'Tenant access service must use the shared safe denied message.',
);
assert(!tenantAccessService.includes('@'), 'Tenant access service must not hardcode email access rules.');
assert(tenantDataPaths.includes("employees: 'employees'"), 'Tenant data paths must include tenant-scoped employees.');
assert(tenantDataPaths.includes("shifts: 'shifts'"), 'Tenant data paths must include tenant-scoped shifts.');
assert(tenantDataPaths.includes("settings: 'settings'"), 'Tenant data paths must include tenant-scoped settings.');
assert(tenantDataPaths.includes("subscription: 'subscription'"), 'Tenant data paths must include tenant-scoped subscription.');
assert(tenantDataPaths.includes("tokenRequests: 'tokenRequests'"), 'Tenant data paths must include tenant-scoped token requests.');
assert(tenantDataPaths.includes("auditLogs: 'auditLogs'"), 'Tenant data paths must include tenant-scoped audit logs.');
assert(tenantDataPaths.includes('getTenantScopedCollectionPath'), 'Tenant data paths must expose tenant-scoped collection paths.');
assert(tenantDataPaths.includes('getTenantMembershipPath'), 'Tenant data paths must expose uid-based membership paths.');
assert(tenantSubscriptionRepository.includes('getTenantSubscription'), 'Tenant subscription repository must expose getTenantSubscription.');
assert(tenantSubscriptionRepository.includes('TENANT_SCOPED_COLLECTIONS.subscription'), 'Tenant subscription repository must use tenant-scoped subscription path.');
assert(tenantTokenRequestsRepository.includes('createTenantTokenRequest'), 'Tenant token requests repository must expose createTenantTokenRequest.');
assert(tenantTokenRequestsRepository.includes('listTenantTokenRequests'), 'Tenant token requests repository must expose listTenantTokenRequests.');
assert(tenantTokenRequestsRepository.includes('TENANT_SCOPED_COLLECTIONS.tokenRequests'), 'Tenant token requests repository must use tenant-scoped tokenRequests path.');
assert(!tenantTokenRequestsRepository.includes('secret') && !tenantTokenRequestsRepository.includes('tokenValue'), 'Tenant token requests must not store secret token values.');
assert(selectTenant.includes('resolveCentralTenantDestination'), 'Select tenant page must use central membership flow.');
assert(selectTenant.includes('resolveAuthorizedReturnTo'), 'Select tenant page must validate returnTo before tenant redirect.');
assert(selectTenant.includes('authRepository.subscribeAuth'), 'Select tenant page must use raw auth uid for membership flow.');
assert(!selectTenant.includes('authRepository.subscribeAdminAuth'), 'Select tenant page must not require admin claim for membership lookup.');
assert(selectTenant.includes('window.location.assign'), 'Single tenant flow must redirect to tenant domain.');
assert(!selectTenant.includes('console.log'), 'Select tenant page must not log user or tenant data.');
assert(envExample.includes('VITE_ENABLE_TENANT_GATE=false'), 'Tenant gate must be explicitly default-off for the pilot.');
assert(tenantGate.includes('VITE_ENABLE_TENANT_GATE'), 'Tenant gate must be controlled by an explicit feature flag.');
assert(tenantGate.includes('PUBLIC_TENANT_ROUTES'), 'Tenant gate must allow public auth routes through when enabled.');
assert(tenantGate.includes('buildCentralLoginUrl'), 'Tenant gate must redirect unauthenticated tenant users to central login.');
assert(tenantGate.includes('createCurrentReturnToUrl'), 'Tenant gate must preserve returnTo when redirecting to central login.');
assert(tenantGate.includes("'/login'"), 'Tenant gate must not block /login.');
assert(tenantGate.includes("'/forgot-password'"), 'Tenant gate must not block /forgot-password.');
assert(tenantGate.includes("'/reset-password'"), 'Tenant gate must not block /reset-password.');
assert(tenantGate.includes('verifyTenantAccessForHost'), 'Tenant gate must verify active membership before protected tenant access.');
assert(tenantGate.includes('authRepository.subscribeAuth'), 'Tenant gate must use raw auth uid for tenant membership checks.');
assert(!tenantGate.includes('authRepository.subscribeAdminAuth'), 'Tenant gate must not require admin claim for tenant membership checks.');
assert(tenantGate.includes('TENANT_ACCESS_MESSAGES.denied'), 'Tenant gate must use safe denied messaging.');
assert(!tenantGate.includes('console.log'), 'Tenant gate must not log users, tenants, or access failures.');
assert(packageJson.includes('tenant:seed-bp-kallis'), 'Package scripts must include the BP Kallis tenant seed command.');
assert(seedTenant.includes('tenantMemberships/${uid}_${tenantId}'), 'Tenant seed must create uid-based membership ids.');
assert(seedTenant.includes('users/${uid}'), 'Tenant seed must prepare users/{uid}.');
assert(seedTenant.includes('tenants/${tenantId}'), 'Tenant seed must prepare tenants/{tenantId}.');
assert(seedTenant.includes('Service account private keys and OAuth tokens are never printed'), 'Tenant seed must document secret handling.');
assert(!seedTenant.includes('bp-kallis@'), 'Tenant seed must not hardcode tenant access by email.');

const localContext = resolveTenantHostContext('localhost');
assertEqual(localContext.mode, 'local', 'localhost must resolve as local mode.');
assertEqual(localContext.tenantSlug, 'bp-kallis', 'localhost must use the safe default tenant slug.');

const centralContext = resolveTenantHostContext('gas.homelabshare.gr');
assertEqual(centralContext.mode, 'central', 'gas.homelabshare.gr must resolve as central portal.');

const tenantContext = resolveTenantHostContext('bp-kallis.homelabshare.gr');
assertEqual(tenantContext.mode, 'tenant', 'bp-kallis.homelabshare.gr must resolve as tenant mode.');
assertEqual(tenantContext.tenantSlug, 'bp-kallis', 'bp-kallis host must resolve to bp-kallis slug.');

const unknownContext = resolveTenantHostContext('example.com');
assertEqual(unknownContext.mode, 'unknown', 'Unknown hostnames must not be treated as tenants.');

assertEqual(getUserPath('uid-123'), 'users/uid-123', 'User path must follow users/{uid}.');
assertThrows(
  () => getTenantPath('BP-Kallis'),
  'Tenant paths must reject mixed-case tenant ids instead of normalizing production inputs.',
);
assertEqual(getTenantPath('bp-kallis'), 'tenants/bp-kallis', 'Tenant path must accept lowercase tenant ids.');
assertEqual(
  getTenantMembershipPath('uid-123', 'bp-kallis'),
  'tenantMemberships/uid-123_bp-kallis',
  'Membership path must follow tenantMemberships/{uid}_{tenantId}.',
);
assertEqual(
  getTenantScopedCollectionPath('bp-kallis', TENANT_SCOPED_COLLECTIONS.employees),
  'tenants/bp-kallis/employees',
  'Tenant employees path must be scoped under tenants/{tenantId}.',
);
assertEqual(
  getTenantScopedDocumentPath('bp-kallis', TENANT_SCOPED_COLLECTIONS.shifts, 'shift-1'),
  'tenants/bp-kallis/shifts/shift-1',
  'Tenant shift document path must be scoped under tenants/{tenantId}/shifts.',
);
assertThrows(
  () => getTenantScopedCollectionPath('bp-kallis', 'unsafeCollection'),
  'Tenant data paths must reject unsupported collections.',
);
assertThrows(
  () => getTenantPath('../bad'),
  'Tenant data paths must reject unsafe tenant ids.',
);

console.log('SaaS foundation checks passed');
