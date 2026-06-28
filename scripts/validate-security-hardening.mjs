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

function matchIndentedBlock(collectionName) {
  const pattern = new RegExp(`(^[ \\t]*)match\\s+/${collectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\{`, 'm');
  const match = firestoreRules.match(pattern);
  if (!match) return '';
  const start = match.index;
  const indent = match[1];
  const nextPattern = new RegExp(`\\n${indent}match\\s+/`, 'g');
  nextPattern.lastIndex = start + match[0].length;
  const next = nextPattern.exec(firestoreRules);
  return firestoreRules.slice(start, next ? next.index : undefined);
}

const publicReadMatches = [...firestoreRules.matchAll(/^[ \t]*match\s+\/([A-Za-z0-9_]+)\/\{/gm)]
  .map((match) => match[1])
  .filter((collectionName) => !['databases', 'tenants'].includes(collectionName))
  .filter((collectionName) => matchIndentedBlock(collectionName).includes('allow read: if true;'));
const allowedPublicReadCollections = new Set([
  'employees_public',
  'published_schedules',
  'publicEmployees',
  'publicSchedules',
  'publicMonths',
  'publicAnnouncements',
]);

assert(!combinedClientAuth.includes('VITE_ADMIN_PASSWORD'), 'Client/admin docs must not reference VITE_ADMIN_PASSWORD.');
assert(!combinedClientAuth.includes('admin123'), 'Client/admin docs must not expose demo admin password fallback.');
assert(!combinedClientAuth.includes('admin@example.com'), 'Client/admin docs must not expose demo admin email fallback.');
assert(!authService.includes('adminPassword'), 'Auth service must not import or compare a client-side admin password.');
assert(!authService.includes('getIdTokenResult'), 'Auth service must not authorize tenant admins using Firebase custom claims.');
assert(!authService.includes('isAllowedAdminEmail'), 'Auth service must not authorize tenant admins using email allowlists.');
assert(
  !authService.includes('!isFirebaseConfigured || !auth || !isAdminEmailConfigured'),
  'Production auth subscription must not require VITE_ADMIN_EMAIL.',
);
assert(
  runtimeEnvironmentRepository.includes('getPublicConfiguredAdminEmail'),
  'Runtime repository must hide configured admin email outside demo mode.',
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
assert(!adminBootstrapScript.includes('customAttributes'), 'Admin bootstrap must not write Firebase custom claims.');
assert(!adminBootstrapScript.includes('admin: true'), 'Admin bootstrap must not grant admin access by custom claim.');

assert(!firestoreRules.includes('admin@example.com'), 'Firestore rules must not hardcode demo admin emails.');
assert(
  publicReadMatches.every((collectionName) => allowedPublicReadCollections.has(collectionName)),
  `Firestore rules expose unexpected public reads: ${publicReadMatches.filter((collectionName) => !allowedPublicReadCollections.has(collectionName)).join(', ')}`,
);
assert(matchBlock('employeeAbsencesPublic').includes('allow read: if isAdmin();'), 'Legacy public absence mirror must not be anonymously readable.');
assert(matchBlock('employeeAbsencesPublic').includes('allow create: if isAdmin()'), 'Sanitized public absence docs must be admin writable only.');
assert(matchBlock('published_schedules').includes('allow read: if true;'), 'Sanitized published schedules must remain public readable.');
assert(
  matchBlock('published_schedules').includes('allow create, update: if isAdmin() && validPublishedSchedule(resourceId);'),
  'Sanitized published schedules must be admin writable only.',
);
assert(!firestoreRules.includes('request.auth.token.admin == true'), 'Firestore rules must not authorize tenant admins by custom claim.');
assert(firestoreRules.includes("role in ['OWNER', 'ADMIN', 'MANAGER']"), 'Firestore rules must validate tenant admin roles.');
assert(firestoreRules.includes('allow read: if isAdmin()'), 'Protected Firestore reads must require admin authorization.');
assert(firestoreRules.includes('affectedKeys().hasOnly'), 'Firestore rules must restrict unexpected fields.');
assert(firestoreRules.includes('match /users/{uid}'), 'Firestore rules must define SaaS users/{uid} rules.');
assert(firestoreRules.includes('match /tenantMemberships/{membershipId}'), 'Firestore rules must define tenantMemberships rules.');
assert(firestoreRules.includes('match /tenants/{tenantId}'), 'Firestore rules must define tenants rules.');
assert(firestoreRules.includes('isActiveTenantMember'), 'Firestore rules must verify active tenant membership by uid + tenantId.');
assert(matchBlock('tenantMemberships').includes('resource.data.uid == request.auth.uid'), 'Tenant memberships must be readable by the owning uid.');
assert(matchBlock('tenantMemberships').includes("resource.data.status == 'ACTIVE'"), 'Tenant membership self-read must require ACTIVE status.');
assert(matchBlock('tenantMemberships').includes('resource.data.tenantId is string'), 'Tenant membership tenant-admin reads must be tenant-bound.');
assert(matchBlock('tenantMemberships').includes('isTenantAdmin(resource.data.tenantId)'), 'Tenant membership reads must not grant cross-tenant membership visibility.');
assert(matchBlock('tenantMemberships').includes('allow create, update, delete: if false;'), 'Tenant memberships must deny all client writes.');
assert(!matchBlock('tenantMemberships').includes('allow create, update: if isAdmin()'), 'Tenant memberships must not be client-writable by hardcoded admin checks.');
assert(!matchBlock('tenantMemberships').includes('allow delete: if isAdmin()'), 'Tenant memberships must not be client-deletable by hardcoded admin checks.');
assert(matchBlock('tenants').includes('allow read: if isTenantAdmin(tenantId);'), 'Tenants must be readable only by matching tenant admins.');
assert(matchBlock('tenants').includes('match /employees/{employeeId}'), 'Tenant scoped employees rules must exist.');
assert(matchBlock('tenants').includes('match /shifts/{shiftId}'), 'Tenant scoped shifts rules must exist.');
assert(matchBlock('tenants').includes('match /settings/{settingsId}'), 'Tenant scoped settings rules must exist.');
assert(matchBlock('tenants').includes('match /subscription/{subscriptionId}'), 'Tenant scoped subscription rules must exist.');
assert(matchBlock('tenants').includes('match /tokenRequests/{requestId}'), 'Tenant scoped token request rules must exist.');
assert(matchBlock('tenants').includes('match /auditLogs/{auditLogId}'), 'Tenant scoped audit log rules must exist.');
[
  'match /publicEmployees/{employeeId}',
  'match /publicSchedules/{weekStart}',
  'match /publicMonths/{yearMonth}',
  'match /publicAnnouncements/{announcementId}',
].forEach((marker) => {
  assert(matchBlock('tenants').includes(marker), `Tenant scoped public rule missing: ${marker}`);
});
[
  'match /employees/{employeeId}',
  'match /shifts/{shiftId}',
  'match /settings/{settingsId}',
  'match /subscription/{subscriptionId}',
  'match /tokenRequests/{requestId}',
  'match /auditLogs/{auditLogId}',
].forEach((marker) => {
  const start = matchBlock('tenants').indexOf(marker);
  const end = matchBlock('tenants').indexOf('\n      match /', start + marker.length);
  const block = matchBlock('tenants').slice(start, end === -1 ? undefined : end);
  assert(!block.includes('allow read: if true;'), `Raw tenant scoped SaaS data must not be public readable: ${marker}`);
});
assert(matchBlock('monthly_schedule_exports').includes('allow read: if isTenantAdmin(resource.data.tenantId);'), 'Monthly PDF archive metadata must be tenant-admin-readable only.');
assert(
  matchBlock('monthly_schedule_exports').includes('allow create, update: if isTenantAdmin(request.resource.data.tenantId) && validMonthlyScheduleExport(exportId);'),
  'Monthly PDF archive metadata must be admin writable only and validated.',
);
assert(!matchBlock('monthly_schedule_exports').includes('allow read: if true;'), 'Monthly PDF archive metadata must not be public readable.');
assert(!storageRules.includes('request.auth.token.admin == true'), 'Storage rules must not authorize admins by custom claim.');
assert(storageRules.includes("role in ['OWNER', 'ADMIN', 'MANAGER']"), 'Storage rules must validate tenant admin roles.');
assert(storageRules.includes('match /tenants/{tenantId}/monthly_schedule_pdfs/{yearMonth}/{fileName}'), 'Storage rules must define private monthly PDF archive paths.');
assert(storageRules.includes('allow read: if isTenantAdmin(tenantId)'), 'Monthly PDF archive files must be tenant-admin-readable only.');
assert(storageRules.includes('allow write: if isTenantAdmin(tenantId)'), 'Monthly PDF archive files must be tenant-admin-writable only.');
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
