import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import type { ImportErrorCode } from '@jot/shared';
import { isPublicAddress } from './addressGuard.js';

// Fetches one page for an import, guarded so a pasted link can only reach public web pages
// (research.md §4).

export class ImportFailure extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code);
  }
}

export interface FetchOptions {
  accept: 'html' | 'json';
  // For the whole fetch, redirects included.
  timeoutMs?: number;
  // After decompression.
  maxBytes?: number;
  // `host:port` values reachable even though they aren't public: only for local runs and tests.
  allowHosts?: readonly string[];
}

export interface FetchedPage {
  status: number;
  // Where the last redirect led.
  finalUrl: string;
  // Empty for an error status.
  body: string;
}

export const MAX_REDIRECTS = 5;
const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = 'JobOpportunityTracker/1.0 (personal job tracker; reads one posting on request)';
const ACCEPT = {
  html: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
  json: 'application/json',
};
const CONTENT_TYPES = {
  html: /^(text\/html|application\/xhtml\+xml)\b/i,
  json: /^application\/([\w.-]+\+)?json\b/i,
};

interface Target {
  url: URL;
  // Reachable without the public-address check (allowHosts).
  trusted: boolean;
}

// Checks a link before connecting: a public http(s) page on a normal port, no credentials.
function checkTarget(link: string, allowHosts: readonly string[] | undefined): Target {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new ImportFailure('URL_NOT_ALLOWED');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ImportFailure('URL_NOT_ALLOWED');
  }
  if (url.username !== '' || url.password !== '') {
    throw new ImportFailure('URL_NOT_ALLOWED');
  }
  const port = url.port === '' ? (url.protocol === 'https:' ? 443 : 80) : Number(url.port);
  // An IPv6 host keeps its brackets in URL.hostname; no other host can contain them.
  const host = url.hostname.replace(/[[\]]/g, '');
  const trusted = allowHosts?.includes(`${host}:${port}`) === true;
  if (!trusted && !ALLOWED_PORTS.has(port)) {
    throw new ImportFailure('URL_NOT_ALLOWED');
  }
  // Node connects to an IP literal without calling `lookup`, so check it here.
  if (!trusted && isIP(host) !== 0 && !isPublicAddress(host)) {
    throw new ImportFailure('URL_NOT_ALLOWED');
  }
  return { url, trusted };
}

// Resolves the host and refuses any non-public address, on the address the connection will
// actually use, so DNS rebinding can't get past the check.
// `resolve` is injectable for tests.
export function createGuardedLookup(resolve: typeof dnsLookup = dnsLookup): LookupFunction {
  return (hostname, options, callback) => {
    // The callback's address arguments depend on `options.all`.
    const done = callback as (
      error: Error | null,
      address?: string | LookupAddress[],
      family?: number,
    ) => void;
    resolve(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
      if (error) {
        done(error);
        return;
      }
      const [first] = addresses;
      if (!first || addresses.some((a) => !isPublicAddress(a.address))) {
        done(new ImportFailure('URL_NOT_ALLOWED'));
        return;
      }
      if (options.all) {
        done(null, addresses);
      } else {
        done(null, first.address, first.family);
      }
    });
  };
}
const guardedLookup = createGuardedLookup();

function decoded(response: IncomingMessage): NodeJS.ReadableStream {
  switch (response.headers['content-encoding']?.toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return response.pipe(createGunzip());
    case 'deflate':
      return response.pipe(createInflate());
    case 'br':
      return response.pipe(createBrotliDecompress());
    default:
      return response;
  }
}

function readBody(response: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const stream = decoded(response);
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        response.destroy();
        reject(new ImportFailure('UNREACHABLE'));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', () => reject(new ImportFailure('UNREACHABLE')));
  });
}

function get(target: Target, accept: FetchOptions['accept'], signal: AbortSignal) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const send = target.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(target.url, {
      signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: ACCEPT[accept],
        'accept-language': 'en',
        'accept-encoding': 'gzip, deflate, br',
      },
      ...(target.trusted ? {} : { lookup: guardedLookup }),
    });
    req.on('response', resolve);
    req.on('error', (error) =>
      reject(error instanceof ImportFailure ? error : new ImportFailure('UNREACHABLE')),
    );
    req.end();
  });
}

export async function fetchPage(link: string, options: FetchOptions): Promise<FetchedPage> {
  const { accept, timeoutMs = 10_000, maxBytes = 2_000_000, allowHosts } = options;
  const signal = AbortSignal.timeout(timeoutMs);
  let target = checkTarget(link, allowHosts);

  for (let redirects = 0; ; redirects++) {
    const response = await get(target, accept, signal);
    const status = response.statusCode ?? 0;
    const location = response.headers.location;
    if (REDIRECT_STATUSES.has(status) && location) {
      // Stryker disable next-line CallExpression: only frees the connection; no test can see it
      response.resume();
      if (redirects === MAX_REDIRECTS) {
        throw new ImportFailure('UNREACHABLE');
      }
      target = checkTarget(new URL(location, target.url).href, allowHosts);
      continue;
    }
    const finalUrl = target.url.href;
    if (status >= 400) {
      // Stryker disable next-line CallExpression: only frees the connection; no test can see it
      response.resume();
      return { status, finalUrl, body: '' };
    }
    if (!CONTENT_TYPES[accept].test(String(response.headers['content-type']))) {
      // Stryker disable next-line CallExpression: only frees the connection; no test can see it
      response.resume();
      throw new ImportFailure('UNREACHABLE');
    }
    return { status, finalUrl, body: await readBody(response, maxBytes) };
  }
}
