// Test tags: every test is tagged with the functionality it checks, and every source file is
// mapped to the tags whose tests exercise it. A change then runs only the tests for what it
// touched (see "Test tags" in the README). `core` is the common code every feature runs on, so
// a change to it runs everything. CI still runs the full suite on every push to master.
//
//   node scripts/test-tags.mjs affected [--base <ref>] [--all]  which tests a change needs
//   node scripts/test-tags.mjs vitest [--base <ref>] [args...]  run the affected Vitest tests
//   node scripts/test-tags.mjs e2e [--base <ref>] [args...]     run the affected Playwright tests
//   node scripts/test-tags.mjs mutate [--base <ref>]             the files to mutation test
//   node scripts/test-tags.mjs check                             every test is tagged
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, matchesGlob, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** The tags. Vitest reads these (vitest.config.ts) and rejects any tag not listed here. */
export const TAGS = [
  {
    name: 'core',
    description:
      'Common code every feature runs on: shared schemas and stages, the API router and data ' +
      'access, the web shell, auth, the API client, test helpers, and tooling. Runs everything.',
  },
  { name: 'capture', description: 'Adding and viewing an opportunity (US1)' },
  { name: 'pipeline', description: 'Moving through stages, and the stage history (US2)' },
  { name: 'overview', description: 'The stage board, the archive, and filter, sort, search (US3)' },
  { name: 'edit', description: 'Editing, deleting, duplicate warnings, follow-up flags (US4)' },
  { name: 'import', description: 'Filling the add form from a job posting link (feature 002)' },
  { name: 'mcp', description: 'Using the tracker from Claude: the MCP server (feature 003)' },
  { name: 'interview', description: 'Logging interviews and the interview count (feature 005)' },
  {
    name: 'installable',
    description: 'Installing the app on a phone, offline open, and updates (feature 006)',
  },
  { name: 'theme', description: 'The banner and the site colours (feature 008)' },
  {
    name: 'deadline',
    description:
      "The posting's closing date, the card's deadline text, and the Closing soonest sort " +
      '(feature 009)',
  },
  {
    name: 'leads',
    description:
      "Networking leads: the page, their notes, linking opportunities to them, and Claude's " +
      'lead tools (features 010–011)',
  },
  { name: 'infra', description: 'The AWS CDK stacks and the deploy workflow' },
];

const TAG_NAMES = new Set(TAGS.map((tag) => tag.name));
// Features with end-to-end specs. `infra` has none; `core` runs them all.
const E2E_FEATURES = [
  'capture',
  'pipeline',
  'overview',
  'edit',
  'import',
  'mcp',
  'interview',
  'installable',
  'theme',
  'deadline',
  'leads',
];
// Playwright tags that say how or where a test runs, not what it checks.
const PLAYWRIGHT_RUN_TAGS = new Set(['responsive', 'deployed']);

/**
 * The tags whose tests exercise each source file. The first matching pattern wins. Code used
 * by several features (but not all) lists each of them; code every feature runs on is `core`.
 * A new source file that no specific pattern matches falls through to `core`, the safe default.
 */
