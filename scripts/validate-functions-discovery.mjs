import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const functionsEntry = resolve(rootDir, 'functions', 'src', 'index.js');
const functionsEntryUrl = pathToFileURL(functionsEntry).href;

const DISCOVERY_MAX_ALLOWED_DURATION_MS = 10000;
const EXPECTED_EXPORTS = ['cleanupAuthTickets', 'createAuthTicket', 'exchangeAuthTicket'];

async function runDiscoveryValidation() {
  const startTime = Date.now();

  const childCode = `
    const startTime = Date.now();
    import('${functionsEntryUrl}').then((mod) => {
      const exportsFound = Object.keys(mod).sort();
      const duration = Date.now() - startTime;
      process.stdout.write(JSON.stringify({
        success: true,
        exports: exportsFound,
        durationMs: duration
      }));
      process.exit(0);
    }).catch((err) => {
      process.stderr.write(JSON.stringify({
        success: false,
        error: err.message,
        stack: err.stack
      }));
      process.exit(1);
    });
  `;

  const cleanEnv = { ...process.env };
  delete cleanEnv.GOOGLE_APPLICATION_CREDENTIALS;
  delete cleanEnv.GCLOUD_PROJECT;
  delete cleanEnv.FIREBASE_CONFIG;
  delete cleanEnv.FIRESTORE_EMULATOR_HOST;
  delete cleanEnv.FIREBASE_AUTH_EMULATOR_HOST;
  delete cleanEnv.PUBSUB_EMULATOR_HOST;
  delete cleanEnv.EVENTARC_EMULATOR_HOST;
  delete cleanEnv.CLOUD_TASKS_EMULATOR_HOST;
  cleanEnv.NODE_ENV = 'production';

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', childCode], {
      cwd: rootDir,
      env: cleanEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: DISCOVERY_MAX_ALLOWED_DURATION_MS,
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('error', (err) => {
      rejectPromise(new Error(`Child process spawn error: ${err.message}`));
    });

    child.on('close', (code, signal) => {
      const totalDuration = Date.now() - startTime;

      if (signal === 'SIGTERM' || totalDuration >= DISCOVERY_MAX_ALLOWED_DURATION_MS) {
        return rejectPromise(
          new Error(
            `Functions discovery timed out after ${totalDuration}ms (threshold: ${DISCOVERY_MAX_ALLOWED_DURATION_MS}ms). Possible hanging initialization.`
          )
        );
      }

      if (code !== 0) {
        return rejectPromise(
          new Error(`Discovery failed with code ${code}. Stderr: ${stderrData || stdoutData}`)
        );
      }

      try {
        const result = JSON.parse(stdoutData);
        if (!result.success) {
          return rejectPromise(new Error(`Discovery returned failure: ${result.error}`));
        }

        const sortedFound = [...result.exports].sort();
        const sortedExpected = [...EXPECTED_EXPORTS].sort();

        if (JSON.stringify(sortedFound) !== JSON.stringify(sortedExpected)) {
          return rejectPromise(
            new Error(
              `Export mismatch. Expected: ${JSON.stringify(sortedExpected)}, got: ${JSON.stringify(sortedFound)}`
            )
          );
        }

        resolvePromise({
          durationMs: result.durationMs,
          totalDurationMs: totalDuration,
          exports: sortedFound,
        });
      } catch (err) {
        rejectPromise(new Error(`Failed to parse discovery output: ${stdoutData} (error: ${err.message})`));
      }
    });
  });
}

runDiscoveryValidation()
  .then((res) => {
    console.log(
      `Functions deployment discovery validation PASSED in ${res.durationMs}ms (total child time: ${res.totalDurationMs}ms)`
    );
    console.log(`Exports verified: ${res.exports.join(', ')}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`Functions deployment discovery validation FAILED: ${err.message}`);
    process.exit(1);
  });
