// Bundles the Lambda handler. CDK's NodejsFunction does its own bundling at deploy time;
// this build checks that the handler bundles cleanly on every CI run.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/handler.ts'],
  outfile: 'dist/handler.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external: ['@aws-sdk/*'],
  logLevel: 'info',
});
