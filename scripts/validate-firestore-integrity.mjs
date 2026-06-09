import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const schedulerService = read('src/firebase/schedulerService.js');
const schedulerStore = read('src/hooks/useSchedulerStore.js');
const firestoreRules = read('firestore.rules');
const readme = read('README.md');
const security = read('SECURITY.md');

assert(schedulerService.includes('writeBatch'), 'Firestore service must use writeBatch for multi-write operations.');
assert(schedulerService.includes('commitBatchChunks'), 'Firestore service must use chunked batch commits for large writes.');
assert(schedulerService.includes('replaceShiftsBatch'), 'Firestore service must expose atomic shift replacement for generation/template flows.');
assert(!schedulerService.includes('await Promise.all(\n    shifts.map'), 'createManyShifts must not use Promise.all addDoc multi-writes.');
assert(!schedulerService.includes('await Promise.all(\n    existing.map'), 'removeWeekShifts must not use Promise.all deleteDoc multi-writes.');

assert(schedulerService.includes('AUDIT_LOGS_COLLECTION'), 'Firestore service must define audit log collection.');
assert(schedulerService.includes('writeAuditLog'), 'Firestore service must expose audit log writer.');
assert(schedulerStore.includes('generationRunId'), 'Scheduler store must attach generationRunId to generated shifts.');
assert(schedulerStore.includes('replaceShiftsBatch'), 'Scheduler store generation/template flows must use batch shift replacement.');
assert(schedulerStore.includes('writeAuditLog'), 'Scheduler store must write audit logs for admin actions.');

assert(firestoreRules.includes('match /audit_logs/{auditLogId}'), 'Firestore rules must define audit_logs rules.');
assert(firestoreRules.includes('allow read: if isAdmin()'), 'Audit logs must be readable only by admins.');
assert(firestoreRules.includes('allow create: if isAdmin() && validAuditLog()'), 'Audit logs must be creatable only by admins.');
assert(firestoreRules.includes('allow update, delete: if false'), 'Audit logs must be immutable from the client.');
assert(firestoreRules.includes('generationRunId'), 'Firestore rules must allow generationRunId on generated shifts/audit logs.');

assert(readme.includes('generationRunId'), 'README must document generationRunId.');
assert(security.includes('audit log'), 'SECURITY.md must document audit log behavior.');

console.log('Firestore integrity checks passed');
