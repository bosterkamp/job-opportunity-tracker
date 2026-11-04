// @module-tag import
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { LookupAddress } from 'node:dns';
import {
  createGuardedLookup,
  fetchPage,
  ImportFailure,
  MAX_REDIRECTS,
} from '../../src/import/fetchPage.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

// A local server for one test. `allowHosts` lets the fetcher reach it despite the address guard.
async function serve(handler: Handler) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    allowHosts: [`127.0.0.1:${port}`],
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const html = (res: ServerResponse, body: string | Buffer, headers: Record<string, string> = {}) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
};

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ImportFailure);
    return (error as ImportFailure).code;
  }
  throw new Error('Expected the fetch to fail');
}

describe('fetchPage', () => {
  it('returns the page, its status, and where it was found', async () => {
    const seen: IncomingMessage['headers'][] = [];
    const server = await serve((req, res) => {
      seen.push(req.headers);
      html(res, '<h1>Engineer – café</h1>');
    });
    try {
      const page = await fetchPage(`${server.url}/jobs/1?ref=x`, {
        accept: 'html',
        allowHosts: server.allowHosts,
      });

      expect(page).toEqual({
        status: 200,
        finalUrl: `${server.url}/jobs/1?ref=x`,
        body: '<h1>Engineer – café</h1>',
      });
      expect(seen[0]).toMatchObject({
        'user-agent':
          'JobOpportunityTracker/1.0 (personal job tracker; reads one posting on request)',
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'accept-language': 'en',
        'accept-encoding': 'gzip, deflate, br',
      });
    } finally {
      await server.close();
    }
  });

  it.each([
    ['application/xhtml+xml', 'html'],
    ['TEXT/HTML', 'html'],
    ['application/json; charset=utf-8', 'json'],
    ['application/ld+json', 'json'],
  ] as const)('accepts %s when asking for %s', async (contentType, accept) => {
    const seen: (string | undefined)[] = [];
    const server = await serve((req, res) => {
      seen.push(req.headers.accept);
      res.writeHead(200, { 'content-type': contentType });
      res.end('ok');
    });
    try {
      const page = await fetchPage(server.url, { accept, allowHosts: server.allowHosts });

      expect(page.body).toBe('ok');
      if (accept === 'json') {
        expect(seen).toEqual(['application/json']);
      }
    } finally {
      await server.close();
    }
  });

  it.each([
    ['text/plain', 'html'],
    ['application/pdf', 'html'],
    ['', 'html'],
    ['text/html', 'json'],
    ['application/jsonp', 'json'],
    ['x-text/html', 'html'],
    ['text/application/json', 'json'],
  ] as const)('refuses %j when asking for %s', async (contentType, accept) => {
    const server = await serve((_req, res) => {
      res.writeHead(200, contentType ? { 'content-type': contentType } : {});
      res.end('data');
    });
    try {
      expect(await failure(fetchPage(server.url, { accept, allowHosts: server.allowHosts }))).toBe(
        'UNREACHABLE',
      );
    } finally {
      await server.close();
    }
  });

  it.each([301, 302, 303, 307, 308])(
    'follows a %i redirect, relative or absolute',
    async (code) => {
      const server = await serve((req, res) => {
        if (req.url === '/start') {
          res.writeHead(code, { location: '/middle' });
          res.end();
        } else if (req.url === '/middle') {
          res.writeHead(code, { location: `http://127.0.0.1:${server.port}/end` });
          res.end();
        } else {
          html(res, `at ${req.url}`);
        }
      });
      try {
        const page = await fetchPage(`${server.url}/start`, {
          accept: 'html',
          allowHosts: server.allowHosts,
        });

        expect(page).toEqual({ status: 200, finalUrl: `${server.url}/end`, body: 'at /end' });
      } finally {
        await server.close();
      }
    },
  );

  it(`follows ${MAX_REDIRECTS} redirects, and gives up on the next one`, async () => {
    expect(MAX_REDIRECTS).toBe(5);
    const server = await serve((req, res) => {
      const hop = Number(req.url?.slice(1));
      if (hop < Number(req.headers['x-stop'] ?? 99)) {
        res.writeHead(302, { location: `/${hop + 1}` });
        res.end();
      } else {
        html(res, `done at ${hop}`);
      }
    });
    try {
      const five = await serve((req, res) => {
        const hop = Number(req.url?.slice(1));
        if (hop < 5) {
          res.writeHead(302, { location: `/${hop + 1}` });
          res.end();
        } else {
          html(res, `done at ${hop}`);
        }
      });
      try {
        const page = await fetchPage(`${five.url}/0`, {
          accept: 'html',
          allowHosts: five.allowHosts,
        });
        expect(page.body).toBe('done at 5');
      } finally {
        await five.close();
      }

      expect(
        await failure(
          fetchPage(`${server.url}/0`, { accept: 'html', allowHosts: server.allowHosts }),
        ),
      ).toBe('UNREACHABLE');
    } finally {
      await server.close();
    }
  });

  it('returns a redirect status without a location as the page status', async () => {
    const server = await serve((_req, res) => {
      res.writeHead(302);
      res.end();
    });
    try {
      expect(
        await failure(fetchPage(server.url, { accept: 'html', allowHosts: server.allowHosts })),
      ).toBe('UNREACHABLE');
    } finally {
      await server.close();
    }
  });

  it.each([
    ['a private address', 'http://10.0.0.1/job'],
    ['the metadata address', 'http://169.254.169.254/latest'],
    ['an IPv6 loopback', 'http://[::1]/job'],
    ['localhost, by name', 'http://localhost/job'],
    ['ftp', 'ftp://example.com/job'],
    ['credentials', 'http://user:pass@example.com/job'],
  ])('checks every redirect: one to %s is refused', async (_label, location) => {
    const server = await serve((_req, res) => {
      res.writeHead(302, { location });
      res.end();
    });
    try {
      expect(
        await failure(fetchPage(server.url, { accept: 'html', allowHosts: server.allowHosts })),
      ).toBe('URL_NOT_ALLOWED');
    } finally {
      await server.close();
    }
  });

  it.each([
    ['gzip', gzipSync],
    ['x-gzip', gzipSync],
    ['deflate', deflateSync],
    ['br', brotliCompressSync],
    ['GZIP', gzipSync],
  ] as const)('decompresses %s', async (encoding, compress) => {
    const server = await serve((_req, res) => {
      html(res, compress(Buffer.from('<p>compressed</p>')), { 'content-encoding': encoding });
    });
    try {
      const page = await fetchPage(server.url, { accept: 'html', allowHosts: server.allowHosts });

      expect(page.body).toBe('<p>compressed</p>');
    } finally {
      await server.close();
    }
  });

  it('reports a body that fails to decompress as unreachable', async () => {
    const server = await serve((_req, res) => {
      html(res, Buffer.from('not gzip at all'), { 'content-encoding': 'gzip' });
    });
    try {
      expect(
        await failure(fetchPage(server.url, { accept: 'html', allowHosts: server.allowHosts })),
      ).toBe('UNREACHABLE');
    } finally {
      await server.close();
    }
  });

  it('reads a page up to the size limit, and refuses one byte more', async () => {
    const server = await serve((req, res) => html(res, 'x'.repeat(Number(req.url?.slice(1)))));
    try {
      const options = { accept: 'html', maxBytes: 1000, allowHosts: server.allowHosts } as const;

      expect((await fetchPage(`${server.url}/1000`, options)).body).toHaveLength(1000);
      expect(await failure(fetchPage(`${server.url}/1001`, options))).toBe('UNREACHABLE');
    } finally {
      await server.close();
    }
  });

  it('applies the size limit after decompression', async () => {
    const server = await serve((_req, res) => {
      html(res, gzipSync(Buffer.alloc(50_000, 'a')), { 'content-encoding': 'gzip' });
    });
    try {
      expect(
        await failure(
          fetchPage(server.url, {
            accept: 'html',
            maxBytes: 10_000,
            allowHosts: server.allowHosts,
          }),
        ),
      ).toBe('UNREACHABLE');
    } finally {
      await server.close();
    }
  });

  it('defaults to a 2 MB limit', async () => {
    const server = await serve((req, res) => html(res, 'x'.repeat(Number(req.url?.slice(1)))));
    try {
      const options = { accept: 'html', allowHosts: server.allowHosts } as const;

      expect((await fetchPage(`${server.url}/2000000`, options)).body).toHaveLength(2_000_000);
      expect(await failure(fetchPage(`${server.url}/2000001`, options))).toBe('UNREACHABLE');
    } finally {
      await server.close();
    }
  });

  it('gives up when the server is too slow to answer', async () => {
    const server = await serve(() => undefined);
    try {
      expect(
        await failure(
          fetchPage(server.url, { accept: 'html', timeoutMs: 200, allowHosts: server.allowHosts }),
        ),
      ).toBe('UNREACHABLE');
    } finally {
      await server.close();
    }
  });

  it('gives up when the page stops arriving partway', async () => {
    const server = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.write('<p>start');
    });
    try {
      expect(
        await failure(
          fetchPage(server.url, { accept: 'html', timeoutMs: 300, allowHosts: server.allowHosts }),
        ),
      ).toBe('UNREACHABLE');
    } finally {
      await server.close();
    }
  });

  it('returns an error status without reading the page', async () => {
    const server = await serve((_req, res) => {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('forbidden');
    });
    try {
      expect(
        await fetchPage(server.url, { accept: 'html', allowHosts: server.allowHosts }),
      ).toEqual({
        status: 403,
        finalUrl: `${server.url}/`,
        body: '',
      });
    } finally {
      await server.close();
    }
  });

  it('reports a refused connection and an unknown host as unreachable', async () => {
    const server = await serve(() => undefined);
    const { url, allowHosts } = server;
    await server.close();

    expect(await failure(fetchPage(url, { accept: 'html', allowHosts }))).toBe('UNREACHABLE');
    expect(await failure(fetchPage('https://no-such-host.invalid/job', { accept: 'html' }))).toBe(
      'UNREACHABLE',
    );
  });

  it.each([
    ['ftp', 'ftp://example.com/job'],
    ['file', 'file:///etc/passwd'],
    ['a user name', 'https://user@example.com/job'],
    ['a password', 'https://:secret@example.com/job'],
    ['port 22', 'http://example.com:22/'],
    ['port 3000', 'https://example.com:3000/'],
    ['not a link', 'jobs at acme'],
  ])('refuses %s before connecting', async (_label, link) => {
    expect(await failure(fetchPage(link, { accept: 'html', timeoutMs: 1 }))).toBe(
      'URL_NOT_ALLOWED',
    );
  });

  it.each([
    'http://127.0.0.1:PORT/job',
    'http://localhost:PORT/job',
    'http://[::1]:PORT/job',
    'http://10.1.2.3/job',
    'http://169.254.169.254/latest/meta-data',
    'http://[fd00::1]/job',
  ])('refuses %s without an allowance, by address or by name', async (pattern) => {
    let requests = 0;
    const server = await serve((_req, res) => {
      requests += 1;
      html(res, 'should not be read');
    });
    try {
      const link = pattern.replace('PORT', String(server.port));

      expect(await failure(fetchPage(link, { accept: 'html', timeoutMs: 2000 }))).toBe(
        'URL_NOT_ALLOWED',
      );
      expect(requests).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('allows the normal web ports', async () => {
    // Refused before connecting only when the port isn't allowed: these get as far as DNS.
    for (const link of [
      'http://no-such-host.invalid:80/',
      'https://no-such-host.invalid:443/',
      'http://no-such-host.invalid:8080/',
      'https://no-such-host.invalid:8443/',
    ]) {
      expect(await failure(fetchPage(link, { accept: 'html' }))).toBe('UNREACHABLE');
    }
  });

  it('allows a listed host only on its listed port', async () => {
    const server = await serve((_req, res) => html(res, 'local'));
    try {
      expect(
        await failure(
          fetchPage(server.url, { accept: 'html', allowHosts: [`127.0.0.1:${server.port + 1}`] }),
        ),
      ).toBe('URL_NOT_ALLOWED');
      expect(
        (await fetchPage(server.url, { accept: 'html', allowHosts: server.allowHosts })).body,
      ).toBe('local');
    } finally {
      await server.close();
    }
  });

  it('returns HTTP 400 as an error status too, without reading the page', async () => {
    const server = await serve((_req, res) => {
      res.writeHead(400, { 'content-type': 'text/html' });
      res.end('<p>bad</p>');
    });
    try {
      expect(
        (await fetchPage(server.url, { accept: 'html', allowHosts: server.allowHosts })).body,
      ).toBe('');
    } finally {
      await server.close();
    }
  });

  it('matches an allowance on the default port: 443 for https, 80 for http', async () => {
    // 192.0.2.1 is a documentation address: never public, and nothing answers there.
    const allowHosts = ['192.0.2.1:443'];

    expect(
      await failure(
        fetchPage('https://192.0.2.1/job', { accept: 'html', timeoutMs: 300, allowHosts }),
      ),
    ).toBe('UNREACHABLE');
    expect(
      await failure(
        fetchPage('http://192.0.2.1/job', { accept: 'html', timeoutMs: 300, allowHosts }),
      ),
    ).toBe('URL_NOT_ALLOWED');
  });

  it('stops downloading a page as soon as it passes the size limit', async () => {
    let writes = 0;
    let closed = false;
    const server = await serve((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.on('close', () => {
        closed = true;
      });
      const timer = setInterval(() => {
        writes += 1;
        if (writes === 100 || closed) {
          clearInterval(timer);
          res.end();
        } else {
          res.write('x'.repeat(500));
        }
      }, 10);
    });
    try {
      expect(
        await failure(
          fetchPage(server.url, { accept: 'html', maxBytes: 1000, allowHosts: server.allowHosts }),
        ),
      ).toBe('UNREACHABLE');
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(closed).toBe(true);
      expect(writes).toBeLessThan(50);
    } finally {
      await server.close();
    }
  });
});

describe('createGuardedLookup', () => {
  type Resolver = Parameters<typeof createGuardedLookup>[0];
  const fakeResolver = (result: Error | LookupAddress[]) =>
    ((_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
      expect(options.all).toBe(true);
      if (result instanceof Error) {
        callback(result, []);
      } else {
        callback(null, result);
      }
    }) as unknown as Resolver;

  function look(result: Error | LookupAddress[], all: boolean) {
    return new Promise<unknown[]>((resolve) => {
      createGuardedLookup(fakeResolver(result))('example.com', { all }, (...args: unknown[]) =>
        resolve(args),
      );
    });
  }

  const publicV4 = { address: '93.184.215.14', family: 4 };
  const publicV6 = { address: '2606:2800:21f:cb07::1', family: 6 };

  it('passes on the first public address, or all of them when asked', async () => {
    expect(await look([publicV4, publicV6], false)).toEqual([null, '93.184.215.14', 4]);
    expect(await look([publicV4, publicV6], true)).toEqual([null, [publicV4, publicV6]]);
  });

  it('refuses the host if any of its addresses is not public', async () => {
    const [error] = await look([publicV4, { address: '10.0.0.5', family: 4 }], false);

    expect(error).toBeInstanceOf(ImportFailure);
    expect((error as ImportFailure).code).toBe('URL_NOT_ALLOWED');
  });

  it('refuses a host with no addresses', async () => {
    const [error] = await look([], true);

    expect((error as ImportFailure).code).toBe('URL_NOT_ALLOWED');
  });

  it('passes a DNS error through', async () => {
    const dnsError = new Error('ENOTFOUND');

    expect(await look(dnsError, false)).toEqual([dnsError]);
  });
});
