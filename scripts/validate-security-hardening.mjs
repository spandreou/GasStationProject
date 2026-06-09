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
const firestoreRules = read('firestore.rules');
const vercelConfig = JSON.parse(read('vercel.json'));
const readme = read('README.md');

const combinedClientAuth = `${firebaseConfig}\n${authService}\n${adminLoginModal}\n${readme}`;

assert(!combinedClientAuth.includes('VITE_ADMIN_PASSWORD'), 'Client/admin docs must not reference VITE_ADMIN_PASSWORD.');
assert(!combinedClientAuth.includes('admin123'), 'Client/admin docs must not expose demo admin password fallback.');
assert(!combinedClientAuth.includes('admin@example.com'), 'Client/admin docs must not expose demo admin email fallback.');
assert(!authService.includes('adminPassword'), 'Auth service must not import or compare a client-side admin password.');
assert(authService.includes('getIdTokenResult'), 'Auth service must verify production admin using Firebase custom claims.');

assert(!firestoreRules.includes('admin@example.com'), 'Firestore rules must not hardcode demo admin emails.');
assert(!firestoreRules.includes('allow read: if true'), 'Firestore rules must not expose public reads.');
assert(firestoreRules.includes('request.auth.token.admin == true'), 'Firestore rules must authorize admin writes by custom claim.');
assert(firestoreRules.includes('allow read: if isSignedIn()'), 'Protected Firestore reads must require authentication.');
assert(firestoreRules.includes('affectedKeys().hasOnly'), 'Firestore rules must restrict unexpected fields.');

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
