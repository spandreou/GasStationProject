import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MEMBERSHIP_CLASSIFICATIONS,
  cleanString,
  classifyMembershipInventory,
  sanitizeInventorySummary,
} from './lib/tenant-membership-inventory-core.mjs';

/**
 * EXACT PRODUCTION PROJECT LOCK
 *
 * This constant requires explicit human confirmation and code commit before any real
 * production read execution can proceed. Leaving this empty or unconfigured ensures
 * that all execution attempts fail closed before Firebase Admin SDK initialization.
 */
export const CONFIRMED_PRODUCTION_PROJECT_ID = '';

const REVIEWER_LABEL_MAX_LENGTH = 64;
const RETENTION_HOURS_DEFAULT = 168;
const RETENTION_HOURS_MIN = 1;
const RETENTION_HOURS_MAX = 720;
const MAX_MEMBERSHIPS_DEFAULT = 100;
const MAX_MEMBERSHIPS_MIN = 1;
export const MAX_MEMBERSHIPS_HARD_LIMIT = 1000;

function pathComparisonKey(value) {
  const normalized = path.normalize(path.resolve(value));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function pathIsWithin(rootPath, targetPath) {
  const rootKey = pathComparisonKey(rootPath);
  const targetKey = pathComparisonKey(targetPath);
  const relative = path.relative(rootKey, targetKey);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function repositoryRootRealPath() {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url));
  return fs.realpathSync(repoRoot);
}

function assertNoRedirectedPathComponents(absolutePath) {
  const resolved = path.resolve(absolutePath);
  const parsed = path.parse(resolved);
  const components = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const component of components) {
    current = path.join(current, component);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error('Output directory path must not use a symbolic link, junction or reparse-point redirect.');
    }
  }
}

export function resolveCanonicalOutputDirectory(rawPath) {
  const outputDirRaw = typeof rawPath === 'string' ? rawPath : '';
  if (!outputDirRaw || !path.isAbsolute(outputDirRaw)) {
    throw new Error('Output directory must be an absolute path strictly outside the repository worktree.');
  }

  const resolved = path.resolve(outputDirRaw);
  if (!fs.existsSync(resolved)) {
    throw new Error('Output directory does not exist.');
  }

  const stat = fs.lstatSync(resolved);
  if (stat.isSymbolicLink()) {
    throw new Error('Output directory path must not use a symbolic link, junction or reparse-point redirect.');
  }
  if (!stat.isDirectory()) {
    throw new Error('Output directory path is not a directory.');
  }

  assertNoRedirectedPathComponents(resolved);
  const canonical = fs.realpathSync(resolved);
  if (pathIsWithin(repositoryRootRealPath(), canonical)) {
    throw new Error('Output directory must be an absolute path strictly outside the repository worktree.');
  }
  return canonical;
}

