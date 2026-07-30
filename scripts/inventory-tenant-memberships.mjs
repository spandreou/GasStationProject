import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPROVED_EMULATOR_PROJECT_IDS = new Set(['demo-shiftoryx-owner-inventory']);
const RECOGNIZED_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER']);
const RECOGNIZED_STATUSES = new Set(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED']);
const INACTIVE_STATUSES = new Set(['INACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED']);
const TENANT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/u;
const LOCAL_EMULATOR_HOST_PATTERN = /^(?:127\.0\.0\.1|localhost|\[::1\]):[1-9][0-9]{1,4}$/iu;

export const MEMBERSHIP_CLASSIFICATIONS = Object.freeze([
  'NO_MIGRATION_REQUIRED',
  'SAFE_CANDIDATE',
  'MANUAL_REVIEW_REQUIRED',
  'INVALID_OR_MALFORMED',
  'REVOKED_OR_INACTIVE',
  'CONFLICT_OR_DUPLICATE',
]);

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidUid(uid) {
  return uid.length > 0 && uid.length <= 128 && !/[/\u0000-\u001f\u007f]/u.test(uid);
}

function timestampMillis(value) {
  if (value === null || value === undefined || value === '') return { state: 'missing', value: null };
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    return Number.isFinite(milliseconds)
      ? { state: 'valid', value: milliseconds }
      : { state: 'invalid', value: null };
  }
  if (typeof value?.toMillis === 'function') {
    const milliseconds = value.toMillis();
    return Number.isFinite(milliseconds)
      ? { state: 'valid', value: milliseconds }
      : { state: 'invalid', value: null };
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { state: 'valid', value }
      : { state: 'invalid', value: null };
  }
  if (typeof value === 'string') {
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds)
      ? { state: 'valid', value: milliseconds }
      : { state: 'invalid', value: null };
  }
  return { state: 'invalid', value: null };
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function pairKey(uid, tenantId) {
  return JSON.stringify([uid, tenantId]);
}

