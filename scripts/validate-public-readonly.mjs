import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function matchNestedTenantBlock(source, collectionName) {
  const marker = `match /${collectionName}/`;
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const next = source.indexOf('\n      match /', start + marker.length);
  const tenantEnd = source.indexOf('\n    }\n\n    match /{document=**}', start + marker.length);
  const end = next === -1 ? tenantEnd : Math.min(next, tenantEnd === -1 ? next : tenantEnd);
  return source.slice(start, end === -1 ? undefined : end);
}

function matchIndentedBlockByMarker(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const lineStart = source.lastIndexOf('\n', start) + 1;
  const indent = source.slice(lineStart, start);
  const nextPattern = new RegExp(`\\n${indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}match\\s+/`, 'g');
  nextPattern.lastIndex = start + marker.length;
  const next = nextPattern.exec(source);
  return source.slice(start, next ? next.index : undefined);
}

const mainDashboard = read('src/components/scheduler/MainDashboard.jsx');
const weekToolbar = read('src/components/scheduler/WeekToolbar.jsx');
const schedulerStore = read('src/hooks/useSchedulerStore.js');
const publicService = read('src/firebase/publishedScheduleService.js');
const employeeSidebar = read('src/components/scheduler/EmployeeSidebar.jsx');
const announcementBoard = read('src/components/scheduler/AnnouncementBoard.jsx');
const firestoreRules = read('firestore.rules');

[
  'Οριστικοποίηση Εβδομάδας',
  'Οριστικοποιημένη',
  'Finalize / Share',
  'handleFinalizeFromToolbar',
  'finalizeCurrentWeek',
  'actionKey: \'finalizeWeek\'',
].forEach((needle) => {
  assert(!`${mainDashboard}\n${weekToolbar}`.includes(needle), `Finalize UI/action text must not remain: ${needle}`);
});

assert(
  publicService.includes("'tenants'") &&
    publicService.includes('PUBLIC_SCHEDULES_COLLECTION') &&
    publicService.includes('PUBLIC_MONTHS_COLLECTION') &&
    publicService.includes('PUBLIC_EMPLOYEES_COLLECTION') &&
    publicService.includes('PUBLIC_ANNOUNCEMENTS_COLLECTION'),
  'Public service must use tenant-scoped sanitized public collections.',
);

[
  'afm',
  'phone',
  'email',
  'notes',
  'authorEmail',
  'storagePath',
  'downloadUrl',
  'signedUrl',
  'publicUrl',
].forEach((forbidden) => {
  const sanitizeFunctions = publicService.match(/function sanitize[\s\S]+?export function subscribePublishedSchedule/)?.[0] || '';
  assert(!new RegExp(`\\b${forbidden}\\b`, 'i').test(sanitizeFunctions), `Public sanitized payload must not include ${forbidden}.`);
});

assert(employeeSidebar.includes('{isAdmin ? (') && employeeSidebar.includes('<Pencil size={15} />'), 'Employee edit controls must remain inside an admin-only branch.');
assert(!employeeSidebar.includes('Είσοδος Διαχειριστή'), 'Public employee sidebar must not render disabled login/admin controls.');
assert(!announcementBoard.includes('title="Read-only"'), 'Public announcements must not show read-only admin banner.');
assert(announcementBoard.includes('isAdmin && announcement.authorEmail'), 'Announcement author email must be admin-only.');

[
  'publicEmployees',
  'publicSchedules',
  'publicMonths',
  'publicAnnouncements',
].forEach((collectionName) => {
  const block = matchNestedTenantBlock(firestoreRules, collectionName);
  assert(block.includes('allow read: if true;'), `${collectionName} must be public readable.`);
  assert(block.includes('allow create, update: if isTenantAdmin(tenantId)'), `${collectionName} writes must be tenant-admin-only.`);
  assert(block.includes('allow delete: if isTenantAdmin(tenantId);'), `${collectionName} deletes must be tenant-admin-only.`);
});

[
  'match /employees/{employeeId}',
  'match /shifts/{shiftId}',
  'match /auditLogs/{auditLogId}',
].forEach((marker) => {
  const block = matchIndentedBlockByMarker(firestoreRules, marker);
  assert(!block.includes('allow read: if true;'), `Raw tenant/admin collection must not be public readable: ${marker}`);
});

assert(mainDashboard.includes('displayAnnouncements'), 'Public dashboard must render sanitized public announcements.');
assert(mainDashboard.includes('publicEmployees?.length ? publicEmployees'), 'Public dashboard must prefer sanitized public employees.');
assert(schedulerStore.includes('refreshPublicWeekSnapshot'), 'Admin schedule writes must refresh public week snapshots.');
assert(schedulerStore.includes('refreshPublicMonthSnapshot'), 'Admin monthly generation must refresh public month snapshots.');
assert(schedulerStore.includes('refreshPublicEmployeesSnapshot'), 'Employee writes must refresh public employee snapshots.');
assert(
  !/refreshPublicWeekSnapshot\(\{\s*weekStart,\s*shifts:\s*monthShifts/.test(schedulerStore),
  'Monthly public refresh must not overwrite boundary week snapshots with month-only shifts.',
);

console.log('Public read-only tenant checks passed');
