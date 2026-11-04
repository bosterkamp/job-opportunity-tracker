import { InvokeCommand, type LambdaClient } from '@aws-sdk/client-lambda';
import { IMPORT_MESSAGES, PostingDetailsSchema, type PostingDetails } from '@jot/shared';
import { ToolError } from './apiCall.js';

// Reads a posting link by invoking feature 002's import function, which reaches the internet
// and has no table access; this function has table access and never fetches pages itself
// (research.md §4).

export type ReadPosting = (url: string, sub: string) => Promise<PostingDetails>;

export function createImportClient(
  lambda: Pick<LambdaClient, 'send'>,
  functionName: string,
): ReadPosting {
  return async function readPosting(url, sub) {
    // Only what the import function's router reads: the route, the body, and the owner, the
    // way API Gateway's authorizer would pass them.
    const event = {
      rawPath: '/imports',
      body: JSON.stringify({ url }),
      isBase64Encoded: false,
      requestContext: { http: { method: 'POST' }, authorizer: { jwt: { claims: { sub } } } },
    };
    const result = await lambda.send(
      new InvokeCommand({
        FunctionName: functionName,
        Payload: new TextEncoder().encode(JSON.stringify(event)),
      }),
    );
    if (result.FunctionError) {
      throw new ToolError('UNREACHABLE', IMPORT_MESSAGES.UNREACHABLE);
    }
    const answer = JSON.parse(new TextDecoder().decode(result.Payload)) as {
      statusCode: number;
      body: string;
    };
    const body = JSON.parse(answer.body) as unknown;
    if (answer.statusCode !== 200) {
      const { code, message } = body as { code: string; message: string };
      throw new ToolError(code, message);
    }
    return PostingDetailsSchema.parse(body);
  };
}