function incrementCount(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

function buildConflictIndexes(records) {
  const pairCounts = Object.create(null);
  const activeTenantClaimCounts = Object.create(null);

  for (const record of records) {
    const uid = cleanString(record.data?.uid);
    const tenantId = cleanString(record.data?.tenantId);
    const role = cleanString(record.data?.role);
    const status = cleanString(record.data?.status);

    if (uid && tenantId) {
      incrementCount(pairCounts, pairKey(uid, tenantId));
    }
    if (uid && tenantId && RECOGNIZED_ROLES.has(role) && status === 'ACTIVE') {
      incrementCount(activeTenantClaimCounts, tenantId);
    }
  }

  return { pairCounts, activeTenantClaimCounts };
}

function classifyOne({
  record,
  pairCounts,
  activeTenantClaimCounts,
  userIds,
  tenantIds,
  platformAdminIds,
  approvedRoleChangeIds,
}) {
  const id = cleanString(record.id);
  const data = record.data || {};
  const uid = cleanString(data.uid);
  const tenantId = cleanString(data.tenantId);
  const role = cleanString(data.role);
  const status = cleanString(data.status);
  const reasons = [];

  if (!id) reasons.push('missing-document-id');
  if (!uid) reasons.push('missing-uid');
  else if (!isValidUid(uid)) reasons.push('invalid-uid');
  if (!tenantId) reasons.push('missing-tenant-id');
  else if (!TENANT_ID_PATTERN.test(tenantId)) reasons.push('invalid-tenant-id');
  if (!role) reasons.push('missing-role');
  else if (!RECOGNIZED_ROLES.has(role)) reasons.push('invalid-role');
  if (!status) reasons.push('missing-status');
  else if (!RECOGNIZED_STATUSES.has(status)) reasons.push('invalid-status');

  const hasFatalShapeError = reasons.length > 0;
  if (hasFatalShapeError) {
    return {
      id,
      classification: 'INVALID_OR_MALFORMED',
      reasons: uniqueSorted(reasons),
      currentRole: role || null,
      currentStatus: status || null,
      proposedRole: null,
    };
  }

  const expectedId = `${uid}_${tenantId}`;
  if (id !== expectedId) reasons.push('document-id-fields-mismatch');

  const duplicatePair = pairCounts[pairKey(uid, tenantId)] > 1;
  const competingTenantClaims = activeTenantClaimCounts[tenantId] > 1;
  if (duplicatePair) reasons.push('duplicate-uid-tenant');
  if (competingTenantClaims) reasons.push('multiple-active-tenant-ownership-claims');

  if (duplicatePair || competingTenantClaims) {
    return {
      id,
      classification: 'CONFLICT_OR_DUPLICATE',
      reasons: uniqueSorted(reasons),
      currentRole: role,
      currentStatus: status,
      proposedRole: null,
    };
  }

  if (id !== expectedId) {
    return {
      id,
      classification: 'INVALID_OR_MALFORMED',
      reasons: uniqueSorted(reasons),
      currentRole: role,
      currentStatus: status,
      proposedRole: null,
    };
  }

  const createdAt = timestampMillis(data.createdAt);
  const updatedAt = timestampMillis(data.updatedAt);
  if (createdAt.state === 'invalid' || updatedAt.state === 'invalid') {
    reasons.push('invalid-timestamp');
    return {
      id,
      classification: 'INVALID_OR_MALFORMED',
      reasons: uniqueSorted(reasons),
      currentRole: role,
      currentStatus: status,
      proposedRole: null,
    };
  }

  if (INACTIVE_STATUSES.has(status)) {
    reasons.push('inactive-status');
    return {
      id,
      classification: 'REVOKED_OR_INACTIVE',
      reasons: uniqueSorted(reasons),
      currentRole: role,
      currentStatus: status,
      proposedRole: null,
    };
  }

  if (createdAt.state === 'missing' || updatedAt.state === 'missing') {
    reasons.push('missing-timestamp-provenance');
  } else if (updatedAt.value < createdAt.value) {
    reasons.push('timestamp-order-needs-review');
  }

  if (!(userIds instanceof Set)) reasons.push('user-reference-not-checked');
  else if (!userIds.has(uid)) reasons.push('user-not-found');
  if (!(tenantIds instanceof Set)) reasons.push('tenant-reference-not-checked');
  else if (!tenantIds.has(tenantId)) reasons.push('tenant-not-found');
  if (platformAdminIds instanceof Set && platformAdminIds.has(uid)) {
    reasons.push('platform-admin-has-explicit-tenant-membership');
  }

  if (reasons.length > 0) {
    return {
      id,
      classification: 'MANUAL_REVIEW_REQUIRED',
      reasons: uniqueSorted(reasons),
      currentRole: role,
      currentStatus: status,
      proposedRole: null,
    };
  }

  if (role === 'OWNER') {
    return {
      id,
      classification: 'NO_MIGRATION_REQUIRED',
      reasons: ['active-owner-record-is-canonical'],
      currentRole: role,
      currentStatus: status,
      proposedRole: null,
    };
  }

  if (approvedRoleChangeIds instanceof Set && approvedRoleChangeIds.has(id)) {
    return {
      id,
      classification: 'SAFE_CANDIDATE',
      reasons: ['explicit-record-level-owner-approval-evidence'],
      currentRole: role,
      currentStatus: status,
      proposedRole: 'OWNER',
    };
  }

  return {
    id,
    classification: 'MANUAL_REVIEW_REQUIRED',
    reasons: [`legacy-${role.toLowerCase()}-owner-semantics-not-approved`],
    currentRole: role,
    currentStatus: status,
    proposedRole: null,
  };
}

export function classifyMembershipInventory({
  memberships = [],
  userIds,
  tenantIds,
  platformAdminIds = new Set(),
  approvedRoleChangeIds = new Set(),
} = {}) {
  if (!Array.isArray(memberships)) {
    throw new Error('Membership inventory input must be an array.');
  }

  const orderedRecords = memberships
    .map((record) => ({
      id: cleanString(record?.id),
      data: record?.data && typeof record.data === 'object' ? record.data : {},
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const { pairCounts, activeTenantClaimCounts } = buildConflictIndexes(orderedRecords);
  const records = orderedRecords.map((record) =>
    classifyOne({
      record,
      pairCounts,
      activeTenantClaimCounts,
      userIds,
      tenantIds,
      platformAdminIds,
      approvedRoleChangeIds,
    }),
  );

  const counts = Object.fromEntries(MEMBERSHIP_CLASSIFICATIONS.map((classification) => [classification, 0]));
  for (const record of records) {
    counts[record.classification] += 1;
  }

  const membershipUids = new Set(
    orderedRecords.map((record) => cleanString(record.data.uid)).filter(Boolean),
  );
  const platformIds = platformAdminIds instanceof Set ? [...platformAdminIds] : [];
  const platformAdminsWithExplicitTenantMembership = platformIds.filter((uid) => membershipUids.has(uid)).length;

  return {
    records,
    counts,
    diagnostics: {
      totalMemberships: records.length,
      userReferencesChecked: userIds instanceof Set,
      tenantReferencesChecked: tenantIds instanceof Set,
      platformAdminRecordsChecked: platformIds.length,
      platformAdminsWithoutTenantMembership:
        platformIds.length - platformAdminsWithExplicitTenantMembership,
      platformAdminsWithExplicitTenantMembership,
    },
  };
}

export function buildPhase2BPlanningSummary(inventory) {
  const counts = inventory?.counts || {};
  const eligibleCount = Number(counts.SAFE_CANDIDATE || 0);
  const manualApprovalCount =
    Number(counts.MANUAL_REVIEW_REQUIRED || 0) +
    Number(counts.CONFLICT_OR_DUPLICATE || 0);
  const total = MEMBERSHIP_CLASSIFICATIONS.reduce(
    (sum, classification) => sum + Number(counts[classification] || 0),
    0,
  );

  return {
    sourceIsReadOnlyInventory: true,
    writeOperationsExecuted: 0,
    eligibleClassification: 'SAFE_CANDIDATE',
    eligibleCount,
    manualApprovalCount,
    excludedCount: total - eligibleCount - manualApprovalCount,
  };
}

export function sanitizeInventorySummary(inventory, { source = 'unknown' } = {}) {
  const reasonCounts = Object.create(null);
  for (const record of inventory.records || []) {
    for (const reason of record.reasons || []) {
      incrementCount(reasonCounts, reason);
    }
  }

  return {
    mode: 'READ_ONLY',
    source,
    counts: inventory.counts,
    diagnostics: inventory.diagnostics,
    reasonCounts: Object.fromEntries(
      Object.entries(reasonCounts).sort(([left], [right]) => left.localeCompare(right)),
    ),
    phase2BPlan: buildPhase2BPlanningSummary(inventory),
    rawIdentifiersPrinted: false,
    productionAccessPerformed: false,
    writeOperationsExecuted: 0,
  };
}

export function assertEmulatorReadOnlyTarget({ emulatorHost, projectId }) {
  const host = cleanString(emulatorHost);
  const project = cleanString(projectId);
  if (!host) {
    throw new Error('Firestore emulator host is required for emulator inventory.');
  }
  if (!LOCAL_EMULATOR_HOST_PATTERN.test(host)) {
    throw new Error('Firestore emulator host must be an explicit local loopback address.');
  }
  if (!APPROVED_EMULATOR_PROJECT_IDS.has(project)) {
    throw new Error('Emulator project is not approved for Phase 2A inventory.');
  }
}

function builtInOfflineFixture() {
  return {
    memberships: [
      {
        id: 'synthetic-owner_synthetic-store-a',
        data: {
          uid: 'synthetic-owner',
          tenantId: 'synthetic-store-a',
          role: 'OWNER',
          status: 'ACTIVE',
          createdAt: '2026-07-28T08:00:00.000Z',
          updatedAt: '2026-07-28T09:00:00.000Z',
        },
      },
      {
        id: 'synthetic-admin_synthetic-store-b',
        data: {
          uid: 'synthetic-admin',
          tenantId: 'synthetic-store-b',
          role: 'ADMIN',
          status: 'ACTIVE',
          createdAt: '2026-07-28T08:00:00.000Z',
          updatedAt: '2026-07-28T09:00:00.000Z',
        },
      },
      {
        id: 'synthetic-revoked_synthetic-store-c',
        data: {
          uid: 'synthetic-revoked',
          tenantId: 'synthetic-store-c',
          role: 'MANAGER',
          status: 'REVOKED',
          createdAt: '2026-07-28T08:00:00.000Z',
          updatedAt: '2026-07-28T09:00:00.000Z',
        },
      },
    ],
    userIds: new Set(['synthetic-owner', 'synthetic-admin', 'synthetic-revoked']),
    tenantIds: new Set(['synthetic-store-a', 'synthetic-store-b', 'synthetic-store-c']),
    platformAdminIds: new Set(),
  };
}

async function loadReferenceIds(db, collectionName) {
  const snapshot = await db.collection(collectionName).get();
  return new Set(snapshot.docs.map((document) => document.id));
}

export async function inventoryFirestoreReadOnly(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error('Inventory options must be an object.');
  }
  if ('db' in options) {
    throw new Error('Phase 2A inventory does not accept injected Firestore clients.');
  }

  const { emulatorHost, projectId } = options;
  assertEmulatorReadOnlyTarget({ emulatorHost, projectId });
  const configuredEmulatorHost = String(process.env.FIRESTORE_EMULATOR_HOST || '');
  if (configuredEmulatorHost !== cleanString(emulatorHost)) {
    throw new Error('Checked emulator host must match FIRESTORE_EMULATOR_HOST.');
  }

  const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
  const adminApp = requireFromFunctions('firebase-admin/app');
  const adminFirestore = requireFromFunctions('firebase-admin/firestore');
  const app = adminApp.initializeApp({ projectId }, 'phase-2a-owner-inventory-read-only');
  const firestore = adminFirestore.getFirestore(app);

  try {
    const membershipSnapshot = await firestore
      .collection('tenantMemberships')
      .select('uid', 'tenantId', 'role', 'status', 'createdAt', 'updatedAt')
      .get();
    const memberships = membershipSnapshot.docs.map((document) => ({
      id: document.id,
      data: document.data(),
    }));
    const [userIds, tenantIds, platformAdminIds] = await Promise.all([
      loadReferenceIds(firestore, 'users'),
      loadReferenceIds(firestore, 'tenants'),
      loadReferenceIds(firestore, 'platformAdmins'),
    ]);

    return classifyMembershipInventory({
      memberships,
      userIds,
      tenantIds,
      platformAdminIds,
    });
  } finally {
    await adminApp.deleteApp(app);
  }
}

function printUsage() {
  console.log(`Usage:
  node scripts/inventory-tenant-memberships.mjs --read-only [options]

Options:
  --source offline-fixture   Use built-in sanitized synthetic data. Default.
  --source emulator          Read the local Firestore emulator only.
  --project-id <id>          Required for emulator source.
  --read-only                Mandatory acknowledgement; no production mode exists.
  --help                     Show this help.

The command prints aggregate counts only. It has no production connector and
does not accept credentials through command-line arguments.`);
}

function parseCliArgs(argv) {
  const parsed = {
    source: 'offline-fixture',
    projectId: '',
    readOnly: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--read-only') parsed.readOnly = true;
    else if (arg === '--source') parsed.source = cleanString(argv[++index]);
    else if (arg === '--project-id') parsed.projectId = cleanString(argv[++index]);
    else throw new Error('Unsupported inventory argument.');
  }

  return parsed;
}

async function runCli() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  if (!args.readOnly) {
    throw new Error('The explicit --read-only acknowledgement is required.');
  }

  let inventory;
  if (args.source === 'offline-fixture') {
    if (args.projectId) {
      throw new Error('Offline fixture mode does not accept a project id.');
    }
    inventory = classifyMembershipInventory(builtInOfflineFixture());
  } else if (args.source === 'emulator') {
    inventory = await inventoryFirestoreReadOnly({
      emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
      projectId: args.projectId,
    });
  } else {
    throw new Error('Inventory source must be offline-fixture or emulator.');
  }

  console.log(JSON.stringify(sanitizeInventorySummary(inventory, { source: args.source }), null, 2));
}

const currentFile = path.resolve(fileURLToPath(import.meta.url));
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectInvocation =
  process.platform === 'win32'
    ? currentFile.toLowerCase() === invokedFile.toLowerCase()
    : currentFile === invokedFile;

if (isDirectInvocation) {
  runCli().catch((error) => {
    console.error(`Phase 2A inventory invocation rejected: ${error.message}`);
    process.exitCode = 1;
  });
}
