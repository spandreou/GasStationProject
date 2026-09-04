import assert from 'node:assert/strict';
import {
  AUTH_TICKET_TTL_MS,
  buildAuthTicketDocument,
  buildTenantTicketRedirectUrl,
  hashAuthTicket,
  isAllowedBrokerOrigin,
  isAllowedTenantOrigin,
  isAllowedTenantSlug,
  resolveValidatedTenantOrigin,
  validateBrokerReturnTo,
  validateTicketFormat,
} from '../functions/src/authBrokerCore.js';

console.log('--- RUNNING EXPANDED AUTH BROKER NEGATIVE TEST MATRIX ---');

let passedTests = 0;
function pass(testName) {
  passedTests++;
}

const DOMAIN_FAMILIES = [
  { id: 'primary', baseDomain: 'shiftoryx.gr', centralDomain: 'shiftoryx.gr' },
  { id: 'legacy', baseDomain: 'homelabshare.gr', centralDomain: 'gas.homelabshare.gr' },
];

// ============================================================================
// 1. ORIGIN & PROTOCOL BOUNDARY ENFORCEMENT
// ============================================================================
console.log('1. Testing origin and protocol boundaries...');

// 1.1 Insecure HTTP origin
assert.equal(isAllowedTenantOrigin('http://shiftoryx.gr', DOMAIN_FAMILIES), false);
assert.equal(isAllowedTenantOrigin('http://bp-kallis.shiftoryx.gr', DOMAIN_FAMILIES), false);
assert.equal(isAllowedTenantOrigin('http://bp-kallis.homelabshare.gr', DOMAIN_FAMILIES), false);
assert.equal(isAllowedBrokerOrigin('http://shiftoryx.gr', ['https://shiftoryx.gr']), false);
pass('HTTP origins strictly rejected');

// 1.2 Lookalike / Phishing / Suffix injection domains
const attackerOrigins = [
  'https://attacker.example',
  'https://evilshiftoryx.gr',
  'https://shiftoryx.gr.evil.com',
  'https://bp-kallis.shiftoryx.gr.evil.example',
  'https://notshiftoryx.gr',
  'https://shiftoryx.gr.attacker.io',
  'https://homelabshare.gr.phishing.site',
];
for (const badOrigin of attackerOrigins) {
  assert.equal(isAllowedBrokerOrigin(badOrigin, ['https://shiftoryx.gr', 'https://gas.homelabshare.gr']), false, `Origin ${badOrigin} must not be allowed`);
  assert.equal(isAllowedTenantOrigin(badOrigin, DOMAIN_FAMILIES), false, `Tenant origin ${badOrigin} must not be allowed`);
}
pass('Attacker / lookalike / suffix injection origins rejected');

// 1.3 Deep nested subdomains and invalid tenant host structures
const invalidNestedOrigins = [
  'https://foo.bar.shiftoryx.gr',
  'https://a.b.c.shiftoryx.gr',
  'https://bp-kallis.extra.shiftoryx.gr',
  'https://nested.tenant.homelabshare.gr',
];
for (const nested of invalidNestedOrigins) {
  assert.equal(isAllowedTenantOrigin(nested, DOMAIN_FAMILIES), false, `Nested origin ${nested} must fail closed`);
}
pass('Deep nested subdomains fail closed');

// 1.4 Reserved subdomain origins
const reservedOrigins = [
  'https://admin.shiftoryx.gr',
  'https://api.shiftoryx.gr',
  'https://www.shiftoryx.gr',
  'https://gas.shiftoryx.gr',
  'https://admin.homelabshare.gr',
];
for (const resOrigin of reservedOrigins) {
  assert.equal(isAllowedTenantOrigin(resOrigin, DOMAIN_FAMILIES), false, `Reserved origin ${resOrigin} cannot be tenant origin`);
}
pass('Reserved subdomain origins rejected from tenant CORS');

// 1.5 Port tampering / non-standard ports in production
assert.equal(isAllowedTenantOrigin('https://bp-kallis.shiftoryx.gr:8080', DOMAIN_FAMILIES), false);
assert.equal(isAllowedTenantOrigin('https://bp-kallis.shiftoryx.gr:443', DOMAIN_FAMILIES), true); // default 443 normalized
assert.equal(isAllowedTenantOrigin('https://bp-kallis.shiftoryx.gr:8443', DOMAIN_FAMILIES), false);
pass('Non-standard ports rejected in production');

// ============================================================================
// 2. RETURNO SECURITY & OPEN REDIRECT REGRESSION TESTS
// ============================================================================
console.log('2. Testing returnTo validation and open redirect prevention...');

