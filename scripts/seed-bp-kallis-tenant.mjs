import { createSign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const DEFAULT_TENANT_ID = 'bp-kallis';

function printUsage() {
  console.log(`Usage:
  npm run tenant:seed-bp-kallis -- --uid <firebase-uid> [options]

Options:
  --tenant-id <id>             Tenant document id. Default: ${DEFAULT_TENANT_ID}
  --slug <slug>                Tenant slug. Default: bp-kallis
  --domain <domain>            Tenant domain. Default: bp-kallis.homelabshare.gr
  --display-name <name>        Tenant display name. Default: BP Kallis
  --role <role>                Membership role. Default: TENANT_ADMIN
  --email <email>              Optional user email snapshot for users/{uid}.
  --service-account <path>     Service account JSON path. Alternative to GOOGLE_APPLICATION_CREDENTIALS.
  --use-gcloud                 Use the active gcloud account for the Google OAuth token.
  --project-id <id>            Firebase project id. Defaults to service account or .env VITE_FIREBASE_PROJECT_ID.
  --dry-run                    Validate and print the planned document paths only.

Security:
  Service account private keys and OAuth tokens are never printed.
  Memberships are keyed by Firebase uid, not email/domain hardcoding.
`);
}

function parseArgs(argv) {
  const args = {
    tenantId: DEFAULT_TENANT_ID,
    slug: 'bp-kallis',
    domain: 'bp-kallis.homelabshare.gr',
    displayName: 'BP Kallis',
    role: 'TENANT_ADMIN',
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--uid') args.uid = argv[++index];
    else if (arg === '--tenant-id') args.tenantId = argv[++index];
    else if (arg === '--slug') args.slug = argv[++index];
    else if (arg === '--domain') args.domain = argv[++index];
    else if (arg === '--display-name') args.displayName = argv[++index];
    else if (arg === '--role') args.role = argv[++index];
    else if (arg === '--email') args.email = argv[++index];
    else if (arg === '--service-account') args.serviceAccountPath = argv[++index];
    else if (arg === '--project-id') args.projectId = argv[++index];
    else if (arg === '--use-gcloud') args.useGcloud = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  assert(
    serviceAccountPath,
    'Missing service account. Set FIREBASE_SERVICE_ACCOUNT_JSON, GOOGLE_APPLICATION_CREDENTIALS, pass --service-account <path>, or use --use-gcloud.',
  );
  assert(existsSync(serviceAccountPath), `Service account file was not found: ${serviceAccountPath}`);
  return JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
}

function resolveProjectId(args, serviceAccount) {
  return (
    args.projectId ||
    serviceAccount?.project_id ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    getDotEnvValue('FIREBASE_PROJECT_ID') ||
    getDotEnvValue('VITE_FIREBASE_PROJECT_ID')
  );
}

function validateServiceAccount(serviceAccount) {
  assert(serviceAccount?.client_email, 'Service account is missing client_email.');
  assert(serviceAccount?.private_key, 'Service account is missing private_key.');
  assert(serviceAccount?.project_id, 'Service account is missing project_id.');
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
  assert(data.access_token, 'OAuth token response did not include an access token.');
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
  throw new Error('Missing token source. Provide a service account, GOOGLE_OAUTH_ACCESS_TOKEN, or --use-gcloud.');
}

function stringValue(value) {
  return { stringValue: String(value || '') };
}

function timestampValue(value = new Date()) {
  return { timestampValue: value.toISOString() };
}

function mapValue(fields) {
  return { mapValue: { fields } };
}

function documentName(projectId, path) {
  return `projects/${projectId}/databases/(default)/documents/${path}`;
}

async function commitWrites({ projectId, accessToken, writes }) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': projectId,
      },
      body: JSON.stringify({ writes }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || response.statusText;
    throw new Error(`Firestore commit failed (${response.status}): ${message}`);
  }
}

function buildWrites({ projectId, uid, tenantId, slug, domain, displayName, role, email }) {
  const now = new Date();
  const membershipId = `${uid}_${tenantId}`;
  return [
    {
      update: {
        name: documentName(projectId, `tenants/${tenantId}`),
        fields: {
          slug: stringValue(slug),
          domain: stringValue(domain),
          displayName: stringValue(displayName),
          status: stringValue('ACTIVE'),
          createdAt: timestampValue(now),
          updatedAt: timestampValue(now),
        },
      },
    },
    {
      update: {
        name: documentName(projectId, `tenantMemberships/${membershipId}`),
        fields: {
          uid: stringValue(uid),
          tenantId: stringValue(tenantId),
          role: stringValue(role),
          status: stringValue('ACTIVE'),
          createdAt: timestampValue(now),
          updatedAt: timestampValue(now),
        },
      },
    },
    {
      update: {
        name: documentName(projectId, `users/${uid}`),
        fields: {
          uid: stringValue(uid),
          ...(email ? { email: stringValue(String(email).trim().toLowerCase()) } : {}),
          memberships: mapValue({
            [tenantId]: mapValue({
              role: stringValue(role),
              status: stringValue('ACTIVE'),
            }),
          }),
          updatedAt: timestampValue(now),
        },
      },
    },
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const uid = String(args.uid || '').trim();
  const tenantId = String(args.tenantId || '').trim();
  assert(uid, 'Missing required --uid value.');
  assert(tenantId, 'Missing required --tenant-id value.');
  assert(/^[a-z0-9_-]+$/iu.test(tenantId), 'Tenant id may only contain letters, numbers, underscores, and dashes.');
  assert(/^[a-z0-9-]+$/iu.test(args.slug), 'Tenant slug may only contain letters, numbers, and dashes.');
  assert(String(args.domain || '').includes('.'), 'Tenant domain must look like a domain name.');

  const serviceAccount = (args.serviceAccountPath || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS)
    ? loadServiceAccount(args.serviceAccountPath)
    : null;
  if (serviceAccount) validateServiceAccount(serviceAccount);

  const projectId = resolveProjectId(args, serviceAccount);
  assert(projectId, 'Missing Firebase project id. Set VITE_FIREBASE_PROJECT_ID in .env or pass --project-id.');

  const plannedPaths = [
    `tenants/${tenantId}`,
    `tenantMemberships/${uid}_${tenantId}`,
    `users/${uid}`,
  ];

  if (args.dryRun) {
    console.log('Tenant seed dry run OK. Planned document paths:');
    plannedPaths.forEach((path) => console.log(`- ${path}`));
    return;
  }

  assert(typeof fetch === 'function', 'This script requires Node.js with global fetch support.');
  const accessToken = await resolveAccessToken(args, serviceAccount);
  await commitWrites({
    projectId,
    accessToken,
    writes: buildWrites({
      projectId,
      uid,
      tenantId,
      slug: args.slug,
      domain: args.domain,
      displayName: args.displayName,
      role: args.role,
      email: args.email,
    }),
  });

  console.log('BP Kallis tenant seed completed.');
  plannedPaths.forEach((path) => console.log(`- ${path}`));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
