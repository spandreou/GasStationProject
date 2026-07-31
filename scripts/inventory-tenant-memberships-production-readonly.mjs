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

export function isRepositoryPath(targetPath) {
  if (!targetPath) return false;
  const resolved = path.resolve(cleanString(targetPath));
  const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const relative = path.relative(repoRoot, resolved);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function validateProductionEnvironment(env = process.env) {
  if (env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Production read-only inventory rejects executions with FIRESTORE_EMULATOR_HOST set.');
  }

  const approval = cleanString(env.SHIFTORYX_PRODUCTION_READ_APPROVED);
  if (approval !== 'YES_READ_ONLY_INVENTORY') {
    throw new Error('Production read requires SHIFTORYX_PRODUCTION_READ_APPROVED=YES_READ_ONLY_INVENTORY.');
  }

  const reviewer = cleanString(env.SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER);
  if (!reviewer) {
    throw new Error('Production read requires SHIFTORYX_PRODUCTION_INVENTORY_REVIEWER to be set.');
  }

  const projectEnv = cleanString(env.SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID);
  if (!projectEnv) {
    throw new Error('Production read requires SHIFTORYX_PRODUCTION_FIREBASE_PROJECT_ID to be set.');
  }

  const confirmedProject = cleanString(CONFIRMED_PRODUCTION_PROJECT_ID);
  if (!confirmedProject || confirmedProject === 'EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION') {
    throw new Error('EXACT_PRODUCTION_PROJECT_REQUIRES_HUMAN_CONFIRMATION: Exact production project ID must be human-confirmed in code constant.');
  }

  if (projectEnv !== confirmedProject) {
    throw new Error('Environment project ID does not match confirmed production project ID constant.');
  }

  const outputDirRaw = cleanString(env.SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR);
  if (!outputDirRaw) {
    throw new Error('Production read requires SHIFTORYX_PRODUCTION_INVENTORY_OUTPUT_DIR to be set.');
  }

  const outputDir = path.resolve(outputDirRaw);
  if (!path.isAbsolute(outputDirRaw) || isRepositoryPath(outputDir)) {
    throw new Error('Output directory must be an absolute path strictly outside the repository worktree.');
  }

  if (!fs.existsSync(outputDir)) {
    throw new Error('Output directory does not exist.');
  }

  const stat = fs.lstatSync(outputDir);
  if (!stat.isDirectory()) {
    throw new Error('Output directory path is not a directory.');
  }
  if (stat.isSymbolicLink()) {
    throw new Error('Output directory path must not be a symbolic link.');
  }

  const retentionHoursRaw = env.SHIFTORYX_PRODUCTION_INVENTORY_RETENTION_HOURS
    ? Number.parseInt(env.SHIFTORYX_PRODUCTION_INVENTORY_RETENTION_HOURS, 10)
    : 168; // Default 7 days
  if (!Number.isInteger(retentionHoursRaw) || retentionHoursRaw <= 0 || retentionHoursRaw > 720) {
    throw new Error('Retention hours must be a positive integer <= 720.');
  }

  const maxMembershipsRaw = env.SHIFTORYX_PRODUCTION_INVENTORY_MAX_MEMBERSHIPS
    ? Number.parseInt(env.SHIFTORYX_PRODUCTION_INVENTORY_MAX_MEMBERSHIPS, 10)
    : 100;
  if (!Number.isInteger(maxMembershipsRaw) || maxMembershipsRaw <= 0) {
    throw new Error('Max memberships limit must be a positive integer.');
  }

  return {
    projectId: confirmedProject,
    reviewer,
    outputDir,
    retentionHours: retentionHoursRaw,
    maxMemberships: maxMembershipsRaw,
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

export function writeProtectedAuditFile({
  outputDir,
  correlationId,
  reviewer,
  projectId,
  retentionHours,
  inventory,
  mirrorDetails,
}) {
  const timestamp = new Date().toISOString();
  const retentionDeadline = new Date(Date.now() + retentionHours * 3600000).toISOString();
  const fileName = `shiftoryx-inventory-${correlationId}.json`;
  const filePath = path.join(outputDir, fileName);

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
    inventorySummary: sanitizeInventorySummary(inventory, { source: 'production' }),
    mirrorDetails,
    recordClassifications: inventory.records,
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

export async function runChunkedReferenceReads(firestore, uniqueUids, uniqueTenantIds, chunkSize = 10) {
  const userResults = new Map();
  const tenantResults = new Map();
  const platformAdminResults = new Map();

  const uidList = [...uniqueUids];
  for (let i = 0; i < uidList.length; i += chunkSize) {
    const chunk = uidList.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (uid) => {
        const userDoc = await firestore.collection('users').doc(uid).get();
        if (userDoc.exists) {
          const data = userDoc.data() || {};
          userResults.set(uid, { exists: true, memberships: data.memberships || {} });
        } else {
          userResults.set(uid, { exists: false, memberships: null });
        }

        const adminDoc = await firestore.collection('platformAdmins').doc(uid).get();
        platformAdminResults.set(uid, adminDoc.exists);
      }),
    );
  }

  const tenantList = [...uniqueTenantIds];
  for (let i = 0; i < tenantList.length; i += chunkSize) {
    const chunk = tenantList.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (tenantId) => {
        const tenantDoc = await firestore.collection('tenants').doc(tenantId).get();
        tenantResults.set(tenantId, tenantDoc.exists);
      }),
    );
  }

  return { userResults, tenantResults, platformAdminResults };
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
  let isRealProductionRead = false;

  if (fakeAdapter) {
    // Injected dry-run fake adapter (used for testing guards without network)
    const result = await fakeAdapter(config);
    membershipsData = result.membershipsData || [];
    userResults = result.userResults || new Map();
    tenantResults = result.tenantResults || new Map();
    platformAdminResults = result.platformAdminResults || new Map();
    isRealProductionRead = Boolean(result.isRealProductionRead);
  } else {
    // Real Firebase Admin read boundary
    isRealProductionRead = true;
    const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
    const adminApp = requireFromFunctions('firebase-admin/app');
    const adminFirestore = requireFromFunctions('firebase-admin/firestore');
    const app = adminApp.initializeApp({ projectId: config.projectId }, 'production-read-only-inventory');
    const firestore = adminFirestore.getFirestore(app);

    try {
      const snapshot = await firestore
        .collection('tenantMemberships')
        .select('uid', 'tenantId', 'role', 'status', 'createdAt', 'updatedAt')
        .limit(config.maxMemberships + 1)
        .get();

      if (snapshot.docs.length > config.maxMemberships) {
        throw new Error(
          `Membership count exceeds approved maximum limit of ${config.maxMemberships}. Stopping before reference reads.`,
        );
      }

      membershipsData = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));

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

  // Write protected external audit file
  const { filePath: auditFilePath, retentionDeadline } = writeProtectedAuditFile({
    outputDir: config.outputDir,
    correlationId,
    reviewer: config.reviewer,
    projectId: config.projectId,
    retentionHours: config.retentionHours,
    inventory,
    mirrorDetails,
  });

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

  const missingUserCount = membershipsData.length - existingUserIds.size;
  const missingTenantCount = membershipsData.length - existingTenantIds.size;
  const mirrorMismatchCount = mirrorAbsentCount + mirrorRoleMismatchCount + mirrorStatusMismatchCount + malformedMirrorCount;

  const hasUnexpectedManager = managerCount > 0;
  const hasAnomalies =
    hasUnexpectedManager ||
    unknownRoleCount > 0 ||
    inventory.counts.INVALID_OR_MALFORMED > 0 ||
    inventory.counts.CONFLICT_OR_DUPLICATE > 0 ||
    missingUserCount > 0 ||
    missingTenantCount > 0 ||
    mirrorMismatchCount > 0;

  let finalCheckpointVerdict = 'CHECKPOINT_VERDICT_PASS';
  if (hasUnexpectedManager) {
    finalCheckpointVerdict = 'UNEXPECTED_MANAGER_DATA_REQUIRES_REVIEW';
  } else if (hasAnomalies) {
    finalCheckpointVerdict = 'CHECKPOINT_VERDICT_REQUIRES_MANUAL_REVIEW';
  }

  const sanitizedConsoleOutput = {
    correlationId,
    mode: 'READ_ONLY',
    productionReadPerformed: isRealProductionRead,
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
    missingUserCount,
    missingTenantCount,
    mirrorMismatchCount,
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

export async function runProductionInventoryCli(argv = process.argv.slice(2), env = process.env) {
  const cli = parseProductionCliArgs(argv);
  if (cli.help) {
    console.log(`Usage: node scripts/inventory-tenant-memberships-production-readonly.mjs --read-only

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
`);
    return;
  }

  if (!cli.readOnly) {
    throw new Error('Mandatory flag --read-only is required.');
  }

  // Validate configuration before importing/initializing SDK
  const config = validateProductionEnvironment(env);

  const result = await inventoryFirestoreProductionReadOnlyInternal({ config });

  console.log(JSON.stringify(result.sanitizedConsoleOutput, null, 2));

  if (result.hasAnomalies) {
    process.exitCode = 1;
  }
}

const currentFile = path.resolve(fileURLToPath(import.meta.url));
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectInvocation =
  process.platform === 'win32'
    ? currentFile.toLowerCase() === invokedFile.toLowerCase()
    : currentFile === invokedFile;

if (isDirectInvocation) {
  runProductionInventoryCli().catch((error) => {
    console.error(`Production read-only inventory execution rejected: ${error.message}`);
    process.exitCode = 1;
  });
}