export const SOURCE_TAGS = [
  // Shared rules
  ['packages/shared/src/transitions.ts', ['pipeline']],
  ['packages/shared/src/duplicates.ts', ['edit']],
  ['packages/shared/src/imports.ts', ['import']],
  ['packages/shared/src/changeSource.ts', ['mcp']],
  ['packages/shared/src/salary.ts', ['capture', 'overview', 'edit', 'import', 'mcp']],
  ['packages/shared/src/dateAdded.ts', ['capture', 'edit', 'mcp', 'interview']],
  ['packages/shared/src/interviews.ts', ['interview', 'overview', 'mcp']],
  ['packages/shared/src/leadNotes.ts', ['leads']],
  // API
  ['packages/api/src/routes/stageChanges.ts', ['pipeline']],
  ['packages/api/src/repo/leadRepo.ts', ['leads']],
  ['packages/api/src/routes/leads.ts', ['leads']],
  ['packages/api/src/import/jobPosting.ts', ['import', 'deadline']],
  ['packages/api/src/import/**', ['import']],
  ['packages/api/src/routes/imports.ts', ['import']],
  ['packages/api/src/importHandler.ts', ['import']],
  ['packages/api/src/routes/interviews.ts', ['interview', 'mcp']],
  ['packages/api/src/mcp/tools.ts', ['mcp', 'deadline', 'leads']],
  ['packages/api/src/mcp/**', ['mcp']],
  ['packages/api/src/mcpHandler.ts', ['mcp']],
  ['packages/api/src/routes/opportunities.ts', ['capture', 'overview', 'edit', 'leads']],
  // Web
  [
    'packages/web/src/components/OpportunityForm*',
    ['capture', 'edit', 'import', 'deadline', 'leads'],
  ],
  ['packages/web/src/components/StarRating*', ['capture', 'overview', 'edit']],
  ['packages/web/src/components/MoveStage*', ['pipeline', 'overview']],
  ['packages/web/src/components/DeleteOpportunity*', ['edit']],
  ['packages/web/src/components/focusTrap.ts', ['pipeline', 'overview', 'edit', 'leads']],
  ['packages/web/src/components/OpportunityCard*', ['overview', 'edit', 'deadline']],
  ['packages/web/src/components/StageBoard*', ['overview']],
  ['packages/web/src/components/ListToolbar*', ['overview']],
  ['packages/web/src/features/overview/**', ['overview', 'deadline']],
  ['packages/web/src/features/import/**', ['import', 'deadline']],
  ['packages/web/src/components/InterviewForm*', ['interview']],
  ['packages/web/src/components/LeadDialog*', ['leads']],
  ['packages/web/src/components/DeleteLead*', ['leads']],
  ['packages/web/src/components/NoteDialog*', ['leads']],
  ['packages/web/src/components/DeleteNote*', ['leads']],
  ['packages/web/src/pages/Leads*', ['leads']],
  ['packages/web/src/sw/**', ['installable']],
  ['packages/web/src/registerServiceWorker.ts', ['installable']],
  ['packages/web/public/**', ['installable']],
  ['packages/web/index.html', ['installable']],
  ['packages/web/src/assets/banner-scene.svg', ['theme']],
  ['packages/web/src/pages/Overview.tsx', ['overview', 'deadline']],
  ['packages/web/src/pages/Archive.tsx', ['overview', 'deadline']],
  ['packages/web/src/pages/NewOpportunity.tsx', ['capture', 'edit', 'import', 'leads']],
  [
    'packages/web/src/pages/OpportunityDetail.tsx',
    ['capture', 'pipeline', 'edit', 'deadline', 'leads'],
  ],
  // Infrastructure: the whole package (its tests, config, and dependencies) and the deploy
  ['packages/infra/**', ['infra']],
  ['.github/workflows/deploy.yml', ['infra']],
  // Common code, catch-alls last
  ['packages/*/src/**', ['core']],
  ['packages/api/scripts/**', ['core']],
];

// Changes that no test checks: documentation, editor settings, and the secret scan.
const UNTESTED = [
  '**/*.md',
  'specs/**',
  '.specify/**',
  '.claude/**',
  '.vscode/**',
  '.github/ISSUE_TEMPLATE/**',
  // The daily secret scan runs on its own schedule; no test checks it.
  '.github/workflows/secret-scan.yml',
  // Renders the app icons by hand when they change; the manifest test checks its output.
  'scripts/make-icons.mjs',
  'LICENSE',
];

// Changes that can't change a mutation result: end-to-end setup (only Playwright reads it),
// styles (unit tests don't depend on them), and this file's tag lists.
const MUTATION_NEUTRAL = ['e2e/**', 'playwright.config.ts', '**/*.css', 'scripts/test-tags.mjs'];

const isVitestFile = (file) => /^packages\/[^/]+\/tests\/.*\.test\.tsx?$/.test(file);
const isPlaywrightFile = (file) => /^e2e\/.*\.spec\.ts$/.test(file);
const matches = (file, patterns) => patterns.some((pattern) => matchesGlob(file, pattern));

/** The tags a test file declares: Vitest `@module-tag` and `tags:`, Playwright `tag:`. */
export function declaredTags(source) {
  const tags = new Set();
  for (const [, tag] of source.matchAll(/(?:\/\/|\*)\s*@module-tag\s+([\w-]+)/g)) {
    tags.add(tag);
  }
  for (const [, list] of source.matchAll(/\btags?:\s*(\[[^\]]*\]|'[^']*')/g)) {
    for (const [, tag] of list.matchAll(/'@?([\w-]+)'/g)) {
      tags.add(tag);
    }
  }
  return [...tags];
}

const featureTagsIn = (file) =>
  declaredTags(readFileSync(join(repoRoot, file), 'utf8')).filter(
    (tag) => !PLAYWRIGHT_RUN_TAGS.has(tag),
  );