const maliciousReturnTos = [
  'https://attacker.example/steal',
  'https://evilshiftoryx.gr/login',
  'https://admin.shiftoryx.gr/secret',
  'https://foo.bar.shiftoryx.gr/app',
  'http://shiftoryx.gr/app',
  'http://bp-kallis.shiftoryx.gr/app',
  'https://bp-kallis.shiftoryx.gr.evil.example/app',
  'javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  '//evil.com/app',
  '/\\evil.com',
  'https://user:password@bp-kallis.shiftoryx.gr/app',
  'https://bp-kallis.shiftoryx.gr/../../../etc/passwd',
  'https://ab.shiftoryx.gr/app', // slug too short
  `https://${'a'.repeat(41)}.shiftoryx.gr/app`, // slug too long
  'https://bp_kallis.shiftoryx.gr/app', // underscore not allowed
  'https://-bp-kallis.shiftoryx.gr/app', // leading hyphen
  'https://bp-kallis-.shiftoryx.gr/app', // trailing hyphen
];

for (const badReturnTo of maliciousReturnTos) {
  const result = validateBrokerReturnTo({
    returnTo: badReturnTo,
    expectedTenantId: 'bp-kallis',
    callerOrigin: 'https://shiftoryx.gr',
    allowedTenantIds: ['bp-kallis'],
    production: true,
  });
  assert.equal(result.valid, false, `Bad returnTo must be rejected: ${badReturnTo}`);
}
pass('All malicious returnTo patterns rejected');

// 2.2 Case sensitivity and hostname normalization
const caseInsensitiveReturnTo = validateBrokerReturnTo({
  returnTo: 'https://BP-KALLIS.shiftoryx.gr/app',
  expectedTenantId: 'bp-kallis',
  callerOrigin: 'https://shiftoryx.gr',
  allowedTenantIds: ['bp-kallis'],
  production: true,
});
assert.equal(caseInsensitiveReturnTo.valid, true, 'Uppercase hostname in returnTo must normalize cleanly');
assert.equal(caseInsensitiveReturnTo.allowedTenantOrigin, 'https://bp-kallis.shiftoryx.gr');
assert.equal(caseInsensitiveReturnTo.tenantId, 'bp-kallis');
pass('Hostname case normalization verified');

// 2.3 Cross-domain-family redirect prevention
const cross1 = validateBrokerReturnTo({
  returnTo: 'https://bp-kallis.homelabshare.gr/app',
  expectedTenantId: 'bp-kallis',
  callerOrigin: 'https://shiftoryx.gr', // primary caller to legacy tenant
  production: true,
});
assert.equal(cross1.valid, false);
assert.equal(cross1.reason, 'cross-family-redirect-not-allowed');

const cross2 = validateBrokerReturnTo({
  returnTo: 'https://bp-kallis.shiftoryx.gr/app',
  expectedTenantId: 'bp-kallis',
  callerOrigin: 'https://gas.homelabshare.gr', // legacy caller to primary tenant
  production: true,
});
assert.equal(cross2.valid, false);
assert.equal(cross2.reason, 'cross-family-redirect-not-allowed');
pass('Cross-family redirects strictly prohibited');

// 2.4 Tenant ID mismatch prevention
const tenantMismatch = validateBrokerReturnTo({
  returnTo: 'https://bp-kallis.shiftoryx.gr/app',
  expectedTenantId: 'different-store', // caller requested different tenant than returnTo host
  callerOrigin: 'https://shiftoryx.gr',
  allowedTenantIds: ['bp-kallis', 'different-store'],
  production: true,
});
assert.equal(tenantMismatch.valid, false);
assert.equal(tenantMismatch.reason, 'tenant-mismatch');
pass('Tenant ID / returnTo host mismatch strictly blocked');

// ============================================================================
// 3. TICKET FORMAT, INTEGRITY, TAMPERING, EXPIRATION & REPLAY
// ============================================================================
console.log('3. Testing auth ticket format, lifecycle, and tamper resistance...');

// 3.1 Format validation
assert.equal(validateTicketFormat('').valid, false);
assert.equal(validateTicketFormat(null).valid, false);
assert.equal(validateTicketFormat(undefined).valid, false);
assert.equal(validateTicketFormat('12345').valid, false);
assert.equal(validateTicketFormat('a'.repeat(63)).valid, false);
assert.equal(validateTicketFormat('a'.repeat(65)).valid, false);
assert.equal(validateTicketFormat('g'.repeat(64)).valid, false); // non-hex
assert.equal(validateTicketFormat('a'.repeat(60) + ';;;;').valid, false);
assert.equal(validateTicketFormat('a'.repeat(64)).valid, true);
pass('Ticket format validation strictly enforces 64-char hex');

// 3.2 Ticket hashing determinism & collision resistance
const ticketA = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ticketB = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde0';
assert.equal(hashAuthTicket(ticketA).length, 64);
assert.notEqual(hashAuthTicket(ticketA), hashAuthTicket(ticketB));
assert.equal(hashAuthTicket(ticketA), hashAuthTicket(ticketA));
pass('SHA-256 ticket hashing deterministic');

