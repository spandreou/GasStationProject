import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const schedulerService = read('src/firebase/schedulerService.js');
const firestoreCore = read('src/firebase/firestoreCore.js');
const shiftService = read('src/firebase/shiftService.js');
const auditLogService = read('src/firebase/auditLogService.js');
const schedulerStore = read('src/hooks/useSchedulerStore.js');
const firestoreRules = read('firestore.rules');
const readme = read('README.md');
const security = read('SECURITY.md');

assert(firestoreCore.includes('writeBatch'), 'Firestore core must use writeBatch for multi-write operations.');
assert(firestoreCore.includes('commitBatchChunks'), 'Firestore core must expose chunked batch commits for large writes.');
assert(shiftService.includes('replaceShiftsBatch'), 'Shift service must expose atomic shift replacement for generation/template flows.');
assert(!shiftService.includes('await Promise.all(\n    shifts.map'), 'createManyShifts must not use Promise.all addDoc multi-writes.');
assert(!shiftService.includes('await Promise.all(\n    existing.map'), 'removeWeekShifts must not use Promise.all deleteDoc multi-writes.');

assert(auditLogService.includes('AUDIT_LOGS_COLLECTION'), 'Audit log service must define audit log collection.');
assert(auditLogService.includes('writeAuditLog'), 'Audit log service must expose audit log writer.');
assert(schedulerStore.includes('generationRunId'), 'Scheduler store must attach generationRunId to generated shifts.');
assert(schedulerStore.includes('replaceShiftsBatch'), 'Scheduler store generation/template flows must use batch shift replacement.');
assert(schedulerStore.includes('writeAuditLog'), 'Scheduler store must write audit logs for admin actions.');
assert(!schedulerStore.includes('../firebase/schedulerService'), 'Scheduler store must import domain Firebase services instead of the deprecated schedulerService wrapper.');
assert(schedulerService.includes('Deprecated compatibility barrel'), 'Legacy schedulerService must be documented as a deprecated compatibility wrapper.');
assert(!schedulerService.includes('firebase/firestore'), 'Deprecated schedulerService wrapper must not contain direct Firestore implementation.');

assert(firestoreRules.includes('match /audit_logs/{auditLogId}'), 'Firestore rules must define audit_logs rules.');
assert(firestoreRules.includes('allow read: if isAdmin()'), 'Audit logs must be readable only by admins.');
assert(firestoreRules.includes('allow create: if isAdmin() && validAuditLog()'), 'Audit logs must be creatable only by admins.');
assert(firestoreRules.includes('allow update, delete: if false'), 'Audit logs must be immutable from the client.');
assert(firestoreRules.includes('generationRunId'), 'Firestore rules must allow generationRunId on generated shifts/audit logs.');

assert(readme.includes('generationRunId'), 'README must document generationRunId.');
assert(readme.includes('Service Layer Architecture'), 'README must document the Firebase service layer architecture.');
assert(security.includes('audit log'), 'SECURITY.md must document audit log behavior.');

console.log('Firestore integrity checks passed');
