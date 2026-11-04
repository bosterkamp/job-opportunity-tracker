// @module-tag import
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { IMPORT_MESSAGES } from '@jot/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createImportHandler, handler } from '../../src/importHandler.js';
import { apiEvent } from '../unit/event.js';

// Serves the fixture postings by name, and a few special paths, on a local port.
async function postingSite() {
  const server = createServer((req, res) => {
    const path = req.url ?? '/';
    if (path === '/forbidden') {
      res.writeHead(403, { 'content-type': 'text/html' });
      res.end('no');
    } else if (path === '/gone') {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('gone');
    } else {
      const name = path.slice(1);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(readFileSync(new URL(`../fixtures/postings/${name}`, import.meta.url)));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (path: string) => `http://127.0.0.1:${port}/${path}`,
    allowHosts: [`127.0.0.1:${port}`],
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const post = (body: unknown) => apiEvent('POST', '/imports', { body });
const parse = (result: { body?: string }) => JSON.parse(result.body ?? '') as unknown;

describe('POST /imports', () => {
  it('returns the posting details and stores nothing', async () => {
    const site = await postingSite();
    try {
      const handle = createImportHandler(
        { appEnv: 'local', allowHosts: site.allowHosts },
        {
          log: () => undefined,
        },
      );

      const result = await handle(post({ url: site.url('ashby.html') }));

      expect(result.statusCode).toBe(200);
      expect(parse(result)).toEqual({
        company: 'Globex',
        title: 'Engineering Manager, Payments',
        description: 'Lead the payments team.',
        location: 'European Union',
        workArrangement: 'REMOTE',
        salaryMin: 110_000,
        salaryMax: 185_000,
        compensation: '€110,000–€185,000 a year',
        source: '127.0.0.1',
      });
    } finally {
      await site.close();
    }
  });

  it.each([
    ['no link', {}],
    ['not a link', { url: 'jobs at acme' }],
    ['an ftp link', { url: 'ftp://example.com/job' }],
  ])('rejects %s as a validation error', async (_label, body) => {
    const handle = createImportHandler({ appEnv: 'local', allowHosts: [] });

    const result = await handle(post(body));

    expect(result.statusCode).toBe(400);
    expect(parse(result)).toMatchObject({ code: 'VALIDATION_ERROR', fields: ['url'] });
  });

  it.each([
    ['no-job.html', 'NO_JOB_DETAILS'],
    ['several.html', 'MULTIPLE_JOBS'],
    ['forbidden', 'SIGN_IN_REQUIRED'],
    ['gone', 'UNREACHABLE'],
  ] as const)('answers %s with 422 %s and its message', async (path, code) => {
    const site = await postingSite();
    try {
      const handle = createImportHandler(
        { appEnv: 'local', allowHosts: site.allowHosts },
        { log: () => undefined },
      );

      const result = await handle(post({ url: site.url(path) }));

      expect(result.statusCode).toBe(422);
      expect(parse(result)).toEqual({ code, message: IMPORT_MESSAGES[code] });
    } finally {
      await site.close();
    }
  });

  it('refuses a local address under the AWS configuration', async () => {
    const site = await postingSite();
    try {
      const handle = createImportHandler(
        { appEnv: 'aws', allowHosts: [] },
        { log: () => undefined },
      );

      const result = await handle({ ...post({ url: site.url('lever.html') }) });

      expect(result.statusCode).toBe(422);
      expect(parse(result)).toEqual({
        code: 'URL_NOT_ALLOWED',
        message: IMPORT_MESSAGES.URL_NOT_ALLOWED,
      });
    } finally {
      await site.close();
    }
  });

  it('answers LinkedIn links without fetching them', async () => {
    const handle = createImportHandler({ appEnv: 'aws', allowHosts: [] }, { log: () => undefined });

    const result = await handle(post({ url: 'https://www.linkedin.com/jobs/view/1' }));

    expect(parse(result)).toEqual({
      code: 'SIGN_IN_REQUIRED',
      message: IMPORT_MESSAGES.SIGN_IN_REQUIRED,
    });
  });

  it('requires a signed-in user in AWS', async () => {
    const handle = createImportHandler({ appEnv: 'aws', allowHosts: [] });

    const result = await handle(
      apiEvent('POST', '/imports', { body: { url: 'https://a.example' }, sub: null }),
    );

    expect(result.statusCode).toBe(401);
  });

  it('serves only POST /imports', async () => {
    const handle = createImportHandler({ appEnv: 'local', allowHosts: [] });

    expect((await handle(apiEvent('GET', '/imports'))).statusCode).toBe(404);
    expect((await handle(apiEvent('GET', '/opportunities'))).statusCode).toBe(404);
  });

  it('passes an unexpected failure on as a server error', async () => {
    const handle = createImportHandler(
      { appEnv: 'local', allowHosts: [] },
      { log: () => undefined, fetchPage: () => Promise.reject(new Error('boom')) },
    );

    const result = await handle(post({ url: 'https://a.example/job' }));

    expect(result.statusCode).toBe(500);
  });
});

describe('the import Lambda entry point', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads its configuration from the environment and serves only POST /imports', async () => {
    vi.stubEnv('APP_ENV', 'local');

    const result = await handler(post({}));

    expect(result.statusCode).toBe(400);
    expect((await handler(apiEvent('GET', '/health'))).statusCode).toBe(404);
  });
});
