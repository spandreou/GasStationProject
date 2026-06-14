import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function matchBlock(source, collectionName) {
  const marker = `match /${collectionName}/`;
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const next = source.indexOf('\n    match /', start + marker.length);
  return source.slice(start, next === -1 ? undefined : next);
}

const mainDashboard = read('src/components/scheduler/MainDashboard.jsx');
const weekToolbar = read('src/components/scheduler/WeekToolbar.jsx');
const exportService = read('src/utils/exportService.js');
const exportUtils = read('src/utils/exportUtils.js');
const exportAuditService = read('src/firebase/exportAuditService.js');
const repositories = read('src/repositories/index.js');
const firestoreRules = read('firestore.rules');

assert(repositories.includes('exportAuditRepository'), 'Repository exports must include exportAuditRepository.');
assert(exportAuditService.includes("action: 'EXPORT'"), 'Export audit service must write EXPORT action logs.');
assert(exportAuditService.includes("status: safeStatus"), 'Export audit logs must include safe status metadata.');
assert(exportAuditService.includes('throw new Error(\'Η εξαγωγή δεν ολοκληρώθηκε. Δοκίμασε ξανά.\')'), 'Export audit failures must surface a generic safe error.');
assert(!/downloadUrl|token|password|secret|fileContent|blob|base64/i.test(exportAuditService), 'Export audit service must not store secrets, download URLs, file contents, blobs, or base64 data.');

assert(mainDashboard.includes('runAdminExportWithAudit'), 'MainDashboard must route exports through the shared admin audit guard.');
assert(mainDashboard.includes('exportAuditRepository'), 'MainDashboard must use exportAuditRepository.');
assert(mainDashboard.includes('exportAuthorization'), 'Export calls must pass an explicit export authorization object.');
assert(mainDashboard.includes('onBeforeDownload: async () =>'), 'Export calls must audit before the browser download starts.');
assert(mainDashboard.includes('adminUser?.uid'), 'Export authorization must be based on the existing admin user state.');
assert(!mainDashboard.includes('VITE_ADMIN_EMAIL') && !mainDashboard.includes('adminEmail ==='), 'Exports must not use email-based admin checks.');

assert(weekToolbar.includes('{isAdmin ? (') && weekToolbar.includes('<ExportDropdown'), 'Export dropdown must only render for admins.');
assert(weekToolbar.includes('Read-only preview'), 'Non-admin toolbar must remain read-only.');

assert(exportService.includes('assertExportAuthorized'), 'Active exportService exports must require explicit authorization.');
assert(exportUtils.includes('assertExportAuthorized'), 'Legacy exportUtils exports must require explicit authorization.');
assert(exportService.includes("typeof onBeforeDownload !== 'function'"), 'Active exportService must require an audit callback.');
assert(exportUtils.includes("typeof onBeforeDownload !== 'function'"), 'Legacy exportUtils must require an audit callback.');

const auditBlock = matchBlock(firestoreRules, 'audit_logs');
assert(auditBlock.includes('allow read: if isAdmin();'), 'Audit logs must be readable only by admins.');
assert(auditBlock.includes('allow create: if isAdmin() && validAuditLog();'), 'Audit logs must be creatable only by admins.');
assert(auditBlock.includes('allow update, delete: if false;'), 'Audit logs must be immutable from clients.');

console.log('Export audit security checks passed');