function parseStrictDecimalInteger(rawValue, {
  label,
  defaultValue,
  minimum,
  maximum,
}) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return defaultValue;
  }
  if (typeof rawValue !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(rawValue)) {
    throw new Error(`${label} must be a strict decimal integer between ${minimum} and ${maximum}.`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be a strict decimal integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function validateReviewerLabel(rawValue) {
  const reviewer = cleanString(rawValue);
  if (!reviewer) {
    throw new Error('Production read requires SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER reviewer label to be set.');
  }
  if (
    reviewer.length > REVIEWER_LABEL_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(reviewer) ||
    /[\\/]/u.test(reviewer) ||
    reviewer.includes('@')
  ) {
    throw new Error(
      `Production inventory reviewer label must be a non-sensitive operational label of at most ${REVIEWER_LABEL_MAX_LENGTH} characters without control characters, path separators or email addresses.`,
    );
  }
  return reviewer;
}

export function isRepositoryPath(targetPath) {
  if (!targetPath) return false;
  const resolved = path.resolve(cleanString(targetPath));
  return pathIsWithin(repositoryRootRealPath(), resolved);
}

export function validateProductionEnvironment(env = process.env) {
  if (env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Production read-only inventory rejects executions with FIRESTORE_EMULATOR_HOST set.');
  }

  const approval = cleanString(env.SHIFTORYX_PRODUCTION_READ_APPROVED);
  if (approval !== 'YES_READ_ONLY_INVENTORY') {
    throw new Error('Production read requires SHIFTORYX_PRODUCTION_READ_APPROVED=YES_READ_ONLY_INVENTORY.');
  }

  const reviewer = validateReviewerLabel(env.SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER);

  const projectEnv = cleanString(env.SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID);
  if (!projectEnv) {
    throw new Error('Production read requires SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID to be set.');
  }

  const outputDirRaw = cleanString(env.SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR);
  if (!outputDirRaw) {
    throw new Error('Production read requires SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR to be set.');
  }

  const outputDir = resolveCanonicalOutputDirectory(outputDirRaw);

  const retentionHours = parseStrictDecimalInteger(
    env.SHIFTORYX_PRODUCTION_INVENTORY_RETENTION_HOURS,
    {
      label: 'Retention hours',
      defaultValue: RETENTION_HOURS_DEFAULT,
      minimum: RETENTION_HOURS_MIN,
      maximum: RETENTION_HOURS_MAX,
    },
  );

  const maxMemberships = parseStrictDecimalInteger(
    env.SHIFTORYX_PRODUCTION_INVENTORY_MAX_MEMBERSHIPS,
    {
      label: 'Max memberships',
      defaultValue: MAX_MEMBERSHIPS_DEFAULT,
      minimum: MAX_MEMBERSHIPS_MIN,
      maximum: MAX_MEMBERSHIPS_HARD_LIMIT,
    },
  );

  const confirmedProject = cleanString(CONFIRMED_PRODUCTION_PROJECT_ID);
  if (!confirmedProject || confirmedProject === 'EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION') {
    throw new Error('EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION: Exact production project ID must be human-confirmed in code constant.');
  }

  if (projectEnv !== confirmedProject) {
    throw new Error('Environment project ID does not match confirmed production project ID constant.');
  }

  return {
    projectId: confirmedProject,
    reviewer,
    outputDir,
    retentionHours,
    maxMemberships,
  };
}

export function parseProductionCliArgs(argv) {
  const parsed = { readOnly: false, help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--read-only') parsed.readOnly = true;
    else throw new Error(`Unsupported argument: ${arg}. Production inventory accepts only --read-only and --help.`);
  }
  return parsed;
}

export function validateProductionCliAcknowledgement(parsed) {
  if (parsed?.help) return parsed;
  if (!parsed?.readOnly) {
    throw new Error('Mandatory flag --read-only is required.');
  }
  return parsed;
}

const PRODUCTION_INVENTORY_HELP = `Usage: node scripts/inventory-tenant-memberships-production-readonly.mjs --read-only

Options:
  --read-only   Mandatory acknowledgement flag.
  --help        Show this help.

Environment Variables Required:
  SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID
  SHIFTORYX_PRODUCTION_READ_APPROVED=YES_READ_ONLY_INVENTORY
  SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER
  SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR
  SHIFTORYX_PRODUCTION_INVENTORY_RETENTION_HOURS
  SHIFTORYX_PRODUCTION_INVENTORY_MAX_MEMBERSHIPS
`;

export function safeProductionInventoryErrorCode(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (message.includes('Unsupported argument')) return 'UNSUPPORTED_PRODUCTION_READ_ARGUMENT';
  if (message.includes('--read-only')) return 'READ_ONLY_ACKNOWLEDGEMENT_REQUIRED';
  if (message.includes('FIRESTORE_EMULATOR_HOST')) return 'PRODUCTION_READ_EMULATOR_ENV_REJECTED';
  if (message.includes('SHIFTORYX_PRODUCTION_READ_APPROVED')) return 'PRODUCTION_READ_APPROVAL_REQUIRED';
  if (message.includes('reviewer label') || message.includes('SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER')) {
    return 'PRODUCTION_READ_REVIEWER_INVALID';
  }
  if (message.includes('EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION')) {
    return 'EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION';
  }
  if (message.includes('project ID')) return 'PRODUCTION_READ_PROJECT_INVALID';
  if (message.includes('Output directory') || error?.code === 'EEXIST') {
    return error?.code === 'EEXIST'
      ? 'PRODUCTION_READ_OUTPUT_COLLISION'
      : 'PRODUCTION_READ_OUTPUT_PATH_INVALID';
  }
  if (message.includes('Retention hours') || message.includes('Max memberships')) {
    return 'PRODUCTION_READ_LIMIT_INVALID';
  }
  if (message.includes('exceeds approved maximum')) return 'PRODUCTION_READ_MAXIMUM_EXCEEDED';
  return 'PRODUCTION_READ_RUNTIME_FAILURE';
}

export function writeProtectedAuditFile({
  outputDir,
  correlationId,
  reviewer,
  projectId,
  retentionHours,
  inventory,
  mirrorDetails,
  productionReadPerformed = false,
  recordSnapshots = [],
}) {
  const timestamp = new Date().toISOString();
  const retentionDeadline = new Date(Date.now() + retentionHours * 3600000).toISOString();
  const fileName = `shiftoryx-inventory-${correlationId}.json`;
  const canonicalOutputDir = resolveCanonicalOutputDirectory(outputDir);
  const filePath = path.join(canonicalOutputDir, fileName);

  if (isRepositoryPath(filePath)) {
    throw new Error('Output file path must be strictly outside repository worktree.');
  }

  const payload = {
    correlationId,
    timestamp,
    reviewer,
    projectId,
    retentionDeadlineHours: retentionHours,
    retentionDeadline,
    productionReadPerformed: Boolean(productionReadPerformed),
    writeOperationsExecuted: 0,
    inventorySummary: sanitizeInventorySummary(inventory, {
      source: 'production',
      productionReadPerformed: Boolean(productionReadPerformed),
    }),
    mirrorDetails,
    recordSnapshots,
  };

  // Exclusive file creation with restricted mode 0o600
  const flag = fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY;
  const mode = 0o600;
  const fd = fs.openSync(filePath, flag, mode);
  try {
    fs.writeFileSync(fd, JSON.stringify(payload, null, 2), { encoding: 'utf8' });
  } finally {
    fs.closeSync(fd);
  }

  return { filePath, retentionDeadline };
}

export const REFERENCE_READ_CHUNK_SIZE = 25;

async function readReferenceChunks({
  firestore,
  collectionName,
  ids,
  fieldMask,
  chunkSize,
  onSnapshot,
}) {
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const refs = chunk.map((id) => firestore.collection(collectionName).doc(id));
    const snapshots = await firestore.getAll(...refs, { fieldMask });
    for (const snapshot of snapshots) {
      onSnapshot(snapshot);
    }
  }
}

export async function runChunkedReferenceReads(
  firestore,
  uniqueUids,
  uniqueTenantIds,
  chunkSize = REFERENCE_READ_CHUNK_SIZE,
) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > REFERENCE_READ_CHUNK_SIZE) {
    throw new Error(`Reference read chunk size must be between 1 and ${REFERENCE_READ_CHUNK_SIZE}.`);
  }
  const userResults = new Map();
  const tenantResults = new Map();
  const platformAdminResults = new Map();

  const uidList = [...uniqueUids];
  await readReferenceChunks({
    firestore,
    collectionName: 'users',
    ids: uidList,
    fieldMask: ['memberships'],
    chunkSize,
    onSnapshot(snapshot) {
      if (snapshot.exists) {
        const data = snapshot.data() || {};
        userResults.set(snapshot.id, { exists: true, memberships: data.memberships || {} });
      } else {
        userResults.set(snapshot.id, { exists: false, memberships: null });
      }
    },
  });

  await readReferenceChunks({
    firestore,
    collectionName: 'platformAdmins',
    ids: uidList,
    fieldMask: [],
    chunkSize,
    onSnapshot(snapshot) {
      platformAdminResults.set(snapshot.id, snapshot.exists);
    },
  });

  const tenantList = [...uniqueTenantIds];
  await readReferenceChunks({
    firestore,
    collectionName: 'tenants',
    ids: tenantList,
    fieldMask: [],
    chunkSize,
    onSnapshot(snapshot) {
      tenantResults.set(snapshot.id, snapshot.exists);
    },
  });

  return { userResults, tenantResults, platformAdminResults };
}

