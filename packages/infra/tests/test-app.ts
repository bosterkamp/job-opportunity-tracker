import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App, type AppProps } from 'aws-cdk-lib';

const outdirs: string[] = [];

// A CDK App for tests. Each synthesis writes a cloud assembly to disk, so every test app:
// - skips Lambda bundling (unless a test opts in) to stay fast,
// - turns off asset staging, so assets are referenced in place instead of copied (otherwise
//   each synth copies ~22 MB, which filled the CI disk during mutation testing),
// - gets its own output folder, deleted after each test (see setup.ts).
export function testApp(props: AppProps = {}): App {
  const outdir = mkdtempSync(join(tmpdir(), 'jot-cdk-test-'));
  outdirs.push(outdir);
  return new App({
    outdir,
    ...props,
    context: {
      'aws:cdk:bundling-stacks': [],
      'aws:cdk:disable-asset-staging': true,
      ...props.context,
    },
  });
}

export function removeTestAppOutput(): void {
  for (const dir of outdirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}
