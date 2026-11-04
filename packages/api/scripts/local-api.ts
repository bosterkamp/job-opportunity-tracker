// Thin entry point for `npm run dev`: serves the Lambda handler on http://localhost:3001.
// Playwright starts a separate copy with its own table and ports (see playwright.config.ts).
import './local-env.js';
import { loadConfig, loadImportConfig } from '../src/config.js';
import { createHandler } from '../src/handler.js';
import { createImportHandler } from '../src/importHandler.js';
import { createLocalServer } from '../src/local/server.js';
import { deleteAllItems } from '../src/local/reset.js';
import { createDocumentClient } from '../src/repo/client.js';

const PORT = Number(process.env.PORT ?? 3001);
const config = loadConfig();
const client = createDocumentClient(config);
// Only Playwright turns this on, so your own local data can never be wiped by the reset route.
const allowReset = process.env.ALLOW_TEST_RESET === 'true';
// In AWS, API Gateway sends /imports to its own function; locally one server serves both.
const api = createHandler(config);
// Playwright seeds changes "made through Claude" with this header (feature 003). Only the
// e2e copy, which allows the test reset, honors it; it never exists in AWS.
const viaClaude = allowReset ? createHandler(config, { via: 'CLAUDE' }) : api;
const imports = createImportHandler(loadImportConfig());

createLocalServer({
  handler: (event) =>
    event.rawPath === '/imports'
      ? imports(event)
      : event.headers['x-test-via'] === 'CLAUDE'
        ? viaClaude(event)
        : api(event),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  reset: allowReset
    ? async () => {
        await deleteAllItems(client, config.tableName);
      }
    : undefined,
}).listen(PORT, () => {
  console.log(
    `Local API on http://localhost:${PORT} (table ${config.tableName}${allowReset ? ', test reset enabled' : ''})`,
  );
});
