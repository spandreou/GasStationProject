import { createRequire } from 'node:module';
import { argv } from 'node:process';

const DEFAULT_PROJECT_ID = 'demo-gasstation-auth-broker';

function printUsage() {
  console.log(`Usage:
  node scripts/bootstrap-platform-admin.mjs --uid <uid> [options]

Required Options:
  --uid <uid>               Firebase Auth UID of the platform administrator

Additional Options:
  --role <role>             Role of the platform admin (SUPER_ADMIN). Default: SUPER_ADMIN
  --project-id <id>         Firebase project ID. Default: ${DEFAULT_PROJECT_ID}
  --dry-run                 Perform validation and print target paths only. Default behavior.
  --write                   Perform the write operation
  --verify                  Verify platform admin document exists
  --overwrite               Allow overwriting an existing platform admin
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
    role: 'SUPER_ADMIN',
  };

  for (let i = 0; i < argsArray.length; i++) {
    const arg = argsArray[i];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--uid') {
      parsed.uid = argsArray[++i];
    } else if (arg === '--role') {
      parsed.role = argsArray[++i];
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
  if (!args.uid) {
    throw new Error('Missing required option: --uid <uid>');
  }

  const uid = args.uid.trim();
  if (!/^[a-z0-9_-]+$/iu.test(uid)) {
    throw new Error(`Invalid UID "${uid}". Must contain only alphanumeric characters, dashes, and underscores.`);
  }

  if (args.role !== 'SUPER_ADMIN') {
    throw new Error(`Invalid role "${args.role}". Only 'SUPER_ADMIN' is allowed.`);
  }

  return {
    ...args,
    uid,
  };
}

async function run() {
  const parsed = parseArgs(argv.slice(2));
  if (parsed.help) {
    printUsage();
    return;
  }

  const config = validateInput(parsed);
  const targetPath = `platformAdmins/${config.uid}`;

  if (config.dryRun) {
    console.log('=== Platform Admin Bootstrap Dry-Run (Verification OK) ===');
    console.log(`UID: ${config.uid}`);
    console.log(`Role: ${config.role}`);
    console.log('\nPlanned document writes:');
    console.log(`- ${targetPath}`);
    console.log('\nDry-run completed successfully. No changes made.');
    return;
  }

  // Safety Gate: Block live production writes in Phase 2C.5B
  if (!config.emulator) {
    console.error('Error: Production platform admin bootstrap is disabled in Phase 2C.5B. Use --emulator or request explicit approval for live bootstrap.');
    process.exitCode = 1;
    return;
  }

  // Setup Firestore emulator client dynamically
  const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp } = requireFromFunctions('firebase-admin/app');
  const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';

  const app = initializeApp({ projectId: config.projectId }, `bootstrap-${config.uid}`);
  const db = getFirestore(app);

  if (config.write) {
    const docRef = db.doc(targetPath);
    const snap = await docRef.get();

    if (snap.exists && !config.overwrite) {
      throw new Error(`Platform admin "${config.uid}" already exists. Use --overwrite to replace existing admin.`);
    }

    const now = new Date();
    await docRef.set({
      uid: config.uid,
      role: config.role,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      createdBy: 'bootstrap-emulator',
    });

    console.log(`Successfully bootstrapped platform admin "${config.uid}" in the emulator.`);
    console.log(`- Created/Updated: ${targetPath}`);
  }

  if (config.verify) {
    const snap = await db.doc(targetPath).get();
    if (!snap.exists) {
      throw new Error(`Verification failed. Document "${targetPath}" does not exist in the emulator.`);
    }

    const data = snap.data();
    if (data.status !== 'ACTIVE' || data.role !== 'SUPER_ADMIN') {
      throw new Error(`Verification failed. Invalid document state: ${JSON.stringify(data)}`);
    }

    console.log(`Verification succeeded for platform admin "${config.uid}".`);
  }
}

run().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
