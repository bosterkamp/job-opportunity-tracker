// @module-tag mcp
import { readFileSync } from 'node:fs';
import type { InvokeCommand } from '@aws-sdk/client-lambda';
import { IMPORT_MESSAGES } from '@jot/shared';
import { describe, expect, it } from 'vitest';
import type { FetchedPage } from '../../src/import/fetchPage.js';
import { createImportHandler } from '../../src/importHandler.js';
import { ToolError } from '../../src/mcp/apiCall.js';
import { createImportClient } from '../../src/mcp/importClient.js';
import type { ApiEvent } from '../../src/router.js';

const lever = readFileSync(new URL('../fixtures/postings/lever.html', import.meta.url), 'utf8');

// A Lambda client that hands the payload to the real import handler, in AWS mode, the way
// Lambda would, with a fake page fetch.
function lambdaFor(page: Partial<FetchedPage>) {
  const invocations: { FunctionName?: string; event: ApiEvent }[] = [];
  const handle = createImportHandler(
    { appEnv: 'aws', allowHosts: [] },
    {
      log: () => undefined,
      fetchPage: (link) => Promise.resolve({ status: 200, finalUrl: link, body: '', ...page }),
    },
  );
  const lambda = {
    send: async (command: InvokeCommand) => {
      const { FunctionName, Payload } = command.input;
      const event = JSON.parse(new TextDecoder().decode(Payload as Uint8Array)) as ApiEvent;
      invocations.push({ FunctionName, event });
      const result = await handle(event);
      return { Payload: new TextEncoder().encode(JSON.stringify(result)) };
    },
  };
  return { lambda: lambda as never, invocations };
}

describe('reading a posting through the import function', () => {
  it('invokes it as the owner and returns the details', async () => {
    const { lambda, invocations } = lambdaFor({ body: lever });

    const details = await createImportClient(lambda, 'import-fn')(
      'https://jobs.lever.co/acme/1',
      'owner-sub',
    );

    expect(details).toMatchObject({ company: 'Acme Rockets', title: 'Senior Platform Engineer' });
    expect(invocations.map((i) => i.FunctionName)).toEqual(['import-fn']);
    expect(invocations[0]?.event.requestContext.authorizer?.jwt.claims.sub).toBe('owner-sub');
  });

  it("passes on the import's refusal with its message", async () => {
    const { lambda } = lambdaFor({ body: '<p>No job here</p>' });
    const reading = createImportClient(lambda, 'import-fn')('https://a.example/x', 'owner');

    await expect(reading).rejects.toBeInstanceOf(ToolError);
    await expect(reading).rejects.toMatchObject({
      code: 'NO_JOB_DETAILS',
      message: IMPORT_MESSAGES.NO_JOB_DETAILS,
    });
  });

  it('reports a failed invocation as unreachable', async () => {
    const lambda = { send: () => Promise.resolve({ FunctionError: 'Unhandled' }) };

    await expect(
      createImportClient(lambda as never, 'import-fn')('https://a.example/x', 'owner'),
    ).rejects.toMatchObject({ code: 'UNREACHABLE', message: IMPORT_MESSAGES.UNREACHABLE });
  });

  it('refuses an answer that is not valid posting details', async () => {
    const lambda = {
      send: () =>
        Promise.resolve({
          Payload: new TextEncoder().encode(
            JSON.stringify({ statusCode: 200, body: JSON.stringify({ title: '' }) }),
          ),
        }),
    };

    await expect(
      createImportClient(lambda as never, 'import-fn')('https://a.example/x', 'owner'),
    ).rejects.toThrow();
  });
});