export async function readProjectedMembershipSnapshot(firestore, maxMemberships) {
  if (!Number.isInteger(maxMemberships) || maxMemberships < 1 || maxMemberships > MAX_MEMBERSHIPS_HARD_LIMIT) {
    throw new Error(`Max memberships must be between 1 and ${MAX_MEMBERSHIPS_HARD_LIMIT}.`);
  }
  return firestore
    .collection('tenantMemberships')
    .select('uid', 'tenantId', 'role', 'status', 'createdAt', 'updatedAt')
    .limit(maxMemberships + 1)
    .get();
}

export function serializeFirestoreTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (
    (typeof value.seconds === 'number' || typeof value.seconds === 'bigint') &&
    Number.isInteger(Number(value.nanoseconds || 0))
  ) {
    return {
      seconds: String(value.seconds),
      nanoseconds: Number(value.nanoseconds || 0),
    };
  }
  if (value instanceof Date) {
    return { iso: value.toISOString() };
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return { iso: date.toISOString() };
  }
  if (typeof value?.toDate === 'function') {
    return { iso: value.toDate().toISOString() };
  }
  return { state: 'invalid' };
}

export async function inventoryFirestoreProductionReadOnlyInternal({
  config,
  fakeAdapter = null, // Optional fake adapter for network-free dry-run unit tests
}) {
  const correlationId = crypto.randomUUID();
  let membershipsData = [];
  let userResults = new Map();
  let tenantResults = new Map();
  let platformAdminResults = new Map();
  let productionReadPerformed = false;

  if (fakeAdapter) {
    // Injected dry-run fake adapter (used for testing guards without network)
    const result = await fakeAdapter(config);
    membershipsData = result.membershipsData || [];
    userResults = result.userResults || new Map();
    tenantResults = result.tenantResults || new Map();
    platformAdminResults = result.platformAdminResults || new Map();
    productionReadPerformed = Boolean(result.productionReadPerformed);
  } else {
    // Real Firebase Admin read boundary
    const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
    const adminApp = requireFromFunctions('firebase-admin/app');
    const adminFirestore = requireFromFunctions('firebase-admin/firestore');
    const app = adminApp.initializeApp({ projectId: config.projectId }, 'production-read-only-inventory');
    const firestore = adminFirestore.getFirestore(app);

    try {
      const snapshot = await readProjectedMembershipSnapshot(firestore, config.maxMemberships);
      productionReadPerformed = true;

      if (snapshot.docs.length > config.maxMemberships) {
        throw new Error(
          `Membership count exceeds approved maximum limit of ${config.maxMemberships}. Stopping before reference reads.`,
        );
      }

      membershipsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        path: doc.ref.path,
        updateTime: doc.updateTime,
        data: doc.data(),
      }));

      const uniqueUids = new Set(membershipsData.map((m) => cleanString(m.data?.uid)).filter(Boolean));
      const uniqueTenantIds = new Set(membershipsData.map((m) => cleanString(m.data?.tenantId)).filter(Boolean));

      const refData = await runChunkedReferenceReads(firestore, uniqueUids, uniqueTenantIds);
      userResults = refData.userResults;
      tenantResults = refData.tenantResults;
      platformAdminResults = refData.platformAdminResults;
    } finally {
      await adminApp.deleteApp(app);
    }
  }

  if (membershipsData.length > config.maxMemberships) {
    throw new Error(
      `Membership count exceeds approved maximum limit of ${config.maxMemberships}. Stopping before classification.`,
    );
  }

  const existingUserIds = new Set([...userResults.entries()].filter(([, v]) => v.exists).map(([k]) => k));
  const existingTenantIds = new Set([...tenantResults.entries()].filter(([, v]) => v).map(([k]) => k));
  const platformAdminIds = new Set([...platformAdminResults.entries()].filter(([, v]) => v).map(([k]) => k));
  const referencedUserIds = new Set(
    membershipsData.map((membership) => cleanString(membership.data?.uid)).filter(Boolean),
  );
  const referencedTenantIds = new Set(
    membershipsData.map((membership) => cleanString(membership.data?.tenantId)).filter(Boolean),
  );

  // Perform classification
  const inventory = classifyMembershipInventory({
    memberships: membershipsData,
    userIds: existingUserIds,
    tenantIds: existingTenantIds,
    platformAdminIds,
  });

  // Evaluate user mirror consistency
  const mirrorDetails = [];
  let mirrorAbsentCount = 0;
  let mirrorConsistentCount = 0;
  let mirrorRoleMismatchCount = 0;
  let mirrorStatusMismatchCount = 0;
  let malformedMirrorCount = 0;

  for (const m of membershipsData) {
    const uid = cleanString(m.data?.uid);
    const tenantId = cleanString(m.data?.tenantId);
    const role = cleanString(m.data?.role);
    const status = cleanString(m.data?.status);

    if (!uid || !tenantId) continue;

    const userRef = userResults.get(uid);
    if (!userRef || !userRef.exists) continue;

    const userMemberships = userRef.memberships;
    if (!userMemberships || typeof userMemberships !== 'object') {
      malformedMirrorCount += 1;
      mirrorDetails.push({ id: m.id, uid, tenantId, mirrorState: 'MALFORMED_MIRROR' });
      continue;
    }

    const mirrorRecord = userMemberships[tenantId];
    if (!mirrorRecord) {
      mirrorAbsentCount += 1;
      mirrorDetails.push({ id: m.id, uid, tenantId, mirrorState: 'MIRROR_ABSENT' });
    } else if (typeof mirrorRecord !== 'object') {
      malformedMirrorCount += 1;
      mirrorDetails.push({ id: m.id, uid, tenantId, mirrorState: 'MALFORMED_MIRROR' });
    } else {
      const mirrorRole = cleanString(mirrorRecord.role);
      const mirrorStatus = cleanString(mirrorRecord.status);
      const roleMatch = mirrorRole === role;
      const statusMatch = mirrorStatus === status;

      if (roleMatch && statusMatch) {
        mirrorConsistentCount += 1;
        mirrorDetails.push({ id: m.id, uid, tenantId, mirrorState: 'MIRROR_CONSISTENT' });
      } else {
        if (!roleMatch) mirrorRoleMismatchCount += 1;
        if (!statusMatch) mirrorStatusMismatchCount += 1;
        mirrorDetails.push({
          id: m.id,
          uid,
          tenantId,
          mirrorState: !roleMatch ? 'MIRROR_ROLE_MISMATCH' : 'MIRROR_STATUS_MISMATCH',
          expectedRole: role,
          mirrorRole,
          expectedStatus: status,
          mirrorStatus,
        });
      }
    }
  }

  // Calculate role counts
  let ownerCount = 0;
  let adminCount = 0;
  let managerCount = 0;
  let unknownRoleCount = 0;

  for (const m of membershipsData) {
    const role = cleanString(m.data?.role);
    if (role === 'OWNER') ownerCount += 1;
    else if (role === 'ADMIN') adminCount += 1;
    else if (role === 'MANAGER') managerCount += 1;
    else unknownRoleCount += 1;
  }

  const missingUserReferenceCount = [...referencedUserIds].filter(
    (uid) => !existingUserIds.has(uid),
  ).length;
  const missingTenantReferenceCount = [...referencedTenantIds].filter(
    (tenantId) => !existingTenantIds.has(tenantId),
  ).length;
  const mirrorMismatchCount = mirrorAbsentCount + mirrorRoleMismatchCount + mirrorStatusMismatchCount + malformedMirrorCount;

  const expectedPolicyRecordIds = new Set();
  const structuralOrSecurityRecordIds = new Set();
  for (const record of inventory.records) {
    const isExpectedLegacyAdmin =
      record.classification === 'MANUAL_REVIEW_REQUIRED' &&
      record.currentRole === 'ADMIN' &&
      record.reasons.length === 1 &&
      record.reasons[0] === 'legacy-admin-owner-semantics-not-approved';
    if (isExpectedLegacyAdmin) {
      expectedPolicyRecordIds.add(record.id);
    } else if (
      record.classification === 'MANUAL_REVIEW_REQUIRED' ||
      record.classification === 'INVALID_OR_MALFORMED' ||
      record.classification === 'REVOKED_OR_INACTIVE' ||
      record.classification === 'CONFLICT_OR_DUPLICATE'
    ) {
      structuralOrSecurityRecordIds.add(record.id);
    }
  }
  for (const mirror of mirrorDetails) {
    if (mirror.mirrorState !== 'MIRROR_CONSISTENT') {
      structuralOrSecurityRecordIds.add(mirror.id);
      expectedPolicyRecordIds.delete(mirror.id);
    }
  }

  const expectedPolicyManualReviewCount = expectedPolicyRecordIds.size;
  const structuralOrSecurityManualReviewCount = structuralOrSecurityRecordIds.size;
  const hasAnomalies = structuralOrSecurityManualReviewCount > 0;

  let finalCheckpointVerdict = 'CHECKPOINT_VERDICT_PASS';
  if (hasAnomalies) {
    finalCheckpointVerdict = 'STRUCTURAL_OR_SECURITY_MANUAL_REVIEW';
  } else if (expectedPolicyManualReviewCount > 0) {
    finalCheckpointVerdict = 'EXPECTED_POLICY_MANUAL_REVIEW';
  }

  const classificationsById = new Map(inventory.records.map((record) => [record.id, record]));
  const mirrorsById = new Map(mirrorDetails.map((mirror) => [mirror.id, mirror]));
  const recordSnapshots = [...membershipsData]
    .sort((left, right) => cleanString(left.id).localeCompare(cleanString(right.id)))
    .map((membership) => {
    const id = cleanString(membership.id);
    const uid = cleanString(membership.data?.uid);
    const tenantId = cleanString(membership.data?.tenantId);
    const classification = classificationsById.get(id);
    const mirror = mirrorsById.get(id);
      return {
        documentId: id,
        documentPath: cleanString(membership.path) || `tenantMemberships/${id}`,
        uid,
        tenantId,
        role: cleanString(membership.data?.role),
        status: cleanString(membership.data?.status),
        createdAt: serializeFirestoreTimestamp(membership.data?.createdAt),
        updatedAt: serializeFirestoreTimestamp(membership.data?.updatedAt),
        firestoreDocumentUpdateTime: serializeFirestoreTimestamp(membership.updateTime),
        classification: classification?.classification || 'INVALID_OR_MALFORMED',
        classificationReasons: classification?.reasons || ['classification-record-missing'],
        mirrorState:
          mirror?.mirrorState ||
          (!uid || !existingUserIds.has(uid) ? 'USER_REFERENCE_MISSING' : 'NOT_EVALUATED'),
        platformAdminOverlap: Boolean(uid && platformAdminIds.has(uid)),
      };
    });

  const { filePath: auditFilePath, retentionDeadline } = writeProtectedAuditFile({
    outputDir: config.outputDir,
    correlationId,
    reviewer: config.reviewer,
    projectId: config.projectId,
    retentionHours: config.retentionHours,
    inventory,
    mirrorDetails,
    productionReadPerformed,
    recordSnapshots,
  });

  const sanitizedConsoleOutput = {
    correlationId,
    mode: 'READ_ONLY',
    productionReadPerformed,
    writeOperationsExecuted: 0,
    totalMemberships: inventory.diagnostics.totalMemberships,
    ownerCount,
    adminCount,
    managerCount,
    unknownRoleCount,
    inactiveOrRevokedCount: inventory.counts.REVOKED_OR_INACTIVE,
    malformedCount: inventory.counts.INVALID_OR_MALFORMED,
    duplicateOrConflictCount: inventory.counts.CONFLICT_OR_DUPLICATE,
    platformAdminOverlapCount: inventory.diagnostics.platformAdminsWithExplicitTenantMembership,
    missingUserReferenceCount,
    missingTenantReferenceCount,
    mirrorMismatchCount,
    expectedPolicyManualReviewCount,
    structuralOrSecurityManualReviewCount,
    classificationCounts: inventory.counts,
    readOnlyVerdict: 'READ_ONLY_ENFORCED',
    zeroWriteVerdict: 'ZERO_WRITES_EXECUTED',
    retentionDeadline,
    finalCheckpointVerdict,
  };

  return {
    sanitizedConsoleOutput,
    auditFilePath,
    hasAnomalies,
  };
}

