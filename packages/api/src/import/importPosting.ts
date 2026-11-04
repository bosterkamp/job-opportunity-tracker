import { PostingDetailsSchema, type PostingDetails } from '@jot/shared';
import { fetchPage as defaultFetchPage, ImportFailure } from './fetchPage.js';
import { siteName } from './format.js';
import { greenhouseApiUrl, mapGreenhouse } from './greenhouse.js';
import { extractJobPostings, mapJobPosting } from './jobPosting.js';

// Reads one posting link into the form's details, or fails with the reason (research.md §4).

export interface ImportDeps {
  fetchPage: typeof defaultFetchPage;
  allowHosts: readonly string[];
  // Records only the host and the outcome, never the page or the full link (spec FR-017).
  log: (entry: { host: string; outcome: string }) => void;
}

export const defaultImportDeps: ImportDeps = {
  fetchPage: defaultFetchPage,
  allowHosts: [],
  log: (entry) => console.log(JSON.stringify({ level: 'info', event: 'import', ...entry })),
};

// Statuses sites use to turn away visitors who aren't signed in, or automated readers.
// LinkedIn answers 999.
const SIGN_IN_STATUSES = new Set([401, 403, 407, 429, 999]);
const SIGN_IN_PATH = /(log-?in|sign-?in|authwall)/i;

function fromPage(html: string, pageUrl: string): PostingDetails | undefined {
  const postings = extractJobPostings(html);
  if (postings.length > 1) {
    throw new ImportFailure('MULTIPLE_JOBS');
  }
  const [posting] = postings;
  return posting && mapJobPosting(posting, pageUrl);
}

// Greenhouse's API answers JSON; anything else means it didn't really answer.
function fromJson(body: string): PostingDetails | undefined {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new ImportFailure('UNREACHABLE');
  }
  return mapGreenhouse(json);
}

async function read(link: string, { fetchPage, allowHosts }: ImportDeps): Promise<PostingDetails> {
  // LinkedIn only shows postings to signed-in members, so don't try.
  if (siteName(link) === 'LinkedIn') {
    throw new ImportFailure('SIGN_IN_REQUIRED');
  }
  const api = greenhouseApiUrl(link);
  const page = await fetchPage(api ?? link, { accept: api ? 'json' : 'html', allowHosts });
  if (SIGN_IN_STATUSES.has(page.status) || SIGN_IN_PATH.test(new URL(page.finalUrl).pathname)) {
    throw new ImportFailure('SIGN_IN_REQUIRED');
  }
  if (page.status < 200 || page.status >= 300) {
    throw new ImportFailure('UNREACHABLE');
  }
  const details = api ? fromJson(page.body) : fromPage(page.body, page.finalUrl);
  if (!details) {
    throw new ImportFailure('NO_JOB_DETAILS');
  }
  return PostingDetailsSchema.parse(details);
}

export async function importPosting(
  link: string,
  deps: ImportDeps = defaultImportDeps,
): Promise<PostingDetails> {
  const host = new URL(link).hostname;
  try {
    const details = await read(link, deps);
    deps.log({ host, outcome: 'FOUND' });
    return details;
  } catch (error) {
    deps.log({ host, outcome: error instanceof ImportFailure ? error.code : 'ERROR' });
    throw error;
  }
}
