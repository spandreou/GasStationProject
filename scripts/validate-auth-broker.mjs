import { existsSync, readFileSync } from 'node:fs';
import {
  AUTH_TICKET_TTL_MS,
  buildAuthTicketDocument,
  buildTenantTicketRedirectUrl,
  hashAuthTicket,
  isAllowedBrokerOrigin,
  isAllowedTenantOrigin,
  isAllowedTenantSlug,
  resolveValidatedTenantOrigin,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
  SLUG_REGEX,
  validateBrokerReturnTo,
  validateTicketFormat,
} from '../functions/src/authBrokerCore.js';

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

function assertStartsWith(actual, prefix, message) {
  if (!String(actual).startsWith(prefix)) {
    throw new Error(`${message} Expected "${actual}" to start with "${prefix}".`);
  }
}

[
  'functions/package.json',
  'functions/src/index.js',
  'functions/src/authBrokerCore.js',
  'src/firebase/authBrokerService.js',
  'src/components/auth/AuthTicketCallback.jsx',
  'scripts/test-auth-broker-emulator.mjs',
  'docs/auth-broker-runbook.md',
].forEach((path) => assert(existsSync(new URL(`../${path}`, import.meta.url)), `Missing auth broker file: ${path}`));

const envExample = read('.env.example');
const firebaseJson = JSON.parse(read('firebase.json'));
const packageJson = JSON.parse(read('package.json'));
const firestoreRules = read('firestore.rules');
const functionsIndex = read('functions/src/index.js');
const authBrokerService = read('src/firebase/authBrokerService.js');
const authService = read('src/firebase/authService.js');
const authTicketCallback = read('src/components/auth/AuthTicketCallback.jsx');
const app = read('src/App.jsx');
const loginPage = read('src/components/auth/LoginPage.jsx');
const selectTenantPage = read('src/components/auth/SelectTenantPage.jsx');
const tenantGate = read('src/components/auth/TenantGate.jsx');
const emulatorTest = read('scripts/test-auth-broker-emulator.mjs');
const runbook = read('docs/auth-broker-runbook.md');

assert(envExample.includes('VITE_ENABLE_AUTH_BROKER=false'), 'Auth broker feature flag must default false.');
assert(firebaseJson.functions?.source === 'functions', 'firebase.json must define the functions source.');
assert(firebaseJson.emulators?.auth?.port, 'firebase.json must define an Auth emulator port.');
assert(firebaseJson.emulators?.firestore?.port, 'firebase.json must define a Firestore emulator port.');
assert(firebaseJson.emulators?.functions?.port, 'firebase.json must define a Functions emulator port.');
assert(packageJson.scripts?.['test:auth-broker:emulator']?.includes('emulators:exec'), 'package.json must expose an auth broker emulator test script.');
assert(firestoreRules.includes('match /authTickets/{ticketId}'), 'Firestore rules must include authTickets.');
assert(firestoreRules.includes('allow read, write: if false'), 'authTickets must be denied to clients.');

assert(functionsIndex.includes('createAuthTicket'), 'Functions index must export createAuthTicket.');
assert(functionsIndex.includes('exchangeAuthTicket'), 'Functions index must export exchangeAuthTicket.');
assert(functionsIndex.includes('cleanupAuthTickets'), 'Functions index must export cleanupAuthTickets.');
assert(functionsIndex.includes('createCustomToken'), 'exchangeAuthTicket must mint Firebase custom tokens.');
assert(functionsIndex.includes('runTransaction'), 'exchangeAuthTicket must consume tickets in a Firestore transaction.');
assert(!functionsIndex.includes('console.log(ticket') && !functionsIndex.includes('logger.info(ticket'), 'Functions must not log raw auth tickets.');
assert(!functionsIndex.includes('Access-Control-Allow-Origin: *'), 'Functions must not use wildcard CORS.');

