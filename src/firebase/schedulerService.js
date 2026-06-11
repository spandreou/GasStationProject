// Deprecated compatibility barrel.
// New code should import from the domain-specific Firebase services instead:
// employeeService, shiftService, settingsService, announcementService,
// weekService, and auditLogService.

export { isUsingLocalFallback } from './firestoreCore.js';
export * from './employeeService.js';
export * from './shiftService.js';
export * from './settingsService.js';
export * from './announcementService.js';
export * from './weekService.js';
export * from './auditLogService.js';
export * from './absenceService.js';
