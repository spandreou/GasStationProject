import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const firebaseConfig = read('src/firebase/config.js');
const authService = read('src/firebase/authService.js');
const adminLoginModal = read('src/components/scheduler/AdminLoginModal.jsx');
const runtimeEnvironmentRepository = read('src/repositories/firebase/firebaseRuntimeEnvironmentRepository.js');
const adminBootstrapScript = read('scripts/bootstrap-admin-user.mjs');
const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');
const vercelConfig = JSON.parse(read('vercel.json'));
const readme = read('README.md');

const combinedClientAuth = `${firebaseConfig}\n${authService}\n${adminLoginModal}\n${readme}`;

function matchBlock(collectionName) {
  const marker = `match /${collectionName}/`;
  const start = firestoreRules.indexOf(marker);
  if (start === -1) return '';
  const next = firestoreRules.indexOf('\n    match /', start + marker.length);
  return firestoreRules.slice(start, next === -1 ? undefined : next);
}

const publicReadMatches = [...firestoreRules.matchAll(/match\s+\/([A-Za-z0-9_]+)\/\{/g)]
  .map((match) => match[1])
  .filter((collectionName) => matchBlock(collectionName).includes('allow read: if true;'));
const allowedPublicReadCollections = new Set(['employees_public', 'employeeAbsencesPublic', 'published_schedules']);

assert(!combinedClientAuth.includes('VITE_ADMIN_PASSWORD'), 'Client/admin docs must not reference VITE_ADMIN_PASSWORD.');
assert(!combinedClientAuth.includes('admin123'), 'Client/admin docs must not expose demo admin password fallback.');
assert(!combinedClientAuth.includes('admin@example.com'), 'Client/admin docs must not expose demo admin email fallback.');
assert(!authService.includes('adminPassword'), 'Auth service must not import or compare a client-side admin password.');
assert(authService.includes('getIdTokenResult'), 'Auth service must verify production admin using Firebase custom claims.');
assert(
  !authService.includes('!isFirebaseConfigured || !auth || !isAdminEmailConfigured'),
  'Production auth subscription must not require VITE_ADMIN_EMAIL.',
);
assert(
  runtimeEnvironmentRepository.includes('getPublicConfiguredAdminEmail'),
  'Runtime repository must hide configured admin email outside demo mode.',
);
assert(
  adminBootstrapScript.includes('customAttributes') && adminBootstrapScript.includes('admin: true'),
  'Admin bootstrap must set Firebase custom claim admin=true.',
);
assert(
  adminBootstrapScript.includes('ADMIN_BOOTSTRAP_PASSWORD'),
  'Admin bootstrap must read temporary passwords from an environment variable.',
);
assert(
  !adminBootstrapScript.includes("arg === '--password'") && !adminBootstrapScript.includes('case \'--password\''),
  'Admin bootstrap must not accept passwords as CLI arguments.',
);
assert(
  !adminBootstrapScript
    .split('\n')
    .some((line) => /console\.(log|error)/iu.test(line) && /(password|private_key|access_token|serviceAccount)/iu.test(line)),
  'Admin bootstrap must not print passwords, private keys, access tokens, or service account objects.',
);

assert(!firestoreRules.includes('admin@example.com'), 'Firestore rules must not hardcode demo admin emails.');
assert(
  publicReadMatches.every((collectionName) => allowedPublicReadCollections.has(collectionName)),
  `Firestore rules expose unexpected public reads: ${publicReadMatches.filter((collectionName) => !allowedPublicReadCollections.has(collectionName)).join(', ')}`,
);
assert(matchBlock('employeeAbsencesPublic').includes('allow read: if true;'), 'Sanitized public absence docs must remain public readable.');
assert(matchBlock('employeeAbsencesPublic').includes('allow create: if isAdmin()'), 'Sanitized public absence docs must be admin writable only.');
assert(matchBlock('published_schedules').includes('allow read: if true;'), 'Sanitized published schedules must remain public readable.');
assert(
  matchBlock('published_schedules').includes('allow create, update: if isAdmin() && validPublishedSchedule(resourceId);'),
  'Sanitized published schedules must be admin writable only.',
);
assert(firestoreRules.includes('request.auth.token.admin == true'), 'Firestore rules must authorize admin writes by custom claim.');
assert(firestoreRules.includes('allow read: if isAdmin()'), 'Protected Firestore reads must require admin authorization.');
assert(firestoreRules.includes('affectedKeys().hasOnly'), 'Firestore rules must restrict unexpected fields.');
assert(firestoreRules.includes('match /users/{uid}'), 'Firestore rules must define SaaS users/{uid} rules.');
assert(firestoreRules.includes('match /tenantMemberships/{membershipId}'), 'Firestore rules must define tenantMemberships rules.');
assert(firestoreRules.includes('match /tenants/{tenantId}'), 'Firestore rules must define tenants rules.');
assert(firestoreRules.includes('isActiveTenantMember'), 'Firestore rules must verify active tenant membership by uid + tenantId.');
assert(matchBlock('tenantMemberships').includes('resource.data.uid == request.auth.uid'), 'Tenant memberships must be readable by the owning uid.');
assert(matchBlock('tenantMemberships').includes("resource.data.status == 'ACTIVE'"), 'Tenant membership self-read must require ACTIVE status.');
assert(matchBlock('tenantMemberships').includes('allow create, update: if isAdmin() && validTenantMembership();'), 'Tenant memberships must be admin writable only.');
assert(matchBlock('tenants').includes('allow read: if isAdmin() || isActiveTenantMember(tenantId);'), 'Tenants must be readable only by admins or active tenant members.');
assert(matchBlock('tenants').includes('match /employees/{employeeId}'), 'Tenant scoped employees rules must exist.');
assert(matchBlock('tenants').includes('match /shifts/{shiftId}'), 'Tenant scoped shifts rules must exist.');
assert(matchBlock('tenants').includes('match /settings/{settingsId}'), 'Tenant scoped settings rules must exist.');
assert(matchBlock('tenants').includes('match /subscription/{subscriptionId}'), 'Tenant scoped subscription rules must exist.');
assert(matchBlock('tenants').includes('match /tokenRequests/{requestId}'), 'Tenant scoped token request rules must exist.');
assert(matchBlock('tenants').includes('match /auditLogs/{auditLogId}'), 'Tenant scoped audit log rules must exist.');
assert(!matchBlock('tenants').includes('allow read: if true;'), 'Tenant scoped SaaS data must not be public readable.');
assert(matchBlock('monthly_schedule_exports').includes('allow read: if isAdmin();'), 'Monthly PDF archive metadata must be admin-readable only.');
assert(
  matchBlock('monthly_schedule_exports').includes('allow create, update: if isAdmin() && validMonthlyScheduleExport(exportId);'),
  'Monthly PDF archive metadata must be admin writable only and validated.',
);
assert(!matchBlock('monthly_schedule_exports').includes('allow read: if true;'), 'Monthly PDF archive metadata must not be public readable.');
assert(storageRules.includes('request.auth.token.admin == true'), 'Storage rules must authorize admins by custom claim.');
assert(storageRules.includes('match /tenants/{tenantId}/monthly_schedule_pdfs/{yearMonth}/{fileName}'), 'Storage rules must define private monthly PDF archive paths.');
assert(storageRules.includes('allow read: if isAdmin()'), 'Monthly PDF archive files must be admin-readable only.');
assert(storageRules.includes('allow write: if isAdmin()'), 'Monthly PDF archive files must be admin-writable only.');
assert(!storageRules.includes('allow read: if true;'), 'Storage rules must not expose public reads.');

const allHeaders = vercelConfig.headers.flatMap((entry) => entry.headers || []);
const headerKeys = new Set(allHeaders.map((header) => header.key));
[
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Content-Security-Policy',
].forEach((header) => {
  assert(headerKeys.has(header), `Vercel security header missing: ${header}`);
});

const cspHeader = allHeaders.find((header) => header.key === 'Content-Security-Policy')?.value || '';
[
  "default-src 'self'",
  "script-src 'self'",
  'connect-src',
  'https://*.googleapis.com',
  'https://*.firebaseio.com',
  'https://*.firebaseapp.com',
  'https://*.appspot.com',
  'https://www.googletagmanager.com',
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].forEach((directive) => {
  assert(cspHeader.includes(directive), `Content-Security-Policy missing directive/origin: ${directive}`);
});

console.log('Security hardening checks passed');
