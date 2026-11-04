// @module-tag import
import { describe, expect, it } from 'vitest';
import {
  IMPORT_ERROR_CODES,
  IMPORT_MESSAGES,
  ImportRequestSchema,
  PostingDetailsSchema,
} from '../../src/imports.js';

const text = (length: number) => 'x'.repeat(length);
const valid = { title: 'Engineer', source: 'Lever' };

describe('ImportRequestSchema', () => {
  it('accepts an http or https link', () => {
    expect(ImportRequestSchema.parse({ url: 'https://jobs.lever.co/acme/1' })).toEqual({
      url: 'https://jobs.lever.co/acme/1',
    });
    expect(ImportRequestSchema.safeParse({ url: 'http://example.com/job' }).success).toBe(true);
  });

  it.each([
    ['ftp', 'ftp://example.com/job'],
    ['javascript', 'javascript:alert(1)'],
    ['not a link', 'jobs at acme'],
  ])('rejects a %s link with the form message', (_label, url) => {
    const result = ImportRequestSchema.safeParse({ url });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Must be an http or https link');
  });

  it('accepts a link of 2,000 characters and rejects one longer', () => {
    const base = 'https://example.com/';
    expect(ImportRequestSchema.safeParse({ url: base + text(2000 - base.length) }).success).toBe(
      true,
    );
    const tooLong = ImportRequestSchema.safeParse({ url: base + text(2001 - base.length) });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]?.message).toBe('Use at most 2000 characters');
  });

  it('requires the link and nothing else', () => {
    expect(ImportRequestSchema.safeParse({}).success).toBe(false);
    expect(ImportRequestSchema.safeParse({ url: 'https://a.com', extra: 1 }).success).toBe(false);
  });
});

describe('PostingDetailsSchema', () => {
  it('needs only a title and a source', () => {
    expect(PostingDetailsSchema.parse(valid)).toEqual(valid);
    expect(PostingDetailsSchema.safeParse({ source: 'Lever' }).success).toBe(false);
    expect(PostingDetailsSchema.safeParse({ title: 'Engineer' }).success).toBe(false);
  });

  it('accepts every field', () => {
    const full = {
      company: 'Acme',
      title: 'Engineer',
      description: 'Build things',
      descriptionTruncated: true,
      location: 'Austin, TX',
      workArrangement: 'REMOTE',
      salaryMin: 150_000,
      salaryMax: 180_000,
      compensation: '$150,000–$180,000 a year',
      source: 'Lever',
    };

    expect(PostingDetailsSchema.parse(full)).toEqual(full);
  });

  it.each([
    ['company', 200],
    ['title', 200],
    ['description', 20_000],
    ['location', 200],
    ['compensation', 500],
    ['source', 200],
  ])('accepts %s at %i characters and rejects one more', (field, max) => {
    expect(PostingDetailsSchema.safeParse({ ...valid, [field]: text(max) }).success).toBe(true);
    expect(PostingDetailsSchema.safeParse({ ...valid, [field]: text(max + 1) }).success).toBe(
      false,
    );
  });

  it.each(['salaryMin', 'salaryMax'])('accepts %s as a whole number up to 10,000,000', (field) => {
    for (const ok of [0, 10_000_000]) {
      expect(PostingDetailsSchema.safeParse({ ...valid, [field]: ok }).success).toBe(true);
    }
    for (const bad of [-1, 10_000_001, 1.5, '150000']) {
      expect(PostingDetailsSchema.safeParse({ ...valid, [field]: bad }).success).toBe(false);
    }
  });

  it.each(['REMOTE', 'HYBRID', 'ONSITE'])('accepts the work arrangement %s', (workArrangement) => {
    expect(PostingDetailsSchema.safeParse({ ...valid, workArrangement }).success).toBe(true);
  });

  it('rejects other work arrangements, unknown fields, and a non-boolean truncation flag', () => {
    expect(PostingDetailsSchema.safeParse({ ...valid, workArrangement: 'ON_SITE' }).success).toBe(
      false,
    );
    expect(PostingDetailsSchema.safeParse({ ...valid, contact: 'Sam' }).success).toBe(false);
    expect(PostingDetailsSchema.safeParse({ ...valid, descriptionTruncated: 'yes' }).success).toBe(
      false,
    );
  });
});

describe('import outcomes', () => {
  it('lists every reason an import can fail', () => {
    expect(IMPORT_ERROR_CODES).toEqual([
      'SIGN_IN_REQUIRED',
      'NO_JOB_DETAILS',
      'MULTIPLE_JOBS',
      'UNREACHABLE',
      'URL_NOT_ALLOWED',
    ]);
  });

  it('has a plain-language message for each', () => {
    expect(IMPORT_MESSAGES).toEqual({
      SIGN_IN_REQUIRED:
        "This site doesn't let its postings be read without signing in. Fill in the details by hand.",
      NO_JOB_DETAILS: 'No job details were found on that page. Fill in the details by hand.',
      MULTIPLE_JOBS: 'That page lists several jobs. Use the link to a single posting.',
      UNREACHABLE: "That page couldn't be loaded. Check the link and try again.",
      URL_NOT_ALLOWED: "That link can't be used. Use the public link to the job posting.",
    });
  });
});

describe('the posting closing date (feature 009)', { tags: ['deadline'] }, () => {
  const details = { title: 'Engineer', source: 'Lever' };

  it('accepts a calendar date, and refuses anything else', () => {
    expect(PostingDetailsSchema.parse({ ...details, postedUntil: '2026-11-30' })).toEqual({
      ...details,
      postedUntil: '2026-11-30',
    });
    expect(
      PostingDetailsSchema.safeParse({ ...details, postedUntil: '2026-11-30T23:59:59Z' }).success,
    ).toBe(false);
  });
});
