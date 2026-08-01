import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MEMBERSHIP_CLASSIFICATIONS,
  cleanString,
  classifyMembershipInventory,
  buildPhase2BPlanningSummary,
  sanitizeInventorySummary,
} from './lib/tenant-membership-inventory-core.mjs';

const APPROVED_EMULATOR_PROJECT_IDS = new Set(['demo-shiftoryx-owner-inventory']);
const LOCAL_EMULATOR_HOST_PATTERN = /^(?:127\.0\.0\.1|localhost|\[::1\]):[1-9][0-9]{1,4}$/iu;

export {
  MEMBERSHIP_CLASSIFICATIONS,
  classifyMembershipInventory,
  buildPhase2BPlanningSummary,
  sanitizeInventorySummary,
};

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
  --read-only                Mandatory acknowledgement.
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

  console.log(JSON.stringify(sanitizeInventorySummary(inventory, {
    source: args.source,
    productionReadPerformed: false,
    // Preserve the established Phase 2A offline/emulator report contract.
    // The isolated production reader uses productionReadPerformed exclusively.
    productionReadFieldName: 'productionAccessPerformed',
  }), null, 2));
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