// 3.3 Ticket TTL invariant
assert.equal(AUTH_TICKET_TTL_MS, 60_000, 'Ticket TTL must be exactly 60 seconds (1 minute)');
const now = Date.now();
const doc = buildAuthTicketDocument({
  uid: 'user-xyz',
  tenantId: 'bp-kallis',
  role: 'OWNER',
  returnTo: 'https://bp-kallis.shiftoryx.gr/app',
  returnToHost: 'bp-kallis.shiftoryx.gr',
  centralOrigin: 'https://shiftoryx.gr',
  allowedTenantOrigin: 'https://bp-kallis.shiftoryx.gr',
  requestId: 'req-999',
  nowMs: now,
});
assert.equal(doc.status, 'PENDING');
assert.equal(doc.expiresAtMs, now + 60_000);
assert.equal(doc.usedAt, null);
assert.equal(doc.uid, 'user-xyz');
assert.equal(doc.tenantId, 'bp-kallis');
assert.equal(doc.role, 'OWNER');
pass('Auth ticket document invariants verified');

// 3.4 Build redirect URL verification (URL fragment invariant)
const redirectUrl = buildTenantTicketRedirectUrl('https://bp-kallis.shiftoryx.gr/app?tab=shifts', ticketA);
assert.ok(redirectUrl.startsWith('https://bp-kallis.shiftoryx.gr/app?tab=shifts#authTicket='));
assert.ok(!redirectUrl.includes('?authTicket='), 'Ticket must NEVER appear in URL search parameters');
pass('Ticket redirect URL uses fragment (#) and not query parameter');

// ============================================================================
// 4. TENANT ORIGIN RESOLUTION & GATE G RECONCILIATION PROOF
// ============================================================================
console.log('4. Testing Gate G reconciliation proofs...');

const primaryFamily = DOMAIN_FAMILIES[0];
const legacyFamily = DOMAIN_FAMILIES[1];

// 4.1 Approved Phase 6 burn-in state: tenant.domain = null
const nullDomainPrimary = resolveValidatedTenantOrigin({
  tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: null },
  expectedTenantId: 'bp-kallis',
  targetFamily: primaryFamily,
});
assert.equal(nullDomainPrimary, 'https://bp-kallis.shiftoryx.gr');

const nullDomainLegacy = resolveValidatedTenantOrigin({
  tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: null },
  expectedTenantId: 'bp-kallis',
  targetFamily: legacyFamily,
});
assert.equal(nullDomainLegacy, 'https://bp-kallis.homelabshare.gr');
pass('tenant.domain = null dynamically resolves both primary and legacy families');

// 4.2 Legacy pinned domain blocking primary family (The Gate G bug)
const pinnedLegacyDomainPrimary = resolveValidatedTenantOrigin({
  tenant: { id: 'bp-kallis', slug: 'bp-kallis', domain: 'bp-kallis.homelabshare.gr' },
  expectedTenantId: 'bp-kallis',
  targetFamily: primaryFamily,
});
assert.equal(pinnedLegacyDomainPrimary, null, 'Pinned legacy domain MUST fail closed when resolving for primary family');
pass('Gate G bug confirmed: pinned legacy domain correctly blocked primary broker');

// ============================================================================
// 5. SLUG VALIDATION & RESERVED SUBDOMAIN PROTECTION
// ============================================================================
console.log('5. Testing slug validation and reserved words...');

const reservedSlugs = [
  'admin',
  'api',
  'www',
  'gas',
  'shiftoryx',
  'root',
  'portal',
  'auth',
  'dashboard',
  'login',
  'register',
  'system',
  'status',
  'billing',
  'mail',
  'stores',
  'support',
  'app',
  'firebase',
  'ops',
  'tenant',
];
for (const slug of reservedSlugs) {
  assert.equal(isAllowedTenantSlug(slug), false, `Slug "${slug}" must be reserved/rejected`);
}

const prefixSuffixSlugs = [
  'gas-station',
  'station-gas',
  'shiftoryx-tenant',
  'tenant-shiftoryx',
];
for (const slug of prefixSuffixSlugs) {
  assert.equal(isAllowedTenantSlug(slug), false, `Slug with reserved prefix/suffix "${slug}" must be rejected`);
}

assert.equal(isAllowedTenantSlug('bp-kallis'), true);
assert.equal(isAllowedTenantSlug('station-123'), true);
assert.equal(isAllowedTenantSlug('north-hub'), true);
pass('Slug whitelist/blacklist rules strictly verified');

console.log(`\n--- ALL ${passedTests} NEGATIVE MATRIX TESTS PASSED ---`);
