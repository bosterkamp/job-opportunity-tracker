// @module-tag infra
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { describe, expect, it } from 'vitest';
import { API_BUNDLING } from '../lib/api-stack.js';
import { buildApp } from '../lib/build-app.js';
import { testApp } from './test-app.js';

describe('API_BUNDLING', () => {
  it('builds a minified ES module with a source map and leaves the AWS SDK to the runtime', () => {
    expect(API_BUNDLING).toEqual({
      format: OutputFormat.ESM,
      minify: true,
      sourceMap: true,
      externalModules: ['@aws-sdk/*'],
    });
  });
});

// Bundles the API Lambda for real with esbuild and checks the output, proving the settings
// above produce a working bundle. CDK can't start esbuild from a worker thread, and
// Stryker's Vitest runner runs tests in worker threads (stryker-js#6236). So this test runs
// in normal `npm test` and CI, and the API_BUNDLING test above covers mutation testing.
const webDistPath = fileURLToPath(new URL('./fixtures/web-dist', import.meta.url));
function bundleLambdas(): { name: string; code: string; size: number; hasMap: boolean }[] {
  // Bundling writes its output as a staged asset, so staging stays on for this test.
  const app = testApp({
    context: { 'aws:cdk:bundling-stacks': ['Jot-Api'], 'aws:cdk:disable-asset-staging': false },
  });
  buildApp(app, { webDistPath });
  const { directory } = app.synth();

  return readdirSync(directory)
    .map((name) => join(directory, name, 'index.mjs'))
    .filter((file) => existsSync(file))
    .map((file) => ({
      name: file,
      code: readFileSync(file, 'utf8'),
      size: statSync(file).size,
      hasMap: existsSync(`${file}.map`),
    }));
}

describe.skipIf(!isMainThread)('Lambda bundles', () => {
  it('are minified ES modules with source maps, small enough to exclude the AWS SDK', () => {
    const bundles = bundleLambdas();

    // The API, "Fill from link" (feature 002), and the MCP server (feature 003).
    expect(bundles).toHaveLength(3);
    for (const bundle of bundles) {
      // ES module output is index.mjs; CommonJS would be index.js.
      expect(existsSync(bundle.name.replace(/\.mjs$/, '.js'))).toBe(false);
      expect(bundle.hasMap).toBe(true);
      // Unminified output averages about 40 characters per line; minified, thousands.
      expect(bundle.code.length / bundle.code.split('\n').length).toBeGreaterThan(1000);
      // The AWS SDK comes from the Lambda runtime. Bundled in, a file would be several megabytes.
      expect(bundle.size).toBeLessThan(1_500_000);
    }
    // The API and the MCP server import the DynamoDB client rather than bundling it; the
    // import function has no table and doesn't use it at all.
    const withTable = bundles.filter((b) => /from\s*"@aws-sdk\/lib-dynamodb"/.test(b.code));
    expect(withTable).toHaveLength(2);
    // The API's own bundle stays small: the MCP SDK and the HTML parser live elsewhere.
    const api = withTable.find((b) => !b.code.includes('oauth-protected-resource'));
    expect(api?.size).toBeLessThan(500_000);
  }, 180_000);
});
