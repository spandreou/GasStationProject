import { createRequire } from 'node:module';
import { argv } from 'node:process';

const RESERVED_SLUGS = new Set([
  'gas',
  'www',
  'portal',
  'admin',
  'api',
  'auth',
  'status',
  'ops',
  'support',
  'billing',
  'dashboard',
]);

const DEFAULT_PROJECT_ID = 'demo-gasstation-auth-broker';

function printUsage() {
  console.log(`Usage:
  node scripts/provision-tenant.mjs --tenant <tenantId> --admin-uid <uid> [options]

Required Options:
  --tenant <tenantId>       Tenant ID / slug (e.g. eko-example)
  --admin-uid <uid>         Firebase Auth UID for the tenant admin

Additional Options:
  --admin-email <email>     Optional administrator email
  --display-name <name>     Tenant display name (e.g. "EKO Example")
  --domain <domain>         Tenant domain name (e.g. eko-example.homelabshare.gr)
  --project-id <id>         Firebase project ID. Default: ${DEFAULT_PROJECT_ID}
  --dry-run                 Perform validation and print target paths only. Default behavior.
  --write                   Perform the write operation
  --verify                  Verify tenant documents exist
  --overwrite               Allow overwriting existing tenant metadata
  --emulator                Target the local emulator only (required for writes in this phase)
`);
}

