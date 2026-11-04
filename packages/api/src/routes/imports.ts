import { IMPORT_MESSAGES, ImportRequestSchema, type PostingDetails } from '@jot/shared';
import { ApiError, json } from '../http.js';
import { ImportFailure } from '../import/fetchPage.js';
import type { Route } from '../router.js';

export interface ImportRouteDeps {
  importPosting: (link: string) => Promise<PostingDetails>;
}

// Reads a job posting to fill the add form (contracts/imports.openapi.yaml). Nothing is stored.
export function importRoutes({ importPosting }: ImportRouteDeps): Route[] {
  return [
    {
      method: 'POST',
      path: '/imports',
      async handle({ body }) {
        const { url } = ImportRequestSchema.parse(body);
        try {
          return json(200, await importPosting(url));
        } catch (error) {
          if (error instanceof ImportFailure) {
            throw new ApiError(error.code, IMPORT_MESSAGES[error.code]);
          }
          throw error;
        }
      },
    },
  ];
}