assert(authBrokerService.includes('httpsCallable'), 'Frontend auth broker service must use Firebase Functions callable endpoints.');
assert(authBrokerService.includes('window.history.replaceState'), 'Frontend must clear auth tickets from the URL fragment.');
assert(!authBrokerService.includes('console.log') && !authBrokerService.includes('console.error'), 'Auth broker service must not log tickets or tokens.');
assert(authService.includes('signInWithCustomToken'), 'Auth service must expose custom-token sign-in.');
assert(authTicketCallback.includes('signInWithBrokerCustomToken'), 'Tenant callback must sign in using returned custom token.');
assert(authTicketCallback.includes('readAndClearAuthTicketFromUrl'), 'Tenant callback must read and clear auth tickets safely.');
assert(!authTicketCallback.includes('console.log') && !authTicketCallback.includes('console.error'), 'Tenant callback must not log tickets or custom tokens.');
assert(app.includes('AuthTicketCallback'), 'App must mount tenant auth ticket callback handling.');
assert(loginPage.includes('VITE_ENABLE_AUTH_BROKER') || loginPage.includes('isAuthBrokerEnabled'), 'Login page must gate broker use behind feature flag.');
assert(selectTenantPage.includes('createTenantAuthTicketRedirect'), 'Tenant selection must use auth ticket redirects when enabled.');
assert(tenantGate.includes('VITE_ENABLE_AUTH_BROKER') || tenantGate.includes('isAuthBrokerEnabled'), 'Tenant gate must keep broker behavior feature-flagged.');

assertEqual(AUTH_TICKET_TTL_MS, 60_000, 'Auth ticket TTL must be 60 seconds.');
assert(validateTicketFormat('a'.repeat(64)).valid, '64-char hex tickets must be accepted.');
assert(!validateTicketFormat('short').valid, 'Short tickets must be rejected.');
assert(!validateTicketFormat('../bad-ticket').valid, 'Unsafe ticket strings must be rejected.');
assertEqual(hashAuthTicket('a'.repeat(64)).length, 64, 'Ticket hashes must be SHA-256 hex.');

const validLegacyReturnTo = validateBrokerReturnTo({
  returnTo: 'https://bp-kallis.homelabshare.gr/app?week=2026-06-01',
  expectedTenantId: 'bp-kallis',
  callerOrigin: 'https://gas.homelabshare.gr',
  allowedTenantIds: ['bp-kallis'],
  production: true,
});
assert(validLegacyReturnTo.valid, 'Valid BP Kallis legacy tenant returnTo must pass.');
assertEqual(validLegacyReturnTo.tenantId, 'bp-kallis', 'Legacy returnTo must resolve bp-kallis tenant.');
assertEqual(validLegacyReturnTo.allowedTenantOrigin, 'https://bp-kallis.homelabshare.gr', 'Legacy tenant origin must be normalized.');

const validPrimaryReturnTo = validateBrokerReturnTo({
  returnTo: 'https://bp-kallis.shiftoryx.gr/app?week=2026-06-01',
  expectedTenantId: 'bp-kallis',
  callerOrigin: 'https://shiftoryx.gr',
  allowedTenantIds: ['bp-kallis'],
  production: true,
});
assert(validPrimaryReturnTo.valid, 'Valid BP Kallis primary tenant returnTo must pass.');
assertEqual(validPrimaryReturnTo.tenantId, 'bp-kallis', 'Primary returnTo must resolve bp-kallis tenant.');
assertEqual(validPrimaryReturnTo.allowedTenantOrigin, 'https://bp-kallis.shiftoryx.gr', 'Primary tenant origin must be normalized.');

// Cross-family redirection security checks
const crossFamily1 = validateBrokerReturnTo({
  returnTo: 'https://bp-kallis.homelabshare.gr/app',
  expectedTenantId: 'bp-kallis',
  callerOrigin: 'https://shiftoryx.gr',
  production: true,
});
assert(!crossFamily1.valid && crossFamily1.reason === 'cross-family-redirect-not-allowed', 'Primary central to legacy tenant redirect must be rejected.');

const crossFamily2 = validateBrokerReturnTo({
  returnTo: 'https://bp-kallis.shiftoryx.gr/app',
  expectedTenantId: 'bp-kallis',
  callerOrigin: 'https://gas.homelabshare.gr',
  production: true,
});
assert(!crossFamily2.valid && crossFamily2.reason === 'cross-family-redirect-not-allowed', 'Legacy central to primary tenant redirect must be rejected.');

