// @module-tag import
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  ImportFailure,
  type FetchedPage,
  type FetchOptions,
} from '../../../src/import/fetchPage.js';
import {
  defaultImportDeps,
  importPosting,
  type ImportDeps,
} from '../../../src/import/importPosting.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/postings/${name}`, import.meta.url), 'utf8');

// A fake fetch that answers every request with `page` and records what was asked.
function deps(page: Partial<FetchedPage> | Error, allowHosts: string[] = []) {
  const calls: [string, FetchOptions][] = [];
  const log = vi.fn();
  const value: ImportDeps = {
    allowHosts,
    log,
    fetchPage: (link, options) => {
      calls.push([link, options]);
      if (page instanceof Error) {
        return Promise.reject(page);
      }
      return Promise.resolve({ status: 200, finalUrl: link, body: '', ...page });
    },
  };
  return { deps: value, calls, log };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ImportFailure);
    return (error as ImportFailure).code;
  }
  throw new Error('Expected the import to fail');
}

describe('importPosting', () => {
  it('reads a page with a JobPosting, naming the site it finally landed on', async () => {
    const { deps: d, calls } = deps({
      body: fixture('lever.html'),
      finalUrl: 'https://jobs.lever.co/acme/123',
    });

    const details = await importPosting('https://short.example/abc', d);

    expect(details).toMatchObject({
      company: 'Acme Rockets',
      title: 'Senior Platform Engineer',
      source: 'Lever',
    });
    expect(calls).toEqual([['https://short.example/abc', { accept: 'html', allowHosts: [] }]]);
  });

  it('reads a Greenhouse link through the public API, as JSON', async () => {
    const { deps: d, calls } = deps({ body: fixture('greenhouse.json') });

    const details = await importPosting('https://job-boards.greenhouse.io/soylent/jobs/4001', d);

    expect(details).toMatchObject({ company: 'Soylent', source: 'Greenhouse' });
    expect(calls).toEqual([
      [
        'https://boards-api.greenhouse.io/v1/boards/soylent/jobs/4001?pay_transparency=true',
        { accept: 'json', allowHosts: [] },
      ],
    ]);
  });

  it('passes the allowed hosts to the fetch', async () => {
    const { deps: d, calls } = deps({ body: fixture('lever.html') }, ['localhost:5175']);

    await importPosting('http://localhost:5175/lever.html', d);

    expect(calls[0]?.[1].allowHosts).toEqual(['localhost:5175']);
  });

  it('logs only the host and the outcome', async () => {
    const found = deps({ body: fixture('lever.html') });
    await importPosting('https://jobs.lever.co/acme/123?utm=secret', found.deps);
    expect(found.log.mock.calls).toEqual([[{ host: 'jobs.lever.co', outcome: 'FOUND' }]]);

    const failed = deps({ body: fixture('no-job.html') });
    await failure(importPosting('https://acme.example/about?x=1', failed.deps));
    expect(failed.log.mock.calls).toEqual([[{ host: 'acme.example', outcome: 'NO_JOB_DETAILS' }]]);
  });

  it('logs and rethrows an unexpected error without a code', async () => {
    const boom = new Error('boom');
    const { deps: d, log } = deps(boom);

    await expect(importPosting('https://a.example/job', d)).rejects.toBe(boom);
    expect(log.mock.calls).toEqual([[{ host: 'a.example', outcome: 'ERROR' }]]);
  });

  it('logs as JSON to the console by default', () => {
    const write = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    defaultImportDeps.log({ host: 'a.example', outcome: 'FOUND' });

    expect(write).toHaveBeenCalledWith(
      JSON.stringify({ level: 'info', event: 'import', host: 'a.example', outcome: 'FOUND' }),
    );
    expect(defaultImportDeps.allowHosts).toEqual([]);
    write.mockRestore();
  });

  describe('when the posting cannot be read', () => {
    it('refuses LinkedIn without fetching it', async () => {
      const { deps: d, calls } = deps({ body: fixture('lever.html') });

      expect(await failure(importPosting('https://www.linkedin.com/jobs/view/123', d))).toBe(
        'SIGN_IN_REQUIRED',
      );
      expect(calls).toEqual([]);
    });

    it.each([401, 403, 407, 429, 999])('reads HTTP %i as needing a sign-in', async (status) => {
      expect(await failure(importPosting('https://a.example/job', deps({ status }).deps))).toBe(
        'SIGN_IN_REQUIRED',
      );
    });

    it.each(['/login', '/users/sign-in', '/signin?next=x', '/authwall', '/account/Log-In'])(
      'reads landing on %s as needing a sign-in',
      async (path) => {
        const { deps: d } = deps({
          body: fixture('lever.html'),
          finalUrl: `https://a.example${path}`,
        });

        expect(await failure(importPosting('https://a.example/job', d))).toBe('SIGN_IN_REQUIRED');
      },
    );

    it('does not read "login" in the query or the host as a sign-in page', async () => {
      const { deps: d } = deps({
        body: fixture('lever.html'),
        finalUrl: 'https://login.example/jobs/1?from=login',
      });

      expect((await importPosting('https://login.example/jobs/1', d)).title).toBe(
        'Senior Platform Engineer',
      );
    });

    it.each([404, 410, 500, 503, 300, 302, 199])('reads HTTP %i as unreachable', async (status) => {
      expect(await failure(importPosting('https://a.example/job', deps({ status }).deps))).toBe(
        'UNREACHABLE',
      );
    });

    it('accepts any 2xx status', async () => {
      const { deps: d } = deps({ status: 299, body: fixture('lever.html') });

      expect((await importPosting('https://a.example/job', d)).title).toBe(
        'Senior Platform Engineer',
      );
    });

    it.each(['UNREACHABLE', 'URL_NOT_ALLOWED'] as const)(
      'passes a %s fetch failure through',
      async (code) => {
        expect(
          await failure(importPosting('https://a.example/job', deps(new ImportFailure(code)).deps)),
        ).toBe(code);
      },
    );

    it.each([
      ['no JobPosting', fixture('no-job.html')],
      [
        'a JobPosting without a title',
        '<script type="application/ld+json">{"@type":"JobPosting"}</script>',
      ],
    ])('reports %s as no job details', async (_label, body) => {
      expect(await failure(importPosting('https://a.example/job', deps({ body }).deps))).toBe(
        'NO_JOB_DETAILS',
      );
    });

    it('reports a page with several JobPostings', async () => {
      const { deps: d } = deps({ body: fixture('several.html') });

      expect(await failure(importPosting('https://a.example/jobs', d))).toBe('MULTIPLE_JOBS');
    });

    it('reports a Greenhouse answer that is not JSON as unreachable', async () => {
      expect(
        await failure(
          importPosting('https://boards.greenhouse.io/soylent/jobs/1', deps({ body: 'oops' }).deps),
        ),
      ).toBe('UNREACHABLE');
    });

    it('reports a Greenhouse answer without a title as no job details', async () => {
      expect(
        await failure(
          importPosting(
            'https://boards.greenhouse.io/soylent/jobs/1',
            deps({ body: '{"id": 1}' }).deps,
          ),
        ),
      ).toBe('NO_JOB_DETAILS');
    });
  });
});
