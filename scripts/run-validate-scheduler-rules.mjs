import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runnerPath = fileURLToPath(import.meta.url);
const scriptsDirectory = dirname(runnerPath);
const repositoryRoot = resolve(scriptsDirectory, '..');
const validatorPath = resolve(scriptsDirectory, 'validate-scheduler-rules.mjs');

function assertRepositoryWorkingDirectory() {
  if (relative(repositoryRoot, resolve(process.cwd())) !== '') {
    throw new Error('Scheduler QA must run from the repository root');
  }
}

export async function runSchedulerValidation(buildValidator = build) {
  assertRepositoryWorkingDirectory();

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'shiftoryx-scheduler-qa-'));
  const bundlePath = join(temporaryDirectory, 'validate-scheduler-rules.mjs');

  try {
    await buildValidator({
      entryPoints: [validatorPath],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      outfile: bundlePath,
      logLevel: 'silent',
    });

    await import(pathToFileURL(bundlePath).href);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const isDirectExecution =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  await runSchedulerValidation();
}