[
  'https://evil.com/app',
  'javascript:alert(1)',
  'data:text/html,hi',
  'https://user:pass@bp-kallis.homelabshare.gr/app',
  'https://gas.homelabshare.gr/login',
  'https://shiftoryx.gr/login',
  'https://www.shiftoryx.gr/login',
  'https://admin.shiftoryx.gr/app',
  'https://api.shiftoryx.gr/app',
  'https://unknown.homelabshare.gr/app',
  'https://bp-kallis.homelabshare.gr/../../admin',
  // Adversarial multi-tenant cases: deep nested subdomains must fail closed
  'https://foo.bar.shiftoryx.gr/app',
  'https://www.foo.shiftoryx.gr/app',
  'https://bp-kallis.extra.shiftoryx.gr/app',
  'https://nested.tenant.homelabshare.gr/app',
  // Domain lookalikes & suffix injection
  'https://evilshiftoryx.gr/app',
  'https://shiftoryx.gr.evil.com/app',
  'https://homelabshare.gr.evil.com/app',
  // Invalid slug length / format
  'https://ab.shiftoryx.gr/app',
  `https://${'a'.repeat(41)}.shiftoryx.gr/app`,
  'https://bp_kallis.shiftoryx.gr/app',
  'https://-leading-dash.shiftoryx.gr/app',
  'https://trailing-dash-.shiftoryx.gr/app',
].forEach((returnTo) => {
  assert(
    !validateBrokerReturnTo({
      returnTo,
      expectedTenantId: 'bp-kallis',
      allowedTenantIds: ['bp-kallis'],
      production: true,
    }).valid,
    `Unsafe returnTo must be rejected: ${returnTo}`,
  );
});

// Authoritative provisioning slug contract verification
assertEqual(SLUG_MIN_LENGTH, 3, 'SLUG_MIN_LENGTH must be 3.');
assertEqual(SLUG_MAX_LENGTH, 40, 'SLUG_MAX_LENGTH must be 40.');
assert(SLUG_REGEX.test('bp-kallis'), 'Valid slug regex check.');
assert(!SLUG_REGEX.test('ab'), 'Slug regex must reject length 2.');
assert(!SLUG_REGEX.test('a'.repeat(41)), 'Slug regex must reject length 41.');
assert(!SLUG_REGEX.test('has_underscore'), 'Slug regex must reject underscores.');
assert(!SLUG_REGEX.test('-leading'), 'Slug regex must reject leading hyphen.');
assert(!SLUG_REGEX.test('trailing-'), 'Slug regex must reject trailing hyphen.');
assert(isAllowedTenantSlug('bp-kallis'), 'isAllowedTenantSlug must accept bp-kallis.');
assert(isAllowedTenantSlug('brand-new-store-123'), 'isAllowedTenantSlug must accept valid slug.');
assert(!isAllowedTenantSlug('admin'), 'isAllowedTenantSlug must reject admin.');
assert(!isAllowedTenantSlug('www'), 'isAllowedTenantSlug must reject www.');
assert(!isAllowedTenantSlug('gas'), 'isAllowedTenantSlug must reject gas.');
assert(!isAllowedTenantSlug('shiftoryx'), 'isAllowedTenantSlug must reject shiftoryx.');
assert(!isAllowedTenantSlug('gas-store'), 'isAllowedTenantSlug must reject gas- prefix.');
assert(!isAllowedTenantSlug('store-gas'), 'isAllowedTenantSlug must reject -gas suffix.');
assert(!isAllowedTenantSlug('shiftoryx-store'), 'isAllowedTenantSlug must reject shiftoryx- prefix.');
assert(!isAllowedTenantSlug('store-shiftoryx'), 'isAllowedTenantSlug must reject -shiftoryx suffix.');
assert(!isAllowedTenantSlug('foo.bar'), 'isAllowedTenantSlug must reject slugs with dots.');