export async function runProductionInventoryCli(
  argv = process.argv.slice(2),
  env = process.env,
  dependencies = {},
) {
  const {
    validateEnvironment = validateProductionEnvironment,
    executeInventory = inventoryFirestoreProductionReadOnlyInternal,
    writeStdout = (value) => console.log(value),
  } = dependencies;
  const cli = parseProductionCliArgs(argv);
  if (cli.help) {
    writeStdout(PRODUCTION_INVENTORY_HELP);
    return { status: 'HELP', exitCode: 0 };
  }

  validateProductionCliAcknowledgement(cli);

  // Validate configuration before importing/initializing SDK
  const config = validateEnvironment(env);

  const result = await executeInventory({ config });

  writeStdout(JSON.stringify(result.sanitizedConsoleOutput, null, 2));

  return {
    status: 'COMPLETED',
    exitCode: result.hasAnomalies ? 1 : 0,
    result,
  };
}

export async function runProductionInventoryEntrypoint({
  argv = process.argv.slice(2),
  env = process.env,
  dependencies = {},
  writeStderr = (value) => console.error(value),
} = {}) {
  try {
    const execution = await runProductionInventoryCli(argv, env, dependencies);
    return execution.exitCode;
  } catch (error) {
    writeStderr(safeProductionInventoryErrorCode(error));
    return 1;
  }
}

const currentFile = path.resolve(fileURLToPath(import.meta.url));
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectInvocation =
  process.platform === 'win32'
    ? currentFile.toLowerCase() === invokedFile.toLowerCase()
    : currentFile === invokedFile;

if (isDirectInvocation) {
  runProductionInventoryEntrypoint().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