/** The tags a changed file needs run. An empty list means no test covers it. */
export function tagsForFile(file, read = featureTagsIn) {
  if (isVitestFile(file) || isPlaywrightFile(file)) {
    // A deleted test leaves nothing to run.
    return existsSync(join(repoRoot, file)) ? read(file) : [];
  }
  const source = SOURCE_TAGS.find(([pattern]) => matchesGlob(file, pattern));
  if (source) {
    return source[1];
  }
  if (matches(file, UNTESTED)) {
    return [];
  }
  // Anything else (dependencies, tool config, CI, test helpers) can affect every test.
  return ['core'];
}

/** What to run for a set of changed files. */
export function selectTests(files, read = featureTagsIn) {
  const tags = new Set(files.flatMap((file) => tagsForFile(file, read)));
  if (tags.has('core')) {
    return {
      all: true,
      tags: ['core'],
      unit: true,
      e2e: true,
      vitestFilter: '',
      playwrightGrep: '',
    };
  }
  const sorted = TAGS.map((tag) => tag.name).filter((name) => tags.has(name));
  const e2eTags = sorted.filter((tag) => E2E_FEATURES.includes(tag));
  return {
    all: false,
    tags: sorted,
    unit: sorted.length > 0,
    e2e: e2eTags.length > 0,
    vitestFilter: sorted.join(' || '),
    playwrightGrep: e2eTags.map((tag) => `@${tag}`).join('|'),
  };
}

// The files Stryker mutates (stryker.config.json), so a pull request's targets are a subset of
// what a full run covers.
function strykerGlobs() {
  const { mutate } = JSON.parse(readFileSync(join(repoRoot, 'stryker.config.json'), 'utf8'));
  return {
    include: mutate.filter((glob) => !glob.startsWith('!')),
    exclude: mutate.filter((glob) => glob.startsWith('!')).map((glob) => glob.slice(1)),
  };
}

const isMutated = (file, globs) => matches(file, globs.include) && !matches(file, globs.exclude);

/**
 * The source files a pull request's mutation run covers: the mutated files it changed, and the
 * files whose tests it changed (a changed test re-checks every file sharing one of its tags).
 * `null` means every file, for a change that could affect any test: dependencies, tool
 * configuration, test helpers, or a deleted test (whose tags are gone with it). Every push to
 * master still covers every mutant, so a gap here is caught before anything deploys.
 */
export function mutationTargets(files, read = featureTagsIn, sources = undefined) {
  const globs = strykerGlobs();
  const mutated = sources ?? [...walk('packages')].filter((file) => isMutated(file, globs)).sort();
  const targets = new Set();
  const addTagged = (tags) => {
    for (const source of mutated) {
      if (tagsForFile(source, read).some((tag) => tags.includes(tag))) {
        targets.add(source);
      }
    }
  };
  for (const file of files) {
    if (isMutated(file, globs)) {
      // A deleted source file has nothing left to mutate.
      if (existsSync(join(repoRoot, file))) {
        targets.add(file);
      }
    } else if (isVitestFile(file)) {
      if (!existsSync(join(repoRoot, file))) {
        return null;
      }
      addTagged(read(file));
    } else if (!matches(file, MUTATION_NEUTRAL)) {
      // Anything else (dependencies, tool configuration, test helpers) might change a unit test.
      const tags = tagsForFile(file, read);
      if (tags.includes('core')) {
        return null;
      }
      addTagged(tags);
    }
  }
  return [...targets].sort();
}

const git = (...args) =>
  execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

/** Files changed since `base` (default: where this branch left origin/master), plus local edits. */
export function changedFiles(base) {
  const from = base ?? git('merge-base', 'origin/master', 'HEAD')[0];
  return [
    ...new Set([
      ...git('diff', '--name-only', from, 'HEAD'),
      ...git('diff', '--name-only', 'HEAD'),
      ...git('ls-files', '--others', '--exclude-standard'),
    ]),
  ];
}

