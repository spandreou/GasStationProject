import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stripComments(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function matchBlock(collectionName) {
  const marker = `match /${collectionName}/`;
  const start = firestoreRules.indexOf(marker);
  if (start === -1) return '';
  const next = firestoreRules.indexOf('\n    match /', start + marker.length);
  return firestoreRules.slice(start, next === -1 ? undefined : next);
}

const schedulerService = read('src/firebase/schedulerService.js');
const firestoreCore = read('src/firebase/firestoreCore.js');
const shiftService = read('src/firebase/shiftService.js');
const auditLogService = read('src/firebase/auditLogService.js');
const schedulerStore = read('src/hooks/useSchedulerStore.js');
const absenceService = read('src/firebase/absenceService.js');
const absencesRepository = read('src/repositories/firebase/firebaseAbsencesRepository.js');
const absencesPanel = read('src/components/scheduler/AbsencesPanel.jsx');
const firestoreRules = read('firestore.rules');
const firestoreRulesWithoutComments = stripComments(firestoreRules);
const readme = read('README.md');
const security = read('SECURITY.md');
const absenceFlowSource = [absenceService, absencesRepository, schedulerStore, absencesPanel].join('\n');

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

assert(!/\bisStaff\s*\(/.test(firestoreRulesWithoutComments), 'Firestore rules must not define staff authentication assumptions.');
assert(!/\bstaff\b/i.test(firestoreRulesWithoutComments), 'Firestore rules must not contain staff role assumptions.');
assert(!absenceFlowSource.includes('isStaff'), 'Absence flow must not use staff authentication helpers.');
assert(!/allow\s+(create|update|delete|write)[^;]*:\s*if\s+isSignedIn\s*\(\s*\)\s*;/.test(firestoreRulesWithoutComments), 'Sensitive writes must not be allowed for generic signed-in users.');
assert(!/allow\s+read\s*,\s*write\s*:\s*if\s+true\s*;/.test(firestoreRulesWithoutComments), 'Rules must not allow public read/write.');
assert(!/allow\s+(create|update|delete|write)[^;]*:\s*if\s+true\s*;/.test(firestoreRulesWithoutComments), 'Rules must not allow public writes.');

assert(firestoreRules.includes('match /audit_logs/{auditLogId}'), 'Firestore rules must define audit_logs rules.');
assert(matchBlock('audit_logs').includes('allow read: if isAdmin();'), 'Audit logs must be readable only by admins.');
assert(matchBlock('audit_logs').includes('allow create: if isAdmin() && validAuditLog();'), 'Audit logs must be creatable only by admins.');
assert(matchBlock('audit_logs').includes('allow update, delete: if false;'), 'Audit logs must be immutable from the client.');
assert(firestoreRules.includes('generationRunId'), 'Firestore rules must allow generationRunId on generated shifts/audit logs.');
assert(matchBlock('attendance_history').includes('allow read: if isAdmin();'), 'Attendance history must be readable only by admins.');
assert(matchBlock('week_history').includes('allow read: if isAdmin();'), 'Week history must be readable only by admins.');
assert(
  matchBlock('employees').includes('allow read: if isAdmin();') &&
    matchBlock('employees').includes('allow update: if isAdmin()'),
  'Full employee documents and scheduling role fields must be admin-only.',
);
assert(
  matchBlock('employeeAbsences').includes('allow read: if isAdmin();') &&
    matchBlock('employeeAbsences').includes('allow create: if isAdmin() && validAbsence();') &&
    matchBlock('employeeAbsences').includes('allow update: if isAdmin()') &&
    matchBlock('employeeAbsences').includes('allow delete: if isAdmin();'),
  'Private employeeAbsences must be admin-only read/write.',
);
assert(
  matchBlock('employeeAbsencesPublic').includes('allow read: if true;') &&
    matchBlock('employeeAbsencesPublic').includes('allow create: if isAdmin() && validPublicAbsence();') &&
    matchBlock('employeeAbsencesPublic').includes('allow update: if isAdmin() && validPublicAbsencePatch();') &&
    matchBlock('employeeAbsencesPublic').includes('allow delete: if isAdmin();'),
  'employeeAbsencesPublic must be public read-only and admin writable.',
);
assert(
  firestoreRules.includes("function publicAbsenceFields()") &&
    firestoreRules.includes("'id', 'employeeName', 'typeLabel', 'startDate', 'endDate', 'totalDays', 'status'"),
  'Public absence docs must allow only sanitized fields.',
);
assert(
  !matchBlock('employeeAbsencesPublic').includes('replacementMode') &&
    !matchBlock('employeeAbsencesPublic').includes('manualReplacementEmployeeId') &&
    !matchBlock('employeeAbsencesPublic').includes('note') &&
    !matchBlock('employeeAbsencesPublic').includes('createdBy') &&
    !matchBlock('employeeAbsencesPublic').includes('updatedBy'),
  'Public absence docs must not expose replacement settings, notes, or audit metadata.',
);
assert(absenceService.includes('EMPLOYEE_ABSENCES_PUBLIC_COLLECTION'), 'Absence service must maintain sanitized public absence docs.');
assert(schedulerStore.includes('startAbsencesSubscription'), 'Scheduler store must switch between public and private absence subscriptions.');
assert(schedulerStore.includes('subscribePublicEmployeeAbsences'), 'Public users must read sanitized public absences.');
assert(schedulerStore.includes('adminOnly: true'), 'Admin users must read private absence data for generator/admin flows.');
assert(absencesPanel.includes('isAdmin && absence.note'), 'Public absence cards must not render private notes.');

assert(readme.includes('generationRunId'), 'README must document generationRunId.');
assert(readme.includes('Service Layer Architecture'), 'README must document the Firebase service layer architecture.');
assert(security.includes('audit log'), 'SECURITY.md must document audit log behavior.');
assert(security.includes('Only the station admin signs in'), 'SECURITY.md must document the admin-only sign-in model.');
assert(security.includes('employeeAbsencesPublic'), 'SECURITY.md must document sanitized public absence docs.');

console.log('Firestore integrity checks passed');
