import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const schedulerStore = read('src/hooks/useSchedulerStore.js');
const mainDashboard = read('src/components/scheduler/MainDashboard.jsx');
const tenantDataPaths = read('src/utils/tenantDataPaths.js');
const firestoreCore = read('src/firebase/firestoreCore.js');
const employeeService = read('src/firebase/employeeService.js');
const shiftService = read('src/firebase/shiftService.js');
const absenceService = read('src/firebase/absenceService.js');
const weekService = read('src/firebase/weekService.js');
const settingsService = read('src/firebase/settingsService.js');
const announcementService = read('src/firebase/announcementService.js');
const auditLogService = read('src/firebase/auditLogService.js');
const publishedScheduleService = read('src/firebase/publishedScheduleService.js');

assert(!schedulerStore.includes('../firebase/'), 'useSchedulerStore.js must not import Firebase services directly.');
assert(!schedulerStore.includes('firebase/firestore'), 'useSchedulerStore.js must not import firebase/firestore.');
assert(!schedulerStore.includes('firebase/auth'), 'useSchedulerStore.js must not import firebase/auth.');
assert(schedulerStore.includes("from '../repositories'"), 'useSchedulerStore.js must import neutral repositories.');

assert(!mainDashboard.includes('../../firebase/config'), 'MainDashboard.jsx must not import Firebase config directly.');
assert(!mainDashboard.includes('../firebase/config'), 'MainDashboard.jsx must not import Firebase config directly.');
assert(!mainDashboard.includes('firebase/config'), 'MainDashboard.jsx must not import Firebase config directly.');
assert(mainDashboard.includes("from '../../repositories'"), 'MainDashboard.jsx must import runtime config through repositories.');

[
  "employees: 'employees'",
  "shifts: 'shifts'",
  "shiftTemplates: 'shiftTemplates'",
  "absences: 'absences'",
  "attendanceHistory: 'attendanceHistory'",
  "weekLocks: 'weekLocks'",
  "weekHistory: 'weekHistory'",
  "weekTemplates: 'weekTemplates'",
  "settings: 'settings'",
  "announcements: 'announcements'",
  "auditLogs: 'auditLogs'",
  "publicSchedules: 'publicSchedules'",
  "publicMonths: 'publicMonths'",
  "publicEmployees: 'publicEmployees'",
  "publicAnnouncements: 'publicAnnouncements'",
].forEach((needle) => {
  assert(tenantDataPaths.includes(needle), `Tenant data paths must include ${needle}.`);
});

assert(firestoreCore.includes('export function tenantCollection'), 'Firestore core must expose tenantCollection.');
assert(firestoreCore.includes('export function tenantDoc'), 'Firestore core must expose tenantDoc.');
assert(firestoreCore.includes('getTenantScopedCollectionPath'), 'tenantCollection must use tenant-scoped path helper.');
assert(firestoreCore.includes('getTenantScopedDocumentPath'), 'tenantDoc must use tenant-scoped path helper.');

[
  ['employeeService.js', employeeService, ['TENANT_SCOPED_COLLECTIONS.employees']],
  ['shiftService.js', shiftService, ['TENANT_SCOPED_COLLECTIONS.shifts', 'TENANT_SCOPED_COLLECTIONS.shiftTemplates']],
  ['absenceService.js', absenceService, ['TENANT_SCOPED_COLLECTIONS.absences']],
  ['weekService.js', weekService, [
    'TENANT_SCOPED_COLLECTIONS.attendanceHistory',
    'TENANT_SCOPED_COLLECTIONS.weekLocks',
    'TENANT_SCOPED_COLLECTIONS.weekHistory',
    'TENANT_SCOPED_COLLECTIONS.weekTemplates',
  ]],
  ['settingsService.js', settingsService, ['TENANT_SCOPED_COLLECTIONS.settings']],
  ['announcementService.js', announcementService, ['TENANT_SCOPED_COLLECTIONS.announcements']],
  ['auditLogService.js', auditLogService, ['TENANT_SCOPED_COLLECTIONS.auditLogs']],
  ['publishedScheduleService.js', publishedScheduleService, [
    'TENANT_SCOPED_COLLECTIONS.publicSchedules',
    'TENANT_SCOPED_COLLECTIONS.publicMonths',
    'TENANT_SCOPED_COLLECTIONS.publicEmployees',
    'TENANT_SCOPED_COLLECTIONS.publicAnnouncements',
  ]],
].forEach(([fileName, source, requiredPaths]) => {
  assert(source.includes('tenantCollection') || source.includes('tenantDoc'), `${fileName} must use tenant-scoped Firestore helpers.`);
  requiredPaths.forEach((needle) => assert(source.includes(needle), `${fileName} must use ${needle}.`));
});

[
  [employeeService, 'collection(db, EMPLOYEES_COLLECTION'],
  [shiftService, 'collection(db, SHIFTS_COLLECTION'],
  [shiftService, 'collection(db, SHIFT_TEMPLATES_COLLECTION'],
  [absenceService, 'EMPLOYEE_ABSENCES_PUBLIC_COLLECTION'],
  [absenceService, 'collection(db, EMPLOYEE_ABSENCES_COLLECTION'],
  [weekService, 'collection(db, ATTENDANCE_HISTORY_COLLECTION'],
  [weekService, 'collection(db, WEEK_HISTORY_COLLECTION'],
  [weekService, 'collection(db, WEEK_TEMPLATES_COLLECTION'],
  [settingsService, 'SCHEDULER_SETTINGS_COLLECTION'],
  [announcementService, 'collection(db, ANNOUNCEMENTS_COLLECTION'],
  [auditLogService, 'AUDIT_LOGS_COLLECTION'],
  [publishedScheduleService, 'PUBLISHED_SCHEDULES_COLLECTION'],
].forEach(([source, forbidden]) => {
  assert(!source.includes(forbidden), `Runtime services must not use legacy global Firestore path: ${forbidden}`);
});

assert(schedulerStore.includes('function getTenantArgs()'), 'Scheduler store must centralize tenantId propagation.');
assert(!schedulerStore.includes("|| 'bp-kallis'"), 'Scheduler store must not silently fallback to bp-kallis.');
assert(schedulerStore.includes('tenantId: getPublicTenantId()'), 'Scheduler store writes must pass tenantId explicitly.');
assert(schedulerStore.includes('getTenantArgs()'), 'Scheduler store repository reads must pass tenant args.');
assert(!publishedScheduleService.includes('readLegacy'), 'Published schedule service must not keep legacy fallback reader.');
assert(!publishedScheduleService.includes('published_schedules'), 'Published schedule service must not read global published_schedules.');

console.log('Repository boundary checks passed');
