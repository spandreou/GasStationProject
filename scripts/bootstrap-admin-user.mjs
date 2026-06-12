import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY_TOOLKIT_SCOPE = 'https://www.googleapis.com/auth/identitytoolkit';
const DEFAULT_PASSWORD_ENV = 'ADMIN_BOOTSTRAP_PASSWORD';

function printUsage() {
  console.log(`Usage:
  npm run admin:bootstrap -- --email admin@your-domain.tld [options]

Options:
  --display-name <name>         Display name for a newly created user.
  --service-account <path>      Service account JSON path. Alternative to GOOGLE_APPLICATION_CREDENTIALS.
  --password-env <name>         Env var that contains a temporary password. Default: ${DEFAULT_PASSWORD_ENV}.
  --dry-run                     Validate arguments without contacting Google APIs.

Security:
  Passwords are read only from an environment variable and are never printed.
  Service account private keys and OAuth tokens are never printed.
`);
}

function parseArgs(argv) {
  const args = {
    displayName: 'Gas Station Admin',
    passwordEnv: DEFAULT_PASSWORD_ENV,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--email') {
      args.email = argv[++index];
    } else if (arg === '--display-name') {
      args.displayName = argv[++index];
    } else if (arg === '--service-account') {
      args.serviceAccountPath = argv[++index];
    } else if (arg === '--password-env') {
      args.passwordEnv = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function loadServiceAccount(pathFromArgs) {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    return JSON.parse(inlineJson);
  }

  const serviceAccountPath = pathFromArgs || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  assert(
    serviceAccountPath,
    'Missing service account. Set FIREBASE_SERVICE_ACCOUNT_JSON, GOOGLE_APPLICATION_CREDENTIALS, or pass --service-account <path>.',
  );
  assert(existsSync(serviceAccountPath), `Service account file was not found: ${serviceAccountPath}`);
  return JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
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
    scope: IDENTITY_TOOLKIT_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claimSet))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key, 'base64url');
  return `${unsignedJwt}.${signature}`;
}

async function postJson(url, body, accessToken) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.error_description || response.statusText;
    throw new Error(`Google API request failed (${response.status}): ${message}`);
  }
  return data;
}

async function getAccessToken(serviceAccount) {
  const assertion = createServiceAccountJwt(serviceAccount);
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
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

function identityToolkitUrl(projectId, method) {
  return `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:${method}`;
}

async function lookupUserByEmail(projectId, email, accessToken) {
  const data = await postJson(
    identityToolkitUrl(projectId, 'lookup'),
    { email: [email], targetProjectId: projectId },
    accessToken,
  );
  return data.users?.[0] || null;
}

async function createUser(projectId, { email, password, displayName }, accessToken) {
  return postJson(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts`,
    {
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false,
      targetProjectId: projectId,
    },
    accessToken,
  );
}

function parseClaims(customAttributes) {
  if (!customAttributes) return {};
  try {
    const parsed = JSON.parse(customAttributes);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function updateUser(projectId, { localId, claims, password }, accessToken) {
  const body = {
    localId,
    customAttributes: JSON.stringify(claims),
    targetProjectId: projectId,
    returnSecureToken: false,
  };

  if (password) {
    body.password = password;
  }

  return postJson(identityToolkitUrl(projectId, 'update'), body, accessToken);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }

  const email = normalizeEmail(args.email);
  assert(email, 'Missing required --email value.');
  assert(email.includes('@'), 'Admin email must look like an email address.');
  assert(args.passwordEnv, 'Password env var name cannot be empty.');

  if (args.dryRun) {
    console.log(`Admin bootstrap dry run OK for ${email}. No Google APIs were called.`);
    return;
  }

  assert(typeof fetch === 'function', 'This script requires Node.js with global fetch support.');
  const serviceAccount = loadServiceAccount(args.serviceAccountPath);
  validateServiceAccount(serviceAccount);
  const projectId = serviceAccount.project_id;

  const temporaryPassword = process.env[args.passwordEnv] || '';
  const accessToken = await getAccessToken(serviceAccount);
  let user = await lookupUserByEmail(projectId, email, accessToken);
  let created = false;

  if (!user) {
    assert(
      temporaryPassword,
      `User does not exist. Set ${args.passwordEnv} to create the user with a temporary password.`,
    );
    const createdUser = await createUser(
      projectId,
      { email, password: temporaryPassword, displayName: args.displayName },
      accessToken,
    );
    user = { localId: createdUser.localId, customAttributes: createdUser.customAttributes };
    created = true;
  }

  const claims = { ...parseClaims(user.customAttributes), admin: true };
  const temporaryCredentialProvided = Boolean(temporaryPassword);
  await updateUser(
    projectId,
    { localId: user.localId, claims, password: temporaryPassword },
    accessToken,
  );

  console.log(`Admin bootstrap completed for ${email}`);
  console.log(`Project: ${projectId}`);
  console.log(`Firebase uid: ${user.localId}`);
  console.log(`User created: ${created ? 'yes' : 'no'}`);
  console.log(`Temporary credential set/updated: ${temporaryCredentialProvided ? 'yes' : 'no'}`);
  console.log('Custom claim admin=true is set. Sign out and sign in again so Firebase refreshes the ID token.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