// Scalable dynamic origin verification for newly provisioned tenants
assert(isAllowedTenantOrigin('https://bp-kallis.shiftoryx.gr'), 'bp-kallis on primary domain must be allowed.');
assert(isAllowedTenantOrigin('https://bp-kallis.homelabshare.gr'), 'bp-kallis on legacy domain must be allowed.');
assert(isAllowedTenantOrigin('https://brand-new-tenant-999.shiftoryx.gr'), 'Newly provisioned tenant on primary domain must be allowed without manual reconfiguration.');
assert(isAllowedTenantOrigin('https://brand-new-tenant-999.homelabshare.gr'), 'Newly provisioned tenant on legacy domain must be allowed without manual reconfiguration.');
assert(!isAllowedTenantOrigin('https://foo.bar.shiftoryx.gr'), 'Deep nested origin must be rejected.');
assert(!isAllowedTenantOrigin('https://www.shiftoryx.gr'), 'Central / reserved origin must be rejected as tenant origin.');
assert(!isAllowedTenantOrigin('https://admin.shiftoryx.gr'), 'Reserved subdomain origin must be rejected.');
assert(!isAllowedTenantOrigin('https://evilshiftoryx.gr'), 'Domain lookalike origin must be rejected.');
assert(!isAllowedTenantOrigin('http://bp-kallis.shiftoryx.gr'), 'Non-https origin must be rejected.');
assert(!isAllowedTenantOrigin('https://bp-kallis.shiftoryx.gr:8080'), 'Non-standard port must be rejected in production.');

// Verify newly provisioned tenant returnTo validation without function reconfiguration
const newTenantReturnTo = validateBrokerReturnTo({
  returnTo: 'https://brand-new-tenant-999.shiftoryx.gr/app',
  expectedTenantId: 'brand-new-tenant-999',
  callerOrigin: 'https://shiftoryx.gr',
  production: true,
});
assert(newTenantReturnTo.valid, 'Newly provisioned tenant returnTo must pass without manual reconfiguration.');
assertEqual(newTenantReturnTo.tenantId, 'brand-new-tenant-999', 'Resolved tenant ID must match new tenant slug.');
assertEqual(newTenantReturnTo.allowedTenantOrigin, 'https://brand-new-tenant-999.shiftoryx.gr', 'Resolved tenant origin must match.');

// ============================================================================
// Targeted tests for backend tenant.domain resolution (resolveValidatedTenantOrigin)
// ============================================================================
const primaryFam = { id: 'primary', baseDomain: 'shiftoryx.gr', centralDomain: 'shiftoryx.gr' };
const legacyFam = { id: 'legacy', baseDomain: 'homelabshare.gr', centralDomain: 'gas.homelabshare.gr' };

// 1. tenant.domain = null + valid slug + primary family -> PASS
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: null },
    expectedTenantId: 'bp-kallis',
    targetFamily: primaryFam,
  }),
  'https://bp-kallis.shiftoryx.gr',
  'tenant.domain = null + valid slug + primary family must resolve expected origin.',
);

// 2. tenant.domain = null + valid slug + legacy family -> PASS
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: null },
    expectedTenantId: 'bp-kallis',
    targetFamily: legacyFam,
  }),
  'https://bp-kallis.homelabshare.gr',
  'tenant.domain = null + valid slug + legacy family must resolve expected origin.',
);

// 3. valid explicit primary domain -> PASS
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: 'bp-kallis.shiftoryx.gr' },
    expectedTenantId: 'bp-kallis',
    targetFamily: primaryFam,
  }),
  'https://bp-kallis.shiftoryx.gr',
  'valid explicit primary domain must resolve expected origin.',
);

// 4. valid explicit legacy domain -> PASS
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: 'bp-kallis.homelabshare.gr' },
    expectedTenantId: 'bp-kallis',
    targetFamily: legacyFam,
  }),
  'https://bp-kallis.homelabshare.gr',
  'valid explicit legacy domain must resolve expected origin.',
);

// 5. deep nested explicit primary domain -> FAIL
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: 'foo.bp-kallis.shiftoryx.gr' },
    expectedTenantId: 'bp-kallis',
    targetFamily: primaryFam,
  }),
  null,
  'deep nested explicit primary domain must fail closed.',
);

// 6. deep nested explicit legacy domain -> FAIL
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: 'foo.bp-kallis.homelabshare.gr' },
    expectedTenantId: 'bp-kallis',
    targetFamily: legacyFam,
  }),
  null,
  'deep nested explicit legacy domain must fail closed.',
);

// 7. reserved explicit domain -> FAIL
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: 'admin.shiftoryx.gr' },
    expectedTenantId: 'bp-kallis',
    targetFamily: primaryFam,
  }),
  null,
  'reserved explicit domain must fail closed.',
);

// 8. lookalike domain -> FAIL
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: 'evilshiftoryx.gr' },
    expectedTenantId: 'bp-kallis',
    targetFamily: primaryFam,
  }),
  null,
  'lookalike domain must fail closed.',
);

