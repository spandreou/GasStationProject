import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const ALLOWED_TENANTS = new Set(['bp-kallis']);

function printUsage() {
  console.log(`Usage:
  node scripts/migrate-global-to-tenant.mjs --tenant <tenant-id> [options]

Options:
  --tenant <id>             Target tenant. Required, only 'bp-kallis' is supported in this phase.
  --dry-run                 Show what would be copied. Default if neither --write nor --verify is set.
  --write                   Execute copy migration.
  --verify                  Compare document counts and verify target data matches.
  --overwrite               Overwrite existing target documents during migration.
  --project-id <id>         Override GCP project ID.
  --service-account <path>  Path to Google Service Account JSON file.
  --use-gcloud              Print OAuth token via gcloud CLI.
`);
}

function parseArgs(argv) {
  const args = {
    tenant: '',
    dryRun: false,
    write: false,
    verify: false,
    overwrite: false,
    projectId: '',
    serviceAccountPath: '',
    useGcloud: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    else if (arg === '--tenant') args.tenant = argv[++index];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--verify') args.verify = true;
    else if (arg === '--overwrite') args.overwrite = true;
    else if (arg === '--project-id') args.projectId = argv[++index];
    else if (arg === '--service-account') args.serviceAccountPath = argv[++index];
    else if (arg === '--use-gcloud') args.useGcloud = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function getDotEnvValue(name) {
  if (!existsSync('.env')) return '';
  const line = readFileSync('.env', 'utf8')
    .split(/\r?\n/u)
    .find((entry) => entry.trim().startsWith(`${name}=`));
  if (!line) return '';
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/gu, '');
}

function loadServiceAccount(pathFromArgs) {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) return JSON.parse(inlineJson);

  const serviceAccountPath = pathFromArgs || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccountPath) return null;
  if (!existsSync(serviceAccountPath)) {
    throw new Error(`Service account file not found: ${serviceAccountPath}`);
  }
  return JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
}

function resolveProjectId(args, serviceAccount) {
  return (
    args.projectId ||
    serviceAccount?.project_id ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    getDotEnvValue('FIREBASE_PROJECT_ID') ||
    getDotEnvValue('VITE_FIREBASE_PROJECT_ID') ||
    'gasstationproject-9dd89'
  );
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function createServiceAccountJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: serviceAccount.client_email,
    scope: FIRESTORE_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  return `${unsignedJwt}.${signer.sign(serviceAccount.private_key, 'base64url')}`;
}

async function getAccessToken(serviceAccount) {
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: createServiceAccountJwt(serviceAccount),
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error_description || data?.error || response.statusText;
    throw new Error(`OAuth token request failed (${response.status}): ${message}`);
  }
  return data.access_token;
}