function parseArgs(argsArray) {
  const parsed = {
    dryRun: true, // safe default
    write: false,
    verify: false,
    overwrite: false,
    emulator: false,
    projectId: DEFAULT_PROJECT_ID,
  };

  for (let i = 0; i < argsArray.length; i++) {
    const arg = argsArray[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--tenant') {
      parsed.tenantId = argsArray[++i];
    } else if (arg === '--admin-uid') {
      parsed.adminUid = argsArray[++i];
    } else if (arg === '--admin-email') {
      parsed.adminEmail = argsArray[++i];
    } else if (arg === '--display-name') {
      parsed.displayName = argsArray[++i];
    } else if (arg === '--domain') {
      parsed.domain = argsArray[++i];
    } else if (arg === '--project-id') {
      parsed.projectId = argsArray[++i];
    } else if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--write') {
      parsed.write = true;
      parsed.dryRun = false;
    } else if (arg === '--verify') {
      parsed.verify = true;
      parsed.dryRun = false;
    } else if (arg === '--overwrite') {
      parsed.overwrite = true;
    } else if (arg === '--emulator') {
      parsed.emulator = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function validateInput(args) {
  if (!args.tenantId) {
    throw new Error('Missing required option: --tenant <tenantId>');
  }
  if (!args.adminUid) {
    throw new Error('Missing required option: --admin-uid <uid>');
  }

  // Slug rules validation
  const tenantId = args.tenantId.trim().toLowerCase();
  const slugRegex = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
  if (!slugRegex.test(tenantId)) {
    throw new Error(`Invalid tenant ID "${tenantId}". Must match regex: ^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$`);
  }

  if (RESERVED_SLUGS.has(tenantId)) {
    throw new Error(`Invalid tenant ID "${tenantId}". Slugs matching central/admin portal services are reserved.`);
  }

  if (tenantId.endsWith('-gas') || tenantId.startsWith('gas-')) {
    throw new Error(`Invalid tenant ID "${tenantId}". Slugs containing 'gas-' prefix or '-gas' suffix are prohibited.`);
  }

  if (args.domain && !args.domain.includes('.')) {
    throw new Error(`Invalid domain "${args.domain}". Must be a valid domain structure.`);
  }

  return {
    ...args,
    tenantId,
  };
}

async function run() {
  const parsed = parseArgs(argv.slice(2));
  if (parsed.help) {
    printUsage();
    return;
  }

  const config = validateInput(parsed);

  const targetPaths = [
    `tenants/${config.tenantId}`,
    `users/${config.adminUid}`,
    `tenantMemberships/${config.adminUid}_${config.tenantId}`,
    `tenants/${config.tenantId}/settings/scheduler`,
  ];

  if (config.dryRun) {
    console.log('=== Tenant Provisioning Dry-Run (Verification OK) ===');
    console.log(`Tenant ID: ${config.tenantId}`);
    console.log(`Admin UID: ${config.adminUid}`);
    if (config.adminEmail) console.log(`Admin Email: ${config.adminEmail}`);
    if (config.displayName) console.log(`Display Name: ${config.displayName}`);
    if (config.domain) console.log(`Domain: ${config.domain}`);
    console.log('\nPlanned document writes:');
    targetPaths.forEach((path) => console.log(`- ${path}`));
    console.log('\nDry-run completed successfully. No changes made.');
    return;
  }

  // Safety Gate: Block live production writes in Phase 2C.4
  if (!config.emulator) {
    console.error('Error: Production write mode is disabled in Phase 2C.4. Use --emulator or request explicit approval for live provisioning.');
    process.exitCode = 1;
    return;
  }

  // Setup Firestore emulator client dynamically
  const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp } = requireFromFunctions('firebase-admin/app');
  const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';

  const app = initializeApp({ projectId: config.projectId }, `provision-${config.tenantId}`);
  const db = getFirestore(app);

  if (config.write) {
    // Check if tenant exists
    const tenantDocRef = db.doc(`tenants/${config.tenantId}`);
    const tenantSnap = await tenantDocRef.get();

    if (tenantSnap.exists && !config.overwrite) {
      throw new Error(`Tenant "${config.tenantId}" already exists. Use --overwrite to replace existing metadata.`);
    }

    const batch = db.batch();
    const now = new Date();

    // 1. Write tenants/{tenantId}
    batch.set(tenantDocRef, {
      slug: config.tenantId,
      domain: config.domain || `${config.tenantId}.homelabshare.gr`,
      displayName: config.displayName || config.tenantId,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Write users/{uid}
    const userDocRef = db.doc(`users/${config.adminUid}`);
    const userPayload = {
      uid: config.adminUid,
      status: 'ACTIVE',
      updatedAt: now,
    };
    if (config.adminEmail) {
      userPayload.email = config.adminEmail.trim().toLowerCase();
    }
    // Deep merge memberships field if user exists
    const userSnap = await userDocRef.get();
    if (userSnap.exists) {
      const existingData = userSnap.data();
      userPayload.memberships = {
        ...(existingData.memberships || {}),
        [config.tenantId]: {
          role: 'OWNER',
          status: 'ACTIVE',
        },
      };
      batch.update(userDocRef, userPayload);
    } else {
      userPayload.memberships = {
        [config.tenantId]: {
          role: 'OWNER',
          status: 'ACTIVE',
        },
      };
      userPayload.createdAt = now;
      batch.set(userDocRef, userPayload);
    }

    // 3. Write tenantMemberships/{uid}_{tenantId}
    const membershipDocRef = db.doc(`tenantMemberships/${config.adminUid}_${config.tenantId}`);
    batch.set(membershipDocRef, {
      uid: config.adminUid,
      tenantId: config.tenantId,
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    });

    // 4. Write tenants/{tenantId}/settings/scheduler
    const settingsDocRef = db.doc(`tenants/${config.tenantId}/settings/scheduler`);
    batch.set(settingsDocRef, {
      generatorRules: {
        weeklyRotationEnabled: true,
        avoidConsecutiveSundays: true,
        allowManualOverride: true,
        startWithCoreAMorning: true,
        generationMode: 'balanced',
      },
      specialDaysByDate: {},
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();
    console.log(`Successfully provisioned tenant "${config.tenantId}" in the emulator.`);
    targetPaths.forEach((path) => console.log(`- Created/Updated: ${path}`));
  }

  if (config.verify) {
    const results = await Promise.all(
      targetPaths.map(async (path) => {
        const snap = await db.doc(path).get();
        return { path, exists: snap.exists };
      })
    );

    const missing = results.filter((r) => !r.exists);
    if (missing.length > 0) {
      throw new Error(`Verification failed. Missing documents:\n${missing.map((m) => `- ${m.path}`).join('\n')}`);
    }

    console.log(`Verification succeeded for tenant "${config.tenantId}". All required documents exist in the emulator.`);
  }
}

run().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