// 9. wrong-family explicit domain -> FAIL
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: 'bp-kallis.homelabshare.gr' },
    expectedTenantId: 'bp-kallis',
    targetFamily: primaryFam,
  }),
  null,
  'wrong-family explicit domain must fail closed.',
);

// 10. domain slug != expected tenant slug -> FAIL
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: 'other-tenant.shiftoryx.gr' },
    expectedTenantId: 'bp-kallis',
    targetFamily: primaryFam,
  }),
  null,
  'domain slug != expected tenant slug must fail closed.',
);

// 11. tenant.slug != expected tenant ID -> FAIL
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'bp-kallis', slug: 'other-slug', domain: 'other-slug.shiftoryx.gr' },
    expectedTenantId: 'bp-kallis',
    targetFamily: primaryFam,
  }),
  null,
  'tenant.slug != expected tenant ID must fail closed.',
);

// 12. invalid tenant slug -> FAIL
assertEqual(
  resolveValidatedTenantOrigin({
    tenant: { id: 'ab', slug: 'ab', domain: null },
    expectedTenantId: 'ab',
    targetFamily: primaryFam,
  }),
  null,
  'invalid tenant slug (< 3 chars) must fail closed.',
);

assert(isAllowedBrokerOrigin('https://gas.homelabshare.gr', ['https://gas.homelabshare.gr', 'https://shiftoryx.gr']), 'Legacy central origin must be allowlisted.');
assert(isAllowedBrokerOrigin('https://shiftoryx.gr', ['https://gas.homelabshare.gr', 'https://shiftoryx.gr']), 'Primary central origin must be allowlisted.');
assert(!isAllowedBrokerOrigin('https://evil.com', ['https://gas.homelabshare.gr', 'https://shiftoryx.gr']), 'Unknown origins must be rejected.');
assert(!isAllowedBrokerOrigin('', ['https://gas.homelabshare.gr']), 'Missing origins must be rejected.');

const ticketDoc = buildAuthTicketDocument({
  uid: 'uid-123',
  tenantId: 'bp-kallis',
  role: 'OWNER',
  returnTo: validPrimaryReturnTo.url,
  returnToHost: validPrimaryReturnTo.returnToHost,
  centralOrigin: 'https://shiftoryx.gr',
  allowedTenantOrigin: validPrimaryReturnTo.allowedTenantOrigin,
  requestId: 'request-1',
  nowMs: 1_000,
});
assertEqual(ticketDoc.status, 'PENDING', 'New ticket documents must start PENDING.');
assertEqual(ticketDoc.usedAt, null, 'New ticket documents must not be used.');
assertEqual(ticketDoc.expiresAtMs, 61_000, 'Ticket expiration must be 60 seconds after creation.');
assert(!JSON.stringify(ticketDoc).includes('customToken'), 'Ticket documents must not contain custom tokens.');
assert(!JSON.stringify(ticketDoc).includes('refreshToken'), 'Ticket documents must not contain refresh tokens.');

const redirectUrl = buildTenantTicketRedirectUrl(validPrimaryReturnTo.url, 'b'.repeat(64));
assertStartsWith(redirectUrl, 'https://bp-kallis.shiftoryx.gr/app?week=2026-06-01#authTicket=', 'Ticket must be sent in URL fragment.');
assert(!redirectUrl.includes('?authTicket='), 'Ticket must not be sent in query params.');

[
  'Auth broker emulator checks passed',
  'test-owner-uid',
  'authTickets/${ticketHash}',
  'client must not read authTickets',
  'client must not write authTickets',
  'client may read its own active tenant membership',
  'client must not read memberships from another tenant',
  'client tenant admin must not create tenantMemberships for another tenant',
  'client must not update tenantMemberships',
  'client tenant admin must not delete tenantMemberships',
  'ticket-used',
  'ticket-expired',
  'inactive-or-invalid-membership',
  'missing-membership',
  'invalid-central-origin',
  'central-return-not-allowed',
].forEach((phrase) => assert(emulatorTest.includes(phrase), `Emulator test must cover: ${phrase}`));

[
  'Firebase ID tokens',
  'refresh tokens',
  'custom tokens',
  'auth tickets',
  'VITE_ENABLE_AUTH_BROKER=false',
].forEach((phrase) => assert(runbook.includes(phrase), `Auth broker runbook must document: ${phrase}`));

console.log('Auth broker checks passed');
