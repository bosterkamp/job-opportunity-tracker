// Makes sure DynamoDB Local is answering on http://localhost:8000, starting it with
// docker compose if needed. Used by `npm run dev`, integration tests, and CI.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ENDPOINT = process.env.DYNAMO_ENDPOINT ?? 'http://localhost:8000';
const TIMEOUT_MS = 30_000;
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

async function isUp() {
  try {
    // DynamoDB Local answers a plain GET with an error status, which still means it's up.
    await fetch(ENDPOINT, { signal: AbortSignal.timeout(1_000) });
    return true;
  } catch {
    return false;
  }
}

export async function ensureDynamoDbLocal() {
  if (await isUp()) {
    return;
  }

  console.log(`DynamoDB Local isn't running at ${ENDPOINT}; starting it with docker compose...`);
  const result = spawnSync('docker', ['compose', 'up', '-d', 'dynamodb-local'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      'Could not start DynamoDB Local. Is Docker Desktop running? ' +
        `(docker compose exited with ${result.error?.message ?? result.status})`,
    );
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isUp()) {
      console.log('DynamoDB Local is ready.');
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`DynamoDB Local did not respond at ${ENDPOINT} within ${TIMEOUT_MS / 1000}s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureDynamoDbLocal().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
