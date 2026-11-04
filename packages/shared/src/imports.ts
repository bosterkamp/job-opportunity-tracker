import { z } from 'zod';
import { MAX_SALARY } from './salary.js';
import { PostingUrlSchema, WORK_ARRANGEMENTS } from './schemas.js';

// Filling the add form from a job posting link (feature 002). Nothing here is stored: the
// details only fill the form, which the owner reviews and saves as usual.

const tooLong = (max: number) => `Use at most ${max} characters`;
const capped = (max: number) => z.string().max(max, tooLong(max));

export const ImportRequestSchema = z.strictObject({
  url: PostingUrlSchema.max(2000, tooLong(2000)),
});
export type ImportRequest = z.infer<typeof ImportRequestSchema>;

// What a posting states. Fields it doesn't state are left out. The limits match the
// opportunity's, so a filled form always passes the same validation as a typed one.
export const PostingDetailsSchema = z.strictObject({
  company: capped(200).optional(),
  title: capped(200),
  description: capped(20_000).optional(),
  descriptionTruncated: z.boolean().optional(),
  location: capped(200).optional(),
  workArrangement: z.enum(WORK_ARRANGEMENTS).optional(),
  // The pay as whole numbers (feature 004); the text above keeps its currency and period.
  salaryMin: z.number().int().min(0).max(MAX_SALARY).optional(),
  salaryMax: z.number().int().min(0).max(MAX_SALARY).optional(),
  compensation: capped(500).optional(),
  // The name of the site the posting is on, for "Where you found it".
  source: capped(200),
  // The date the posting is up until, when it says (feature 009).
  postedUntil: z.iso.date().optional(),
});
export type PostingDetails = z.infer<typeof PostingDetailsSchema>;

export const IMPORT_ERROR_CODES = [
  'SIGN_IN_REQUIRED',
  'NO_JOB_DETAILS',
  'MULTIPLE_JOBS',
  'UNREACHABLE',
  'URL_NOT_ALLOWED',
] as const;
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];

// Shown to the owner as is when an import fails (research.md §4).
export const IMPORT_MESSAGES: Record<ImportErrorCode, string> = {
  SIGN_IN_REQUIRED:
    "This site doesn't let its postings be read without signing in. Fill in the details by hand.",
  NO_JOB_DETAILS: 'No job details were found on that page. Fill in the details by hand.',
  MULTIPLE_JOBS: 'That page lists several jobs. Use the link to a single posting.',
  UNREACHABLE: "That page couldn't be loaded. Check the link and try again.",
  URL_NOT_ALLOWED: "That link can't be used. Use the public link to the job posting.",
};
