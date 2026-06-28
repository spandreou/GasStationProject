import { existsSync, readFileSync } from 'node:fs';
import {
  AUTH_TICKET_TTL_MS,
  buildAuthTicketDocument,
  buildTenantTicketRedirectUrl,
  hashAuthTicket,
  isAllowedBrokerOrigin,
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

const validReturnTo = validateBrokerReturnTo({
  returnTo: 'https://bp-kallis.homelabshare.gr/app?week=2026-06-01',
  expectedTenantId: 'bp-kallis',
  baseDomain: 'homelabshare.gr',
  centralDomain: 'gas.homelabshare.gr',
  allowedTenantIds: ['bp-kallis'],
  production: true,
});
assert(validReturnTo.valid, 'Valid BP Kallis tenant returnTo must pass.');
assertEqual(validReturnTo.tenantId, 'bp-kallis', 'returnTo must resolve bp-kallis tenant.');
assertEqual(validReturnTo.allowedTenantOrigin, 'https://bp-kallis.homelabshare.gr', 'Tenant origin must be normalized.');

[
  'https://evil.com/app',
  'javascript:alert(1)',
  'data:text/html,hi',
  'https://user:pass@bp-kallis.homelabshare.gr/app',
  'https://gas.homelabshare.gr/login',
  'https://unknown.homelabshare.gr/app',
  'https://bp-kallis.homelabshare.gr/../../admin',
].forEach((returnTo) => {
  assert(
    !validateBrokerReturnTo({
      returnTo,
      expectedTenantId: 'bp-kallis',
      baseDomain: 'homelabshare.gr',
      centralDomain: 'gas.homelabshare.gr',
      allowedTenantIds: ['bp-kallis'],
      production: true,
    }).valid,
    `Unsafe returnTo must be rejected: ${returnTo}`,
  );
});

assert(isAllowedBrokerOrigin('https://gas.homelabshare.gr', ['https://gas.homelabshare.gr']), 'Central origin must be allowlisted.');
assert(!isAllowedBrokerOrigin('https://evil.com', ['https://gas.homelabshare.gr']), 'Unknown origins must be rejected.');
assert(!isAllowedBrokerOrigin('', ['https://gas.homelabshare.gr']), 'Missing origins must be rejected.');

const ticketDoc = buildAuthTicketDocument({
  uid: 'uid-123',
  tenantId: 'bp-kallis',
  role: 'OWNER',
  returnTo: validReturnTo.url,
  returnToHost: validReturnTo.returnToHost,
  centralOrigin: 'https://gas.homelabshare.gr',
  allowedTenantOrigin: validReturnTo.allowedTenantOrigin,
  requestId: 'request-1',
  nowMs: 1_000,
});
assertEqual(ticketDoc.status, 'PENDING', 'New ticket documents must start PENDING.');
assertEqual(ticketDoc.usedAt, null, 'New ticket documents must not be used.');
assertEqual(ticketDoc.expiresAtMs, 61_000, 'Ticket expiration must be 60 seconds after creation.');
assert(!JSON.stringify(ticketDoc).includes('customToken'), 'Ticket documents must not contain custom tokens.');
assert(!JSON.stringify(ticketDoc).includes('refreshToken'), 'Ticket documents must not contain refresh tokens.');

const redirectUrl = buildTenantTicketRedirectUrl(validReturnTo.url, 'b'.repeat(64));
assertStartsWith(redirectUrl, 'https://bp-kallis.homelabshare.gr/app?week=2026-06-01#authTicket=', 'Ticket must be sent in URL fragment.');
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
