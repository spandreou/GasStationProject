export const ROOT_COLLECTIONS = Object.freeze({
  users: 'users',
  tenants: 'tenants',
  tenantMemberships: 'tenantMemberships',
});

export const TENANT_SCOPED_COLLECTIONS = Object.freeze({
  employees: 'employees',
  shifts: 'shifts',
  shiftTemplates: 'shiftTemplates',
  absences: 'absences',
  attendanceHistory: 'attendanceHistory',
  weekLocks: 'weekLocks',
  weekHistory: 'weekHistory',
  weekTemplates: 'weekTemplates',
  settings: 'settings',
  announcements: 'announcements',
  subscription: 'subscription',
  tokenRequests: 'tokenRequests',
  auditLogs: 'auditLogs',
  publicSchedules: 'publicSchedules',
  publicMonths: 'publicMonths',
  publicEmployees: 'publicEmployees',
  publicAnnouncements: 'publicAnnouncements',
});

const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

function normalizeId(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

export function normalizeTenantId(tenantId) {
  const normalized = normalizeId(tenantId, 'tenantId');
  if (!TENANT_ID_PATTERN.test(normalized)) {
    throw new Error('tenantId must be lowercase letters, numbers, and hyphens.');
  }
  return normalized;
}

export function getTenantPath(tenantId) {
  return `${ROOT_COLLECTIONS.tenants}/${normalizeTenantId(tenantId)}`;
}

export function getUserPath(uid) {
  return `${ROOT_COLLECTIONS.users}/${normalizeId(uid, 'uid')}`;
}

export function getTenantMembershipPath(uid, tenantId) {
  return `${ROOT_COLLECTIONS.tenantMemberships}/${normalizeId(uid, 'uid')}_${normalizeTenantId(tenantId)}`;
}

export function getTenantScopedCollectionPath(tenantId, collectionName) {
  const safeCollectionName = normalizeId(collectionName, 'collectionName');
  if (!Object.values(TENANT_SCOPED_COLLECTIONS).includes(safeCollectionName)) {
    throw new Error(`Unsupported tenant-scoped collection: ${safeCollectionName}`);
  }

  return `${getTenantPath(tenantId)}/${safeCollectionName}`;
}

export function getTenantScopedDocumentPath(tenantId, collectionName, documentId) {
  return `${getTenantScopedCollectionPath(tenantId, collectionName)}/${normalizeId(documentId, 'documentId')}`;
}