function walk(dir) {
  return readdirSync(join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      return [];
    }
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** Problems with the tagging: untagged tests, unknown tags, or patterns that match nothing. */
export function findProblems() {
  const problems = [];
  const files = [...walk('packages'), ...walk('e2e')];
  for (const file of files.filter(isVitestFile)) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const hasModuleTag = /(?:\/\/|\*)\s*@module-tag\s+/.test(source);
    // Without a file-level tag, every top-level describe or test must carry its own tags.
    const untagged = source
      .split('\n')
      .filter((line) => /^(describe|it|test)\b[^(]*\(/.test(line) && !/\btags:/.test(line));
    if (!hasModuleTag && (untagged.length > 0 || declaredTags(source).length === 0)) {
      problems.push(`${file}: add "// @module-tag <tag>", or tags on every top-level block`);
    }
  }
  for (const file of files.filter(isPlaywrightFile)) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    // Each spec is one top-level test.describe tagged with its feature.
    if (/^test\(/m.test(source) || featureTagsIn(file).length === 0) {
      problems.push(`${file}: wrap the tests in test.describe(..., { tag: '@<feature>' })`);
    }
  }
  for (const file of [...files.filter(isVitestFile), ...files.filter(isPlaywrightFile)]) {
    for (const tag of featureTagsIn(file)) {
      if (!TAG_NAMES.has(tag)) {
        problems.push(`${file}: unknown tag "${tag}" (tags are listed in scripts/test-tags.mjs)`);
      }
    }
  }
  const all = [...files, ...git('ls-files', '.github')];
  for (const [pattern, tags] of SOURCE_TAGS) {
    if (!all.some((file) => matchesGlob(file, pattern))) {
      problems.push(`scripts/test-tags.mjs: "${pattern}" matches no file (renamed or deleted?)`);
    }
    for (const tag of tags.filter((tag) => !TAG_NAMES.has(tag))) {
      problems.push(`scripts/test-tags.mjs: "${pattern}" has unknown tag "${tag}"`);
    }
  }
  return problems;
}

function parseArgs(argv) {
  const rest = [];
  let base;
  let all = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') {
      base = argv[++i];
    } else if (argv[i] === '--all') {
      all = true;
    } else {
      rest.push(argv[i]);
    }
  }
  return { base, all, rest };
}

function describe(selection) {
  if (selection.all) {
    return 'Common code changed: running every test.';
  }
  if (!selection.unit) {
    return 'No tested code changed: nothing to run.';
  }
  return `Running the tests tagged: ${selection.tags.join(', ')}.`;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  process.exit(result.status ?? 1);
}

function main([command, ...argv]) {
  const { base, all, rest } = parseArgs(argv);
  const select = () =>
    all
      ? { all: true, tags: ['core'], unit: true, e2e: true, vitestFilter: '', playwrightGrep: '' }
      : selectTests(changedFiles(base));
  const targets = () => (all ? null : mutationTargets(changedFiles(base)));
  const describeTargets = (files) =>
    files === null
      ? 'Mutation testing: every mutant.'
      : `Mutation testing: ${files.length} file(s)${files.length ? `: ${files.join(', ')}` : '.'}`;
  switch (command) {
    case 'affected': {
      const selection = select();
      const mutate = targets();
      console.log(describe(selection));
      console.log(describeTargets(mutate));
      if (process.env.GITHUB_OUTPUT) {
        const outputs = {
          all: selection.all,
          unit: selection.unit,
          e2e: selection.e2e,
          tags: selection.tags.join(', '),
          vitest_filter: selection.vitestFilter,
          playwright_grep: selection.playwrightGrep,
          mutate_all: mutate === null,
          mutate: (mutate ?? []).join(','),
        };
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          Object.entries(outputs)
            .map(([key, value]) => `${key}=${String(value)}\n`)
            .join(''),
        );
      }
      return;
    }
    case 'vitest': {
      const selection = select();
      console.log(describe(selection));
      if (!selection.unit) {
        return;
      }
      const filter = selection.all ? [] : ['--tags-filter', selection.vitestFilter];
      return run('npx', ['vitest', 'run', ...filter, ...rest]);
    }
    case 'e2e': {
      const selection = select();
      console.log(describe(selection));
      if (!selection.e2e) {
        return;
      }
      const grep = selection.all
        ? []
        : ['--grep', selection.playwrightGrep, '--pass-with-no-tests'];
      return run('npx', ['playwright', 'test', '--grep-invert', '@deployed', ...grep, ...rest]);
    }
    case 'mutate': {
      console.log(describeTargets(targets()));
      return;
    }
    case 'check': {
      const problems = findProblems();
      for (const problem of problems) {
        console.error(problem);
      }
      if (problems.length > 0) {
        process.exit(1);
      }
      console.log('Every test is tagged.');
      return;
    }
    default:
      console.error(
        'Usage: node scripts/test-tags.mjs affected|vitest|e2e|mutate|check [--base <ref>]',
      );
      process.exit(2);
  }
}

if (relative(process.argv[1] ?? '', fileURLToPath(import.meta.url)) === '') {
  main(process.argv.slice(2));
}