function getGcloudAccessToken() {
  return execFileSync('gcloud', ['auth', 'print-access-token'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function resolveAccessToken(args, serviceAccount) {
  if (serviceAccount) return getAccessToken(serviceAccount);
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) return process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  if (args.useGcloud) return getGcloudAccessToken();
  return null; // Might be running in emulator
}

// Map global collection names to their tenant-scoped collection names
const COLLECTION_MAPPINGS = {
  employees: 'employees',
  shifts: 'shifts',
  shiftTemplates: 'shiftTemplates',
  employeeAbsences: 'absences',
  attendance_history: 'attendanceHistory',
  week_locks: 'weekLocks',
  week_history: 'weekHistory',
  week_templates: 'weekTemplates',
  announcements: 'announcements',
  audit_logs: 'auditLogs',
  published_schedules: 'publicSchedules',
};

async function listAllDocuments(firestoreBase, collectionPath, accessToken, projectId) {
  const documents = [];
  let pageToken = '';
  do {
    const url = new URL(`${firestoreBase}/${collectionPath}`);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    url.searchParams.set('pageSize', '300');

    const headers = {};
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    if (projectId) {
      headers['X-Goog-User-Project'] = projectId;
    }

    const res = await fetch(url, { headers });
    if (res.status === 404) {
      return []; // Collection does not exist yet
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to list ${collectionPath} (${res.status}): ${err?.error?.message || res.statusText}`);
    }

    const data = await res.json();
    if (data.documents) {
      documents.push(...data.documents);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return documents;
}

async function commitWrites(firestoreBase, writes, accessToken, projectId) {
  if (!writes.length) return;
  const url = `${firestoreBase.replace(/\/documents$/, '')}/documents:commit`;
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  if (projectId) {
    headers['X-Goog-User-Project'] = projectId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ writes }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || response.statusText;
    throw new Error(`Firestore commit failed (${response.status}): ${message}`);
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function countMissingOrDifferentSourceDocs(sourceDocs, targetDocs) {
  const targetById = new Map(targetDocs.map((doc) => [doc.name.split('/').pop(), doc]));
  let missingCount = 0;
  let differentCount = 0;

  for (const sourceDoc of sourceDocs) {
    const docId = sourceDoc.name.split('/').pop();
    const targetDoc = targetById.get(docId);
    if (!targetDoc) {
      missingCount++;
      continue;
    }
    if (stableStringify(sourceDoc.fields || {}) !== stableStringify(targetDoc.fields || {})) {
      differentCount++;
    }
  }

  return {
    missingCount,
    differentCount,
    extraCount: Math.max(0, targetDocs.length - sourceDocs.length),
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.tenant) {
    console.error('Error: Target tenant is required (--tenant <tenant-id>)');
    printUsage();
    process.exit(1);
  }

  if (!ALLOWED_TENANTS.has(args.tenant)) {
    console.error(`Error: Tenant "${args.tenant}" is not permitted for migration in this phase.`);
    process.exit(1);
  }

  if (args.write && args.verify) {
    console.error('Error: Cannot run write and verify mode simultaneously.');
    process.exit(1);
  }

  const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const serviceAccount = isEmulator ? null : loadServiceAccount(args.serviceAccountPath);
  const projectId = resolveProjectId(args, serviceAccount);
  const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || (isEmulator ? null : await resolveAccessToken(args, serviceAccount));

  if (!isEmulator && !accessToken) {
    console.error('Error: Missing authentication credentials for live database. Provide a service account JSON or run with --use-gcloud, or set FIRESTORE_EMULATOR_HOST for emulator tests.');
    process.exit(1);
  }

  const firestoreBase = isEmulator
    ? `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  const mode = args.write ? 'WRITE' : args.verify ? 'VERIFY' : 'DRY-RUN';
  console.log(`--- GasStation Scheduler Migration ---`);
  console.log(`Project:  ${projectId}`);
  console.log(`Tenant:   ${args.tenant}`);
  console.log(`Mode:     ${mode}`);
  console.log(`Emulator: ${isEmulator ? 'Yes (' + process.env.FIRESTORE_EMULATOR_HOST + ')' : 'No'}`);
  console.log(`---------------------------------------`);

  let totalSourceDocs = 0;
  let totalCopiedDocs = 0;
  let totalSkippedDocs = 0;
  let verificationFailed = false;

  const targetPrefix = `tenants/${args.tenant}`;

  // 1. Process standard mapped collections
  for (const [sourceCol, targetColName] of Object.entries(COLLECTION_MAPPINGS)) {
    console.log(`Processing collection: ${sourceCol} -> ${targetPrefix}/${targetColName}`);

    // Fetch source documents
    const sourceDocs = await listAllDocuments(firestoreBase, sourceCol, accessToken, projectId);
    totalSourceDocs += sourceDocs.length;
    console.log(`  Source documents found: ${sourceDocs.length}`);

    if (mode === 'DRY-RUN') {
      console.log(`  Dry run: would copy ${sourceDocs.length} documents.`);
      continue;
    }

    if (mode === 'VERIFY') {
      const targetDocs = await listAllDocuments(firestoreBase, `${targetPrefix}/${targetColName}`, accessToken, projectId);
      console.log(`  Target documents found: ${targetDocs.length}`);
      const { missingCount, differentCount, extraCount } = countMissingOrDifferentSourceDocs(sourceDocs, targetDocs);
      if (missingCount || differentCount) {
        console.warn(`  [MISMATCH] Source docs missing or different in target. Missing: ${missingCount}, Different: ${differentCount}`);
        verificationFailed = true;
      } else {
        const extraMessage = extraCount ? ` Extra target documents: ${extraCount}.` : '';
        console.log(`  [OK] Source documents verified in target.${extraMessage}`);
      }
      continue;
    }

    if (mode === 'WRITE') {
      // Fetch target documents to prevent overwrites
      const targetDocs = await listAllDocuments(firestoreBase, `${targetPrefix}/${targetColName}`, accessToken, projectId);
      const targetIds = new Set(targetDocs.map(doc => doc.name.split('/').pop()));

      const writes = [];
      let skippedCount = 0;

      for (const docObj of sourceDocs) {
        const docId = docObj.name.split('/').pop();
        if (targetIds.has(docId) && !args.overwrite) {
          skippedCount++;
          continue;
        }

        // Build target document name
        const targetDocName = `projects/${projectId}/databases/(default)/documents/${targetPrefix}/${targetColName}/${docId}`;
        writes.push({
          update: {
            name: targetDocName,
            fields: docObj.fields || {},
          }
        });
      }

      if (writes.length > 0) {
        console.log(`  Writing ${writes.length} documents in batches...`);
        // Batch in chunks of 300 to be safe
        const batchSize = 300;
        for (let i = 0; i < writes.length; i += batchSize) {
          const chunk = writes.slice(i, i + batchSize);
          await commitWrites(firestoreBase, chunk, accessToken, projectId);
        }
        totalCopiedDocs += writes.length;
      }

      totalSkippedDocs += skippedCount;
      console.log(`  Done. Copied: ${writes.length}, Skipped (existing): ${skippedCount}`);
    }
  }

  // 2. Process scheduler_settings/default document mapping
  console.log(`Processing document: scheduler_settings/default -> ${targetPrefix}/settings/scheduler`);
  const settingsUrl = `${firestoreBase}/scheduler_settings/default`;
  const headers = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  if (projectId) {
    headers['X-Goog-User-Project'] = projectId;
  }

  const settingsRes = await fetch(settingsUrl, { headers });
  let settingsDoc = null;
  if (settingsRes.ok) {
    settingsDoc = await settingsRes.json();
  }

  if (settingsDoc) {
    totalSourceDocs++;
    if (mode === 'DRY-RUN') {
      console.log(`  Dry run: would copy default settings document.`);
    } else if (mode === 'VERIFY') {
      const targetSettingsUrl = `${firestoreBase}/${targetPrefix}/settings/scheduler`;
      const targetSettingsRes = await fetch(targetSettingsUrl, { headers });
      if (targetSettingsRes.ok) {
        console.log(`  [OK] Settings document exists in target.`);
      } else {
        console.warn(`  [MISMATCH] Settings document missing in target.`);
        verificationFailed = true;
      }
    } else if (mode === 'WRITE') {
      const targetSettingsUrl = `${firestoreBase}/${targetPrefix}/settings/scheduler`;
      let writeSettings = true;

      if (!args.overwrite) {
        const targetSettingsRes = await fetch(targetSettingsUrl, { headers });
        if (targetSettingsRes.ok) {
          writeSettings = false;
          totalSkippedDocs++;
          console.log(`  Settings document already exists at target, skipping.`);
        }
      }

      if (writeSettings) {
        const writes = [{
          update: {
            name: `projects/${projectId}/databases/(default)/documents/${targetPrefix}/settings/scheduler`,
            fields: settingsDoc.fields || {},
          }
        }];
        await commitWrites(firestoreBase, writes, accessToken, projectId);
        totalCopiedDocs++;
        console.log(`  Settings document copied successfully.`);
      }
    }
  } else {
    console.log(`  Source settings document 'default' not found. Skipping.`);
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total Source Documents: ${totalSourceDocs}`);
  if (mode === 'WRITE') {
    console.log(`Total Copied Documents: ${totalCopiedDocs}`);
    console.log(`Total Skipped Documents: ${totalSkippedDocs}`);
  }

  if (mode === 'VERIFY') {
    if (verificationFailed) {
      console.error(`Verification FAILED with mismatches.`);
      process.exit(1);
    } else {
      console.log(`Verification PASSED. All documents match.`);
    }
  } else {
    console.log(`Process complete.`);
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
